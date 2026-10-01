import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { Workspace, type RepoLite } from "@/components/Workspace";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { currentRepos, triageIsFresh, type RepoRow, type ScanRow } from "@/lib/types";

const GITHUB_NOTICES: Record<string, string> = {
  denied: "GitHub access was not granted, so nothing was connected.",
  failed: "Connecting GitHub failed. Please try again.",
};

const REQUIRED_ENV = [
  "ANTHROPIC_API_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_TOKEN_ENCRYPTION_KEY",
];

type RepoListRow = Pick<
  RepoRow,
  | "id"
  | "full_name"
  | "owner"
  | "name"
  | "description"
  | "is_private"
  | "is_fork"
  | "is_archived"
  | "language"
  | "pushed_at"
  | "included"
  | "triage"
  | "triage_score"
  | "triaged_pushed_at"
  | "synced_at"
>;

export default async function Home({ searchParams }: PageProps<"/">) {
  const { github } = await searchParams;
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const [{ data: connection }, { data: repoRows }, { data: scanRows }] = await Promise.all([
    supabase.from("mostviable_github_connections").select("github_login").maybeSingle(),
    supabase
      .from("mostviable_repos")
      .select(
        "id, full_name, owner, name, description, is_private, is_fork, is_archived, language, pushed_at, included, triage, triage_score, triaged_pushed_at, synced_at",
      )
      .order("pushed_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("mostviable_scans")
      .select("id, status, result, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const repos: RepoLite[] = currentRepos((repoRows ?? []) as RepoListRow[]).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    owner: r.owner,
    name: r.name,
    description: r.description,
    is_private: r.is_private,
    is_fork: r.is_fork,
    is_archived: r.is_archived,
    language: r.language,
    included: r.included,
    triage_score: r.triage_score,
    state: triageIsFresh(r) ? "unchanged" : r.triage ? "changed" : "new",
  }));

  const scans = (scanRows ?? []) as Pick<
    ScanRow,
    "id" | "status" | "result" | "created_at" | "completed_at"
  >[];
  const completed = scans.filter((s) => s.status === "complete" && s.result);
  const latest = completed[0];
  const newest = scans[0];
  const unfinished =
    newest && ["triage", "research", "ranking"].includes(newest.status) ? newest.id : null;

  const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
  const notice = typeof github === "string" ? GITHUB_NOTICES[github] : undefined;

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Which of your apps should you sell?
          </h1>
          <p className="mt-3 max-w-2xl text-muted">
            mostviable reads the repos you choose, researches the market for the
            strongest candidates, and names the three most worth turning into a
            product, with a price and a plan for each.
          </p>
        </div>

        {missingEnv.length > 0 && (
          <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
            <p className="font-medium">Setup needed</p>
            <p className="mt-1 text-muted">
              These server settings are empty, so parts of the app will not work yet:{" "}
              <span className="font-mono text-text">{missingEnv.join(", ")}</span>
            </p>
          </div>
        )}

        {notice && (
          <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
            {notice}
          </p>
        )}

        {latest?.result && (
          <section className="rounded-xl border border-accent/30 bg-panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-medium">
                Your top three{" "}
                <span className="font-normal text-muted">
                  from {formatDate(latest.completed_at ?? latest.created_at)}
                </span>
              </h2>
              <Link
                href={`/scans/${latest.id}`}
                className="text-sm text-accent underline-offset-4 hover:underline"
              >
                Open full report
              </Link>
            </div>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              {latest.result.winners.map((w) => (
                <li key={w.repo_id} className="rounded-lg border border-line bg-bg p-4">
                  <span className="font-mono text-sm text-accent">0{w.rank}</span>
                  <p className="mt-1 font-medium break-words">{w.repo_full_name.split("/")[1]}</p>
                  <p className="mt-1 text-sm text-muted">{w.headline}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {connection ? (
          <Workspace
            login={connection.github_login}
            repos={repos}
            unfinishedScanId={unfinished}
          />
        ) : (
          <section className="rounded-xl border border-line bg-panel p-6">
            <h2 className="text-lg font-medium">Connect GitHub to begin</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              GitHub will ask you to grant access to your repositories, including
              private ones. That permission is broader than this app needs: it only
              ever reads, and only the repos you tick on the next screen. You can
              disconnect at any time, which revokes the access on GitHub too.
            </p>
            <a
              href="/api/github/connect"
              className="mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-ink hover:brightness-110"
            >
              Connect GitHub
            </a>
          </section>
        )}

        {completed.length > 1 && (
          <section>
            <h2 className="text-sm font-medium text-muted">Earlier reports</h2>
            <ul className="mt-2 flex flex-col">
              {completed.slice(1).map((scan) => (
                <li key={scan.id} className="border-b border-line py-2 text-sm">
                  <Link href={`/scans/${scan.id}`} className="hover:text-accent">
                    {formatDate(scan.completed_at ?? scan.created_at)}
                    <span className="ml-3 text-muted">
                      {scan.result?.winners.map((w) => w.repo_full_name.split("/")[1]).join(", ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
