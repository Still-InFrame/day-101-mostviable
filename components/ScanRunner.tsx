"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "triage" | "research" | "ranking" | "kits";

export type ProgressItem = {
  name: string;
  // Client clock, in ms. Null until the item starts / while it is running.
  startedAt: number | null;
  finishedAt: number | null;
  failed: boolean;
};

export type Progress = {
  phase: Phase;
  // Every unit of work in the current phase, in the order it was queued.
  items: ProgressItem[];
  failures: { name: string; error: string }[];
  // Set when the scan stopped and cannot continue without the user acting.
  stopped: string | null;
};

const PHASES: { key: Phase; label: string; detail: string }[] = [
  { key: "triage", label: "Triage", detail: "Reading each repo and scoring it, three at a time" },
  {
    key: "research",
    label: "Market research",
    detail: "Searching the web for demand, competitors and pricing. Each app takes a minute or two.",
  },
  { key: "ranking", label: "Ranking", detail: "Comparing the shortlist side by side to pick the top three" },
  { key: "kits", label: "Go-to-market kits", detail: "Writing a selling plan for each winner, about a minute each" },
];

// Phases with more items than this only list the ones in progress.
const FULL_LIST_LIMIT = 12;

const queued = (name: string): ProgressItem => ({
  name,
  startedAt: null,
  finishedAt: null,
  failed: false,
});

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
        update({ phase, items: items.map((i) => queued(i.full_name)) });
        const mark = (name: string, patch: Partial<ProgressItem>) =>
          update((p) => ({
            items: p.items.map((i) => (i.name === name ? { ...i, ...patch } : i)),
          }));
        let fatal: StepError | null = null;
        await pool(items, limit, async (item) => {
          if (fatal) return;
          mark(item.full_name, { startedAt: Date.now() });
          let failed = false;
          try {
            await step(item);
          } catch (err) {
            failed = true;
            const error = err instanceof Error ? err.message : "Failed";
            if (err instanceof StepError && err.fatal) fatal = err;
            update((p) => ({ failures: [...p.failures, { name: item.full_name, error }] }));
          }
          mark(item.full_name, { finishedAt: Date.now(), failed });
        });
        if (fatal) throw fatal;
      };

      setProgress({ phase: "triage", items: [], failures: [], stopped: null });

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

          // Not run through runPhase: a ranking failure has to stop the scan,
          // not be recorded as one skipped item.
          update({
            phase: "ranking",
            items: [{ ...queued("Comparing all researched apps"), startedAt: Date.now() }],
          });
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
          stopped: err instanceof Error ? err.message : "The scan stopped unexpectedly.",
        });
      }
    },
    [router],
  );

  return { progress, run, reset: () => setProgress(null) };
}

function clock(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Ticks once a second while `until` is null, then freezes on the final time.
function Elapsed({ since, until }: { since: number; until: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return <span className="font-mono tabular-nums">{clock((until ?? now) - since)}</span>;
}

function ItemRow({ item, stopped }: { item: ProgressItem; stopped: boolean }) {
  const running = item.startedAt !== null && item.finishedAt === null;
  const done = item.finishedAt !== null;
  // Owner prefixes repeat on every row, so only the repo name is shown.
  const label = item.name.includes("/") ? item.name.split("/")[1] : item.name;

  return (
    <li className="flex items-center gap-3 py-1.5 text-sm">
      <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
        {done ? (
          <span className={item.failed ? "text-warn" : "text-accent"}>{item.failed ? "✕" : "✓"}</span>
        ) : running && !stopped ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-accent/25 border-t-accent motion-reduce:animate-none" />
        ) : (
          <span className="size-1.5 rounded-full bg-muted/50" />
        )}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${
          running ? "text-text" : done ? "text-muted" : "text-muted/60"
        }`}
      >
        {label}
      </span>
      <span className="shrink-0 text-muted">
        {item.startedAt === null ? (
          "queued"
        ) : running && stopped ? (
          "stopped"
        ) : (
          <Elapsed since={item.startedAt} until={item.finishedAt} />
        )}
      </span>
    </li>
  );
}

export function ScanProgress({
  progress,
  onDismiss,
}: {
  progress: Progress;
  onDismiss: () => void;
}) {
  const current = PHASES.findIndex((p) => p.key === progress.phase);
  const stopped = progress.stopped !== null;
  const total = progress.items.length;
  const done = progress.items.filter((i) => i.finishedAt !== null).length;
  const visible =
    total <= FULL_LIST_LIMIT
      ? progress.items
      : progress.items.filter((i) => i.startedAt !== null && i.finishedAt === null);

  return (
    <section className="surface rounded-3xl p-6 sm:p-10">
      <p className="eyebrow">{stopped ? "Paused" : "In progress"}</p>
      <h2 className="mt-2 font-display text-4xl">
        {stopped ? "Scan stopped" : "Scanning your repos"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {stopped
          ? "Finished work is saved. You can resume from the dashboard."
          : "Keep this tab open. Market research is the slow part and can take several minutes."}
      </p>

      <ol className="mt-8 flex flex-col gap-5">
        {PHASES.map((phase, i) => {
          const isCurrent = i === current;
          const isDone = i < current;
          const live = isCurrent && !stopped;
          // A single-item phase has no meaningful fraction, so it gets a
          // sliding bar instead of a fill.
          const indeterminate = live && total <= 1;
          const pct = isDone ? 100 : isCurrent && total > 0 ? (done / total) * 100 : 0;
          return (
            <li key={phase.key} className={isCurrent || isDone ? "" : "opacity-45"}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">
                  <span className="mr-2 font-mono text-muted">0{i + 1}</span>
                  {phase.label}
                </span>
                <span className="font-mono text-muted tabular-nums">
                  {isDone ? "done" : isCurrent && total > 1 ? `${done}/${total}` : ""}
                </span>
              </div>
              <div
                className={`relative mt-2 h-1.5 overflow-hidden rounded-full bg-raised ${
                  live && !indeterminate ? "bar-sheen" : ""
                }`}
              >
                {indeterminate ? (
                  <div className="bar-slide rounded-full bg-accent" />
                ) : (
                  <div
                    className="relative h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
              {isCurrent && (
                <>
                  <p className="mt-2 text-sm text-muted">{phase.detail}</p>
                  {visible.length > 0 && (
                    <ul className="mt-3 rounded-xl border border-line bg-bg/60 px-4 py-2">
                      {visible.map((item) => (
                        <ItemRow key={item.name} item={item} stopped={stopped} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>

      {progress.failures.length > 0 && (
        <div className="mt-8 rounded-xl border border-line bg-bg/60 p-5 text-sm">
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
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-5 py-4 text-sm">
          <span role="alert">{progress.stopped}</span>
          <button
            onClick={() => {
              onDismiss();
              window.location.reload();
            }}
            className="rounded-full bg-warn px-4 py-1.5 font-medium text-bg"
          >
            Back to dashboard
          </button>
        </div>
      )}
    </section>
  );
}
