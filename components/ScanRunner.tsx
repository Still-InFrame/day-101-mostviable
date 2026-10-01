"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "triage" | "research" | "ranking" | "kits";

export type Progress = {
  phase: Phase;
  done: number;
  total: number;
  active: string[];
  failures: { name: string; error: string }[];
  // Set when the scan stopped and cannot continue without the user acting.
  stopped: string | null;
};

const PHASES: { key: Phase; label: string; detail: string }[] = [
  { key: "triage", label: "Triage", detail: "Reading each repo and scoring it" },
  { key: "research", label: "Market research", detail: "Searching the web for demand, competitors and pricing" },
  { key: "ranking", label: "Ranking", detail: "Comparing the shortlist and picking the top three" },
  { key: "kits", label: "Go-to-market kits", detail: "Writing a selling plan for each winner" },
];

class StepError extends Error {
  constructor(
    message: string,
    public fatal: boolean,
  ) {
    super(message);
  }
}

async function call(url: string, body?: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  // The auth proxy answers an expired session with a redirect to /login.
  if (res.redirected) throw new StepError("Your session expired. Sign in again.", true);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new StepError(data.error ?? `Request failed (${res.status})`, Boolean(data.fatal));
  }
  return data;
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await worker(item);
      }
    }),
  );
}

type Named = { id: string; full_name: string };

export function useScanRunner() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);

  const run = useCallback(
    async (scanId: string, force: boolean) => {
      const base = `/api/scans/${scanId}`;
      const update = (patch: Partial<Progress> | ((p: Progress) => Partial<Progress>)) =>
        setProgress((p) => {
          if (!p) return p;
          return { ...p, ...(typeof patch === "function" ? patch(p) : patch) };
        });

      // Runs one phase's items with limited concurrency. A fatal error stops
      // the remaining items; an ordinary one is recorded and skipped.
      const runPhase = async (
        phase: Phase,
        items: Named[],
        limit: number,
        step: (item: Named) => Promise<void>,
      ) => {
        update({ phase, done: 0, total: items.length, active: [] });
        let fatal: StepError | null = null;
        await pool(items, limit, async (item) => {
          if (fatal) return;
          update((p) => ({ active: [...p.active, item.full_name] }));
          try {
            await step(item);
          } catch (err) {
            const error = err instanceof Error ? err.message : "Failed";
            if (err instanceof StepError && err.fatal) fatal = err;
            update((p) => ({ failures: [...p.failures, { name: item.full_name, error }] }));
          }
          update((p) => ({
            done: p.done + 1,
            active: p.active.filter((n) => n !== item.full_name),
          }));
        });
        if (fatal) throw fatal;
      };

      setProgress({ phase: "triage", done: 0, total: 0, active: [], failures: [], stopped: null });

      try {
        const state = await call(base, undefined, "GET");

        if (state.status === "triage") {
          await runPhase("triage", state.triagePending, 3, (repo) =>
            call(`${base}/triage`, { repoId: repo.id }),
          );
        }

        if (!state.ranked) {
          const { shortlist } = await call(`${base}/shortlist`);
          const todo = (shortlist as (Named & { needsResearch: boolean })[]).filter(
            (r) => force || r.needsResearch,
          );
          await runPhase("research", todo, 2, (repo) =>
            call(`${base}/research`, { repoId: repo.id, force }),
          );

          update({ phase: "ranking", done: 0, total: 1, active: [] });
          await call(`${base}/rank`);
        }

        const ranked = await call(base, undefined, "GET");
        const pending = (ranked.winners as { repo_id: string; full_name: string; hasKit: boolean }[])
          .filter((w) => !w.hasKit)
          .map((w) => ({ id: w.repo_id, full_name: w.full_name }));
        // One at a time: each kit is written into the same scan row. The call
        // flagged `last` is what marks the scan complete, so when every kit
        // already exists the final winner is still sent to close the scan out.
        const winners: Named[] = pending.length
          ? pending
          : ranked.winners.slice(-1).map((w: { repo_id: string; full_name: string }) => ({
              id: w.repo_id,
              full_name: w.full_name,
            }));
        await runPhase("kits", winners, 1, (winner) =>
          call(`${base}/kit`, {
            repoId: winner.id,
            last: winner.id === winners[winners.length - 1].id,
          }),
        );

        router.push(`/scans/${scanId}`);
      } catch (err) {
        update({
          active: [],
          stopped: err instanceof Error ? err.message : "The scan stopped unexpectedly.",
        });
      }
    },
    [router],
  );

  return { progress, run, reset: () => setProgress(null) };
}

export function ScanProgress({
  progress,
  onDismiss,
}: {
  progress: Progress;
  onDismiss: () => void;
}) {
  const current = PHASES.findIndex((p) => p.key === progress.phase);

  return (
    <section className="rounded-xl border border-line bg-panel p-6">
      <h2 className="text-lg font-medium">
        {progress.stopped ? "Scan stopped" : "Scanning your repos"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {progress.stopped
          ? "Finished work is saved. You can resume from the dashboard."
          : "Keep this tab open. Market research is the slow part and can take several minutes."}
      </p>

      <ol className="mt-6 flex flex-col gap-4">
        {PHASES.map((phase, i) => {
          const isCurrent = i === current;
          const isDone = i < current;
          const pct = isDone
            ? 100
            : isCurrent && progress.total > 0
              ? Math.round((progress.done / progress.total) * 100)
              : 0;
          return (
            <li key={phase.key} className={isCurrent || isDone ? "" : "opacity-45"}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">
                  <span className="mr-2 font-mono text-muted">0{i + 1}</span>
                  {phase.label}
                </span>
                <span className="font-mono text-muted">
                  {isDone
                    ? "done"
                    : isCurrent && progress.total > 0
                      ? `${progress.done}/${progress.total}`
                      : ""}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className={`h-full rounded-full bg-accent transition-[width] duration-500 ${
                    isCurrent && progress.total <= 1 && !progress.stopped ? "animate-pulse" : ""
                  }`}
                  style={{ width: `${isCurrent && progress.total <= 1 ? 100 : pct}%` }}
                />
              </div>
              {isCurrent && (
                <p className="mt-2 truncate text-sm text-muted">
                  {progress.active.length ? progress.active.join(", ") : phase.detail}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {progress.failures.length > 0 && (
        <div className="mt-6 rounded-lg border border-line bg-bg p-4 text-sm">
          <p className="font-medium">
            {progress.failures.length} {progress.failures.length === 1 ? "repo" : "repos"} skipped
          </p>
          <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-muted">
            {progress.failures.map((f, i) => (
              <li key={i}>
                <span className="font-mono text-text">{f.name}</span>: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress.stopped && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <span role="alert">{progress.stopped}</span>
          <button
            onClick={() => {
              onDismiss();
              window.location.reload();
            }}
            className="rounded-md bg-warn px-3 py-1.5 font-medium text-bg"
          >
            Back to dashboard
          </button>
        </div>
      )}
    </section>
  );
}
