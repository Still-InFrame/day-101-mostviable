import type { ScanResult, StoredResearch, Triage } from "@/lib/ai/schemas";

export type RepoRow = {
  id: string;
  github_id: number;
  full_name: string;
  owner: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  is_private: boolean;
  is_fork: boolean;
  is_archived: boolean;
  language: string | null;
  stars: number;
  pushed_at: string | null;
  included: boolean;
  triage: Triage | null;
  triage_score: number | null;
  triaged_pushed_at: string | null;
  research: StoredResearch | null;
  researched_at: string | null;
  researched_pushed_at: string | null;
  synced_at: string;
};

type ScanStatus = "triage" | "research" | "ranking" | "complete" | "failed";

export type ScanRow = {
  id: string;
  status: ScanStatus;
  repo_ids: string[];
  shortlist_ids: string[];
  result: ScanResult | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ChecklistItem = {
  id: string;
  scan_id: string;
  repo_id: string;
  position: number;
  task: string;
  why: string | null;
  effort: string | null;
  done: boolean;
};

export const SHORTLIST_SIZE = 8;
export const MAX_REPOS_PER_SCAN = 150;
export const MAX_SCANS_PER_DAY = 5;
const RESEARCH_MAX_AGE_DAYS = 30;

// Postgres and GitHub format the same instant differently, so compare by value.
function sameInstant(a: string | null, b: string | null) {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}

export function triageIsFresh(
  repo: Pick<RepoRow, "triage" | "triaged_pushed_at" | "pushed_at">,
) {
  return repo.triage !== null && sameInstant(repo.triaged_pushed_at, repo.pushed_at);
}

export function researchIsFresh(repo: RepoRow) {
  if (!repo.research || !repo.researched_at) return false;
  if (!sameInstant(repo.researched_pushed_at, repo.pushed_at)) return false;
  const ageDays = (Date.now() - Date.parse(repo.researched_at)) / 86_400_000;
  return ageDays < RESEARCH_MAX_AGE_DAYS;
}

// Rows from older syncs are repos that were deleted or lost access.
export function currentRepos<T extends Pick<RepoRow, "synced_at">>(rows: T[]) {
  const latest = rows.reduce((max, r) => Math.max(max, Date.parse(r.synced_at)), 0);
  return rows.filter((r) => Date.parse(r.synced_at) === latest);
}
