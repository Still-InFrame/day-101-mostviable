import { redirect } from "next/navigation";
import { ConnectCard, EarlierReports, Hero, TopThree } from "@/components/Dashboard";
import { Header } from "@/components/Header";
import { Workspace, type RepoLite } from "@/components/Workspace";
import { ACCESS_MESSAGES, touchAccess } from "@/lib/access";
import { getSession } from "@/lib/auth";
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
  const access = await touchAccess(supabase);

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
  const completed = scans.flatMap((s) =>
    s.status === "complete" && s.result ? [{ ...s, result: s.result }] : [],
  );
  const latest = completed[0];
  const newest = scans[0];
  const unfinished =
    newest && ["triage", "research", "ranking"].includes(newest.status) ? newest.id : null;

  const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
  const notice = typeof github === "string" ? GITHUB_NOTICES[github] : undefined;

  return (
    <>
      <Header email={user.email} isAdmin={access.role === "admin"} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 pb-16">
        <Hero />

        {missingEnv.length > 0 && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 px-5 py-4 text-sm">
            <p className="font-medium">Setup needed</p>
            <p className="mt-1 text-muted">
              These server settings are empty, so parts of the app will not work yet:{" "}
              <span className="font-mono text-text">{missingEnv.join(", ")}</span>
            </p>
          </div>
        )}

        {notice && (
          <p role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-5 py-4 text-sm">
            {notice}
          </p>
        )}

        {latest && <TopThree latest={latest} />}

        {access.status !== "active" ? (
          <section className="surface rounded-3xl px-6 py-12 sm:px-10">
            <p className="eyebrow">Access</p>
            <h2 className="mt-3 font-display text-4xl">{ACCESS_MESSAGES[access.status]}</h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
              {access.status === "pending"
                ? "New accounts are approved by hand. You will be able to connect GitHub and run scans as soon as yours is."
                : "You can still open your earlier reports. Contact the owner if you think this is a mistake."}
            </p>
          </section>
        ) : connection ? (
          <Workspace
            login={connection.github_login}
            repos={repos}
            unfinishedScanId={unfinished}
            hasReport={Boolean(latest)}
          />
        ) : (
          <ConnectCard />
        )}

        {completed.length > 1 && <EarlierReports scans={completed.slice(1)} />}
      </main>
    </>
  );
}
