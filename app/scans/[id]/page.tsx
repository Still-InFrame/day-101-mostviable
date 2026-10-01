import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { Report } from "@/components/Report";
import { getSession } from "@/lib/auth";
import { loadRepos, loadScan } from "@/lib/scans";
import type { ChecklistItem } from "@/lib/types";

export default async function ScanPage({ params }: PageProps<"/scans/[id]">) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const scan = await loadScan(supabase, id);
  if (!scan) notFound();
  if (!scan.result) {
    return (
      <>
        <Header email={user.email} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
          <h1 className="text-2xl font-semibold">This scan has no results yet</h1>
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

  return (
    <>
      <Header email={user.email} />
      <Report
        scan={scan}
        result={scan.result}
        repos={repos}
        items={(itemRows ?? []) as ChecklistItem[]}
      />
    </>
  );
}
