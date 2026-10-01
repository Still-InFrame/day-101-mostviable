import { NextResponse } from "next/server";
import { triageRepo } from "@/lib/ai/triage";
import { getSession, jsonError } from "@/lib/auth";
import { getToken, repoSnapshot } from "@/lib/github";
import { loadRepos, loadScan, stepError, type RouteParams } from "@/lib/scans";
import { triageIsFresh } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);

  const { repoId } = (await request.json()) as { repoId?: string };
  const scan = await loadScan(supabase, id);
  if (!scan || !repoId || !scan.repo_ids.includes(repoId)) {
    return jsonError("Repo is not part of this scan", 404);
  }

  const [repo] = await loadRepos(supabase, [repoId]);
  if (!repo) return jsonError("Repo not found", 404);
  if (triageIsFresh(repo)) return NextResponse.json({ ok: true, reused: true });

  const token = await getToken(supabase, user.id);
  if (!token) return jsonError("GitHub is not connected", 400);

  try {
    const snapshot = await repoSnapshot(token, repo.full_name);
    const triage = await triageRepo(repo, snapshot);
    const { error } = await supabase
      .from("mostviable_repos")
      .update({
        triage,
        triage_score: triage.shortlist_score,
        triaged_pushed_at: repo.pushed_at,
      })
      .eq("id", repo.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stepError(err);
  }
}
