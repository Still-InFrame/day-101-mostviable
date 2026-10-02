import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

type Step = "triage" | "research" | "rank" | "kit";

// USD per million tokens at list price. Order matters: the first matching
// prefix wins, so the more specific id comes first. A refusal fallback can
// serve a request on a different model, which is why this is keyed by the
// model that actually answered.
const PRICES = [
  { prefix: "claude-opus-5-5", input: 4, output: 20, cacheRead: 0.2 },
  { prefix: "claude-opus-5", input: 5, output: 25, cacheRead: 0.5 },
  { prefix: "claude-opus-4", input: 5, output: 25, cacheRead: 0.5 },
];
const CACHE_WRITE_MULTIPLIER = 1.25;

function priceFor(model: string) {
  return PRICES.find((p) => model.startsWith(p.prefix)) ?? PRICES[0];
}

// Collects token usage across every model response in one scan step and
// writes a single telemetry row. Cost is an estimate from token counts and
// does not include web search fees.
export function createMeter() {
  const startedAt = Date.now();
  const totals = {
    model: null as string | null,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    searches: 0,
    cost: 0,
  };

  return {
    record(message: Anthropic.Beta.BetaMessage) {
      const usage = message.usage;
      const price = priceFor(message.model);
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const cacheWrite = usage.cache_creation_input_tokens ?? 0;
      totals.model = message.model;
      totals.input += usage.input_tokens;
      totals.output += usage.output_tokens;
      totals.cacheRead += cacheRead;
      totals.cacheWrite += cacheWrite;
      totals.searches += usage.server_tool_use?.web_search_requests ?? 0;
      totals.cost +=
        (usage.input_tokens * price.input +
          usage.output_tokens * price.output +
          cacheRead * price.cacheRead +
          cacheWrite * price.input * CACHE_WRITE_MULTIPLIER) /
        1_000_000;
    },

    async save(supabase: SupabaseClient, entry: { scanId: string; step: Step; error?: unknown }) {
      const failed = entry.error !== undefined;
      const { error } = await supabase.from("mostviable_usage").insert({
        scan_id: entry.scanId,
        step: entry.step,
        model: totals.model,
        input_tokens: totals.input,
        output_tokens: totals.output,
        cache_read_tokens: totals.cacheRead,
        cache_write_tokens: totals.cacheWrite,
        web_searches: totals.searches,
        est_cost_usd: Number(totals.cost.toFixed(4)),
        duration_ms: Date.now() - startedAt,
        ok: !failed,
        error: failed
          ? (entry.error instanceof Error ? entry.error.message : String(entry.error)).slice(0, 300)
          : null,
      });
      // Telemetry must never break a scan step, so a failed write is only logged.
      if (error) console.error("Usage log failed", error.message);
    },
  };
}

export type Meter = ReturnType<typeof createMeter>;
