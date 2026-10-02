import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { RepoRow } from "@/lib/types";
import type { Meter } from "@/lib/usage";
import { anthropic, assertCompleted, FALLBACK, MODEL, SHARED_CONTEXT } from "./client";
import {
  KitSchema,
  RankSchema,
  ResearchSchema,
  SCORE_WEIGHTS,
  weightedScore,
  type Kit,
  type Rank,
} from "./schemas";

function researchBrief(repo: RepoRow) {
  // Parsing strips searched_urls, which is bookkeeping for the UI rather than
  // evidence the model needs.
  const research = ResearchSchema.parse(repo.research);
  return [
    `<candidate name="${repo.full_name}">`,
    `Summary: ${repo.triage?.summary ?? repo.description ?? "(none)"}`,
    `Completeness: ${repo.triage?.completeness ?? "unknown"}`,
    `Weighted score (0-100): ${weightedScore(research.scores)}`,
    `Research: ${JSON.stringify(research)}`,
    "</candidate>",
  ].join("\n");
}

const RANK_SYSTEM = `${SHARED_CONTEXT}

This step is the final call. You will see the researched shortlist side by side, plus one-line summaries of every other repository that was triaged. Pick the three apps most worth turning into a sellable product.

Decide on market demand and selling viability first: is there a paying need, can a solo builder with no audience reach those buyers, and will they pay enough. How finished the code is only breaks ties, because code is the part this builder is good at fixing. Each candidate carries a weighted score (weights: ${JSON.stringify(SCORE_WEIGHTS)}) as a reference; you may rank differently when the evidence supports it, and should say why when you do.

Choose exactly three winners unless fewer than three candidates are worth selling at all, in which case choose fewer and say so in the summary. Every remaining shortlisted candidate goes in runners_up. For dont_pursue, name the triaged repositories the builder should stop treating as product candidates, with the real reason. Use repository names exactly as given.`;

export async function rankCandidates(
  shortlist: RepoRow[],
  others: RepoRow[],
  meter: Meter,
): Promise<Rank> {
  const otherLines = others
    .map(
      (r) =>
        `- ${r.full_name} (triage score ${r.triage_score ?? "n/a"}): ${r.triage?.summary ?? r.description ?? "no summary"}`,
    )
    .join("\n");

  const message = await anthropic()
    .beta.messages.stream({
      ...FALLBACK,
      model: MODEL,
      max_tokens: 32000,
      system: RANK_SYSTEM,
      output_config: { effort: "high", format: betaZodOutputFormat(RankSchema) },
      messages: [
        {
          role: "user",
          content: `<shortlist>\n${shortlist.map(researchBrief).join("\n\n")}\n</shortlist>\n\n<other_repositories>\n${otherLines || "(none)"}\n</other_repositories>\n\nPick the winners.`,
        },
      ],
    })
    .finalMessage();
  meter.record(message);
  assertCompleted(message);
  if (!message.parsed_output) throw new Error("Ranking returned no structured output");
  return message.parsed_output;
}

const KIT_SYSTEM = `${SHARED_CONTEXT}

This step writes the go-to-market kit for one app that was picked as a winner. The builder has never sold software, so be specific enough to act on today: name the actual communities, directories or outreach targets rather than categories like "social media", and write the launch message so it could be posted as-is.

Base pricing tiers on the competitor prices in the research. The gap checklist covers what stands between the repository as it is and a customer being able to pay for it and get value, ordered by importance, with nothing that is merely nice to have.`;

export async function buildKit(
  repo: RepoRow,
  winner: Rank["winners"][number],
  completedTasks: string[],
  meter: Meter,
): Promise<Kit> {
  const done = completedTasks.length
    ? `\n\nThe builder has already completed these tasks, so leave them out of the checklist:\n${completedTasks.map((t) => `- ${t}`).join("\n")}`
    : "";

  const message = await anthropic()
    .beta.messages.stream({
      ...FALLBACK,
      model: MODEL,
      max_tokens: 32000,
      system: KIT_SYSTEM,
      output_config: { effort: "medium", format: betaZodOutputFormat(KitSchema) },
      messages: [
        {
          role: "user",
          content: `${researchBrief(repo)}\n\nWhy it was picked (rank ${winner.rank}): ${winner.why_it_wins}\nLaunch price point: ${winner.price_point}${done}\n\nWrite the go-to-market kit.`,
        },
      ],
    })
    .finalMessage();
  meter.record(message);
  assertCompleted(message);
  if (!message.parsed_output) throw new Error("Kit returned no structured output");
  return message.parsed_output;
}
