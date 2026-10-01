"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAX_REPOS_PER_SCAN, SHORTLIST_SIZE } from "@/lib/types";
import { ScanProgress, useScanRunner } from "./ScanRunner";

export type RepoLite = {
  id: string;
  full_name: string;
  owner: string;
  name: string;
  description: string | null;
  is_private: boolean;
  is_fork: boolean;
  is_archived: boolean;
  language: string | null;
  included: boolean;
  triage_score: number | null;
  // "new" has never been triaged, "changed" was pushed to since its last triage.
  state: "new" | "changed" | "unchanged";
};

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
        tone === "accent" ? "bg-accent/15 text-accent" : "bg-raised text-muted"
      }`}
    >
      {children}
    </span>
  );
}

export function Workspace({
  login,
  repos: initialRepos,
  unfinishedScanId,
}: {
  login: string;
  repos: RepoLite[];
  unfinishedScanId: string | null;
}) {
  const router = useRouter();
  const [repos, setRepos] = useState(initialRepos);
  const [query, setQuery] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const runner = useScanRunner();

  const selected = repos.filter((r) => r.included);
  const needsTriage = selected.filter((r) => r.state !== "unchanged").length;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? repos.filter(
          (r) =>
            r.full_name.toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q),
        )
      : repos;
    const byOwner = new Map<string, RepoLite[]>();
    for (const repo of visible) {
      byOwner.set(repo.owner, [...(byOwner.get(repo.owner) ?? []), repo]);
    }
    return [...byOwner.entries()];
  }, [repos, query]);

  async function setIncluded(ids: string[], included: boolean) {
    const before = repos;
    setRepos((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, included } : r)));
    const { error } = await createClient()
      .from("mostviable_repos")
      .update({ included })
      .in("id", ids);
    if (error) {
      setRepos(before);
      setNotice("Could not save your selection. Try again.");
    }
  }

  async function refreshList() {
    setBusy("refresh");
    setNotice(null);
    const res = await fetch("/api/github/sync", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setNotice(body.error ?? "Could not refresh the repo list.");
    } else {
      // A full reload re-reads the rows the sync just wrote.
      window.location.reload();
      return;
    }
    setBusy(null);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect GitHub? Your past reports stay, but you will need to reconnect to scan again.")) {
      return;
    }
    setBusy("disconnect");
    await fetch("/api/github/disconnect", { method: "POST" });
    router.refresh();
  }

  async function startScan() {
    setNotice(null);
    setBusy("scan");
    const res = await fetch("/api/scans", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok || !body.id) {
      setNotice(body.error ?? "Could not start the scan.");
      return;
    }
    runner.run(body.id, force);
  }

  if (runner.progress) {
    return <ScanProgress progress={runner.progress} onDismiss={runner.reset} />;
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          Connected as <span className="font-mono text-text">@{login}</span>
        </p>
        <div className="flex items-center gap-4 text-muted">
          <button
            onClick={refreshList}
            disabled={busy !== null}
            className="underline-offset-4 hover:text-text hover:underline disabled:opacity-50"
          >
            {busy === "refresh" ? "Refreshing…" : "Refresh repo list"}
          </button>
          <button
            onClick={disconnect}
            disabled={busy !== null}
            className="underline-offset-4 hover:text-text hover:underline disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      </div>

      {unfinishedScanId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <span>Your last scan did not finish. Work already done is saved.</span>
          <button
            onClick={() => runner.run(unfinishedScanId, false)}
            className="rounded-md bg-warn px-3 py-1.5 font-medium text-bg"
          >
            Resume scan
          </button>
        </div>
      )}

      {notice && (
        <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      <div className="rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-medium">Choose repos to include</h2>
            <p className="text-sm text-muted">
              Only ticked repos are read. Forks and archived repos start unticked.
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter repos"
            aria-label="Filter repos"
            className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent sm:w-56"
          />
        </div>

        {repos.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted">
            GitHub returned no repos for this account. If your repos belong to an
            organization, an owner may need to approve this app for it, then use
            Refresh repo list.
          </p>
        )}

        <div className="max-h-[28rem] overflow-y-auto">
          {groups.map(([owner, ownerRepos]) => {
            const ids = ownerRepos.map((r) => r.id);
            return (
              <div key={owner}>
                <div className="sticky top-0 flex items-center justify-between border-b border-line bg-raised px-4 py-2 text-sm">
                  <span className="font-mono">
                    {owner}{" "}
                    <span className="text-muted">
                      {ownerRepos.filter((r) => r.included).length}/{ownerRepos.length}
                    </span>
                  </span>
                  <span className="flex gap-3 text-muted">
                    <button className="hover:text-text" onClick={() => setIncluded(ids, true)}>
                      All
                    </button>
                    <button className="hover:text-text" onClick={() => setIncluded(ids, false)}>
                      None
                    </button>
                  </span>
                </div>
                <ul>
                  {ownerRepos.map((repo) => (
                    <li key={repo.id} className="border-b border-line/60 last:border-b-0">
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-raised/60">
                        <input
                          type="checkbox"
                          checked={repo.included}
                          onChange={(e) => setIncluded([repo.id], e.target.checked)}
                          className="mt-1 size-4 accent-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{repo.name}</span>
                            {repo.is_private && <Badge>private</Badge>}
                            {repo.is_fork && <Badge>fork</Badge>}
                            {repo.is_archived && <Badge>archived</Badge>}
                            {repo.language && <Badge>{repo.language}</Badge>}
                            {repo.state === "new" && <Badge tone="accent">new</Badge>}
                            {repo.state === "changed" && <Badge tone="accent">changed</Badge>}
                          </span>
                          {repo.description && (
                            <span className="mt-0.5 block truncate text-sm text-muted">
                              {repo.description}
                            </span>
                          )}
                        </span>
                        {repo.triage_score !== null && (
                          <span
                            className="font-mono text-sm text-muted"
                            title="Triage score from the last scan"
                          >
                            {Math.round(repo.triage_score)}
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-panel px-4 py-4">
        <div className="text-sm">
          <p>
            <span className="font-mono text-accent">{selected.length}</span> selected,{" "}
            <span className="font-mono">{needsTriage}</span> new or changed since the last scan
          </p>
          <p className="mt-1 text-muted">
            Unchanged repos reuse their earlier results. The top {SHORTLIST_SIZE} get
            live market research.
          </p>
          <label className="mt-2 flex items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="size-4 accent-accent"
            />
            Redo market research even for unchanged repos
          </label>
        </div>
        <button
          onClick={startScan}
          disabled={
            busy !== null || selected.length === 0 || selected.length > MAX_REPOS_PER_SCAN
          }
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-ink hover:brightness-110 disabled:opacity-40"
        >
          {busy === "scan"
            ? "Starting…"
            : selected.length > MAX_REPOS_PER_SCAN
              ? `Select at most ${MAX_REPOS_PER_SCAN}`
              : `Scan ${selected.length} ${selected.length === 1 ? "repo" : "repos"}`}
        </button>
      </div>
    </section>
  );
}
