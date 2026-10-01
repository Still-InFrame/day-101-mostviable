import { NextResponse } from "next/server";
import { buildKit } from "@/lib/ai/rank";
import type { ScanResult } from "@/lib/ai/schemas";
import { getSession, jsonError } from "@/lib/auth";
import { loadRepos, loadScan, stepError, type RouteParams } from "@/lib/scans";

export const maxDuration = 300;

// Kits are written into the scan's result one winner at a time. The client
// calls this sequentially, so the read-modify-write below cannot race.
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);

  const { repoId, last } = (await request.json()) as { repoId?: string; last?: boolean };
  const scan = await loadScan(supabase, id);
  const winner = scan?.result?.winners.find((w) => w.repo_id === repoId);
  if (!scan || !scan.result || !winner) return jsonError("Not a winner of this scan", 404);

  const finish = async (result: ScanResult) => {
    const complete = last || result.winners.every((w) => w.kit);
    const { error } = await supabase
      .from("mostviable_scans")
      .update({
        result,
        ...(complete
          ? { status: "complete", completed_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, complete });
  };

  try {
    if (winner.kit) return await finish(scan.result);

    const [repo] = await loadRepos(supabase, [winner.repo_id]);
    if (!repo?.research) return jsonError("Winner has no research", 409);

    // Tasks the user already ticked off in earlier scans should not come back.
    const { data: doneItems } = await supabase
      .from("mostviable_checklist_items")
      .select("task")
      .eq("repo_id", repo.id)
      .eq("done", true);

    const kit = await buildKit(repo, winner, (doneItems ?? []).map((i) => i.task));

    const { error: itemsError } = await supabase.from("mostviable_checklist_items").insert(
      kit.gap_checklist.map((item, position) => ({
        scan_id: id,
        repo_id: repo.id,
        position,
        task: item.task,
        why: item.why,
        effort: item.effort,
      })),
    );
    if (itemsError) throw new Error(itemsError.message);

    return await finish({
      ...scan.result,
      winners: scan.result.winners.map((w) => (w.repo_id === repo.id ? { ...w, kit } : w)),
    });
  } catch (err) {
    // The last winner still closes out the scan so results are viewable even
    // if its kit could not be written.
    if (last) {
      await supabase
        .from("mostviable_scans")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", id);
    }
    return stepError(err);
  }
}
