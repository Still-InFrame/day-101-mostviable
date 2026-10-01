import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { RepoSnapshot } from "@/lib/github";
import type { RepoRow } from "@/lib/types";
import { anthropic, assertCompleted, FALLBACK, MODEL, SHARED_CONTEXT } from "./client";
import { TriageSchema, type Triage } from "./schemas";

const SYSTEM = `${SHARED_CONTEXT}

This step is triage. You will see one repository and decide how much it deserves deeper market research. Only the top handful of repositories across the builder's whole portfolio go on to that research, so the score has to separate real product candidates from experiments.

You have no web access in this step, so judge from what the repository shows and what you already know about the market. Weigh likely demand and how sellable it is above code polish: a rough prototype aimed at a real paying need should outscore a polished toy. Be willing to give low scores. Games, tutorials, clones of free tools, and personal utilities rarely make good products, and saying so is useful.`;

export function describeRepo(repo: RepoRow, snapshot: RepoSnapshot) {
  const parts = [
    `<repository name="${repo.full_name}">`,
    `Description: ${repo.description ?? "(none)"}`,
    `Primary language: ${repo.language ?? "unknown"}`,
    `Visibility: ${repo.is_private ? "private" : "public"}; stars: ${repo.stars}; fork: ${repo.is_fork}; archived: ${repo.is_archived}`,
    `Live URL: ${repo.homepage || "(none listed)"}`,
    `Last push: ${repo.pushed_at ?? "never"}`,
    `Top-level files: ${snapshot.files.join(", ") || "(empty repository)"}`,
  ];
  if (snapshot.manifest) {
    parts.push(
      `<manifest file="${snapshot.manifest.name}"${snapshot.manifest.truncated ? ' truncated="true"' : ""}>`,
      snapshot.manifest.text,
      "</manifest>",
    );
  }
  if (snapshot.readme) {
    parts.push(
      `<readme${snapshot.readme.truncated ? ' truncated="true"' : ""}>`,
      snapshot.readme.text,
      "</readme>",
    );
  } else {
    parts.push("README: (none)");
  }
  parts.push("</repository>");
  return parts.join("\n");
}

export async function triageRepo(repo: RepoRow, snapshot: RepoSnapshot): Promise<Triage> {
  const message = await anthropic().beta.messages.parse({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(TriageSchema) },
    messages: [
      {
        role: "user",
        content: `${describeRepo(repo, snapshot)}\n\nTriage this repository.`,
      },
    ],
  });
  assertCompleted(message);
  if (!message.parsed_output) throw new Error("Triage returned no structured output");
  const triage = message.parsed_output;
  return {
    ...triage,
    shortlist_score: Math.min(100, Math.max(0, Math.round(triage.shortlist_score))),
  };
}
