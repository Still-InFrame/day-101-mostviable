import { z } from "zod";

// Schemas avoid min/max constraints: structured outputs and strict tools do not
// support them, so ranges are stated in descriptions and clamped in code.

export const TriageSchema = z.object({
  summary: z.string().describe("What the app does, in one or two plain sentences."),
  category: z.string().describe("Short product category, e.g. 'lead generation' or 'party game'."),
  target_user: z.string().describe("Who would use this."),
  is_product: z
    .boolean()
    .describe(
      "True if this could plausibly be sold to customers. False for libraries, configs, forks, empty repos, demos and learning exercises.",
    ),
  completeness: z.enum(["empty", "prototype", "working", "polished"]),
  monetization_angle: z.string().describe("The most plausible way to charge for it."),
  shortlist_score: z
    .number()
    .describe(
      "0-100. How much this deserves deeper market research, weighing likely demand and sellability above code polish.",
    ),
  reasoning: z.string().describe("Two or three sentences justifying the score."),
});
export type Triage = z.infer<typeof TriageSchema>;

const Score = z.object({
  score: z.number().describe("Integer 1-10."),
  reason: z.string().describe("One sentence grounded in what the research found."),
});

export const ResearchSchema = z.object({
  market_need: z.string().describe("The problem and who has it, in two to four sentences."),
  target_customer: z.string().describe("The most likely paying customer."),
  demand_evidence: z
    .array(
      z.object({
        claim: z.string(),
        source_url: z.string().describe("URL from the web search results that supports the claim."),
      }),
    )
    .describe("Concrete signs that people want or pay for this."),
  competitors: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      what_they_do: z.string(),
      pricing: z
        .string()
        .describe("Their actual published pricing, or 'not found' if the search did not show it."),
      source_url: z.string().describe("URL where the pricing or product claim was found."),
    }),
  ),
  pricing: z.object({
    model: z.string().describe("e.g. monthly subscription, one-time purchase, usage-based."),
    recommended_price: z.string().describe("A specific competitive price point."),
    rationale: z.string().describe("Why this price, relative to the competitors found."),
  }),
  differentiation: z.string().describe("What would make this app stand out, or that it does not."),
  risks: z.array(z.string()),
  scores: z.object({
    market_demand: Score,
    willingness_to_pay: Score,
    selling_ease: Score.describe("How reachable buyers are for a solo builder with no audience."),
    competition: Score.describe("10 = wide open, 1 = saturated by strong incumbents."),
    readiness: Score.describe("How close the repo is to something a customer could buy."),
  }),
  verdict: z.string().describe("Two sentences: is this worth selling, and why."),
});
export type Research = z.infer<typeof ResearchSchema>;

export type StoredResearch = Research & {
  // URLs the web search tool actually returned. Lets the UI flag any source
  // the model cited that never appeared in a search result.
  searched_urls: string[];
};

export const RankSchema = z.object({
  summary: z.string().describe("Three or four sentences on the overall picture across the portfolio."),
  winners: z
    .array(
      z.object({
        repo_full_name: z.string(),
        rank: z.number().describe("1, 2 or 3."),
        headline: z.string().describe("One line on why this is a winner."),
        why_it_wins: z.string().describe("Three to five sentences comparing it to the other candidates."),
        price_point: z.string().describe("The price to launch at."),
      }),
    )
    .describe("Exactly three, or fewer only if fewer candidates are worth selling."),
  runners_up: z.array(
    z.object({
      repo_full_name: z.string(),
      why_not_top3: z.string(),
    }),
  ),
  dont_pursue: z
    .array(
      z.object({
        repo_full_name: z.string(),
        reason: z.string(),
      }),
    )
    .describe("Repos the builder should stop spending time on as products, with an honest reason."),
});
export type Rank = z.infer<typeof RankSchema>;

export const KitSchema = z.object({
  positioning: z.string().describe("One-sentence positioning statement."),
  ideal_customer: z.string().describe("A specific first customer profile."),
  pricing_tiers: z.array(
    z.object({
      name: z.string(),
      price: z.string(),
      includes: z.string(),
    }),
  ),
  channels: z
    .array(
      z.object({
        channel: z.string(),
        action: z.string().describe("A concrete first action to take in this channel."),
      }),
    )
    .describe("Where to find buyers, most promising first."),
  first_10_customers: z
    .array(z.string())
    .describe("Step-by-step plan to land the first ten paying customers."),
  launch_message: z.string().describe("A short pitch the builder could post or send as-is."),
  gap_checklist: z
    .array(
      z.object({
        task: z.string(),
        why: z.string(),
        effort: z.enum(["S", "M", "L"]),
      }),
    )
    .describe("What the repo is missing before a customer could pay for it, most important first."),
});
export type Kit = z.infer<typeof KitSchema>;

export type Winner = Rank["winners"][number] & { repo_id: string; kit?: Kit };
export type ScanResult = Omit<Rank, "winners"> & { winners: Winner[] };

export const SCORE_WEIGHTS: Record<keyof Research["scores"], number> = {
  market_demand: 0.3,
  selling_ease: 0.25,
  willingness_to_pay: 0.2,
  competition: 0.15,
  readiness: 0.1,
};

export const SCORE_LABELS: Record<keyof Research["scores"], string> = {
  market_demand: "Market demand",
  selling_ease: "Ease of selling",
  willingness_to_pay: "Willingness to pay",
  competition: "Open competition",
  readiness: "Readiness",
};

const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

export function weightedScore(scores: Research["scores"]) {
  const total = (Object.keys(SCORE_WEIGHTS) as (keyof Research["scores"])[]).reduce(
    (sum, k) => sum + clamp(scores[k].score) * SCORE_WEIGHTS[k],
    0,
  );
  return Math.round(total * 10);
}

export function clampScore(n: number) {
  return clamp(n);
}
