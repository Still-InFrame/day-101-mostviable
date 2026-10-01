import { NextResponse } from "next/server";
import { getSession, jsonError } from "@/lib/auth";
import { loadRepos, loadScan, stepError, type RouteParams } from "@/lib/scans";
import { researchIsFresh, SHORTLIST_SIZE } from "@/lib/types";

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);

  const scan = await loadScan(supabase, id);
  if (!scan) return jsonError("Scan not found", 404);

  try {
    const repos = await loadRepos(supabase, scan.repo_ids);

    // Once ranking has started the shortlist is fixed; before that it is
    // recomputed so a resumed scan picks up any late triage results.
    const locked = scan.status === "ranking" || scan.status === "complete";
    const shortlist = locked
      ? repos.filter((r) => scan.shortlist_ids.includes(r.id))
      : repos
          .filter((r) => r.triage?.is_product)
          .sort((a, b) => (b.triage_score ?? 0) - (a.triage_score ?? 0))
          .slice(0, SHORTLIST_SIZE);

    if (!locked) {
      if (shortlist.length === 0) {
        const message =
          "None of the scanned repos looked like a sellable product, so there was nothing to research.";
        await supabase
          .from("mostviable_scans")
          .update({ status: "failed", error: message })
          .eq("id", id);
        return NextResponse.json({ error: message, fatal: true }, { status: 422 });
      }
      const { error } = await supabase
        .from("mostviable_scans")
        .update({ status: "research", shortlist_ids: shortlist.map((r) => r.id) })
        .eq("id", id);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({
      shortlist: shortlist.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        needsResearch: !researchIsFresh(r),
      })),
    });
  } catch (err) {
    return stepError(err);
  }
}
