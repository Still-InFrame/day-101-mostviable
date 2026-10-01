import { NextResponse } from "next/server";
import { getSession, jsonError } from "@/lib/auth";
import { getToken } from "@/lib/github";
import { syncRepos } from "@/lib/repos";
import { loadRepos, stepError } from "@/lib/scans";
import { currentRepos, MAX_REPOS_PER_SCAN, MAX_SCANS_PER_DAY } from "@/lib/types";

export async function POST() {
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("ANTHROPIC_API_KEY is not set on the server", 500);
  }

  const token = await getToken(supabase, user.id);
  if (!token) return jsonError("GitHub is not connected", 400);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase
    .from("mostviable_scans")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_SCANS_PER_DAY) {
    return jsonError(`Limit of ${MAX_SCANS_PER_DAY} scans per day reached`, 429);
  }

  try {
    // Sync first so pushed_at is current; that is what decides which repos
    // changed since the last scan.
    await syncRepos(supabase, token);
    const repos = currentRepos(await loadRepos(supabase)).filter((r) => r.included);
    if (repos.length === 0) return jsonError("Select at least one repo to scan", 400);
    if (repos.length > MAX_REPOS_PER_SCAN) {
      return jsonError(`Select at most ${MAX_REPOS_PER_SCAN} repos per scan`, 400);
    }

    const { data, error } = await supabase
      .from("mostviable_scans")
      .insert({ repo_ids: repos.map((r) => r.id) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return stepError(err);
  }
}
