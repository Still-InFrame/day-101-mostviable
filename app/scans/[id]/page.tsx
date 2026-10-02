import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { Report } from "@/components/Report";
import { touchAccess } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { loadRepos, loadScan } from "@/lib/scans";
import type { ChecklistItem } from "@/lib/types";

export default async function ScanPage({ params, searchParams }: PageProps<"/scans/[id]">) {
  const { id } = await params;
  const { view, section } = await searchParams;
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");
  const isAdmin = (await touchAccess(supabase)).role === "admin";

  const scan = await loadScan(supabase, id);
  if (!scan) notFound();
  if (!scan.result) {
    return (
      <>
        <Header email={user.email} isAdmin={isAdmin} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-16">
          <h1 className="font-display text-4xl">This scan has no results yet</h1>
          <p className="mt-2 text-muted">
            {scan.error ?? "It did not finish. You can resume it from the dashboard."}
          </p>
          <Link href="/" className="mt-4 inline-block text-accent underline-offset-4 hover:underline">
            Back to dashboard
          </Link>
        </main>
      </>
    );
  }

  const [repos, { data: itemRows }] = await Promise.all([
    loadRepos(supabase, scan.repo_ids),
    supabase
      .from("mostviable_checklist_items")
      .select("*")
      .eq("scan_id", id)
      .order("position"),
  ]);

  // Only shortlisted repos carry research; the client report needs nothing
  // from the rest, so they are left out of the page payload.
  const shortlist = repos
    .filter((r) => scan.shortlist_ids.includes(r.id))
    .map(({ id, name, full_name, html_url, homepage, research }) => ({
      id,
      name,
      full_name,
      html_url,
      homepage,
      research,
    }));

  return (
    <>
      <Header email={user.email} isAdmin={isAdmin} />
      <Report
        date={formatDate(scan.completed_at ?? scan.created_at)}
        scannedCount={scan.repo_ids.length}
        researchedCount={scan.shortlist_ids.length}
        result={scan.result}
        repos={shortlist}
        items={(itemRows ?? []) as ChecklistItem[]}
        initialView={typeof view === "string" ? view : undefined}
        initialSection={typeof section === "string" ? section : undefined}
      />
    </>
  );
}
