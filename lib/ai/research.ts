import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { RepoSnapshot } from "@/lib/github";
import type { RepoRow } from "@/lib/types";
import { anthropic, assertCompleted, FALLBACK, MODEL, SHARED_CONTEXT } from "./client";
import { ResearchSchema, type StoredResearch } from "./schemas";
import { describeRepo } from "./triage";

const SUBMIT_TOOL = "submit_research";
const MAX_SEARCHES = 8;
const MAX_TURNS = 6;

const SYSTEM = `${SHARED_CONTEXT}

This step is market research for one repository that made the shortlist. Use web search to find out whether people pay for something like this, who the real competitors are and what they charge, and what a competitive price would be. Then call the ${SUBMIT_TOOL} tool once with your findings. The report is only delivered through that tool, so finish with it rather than a written summary.

The builder will act on this, so every factual claim about the market needs to come from a search result. Competitor pricing must be what you actually found on a page; if you could not find a price, write "not found" rather than estimating. Every source_url must be a URL that appeared in your search results. If the evidence for demand is thin, say that and score accordingly: an honest low score is more useful than a hopeful one.

You have up to ${MAX_SEARCHES} searches. Spend them on competitors and their pricing pages, evidence of demand (communities asking for this, paid alternatives, search interest), and where buyers of this kind of product are found.`;

type Block = Anthropic.Beta.BetaContentBlock;

// Gathers every URL the search tool returned, from raw result blocks and from
// citations attached to the model's text.
function collectSearchedUrls(content: Block[], into: Set<string>) {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) into.add(result.url);
    }
    if (block.type === "text" && block.citations) {
      for (const citation of block.citations) {
        if (citation.type === "web_search_result_location") into.add(citation.url);
      }
    }
  }
}

export async function researchRepo(
  repo: RepoRow,
  snapshot: RepoSnapshot,
): Promise<StoredResearch> {
  // The generated schema carries a "$schema" dialect marker that is not part
  // of the tool definition format, so it is dropped before sending.
  const inputSchema = z.toJSONSchema(ResearchSchema) as Record<string, unknown>;
  delete inputSchema.$schema;

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES },
    {
      name: SUBMIT_TOOL,
      description:
        "Deliver the finished market research report for this repository. Call exactly once, after searching.",
      // strict keeps the input schema-valid. Eager input streaming is left off
      // because it disables that server-side validation.
      strict: true,
      input_schema: inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    },
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `${describeRepo(repo, snapshot)}\n\nPrior triage summary: ${repo.triage?.summary ?? "(none)"}\n\nResearch the market for this app and submit your report.`,
    },
  ];
  const searched = new Set<string>();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const message = await anthropic()
      .beta.messages.stream({
        ...FALLBACK,
        model: MODEL,
        max_tokens: 32000,
        system: SYSTEM,
        output_config: { effort: "medium" },
        tools,
        messages,
      })
      .finalMessage();

    collectSearchedUrls(message.content, searched);
    assertCompleted(message);

    const submitted = message.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock =>
        b.type === "tool_use" && b.name === SUBMIT_TOOL,
    );
    if (submitted) {
      const parsed = ResearchSchema.safeParse(submitted.input);
      if (!parsed.success) throw new Error("Research report did not match the expected shape");
      return { ...parsed.data, searched_urls: [...searched] };
    }

    messages.push({ role: "assistant", content: message.content });
    // pause_turn means the server-side search loop hit its iteration limit;
    // re-sending with the assistant turn appended resumes it. Any other stop
    // without a submission gets one explicit reminder.
    if (message.stop_reason !== "pause_turn") {
      messages.push({
        role: "user",
        content: `Call ${SUBMIT_TOOL} now with what you found.`,
      });
    }
  }

  throw new Error("Research did not produce a report");
}
