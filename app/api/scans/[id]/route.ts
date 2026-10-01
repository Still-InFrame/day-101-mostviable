import { NextResponse } from "next/server";
import { getSession, jsonError } from "@/lib/auth";
import { loadRepos, loadScan, type RouteParams } from "@/lib/scans";
import { triageIsFresh } from "@/lib/types";

// Reports where a scan stands so the client can start or resume driving it.
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);

  const scan = await loadScan(supabase, id);
  if (!scan) return jsonError("Scan not found", 404);

  const repos = await loadRepos(supabase, scan.repo_ids);
  return NextResponse.json({
    status: scan.status,
    error: scan.error,
    total: repos.length,
    triagePending: repos
      .filter((r) => !triageIsFresh(r))
      .map((r) => ({ id: r.id, full_name: r.full_name })),
    ranked: scan.result !== null,
    winners: (scan.result?.winners ?? []).map((w) => ({
      repo_id: w.repo_id,
      full_name: w.repo_full_name,
      hasKit: Boolean(w.kit),
    })),
  });
}
