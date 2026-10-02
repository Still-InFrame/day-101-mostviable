"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Checklist } from "@/components/Checklist";
import { CopyButton } from "@/components/CopyButton";
import {
  ArtBackdrop,
  cx,
  RankBadge,
  ScoreRing,
  splitRepoName,
} from "@/components/ui";
import {
  clampScore,
  SCORE_LABELS,
  SCORE_WEIGHTS,
  weightedScore,
  type Research,
  type ScanResult,
  type StoredResearch,
  type Winner,
} from "@/lib/ai/schemas";
import { safeUrl, sourceVerified } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistItem, RepoRow } from "@/lib/types";

export type ReportRepo = Pick<
  RepoRow,
  "id" | "name" | "full_name" | "html_url" | "homepage" | "research"
>;

const DIMENSIONS = Object.keys(SCORE_WEIGHTS) as (keyof Research["scores"])[];

const SECTIONS = [
  { key: "why", label: "Why it wins" },
  { key: "market", label: "Market" },
  { key: "pitch", label: "Pitch and pricing" },
  { key: "customers", label: "Find customers" },
  { key: "checklist", label: "Checklist" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

// "overview", a winner's rank as a string ("1".."3"), or "rest".
type View = string;

const DONT_PURSUE_PREVIEW = 8;

function Card({
  title,
  children,
  className,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cx("surface rounded-2xl p-6", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="eyebrow">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// Prices come back anywhere from "$29/mo" to a full sentence, so the type size
// steps down as the text gets longer instead of overflowing.
function Price({ text, large = false }: { text: string; large?: boolean }) {
  const short = text.length <= 28;
  return (
    <p
      className={cx(
        "text-pretty",
        short
          ? large
            ? "text-2xl font-medium"
            : "text-lg font-medium"
          : "text-sm leading-relaxed",
      )}
    >
      {text}
    </p>
  );
}

function Source({ url, searched }: { url: string; searched: string[] }) {
  const safe = safeUrl(url);
  if (!safe) return <span className="text-muted">no source</span>;
  const verified = sourceVerified(url, searched);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <a
        href={safe.toString()}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline-offset-4 hover:underline"
      >
        {safe.hostname.replace(/^www\./, "")}
      </a>
      {verified === false && (
        <span
          className="rounded bg-warn/15 px-1 font-mono text-[10px] text-warn"
          title="This link did not appear in the search results that were retrieved. Check it before relying on it."
        >
          unverified
        </span>
      )}
    </span>
  );
}

function Scorecard({ scores }: { scores: Research["scores"] }) {
  return (
    <ul className="flex flex-col gap-4">
      {DIMENSIONS.map((key) => {
        const score = clampScore(scores[key].score);
        return (
          <li key={key}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {SCORE_LABELS[key]}{" "}
                <span className="font-normal text-muted">
                  {Math.round(SCORE_WEIGHTS[key] * 100)}%
                </span>
              </span>
              <span className="font-mono tabular-nums">{score}/10</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className="bar-grow h-full rounded-full bg-accent"
                style={{ width: `${score * 10}%` }}
              />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {scores[key].reason}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

type Entry = { winner: Winner; repo: ReportRepo; research: StoredResearch };

function Overview({
  entries,
  summary,
  onOpen,
}: {
  entries: Entry[];
  summary: string;
  onOpen: (view: View) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-3">
        {entries.map(({ winner, repo, research }) => {
          const { title, day } = splitRepoName(repo.name);
          return (
            <button
              key={repo.id}
              onClick={() => onOpen(String(winner.rank))}
              className={cx(
                "surface surface-hover flex flex-col rounded-2xl p-6 text-left",
                winner.rank === 1 && "border-gold/35",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <RankBadge rank={winner.rank} />
                  {day && <p className="eyebrow mt-4">{day}</p>}
                  <h3
                    className={cx(
                      "font-display text-3xl break-words",
                      day ? "mt-1" : "mt-4",
                    )}
                  >
                    {title}
                  </h3>
                </div>
                <ScoreRing value={weightedScore(research.scores)} size={68} />
              </div>
              <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-muted">
                {winner.headline}
              </p>
              <div className="mt-auto pt-6">
                <div className="border-t border-line pt-4">
                  <p className="eyebrow mb-1.5">Launch price</p>
                  <div className="line-clamp-3">
                    <Price text={winner.price_point} />
                  </div>
                </div>
                <p className="mt-5 text-sm font-medium text-accent">
                  Open the plan →
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        <Card title="The big picture">
          <p className="leading-relaxed text-pretty">{summary}</p>
        </Card>

        <Card title="How the three compare">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr>
                  <th className="pb-3 text-left font-normal text-muted">
                    Out of 10
                  </th>
                  {entries.map(({ winner, repo }) => (
                    <th
                      key={repo.id}
                      className="pb-3 pl-4 text-left font-normal"
                    >
                      <span className="font-mono text-xs text-muted">
                        No. {winner.rank}
                      </span>
                      <span className="block max-w-[9rem] truncate font-medium">
                        {splitRepoName(repo.name).title}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIMENSIONS.map((key) => (
                  <tr key={key} className="border-t border-line/70">
                    <td className="py-2.5 pr-2 text-muted">
                      {SCORE_LABELS[key]}
                    </td>
                    {entries.map(({ repo, research }) => {
                      const score = clampScore(research.scores[key].score);
                      return (
                        <td
                          key={repo.id}
                          className="py-2.5 pl-4"
                          title={research.scores[key].reason}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="h-1.5 w-full max-w-20 overflow-hidden rounded-full bg-raised">
                              <span
                                className="bar-grow block h-full rounded-full bg-accent"
                                style={{ width: `${score * 10}%` }}
                              />
                            </span>
                            <span className="font-mono tabular-nums">
                              {score}
                            </span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <td className="pt-3 font-medium">Viability</td>
                  {entries.map(({ repo, research }) => (
                    <td
                      key={repo.id}
                      className="pt-3 pl-4 font-mono text-base tabular-nums"
                    >
                      {weightedScore(research.scores)}
                      <span className="text-xs text-muted">/100</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function WinnerView({
  entry,
  section,
  items,
  onSection,
  onToggle,
}: {
  entry: Entry;
  section: Section;
  items: ChecklistItem[];
  onSection: (section: Section) => void;
  onToggle: (id: string, done: boolean) => void;
}) {
  const { winner, repo, research } = entry;
  const { title, day } = splitRepoName(repo.name);
  const searched = research.searched_urls ?? [];
  const live = safeUrl(repo.homepage);
  const kit = winner.kit;
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="flex flex-col gap-6">
      <header
        className={cx(
          "surface flex flex-col gap-6 rounded-2xl p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between",
          winner.rank === 1 && "border-gold/35",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <RankBadge rank={winner.rank} />
            {day && <span className="eyebrow">{day}</span>}
          </div>
          <h2 className="mt-3 font-display text-4xl break-words sm:text-5xl">
            {title}
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-pretty text-muted">
            {winner.headline}
          </p>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a
              href={repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-4 hover:underline"
            >
              {repo.full_name} ↗
            </a>
            {live && (
              <a
                href={live.toString()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-4 hover:underline"
              >
                Live app ↗
              </a>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-6 lg:max-w-sm">
          <ScoreRing value={weightedScore(research.scores)} size={92} />
          <div className="min-w-0">
            <p className="eyebrow mb-1.5">Launch price</p>
            <Price text={winner.price_point} large />
          </div>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Report sections"
        className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={section === s.key}
            onClick={() => onSection(s.key)}
            className={cx(
              "flex-1 rounded-lg px-4 py-2 text-sm whitespace-nowrap transition-colors",
              section === s.key
                ? "bg-raised font-medium text-text shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                : "text-muted hover:text-text",
            )}
          >
            {s.label}
            {s.key === "checklist" && items.length > 0 && (
              <span className="ml-2 font-mono text-xs text-muted tabular-nums">
                {doneCount}/{items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div key={section} className="rise">
        {section === "why" && (
          <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_1fr]">
            <div className="flex flex-col gap-5">
              <Card title="Why it wins">
                <p className="leading-relaxed text-pretty">
                  {winner.why_it_wins}
                </p>
              </Card>
              <Card title="Market need">
                <p className="leading-relaxed text-pretty">
                  {research.market_need}
                </p>
                <p className="mt-4 rounded-lg bg-bg/60 px-4 py-3 text-sm">
                  <span className="text-muted">Buyer: </span>
                  {research.target_customer}
                </p>
              </Card>
              <Card title="What sets it apart">
                <p className="leading-relaxed text-pretty">
                  {research.differentiation}
                </p>
              </Card>
              {research.risks.length > 0 && (
                <Card title="Risks">
                  <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted">
                    {research.risks.map((risk, i) => (
                      <li key={i} className="flex gap-3">
                        <span
                          aria-hidden
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-warn"
                        />
                        {risk}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
            <Card title="Scorecard" className="lg:sticky lg:top-32">
              <Scorecard scores={research.scores} />
            </Card>
          </div>
        )}

        {section === "market" && (
          <div className="flex flex-col gap-5">
            <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.25fr]">
              <Card title="Pricing recommendation">
                <Price text={research.pricing.recommended_price} large />
                <p className="mt-1 text-sm text-muted">
                  {research.pricing.model}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {research.pricing.rationale}
                </p>
              </Card>
              <Card title="Evidence of demand">
                {research.demand_evidence.length === 0 ? (
                  <p className="text-sm text-muted">
                    No direct evidence was found.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3 text-sm leading-relaxed">
                    {research.demand_evidence.map((e, i) => (
                      <li
                        key={i}
                        className="border-b border-line/60 pb-3 last:border-b-0 last:pb-0"
                      >
                        {e.claim}{" "}
                        <Source url={e.source_url} searched={searched} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <Card title="Competitors and what they charge">
              {research.competitors.length === 0 ? (
                <p className="text-sm text-muted">
                  The search found no direct competitors.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="text-muted">
                      <tr className="border-b border-line">
                        <th className="py-2 pr-4 font-normal">Product</th>
                        <th className="py-2 pr-4 font-normal">What it does</th>
                        <th className="py-2 pr-4 font-normal">Pricing</th>
                        <th className="py-2 font-normal">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {research.competitors.map((c, i) => {
                        const site = safeUrl(c.url);
                        return (
                          <tr
                            key={i}
                            className="border-b border-line/60 align-top last:border-b-0"
                          >
                            <td className="py-3 pr-4 font-medium whitespace-nowrap">
                              {site ? (
                                <a
                                  href={site.toString()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline-offset-4 hover:underline"
                                >
                                  {c.name}
                                </a>
                              ) : (
                                c.name
                              )}
                            </td>
                            <td className="py-3 pr-4 text-muted">
                              {c.what_they_do}
                            </td>
                            <td className="py-3 pr-4">{c.pricing}</td>
                            <td className="py-3">
                              <Source url={c.source_url} searched={searched} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {(section === "pitch" || section === "customers") && !kit && (
          <Card>
            <p className="text-sm text-muted">
              The kit for this app could not be generated. Run a new scan to try
              again.
            </p>
          </Card>
        )}

        {section === "pitch" && kit && (
          <div className="flex flex-col gap-5">
            <Card title="Positioning">
              <p className="font-display text-2xl leading-snug text-pretty sm:text-3xl">
                {kit.positioning}
              </p>
              <p className="mt-5 rounded-lg bg-bg/60 px-4 py-3 text-sm">
                <span className="text-muted">First customer to go after: </span>
                {kit.ideal_customer}
              </p>
            </Card>

            <div
              className={cx(
                "grid gap-5",
                kit.pricing_tiers.length >= 4
                  ? "sm:grid-cols-2 lg:grid-cols-4"
                  : "sm:grid-cols-3",
              )}
            >
              {kit.pricing_tiers.map((tier, i) => (
                <Card key={i}>
                  <p className="eyebrow">{tier.name}</p>
                  <div className="mt-2">
                    <Price text={tier.price} large />
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {tier.includes}
                  </p>
                </Card>
              ))}
            </div>

            <Card
              title="Launch message"
              action={<CopyButton text={kit.launch_message} />}
            >
              <p className="rounded-xl border border-line bg-bg/60 p-5 text-sm leading-relaxed whitespace-pre-wrap">
                {kit.launch_message}
              </p>
            </Card>
          </div>
        )}

        {section === "customers" && kit && (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card title="Where to find buyers">
              <ul className="flex flex-col gap-4 text-sm leading-relaxed">
                {kit.channels.map((c, i) => (
                  <li key={i}>
                    <p className="font-medium">{c.channel}</p>
                    <p className="mt-0.5 text-muted">{c.action}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Getting the first ten customers">
              <ol className="flex flex-col gap-4 text-sm leading-relaxed">
                {kit.first_10_customers.map((step, i) => (
                  <li key={i} className="flex gap-3.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-raised font-mono text-xs text-muted">
                      {i + 1}
                    </span>
                    <span className="text-muted">{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        )}

        {section === "checklist" && (
          <Card title="Gap to sellable">
            <Checklist items={items} onToggle={onToggle} />
          </Card>
        )}
      </div>
    </div>
  );
}

function Rest({ result, repos }: { result: ScanResult; repos: ReportRepo[] }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const byName = useMemo(
    () => new Map(repos.map((r) => [r.full_name.toLowerCase(), r])),
    [repos],
  );

  const q = query.trim().toLowerCase();
  const matches = q
    ? result.dont_pursue.filter(
        (r) =>
          r.repo_full_name.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q),
      )
    : result.dont_pursue;
  const shown = showAll || q ? matches : matches.slice(0, DONT_PURSUE_PREVIEW);

  return (
    <div className="flex flex-col gap-6">
      {result.runners_up.length > 0 && (
        <section>
          <h2 className="font-display text-3xl">
            Researched, but not top three
          </h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {result.runners_up.map((r, i) => {
              const repo = byName.get(r.repo_full_name.toLowerCase());
              const name = splitRepoName(
                r.repo_full_name.split("/").pop() ?? r.repo_full_name,
              );
              return (
                <div key={i} className="surface flex gap-5 rounded-2xl p-5">
                  {repo?.research && (
                    <ScoreRing
                      value={weightedScore(repo.research.scores)}
                      size={52}
                    />
                  )}
                  <div className="min-w-0">
                    {name.day && <p className="eyebrow">{name.day}</p>}
                    <p className="text-lg font-medium break-words">
                      {name.title}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {r.why_not_top3}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {result.dont_pursue.length > 0 && (
        <section className="surface rounded-2xl p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl">
                Not worth pursuing as products
              </h2>
              <p className="mt-1 text-sm text-muted">
                {result.dont_pursue.length} repos, judged from triage only
                without market research.
              </p>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter this list"
              aria-label="Filter the not worth pursuing list"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent sm:w-60"
            />
          </div>
          <ul className="mt-5 grid gap-x-8 md:grid-cols-2">
            {shown.map((r, i) => (
              <li key={i} className="border-t border-line/60 py-3.5">
                <p className="font-medium break-words">
                  {r.repo_full_name.split("/").pop()}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {r.reason}
                </p>
              </li>
            ))}
          </ul>
          {matches.length === 0 && (
            <p className="mt-4 text-sm text-muted">
              Nothing matches that filter.
            </p>
          )}
          {!q && matches.length > DONT_PURSUE_PREVIEW && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 rounded-lg border border-line bg-raised px-4 py-2 text-sm transition-colors hover:border-accent/50"
            >
              {showAll ? "Show fewer" : `Show all ${matches.length}`}
            </button>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-line/70 p-6 text-sm leading-relaxed text-muted">
        <h2 className="eyebrow mb-3">How this was scored</h2>
        <p className="max-w-3xl">
          Every selected repo was triaged from its README, file list and
          dependencies. The highest-scoring candidates were then researched with
          live web search, and the final three were picked by comparing that
          research side by side, weighing market demand and how sellable the app
          is above how finished the code is. The viability number is a weighted
          average of the five scorecard dimensions, shown with its weights.
          Competitor prices and demand claims link to where they were found; a
          link marked unverified did not appear in the retrieved search results
          and should be checked. This is research to inform your decision, not a
          guarantee of sales.
        </p>
      </section>
    </div>
  );
}

export function Report({
  date,
  scannedCount,
  researchedCount,
  result,
  repos,
  items: initialItems,
  initialView,
  initialSection,
}: {
  date: string;
  scannedCount: number;
  researchedCount: number;
  result: ScanResult;
  repos: ReportRepo[];
  items: ChecklistItem[];
  initialView?: string;
  initialSection?: string;
}) {
  // A winner's repo row can be gone (deleted on GitHub), so only winners that
  // still have their research are shown.
  const entries = useMemo(() => {
    const byId = new Map(repos.map((r) => [r.id, r]));
    return result.winners.flatMap((winner): Entry[] => {
      const repo = byId.get(winner.repo_id);
      return repo?.research ? [{ winner, repo, research: repo.research }] : [];
    });
  }, [repos, result.winners]);

  const validViews = [
    "overview",
    ...entries.map((e) => String(e.winner.rank)),
    "rest",
  ];
  const [view, setView] = useState<View>(
    initialView && validViews.includes(initialView) ? initialView : "overview",
  );
  const [section, setSection] = useState<Section>(
    SECTIONS.some((s) => s.key === initialSection)
      ? (initialSection as Section)
      : "why",
  );
  const [items, setItems] = useState(initialItems);

  // The address bar tracks the open tab so a reload or shared link lands in
  // the same place, without a server round trip on every click.
  function go(nextView: View, nextSection: Section = "why") {
    setView(nextView);
    setSection(nextSection);
    const params = new URLSearchParams({ view: nextView });
    if (/^\d+$/.test(nextView)) params.set("section", nextSection);
    window.history.replaceState(null, "", `?${params}`);
  }

  function open(nextView: View) {
    go(nextView);
    document.getElementById("report-tabs")?.scrollIntoView({ block: "start" });
  }

  async function toggle(id: string, done: boolean) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, done } : i)));
    const { error } = await createClient()
      .from("mostviable_checklist_items")
      .update({ done })
      .eq("id", id);
    if (error) {
      setItems((list) =>
        list.map((i) => (i.id === id ? { ...i, done: !done } : i)),
      );
    }
  }

  const current = entries.find((e) => String(e.winner.rank) === view);
  const currentIndex = current ? entries.indexOf(current) : -1;
  const previous = currentIndex > 0 ? entries[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < entries.length - 1
      ? entries[currentIndex + 1]
      : null;

  const tabs: { key: View; label: string; rank?: number }[] = [
    { key: "overview", label: "Overview" },
    ...entries.map((e) => ({
      key: String(e.winner.rank),
      label: splitRepoName(e.repo.name).title,
      rank: e.winner.rank,
    })),
    { key: "rest", label: "Everything else" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-16">
      <section className="relative mt-6 overflow-hidden rounded-3xl border border-line px-6 py-10 sm:px-10 sm:py-14">
        <ArtBackdrop src="/art/contours.jpg" priority />
        <div className="relative">
          <Link
            href="/"
            className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
          >
            ← Dashboard
          </Link>
          <p className="eyebrow mt-8">Scan report · {date}</p>
          <h1 className="mt-3 max-w-2xl font-display text-5xl leading-[1.05] text-balance sm:text-6xl">
            Your {entries.length === 3 ? "three " : ""}most viable apps
          </h1>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            {[
              [scannedCount, "repos scanned"],
              [researchedCount, "researched"],
              [entries.length, entries.length === 1 ? "winner" : "winners"],
            ].map(([value, label]) => (
              <div key={label}>
                <dd className="font-mono text-2xl tabular-nums">{value}</dd>
                <dt className="text-sm text-muted">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <nav
        id="report-tabs"
        aria-label="Report"
        className="sticky top-14 z-20 -mx-5 scroll-mt-14 bg-bg/85 px-5 py-3 backdrop-blur-md"
      >
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => go(tab.key)}
              aria-current={view === tab.key ? "page" : undefined}
              className={cx(
                "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors",
                view === tab.key
                  ? "border-accent/60 bg-accent/10 text-text"
                  : "border-line bg-panel text-muted hover:border-muted/50 hover:text-text",
              )}
            >
              {tab.rank && (
                <span className="font-mono text-xs text-accent">
                  {tab.rank}
                </span>
              )}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div key={view} className="rise mt-3">
        {view === "overview" && (
          <Overview entries={entries} summary={result.summary} onOpen={open} />
        )}

        {current && (
          <>
            <WinnerView
              entry={current}
              section={section}
              items={items.filter((i) => i.repo_id === current.repo.id)}
              onSection={(s) => go(view, s)}
              onToggle={toggle}
            />
            <div className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-6 text-sm">
              {previous ? (
                <button
                  onClick={() => open(String(previous.winner.rank))}
                  className="text-muted hover:text-text"
                >
                  ← No. {previous.winner.rank}{" "}
                  {splitRepoName(previous.repo.name).title}
                </button>
              ) : (
                <button
                  onClick={() => open("overview")}
                  className="text-muted hover:text-text"
                >
                  ← Overview
                </button>
              )}
              {next ? (
                <button
                  onClick={() => open(String(next.winner.rank))}
                  className="text-accent hover:underline"
                >
                  No. {next.winner.rank} {splitRepoName(next.repo.name).title} →
                </button>
              ) : (
                <button
                  onClick={() => open("rest")}
                  className="text-accent hover:underline"
                >
                  Everything else →
                </button>
              )}
            </div>
          </>
        )}

        {view === "rest" && <Rest result={result} repos={repos} />}
      </div>
    </main>
  );
}
