import { NextResponse } from "next/server";
import { requireActive } from "@/lib/access";
import { researchRepo } from "@/lib/ai/research";
import { getSession, jsonError } from "@/lib/auth";
import { getToken, repoSnapshot } from "@/lib/github";
import { loadRepos, loadScan, stepError, type RouteParams } from "@/lib/scans";
import { researchIsFresh } from "@/lib/types";
import { createMeter } from "@/lib/usage";

// Web research on one repo runs several searches and can take a few minutes.
export const maxDuration = 300;

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);
  const access = await requireActive(supabase);
  if (access instanceof NextResponse) return access;

  const { repoId, force } = (await request.json()) as { repoId?: string; force?: boolean };
  const scan = await loadScan(supabase, id);
  if (!scan || !repoId || !scan.shortlist_ids.includes(repoId)) {
    return jsonError("Repo is not on this scan's shortlist", 404);
  }

  const [repo] = await loadRepos(supabase, [repoId]);
  if (!repo) return jsonError("Repo not found", 404);
  if (!force && researchIsFresh(repo)) {
    return NextResponse.json({ ok: true, reused: true });
  }

  const token = await getToken(supabase, user.id);
  if (!token) return jsonError("GitHub is not connected", 400);

  const meter = createMeter();
  try {
    const snapshot = await repoSnapshot(token, repo.full_name);
    const research = await researchRepo(repo, snapshot, meter);
    const { error } = await supabase
      .from("mostviable_repos")
      .update({
        research,
        researched_at: new Date().toISOString(),
        researched_pushed_at: repo.pushed_at,
      })
      .eq("id", repo.id);
    if (error) throw new Error(error.message);
    await meter.save(supabase, { scanId: id, step: "research" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await meter.save(supabase, { scanId: id, step: "research", error: err });
    return stepError(err);
  }
}
