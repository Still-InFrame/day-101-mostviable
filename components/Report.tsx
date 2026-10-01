import Link from "next/link";
import { Checklist } from "@/components/Checklist";
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
import { formatDate, safeUrl, sourceVerified } from "@/lib/format";
import type { ChecklistItem, RepoRow, ScanRow } from "@/lib/types";

const DIMENSIONS = Object.keys(SCORE_WEIGHTS) as (keyof Research["scores"])[];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-xs tracking-widest text-muted uppercase">{children}</h3>
  );
}

function Source({ url, searched }: { url: string; searched: string[] }) {
  const safe = safeUrl(url);
  if (!safe) return <span className="text-muted">no source</span>;
  const verified = sourceVerified(url, searched);
  return (
    <span className="inline-flex items-center gap-1.5">
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
    <ul className="flex flex-col gap-3">
      {DIMENSIONS.map((key) => {
        const score = clampScore(scores[key].score);
        return (
          <li key={key}>
            <div className="flex items-baseline justify-between text-sm">
              <span>
                {SCORE_LABELS[key]}{" "}
                <span className="text-muted">{Math.round(SCORE_WEIGHTS[key] * 100)}%</span>
              </span>
              <span className="font-mono">{score}/10</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent" style={{ width: `${score * 10}%` }} />
            </div>
            <p className="mt-1.5 text-sm text-muted">{scores[key].reason}</p>
          </li>
        );
      })}
    </ul>
  );
}

