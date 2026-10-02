import Link from "next/link";
import { ArtBackdrop, cx, RankBadge, splitRepoName } from "@/components/ui";
import type { ScanResult } from "@/lib/ai/schemas";
import { formatDate } from "@/lib/format";
import type { ScanRow } from "@/lib/types";

type CompletedScan = Pick<ScanRow, "id" | "created_at" | "completed_at"> & {
  result: ScanResult;
};

export function Hero() {
  return (
    <section className="relative mt-6 overflow-hidden rounded-3xl border border-line px-6 py-12 sm:px-10 sm:py-16">
      <ArtBackdrop src="/art/bars.jpg" priority />
      <div className="relative">
        <p className="eyebrow">Portfolio scan</p>
        <h1 className="mt-3 max-w-2xl font-display text-5xl leading-[1.05] text-balance sm:text-6xl">
          Which of your apps should you sell?
        </h1>
        <p className="mt-5 max-w-xl leading-relaxed text-muted">
          mostviable reads the repos you choose, researches the market for the
          strongest candidates, and names the three most worth turning into a
          product, with a price and a plan for each.
        </p>
      </div>
    </section>
  );
}

export function TopThree({ latest }: { latest: CompletedScan }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">
            Latest report · {formatDate(latest.completed_at ?? latest.created_at)}
          </p>
          <h2 className="mt-2 font-display text-4xl">Your top three</h2>
        </div>
        <Link
          href={`/scans/${latest.id}`}
          className="rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-accent/60"
        >
          Open full report →
        </Link>
      </div>
      <ol className="mt-5 grid gap-5 md:grid-cols-3">
        {latest.result.winners.map((w) => {
          const { title, day } = splitRepoName(w.repo_full_name.split("/").pop() ?? "");
          return (
            <li key={w.repo_id}>
              <Link
                href={`/scans/${latest.id}?view=${w.rank}`}
                className={cx(
                  "surface surface-hover flex h-full flex-col rounded-2xl p-6",
                  w.rank === 1 && "border-gold/35",
                )}
              >
                <RankBadge rank={w.rank} />
                {day && <p className="eyebrow mt-4">{day}</p>}
                <p className={cx("font-display text-3xl break-words", day ? "mt-1" : "mt-4")}>
                  {title}
                </p>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">
                  {w.headline}
                </p>
                <p className="mt-auto pt-5 text-sm font-medium text-accent">Open the plan →</p>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ConnectCard() {
  return (
    <section className="surface relative overflow-hidden rounded-3xl">
      <ArtBackdrop src="/art/cubes.jpg" />
      <div className="relative max-w-xl px-6 py-12 sm:px-10">
        <p className="eyebrow">Step one</p>
        <h2 className="mt-3 font-display text-4xl">Connect GitHub to begin</h2>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          GitHub will ask you to grant access to your repositories, including
          private ones. That permission is broader than this app needs: it only
          ever reads, and only the repos you tick on the next screen. You can
          disconnect at any time, which revokes the access on GitHub too.
        </p>
        <a
          href="/api/github/connect"
          className="btn-primary mt-7 inline-flex items-center gap-2.5 rounded-full px-6 py-3"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          Connect GitHub
        </a>
      </div>
    </section>
  );
}

export function EarlierReports({ scans }: { scans: CompletedScan[] }) {
  return (
    <section>
      <h2 className="eyebrow">Earlier reports</h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {scans.map((scan) => (
          <li key={scan.id}>
            <Link
              href={`/scans/${scan.id}`}
              className="surface surface-hover flex items-center justify-between gap-4 rounded-xl px-5 py-4 text-sm"
            >
              <span className="min-w-0">
                <span className="block font-medium">
                  {formatDate(scan.completed_at ?? scan.created_at)}
                </span>
                <span className="mt-0.5 block truncate text-muted">
                  {scan.result.winners
                    .map((w) => splitRepoName(w.repo_full_name.split("/").pop() ?? "").title)
                    .join(", ")}
                </span>
              </span>
              <span aria-hidden className="text-muted">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
