import { NextResponse } from "next/server";
import { rankCandidates } from "@/lib/ai/rank";
import type { ScanResult, Winner } from "@/lib/ai/schemas";
import { getSession, jsonError } from "@/lib/auth";
import { loadRepos, loadScan, stepError, type RouteParams } from "@/lib/scans";

export const maxDuration = 300;

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);

  const scan = await loadScan(supabase, id);
  if (!scan) return jsonError("Scan not found", 404);
  if (scan.result) return NextResponse.json({ ok: true, reused: true });

  try {
    const repos = await loadRepos(supabase, scan.repo_ids);
    const shortlist = repos.filter(
      (r) => scan.shortlist_ids.includes(r.id) && r.research,
    );
    if (shortlist.length === 0) {
      const message = "Market research failed for every shortlisted repo, so nothing could be ranked.";
      await supabase
        .from("mostviable_scans")
        .update({ status: "failed", error: message })
        .eq("id", id);
      return NextResponse.json({ error: message, fatal: true }, { status: 422 });
    }
    const others = repos.filter((r) => !scan.shortlist_ids.includes(r.id) && r.triage);

    const rank = await rankCandidates(shortlist, others);

    // The model returns names; map them back to rows and drop anything that
    // is not actually on the shortlist.
    const byName = new Map(shortlist.map((r) => [r.full_name.toLowerCase(), r]));
    const winners = rank.winners
      .flatMap((w): Winner[] => {
        const repo = byName.get(w.repo_full_name.toLowerCase());
        return repo ? [{ ...w, repo_full_name: repo.full_name, repo_id: repo.id }] : [];
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3)
      .map((w, i) => ({ ...w, rank: i + 1 }));
    if (winners.length === 0) throw new Error("Ranking did not name any shortlisted repo");

    const result: ScanResult = { ...rank, winners };
    const { error } = await supabase
      .from("mostviable_scans")
      .update({ status: "ranking", result })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stepError(err);
  }
}