function WinnerCard({
  winner,
  repo,
  items,
}: {
  winner: Winner;
  repo: RepoRow;
  items: ChecklistItem[];
}) {
  const research = repo.research as StoredResearch;
  const searched = research.searched_urls ?? [];
  const live = safeUrl(repo.homepage);
  const kit = winner.kit;

  return (
    <article
      id={`rank-${winner.rank}`}
      className="scroll-mt-6 rounded-2xl border border-line bg-panel"
    >
      <header className="flex flex-col gap-6 border-b border-line p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <span className={`font-mono text-sm ${winner.rank === 1 ? "text-gold" : "text-accent"}`}>
            0{winner.rank}
          </span>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight break-words">{repo.name}</h2>
          <p className="mt-2 text-lg text-balance">{winner.headline}</p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a
              href={repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-4 hover:underline"
            >
              {repo.full_name}
            </a>
            {live && (
              <a
                href={live.toString()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-4 hover:underline"
              >
                Live app
              </a>
            )}
          </p>
        </div>
        <dl className="flex gap-8 sm:text-right">
          <div>
            <dt className="text-sm text-muted">Viability</dt>
            <dd className="font-mono text-3xl">{weightedScore(research.scores)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Launch price</dt>
            <dd className="max-w-[14rem] text-lg font-medium">{winner.price_point}</dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-8 p-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <div>
            <SectionTitle>Why it wins</SectionTitle>
            <p className="mt-2">{winner.why_it_wins}</p>
          </div>
          <div>
            <SectionTitle>Market need</SectionTitle>
            <p className="mt-2">{research.market_need}</p>
            <p className="mt-2 text-sm text-muted">Buyer: {research.target_customer}</p>
          </div>
          <div>
            <SectionTitle>What sets it apart</SectionTitle>
            <p className="mt-2">{research.differentiation}</p>
          </div>
          {research.risks.length > 0 && (
            <div>
              <SectionTitle>Risks</SectionTitle>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {research.risks.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div>
          <SectionTitle>Scorecard</SectionTitle>
          <div className="mt-3">
            <Scorecard scores={research.scores} />
          </div>
        </div>
      </div>

      <div className="border-t border-line p-6">
        <SectionTitle>Competitors and what they charge</SectionTitle>
        {research.competitors.length === 0 ? (
          <p className="mt-2 text-sm text-muted">The search found no direct competitors.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
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
                    <tr key={i} className="border-b border-line/60 align-top last:border-b-0">
                      <td className="py-2.5 pr-4 font-medium">
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
                      <td className="py-2.5 pr-4 text-muted">{c.what_they_do}</td>
                      <td className="py-2.5 pr-4">{c.pricing}</td>
                      <td className="py-2.5">
                        <Source url={c.source_url} searched={searched} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <SectionTitle>Evidence of demand</SectionTitle>
            {research.demand_evidence.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No direct evidence was found.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {research.demand_evidence.map((e, i) => (
                  <li key={i}>
                    {e.claim} <Source url={e.source_url} searched={searched} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionTitle>Pricing recommendation</SectionTitle>
            <p className="mt-2">
              <span className="font-medium">{research.pricing.recommended_price}</span>{" "}
              <span className="text-muted">({research.pricing.model})</span>
            </p>
            <p className="mt-1 text-sm text-muted">{research.pricing.rationale}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-line p-6">
        <SectionTitle>Go-to-market kit</SectionTitle>
        {!kit ? (
          <p className="mt-2 text-sm text-muted">
            The kit for this app could not be generated. Run a new scan to try again.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-6">
            <p className="text-lg text-balance">{kit.positioning}</p>
            <p className="text-sm text-muted">First customer to go after: {kit.ideal_customer}</p>

            <div className="grid gap-3 sm:grid-cols-3">
              {kit.pricing_tiers.map((tier, i) => (
                <div key={i} className="rounded-lg border border-line bg-bg p-4">
                  <p className="text-sm text-muted">{tier.name}</p>
                  <p className="mt-1 text-xl font-medium">{tier.price}</p>
                  <p className="mt-2 text-sm text-muted">{tier.includes}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Where to find buyers</p>
                <ul className="mt-2 flex flex-col gap-2 text-sm">
                  {kit.channels.map((c, i) => (
                    <li key={i}>
                      <span className="font-medium">{c.channel}.</span>{" "}
                      <span className="text-muted">{c.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium">Getting the first ten customers</p>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted">
                  {kit.first_10_customers.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Launch message</p>
              <p className="mt-2 rounded-lg border border-line bg-bg p-4 text-sm whitespace-pre-wrap">
                {kit.launch_message}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line p-6">
        <SectionTitle>Gap to sellable</SectionTitle>
        <div className="mt-3">
          <Checklist items={items} />
        </div>
      </div>
    </article>
  );
}

export function Report({
  scan,
  result,
  repos,
  items,
}: {
  scan: ScanRow;
  result: ScanResult;
  repos: RepoRow[];
  items: ChecklistItem[];
}) {
  const byId = new Map(repos.map((r) => [r.id, r]));
  const byName = new Map(repos.map((r) => [r.full_name.toLowerCase(), r]));
  // A winner's repo row can be gone (deleted on GitHub) or re-researched since.
  const winners = result.winners.flatMap((w) => {
    const repo = byId.get(w.repo_id);
    return repo?.research ? [{ winner: w, repo }] : [];
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-10">
      <div>
        <Link href="/" className="text-sm text-muted underline-offset-4 hover:text-text hover:underline">
          Back to dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Your {winners.length === 3 ? "three " : ""}most viable apps
        </h1>
        <p className="mt-1 text-sm text-muted">
          {formatDate(scan.completed_at ?? scan.created_at)} · {scan.repo_ids.length} repos
          scanned · {scan.shortlist_ids.length} researched
        </p>
        <p className="mt-4 max-w-3xl">{result.summary}</p>
        <nav className="mt-5 flex flex-wrap gap-2 text-sm">
          {winners.map(({ winner, repo }) => (
            <a
              key={repo.id}
              href={`#rank-${winner.rank}`}
              className="rounded-full border border-line px-3 py-1 hover:border-accent"
            >
              <span className="mr-1.5 font-mono text-accent">0{winner.rank}</span>
              {repo.name}
            </a>
          ))}
        </nav>
      </div>

      {winners.map(({ winner, repo }) => (
        <WinnerCard
          key={repo.id}
          winner={winner}
          repo={repo}
          items={items.filter((i) => i.repo_id === repo.id)}
        />
      ))}

      {result.runners_up.length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-6">
          <h2 className="text-lg font-medium">Researched, but not top three</h2>
          <ul className="mt-3 flex flex-col">
            {result.runners_up.map((r, i) => {
              const repo = byName.get(r.repo_full_name.toLowerCase());
              return (
                <li key={i} className="flex gap-4 border-b border-line/60 py-3 last:border-b-0">
                  <span className="w-10 shrink-0 font-mono text-muted">
                    {repo?.research ? weightedScore(repo.research.scores) : ""}
                  </span>
                  <span>
                    <span className="font-medium">{r.repo_full_name}</span>
                    <span className="mt-0.5 block text-sm text-muted">{r.why_not_top3}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {result.dont_pursue.length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-6">
          <h2 className="text-lg font-medium">Not worth pursuing as products</h2>
          <p className="mt-1 text-sm text-muted">
            Judged from triage only, without market research.
          </p>
          <ul className="mt-3 flex flex-col">
            {result.dont_pursue.map((r, i) => (
              <li key={i} className="border-b border-line/60 py-3 last:border-b-0">
                <span className="font-medium">{r.repo_full_name}</span>
                <span className="mt-0.5 block text-sm text-muted">{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="text-sm text-muted">
        <h2 className="font-medium text-text">How this was scored</h2>
        <p className="mt-2 max-w-3xl">
          Every selected repo was triaged from its README, file list and
          dependencies. The highest-scoring candidates were then researched with
          live web search, and the final three were picked by comparing that
          research side by side, weighing market demand and how sellable the
          app is above how finished the code is. The viability number is a
          weighted average of the five scorecard dimensions, shown with its
          weights. Competitor prices and demand claims link to where they were
          found; a link marked unverified did not appear in the retrieved search
          results and should be checked. This is research to inform your
          decision, not a guarantee of sales.
        </p>
      </section>
    </main>
  );
}
