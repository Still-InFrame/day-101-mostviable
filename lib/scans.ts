import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ModelRefusedError } from "@/lib/ai/client";
import { GitHubError } from "@/lib/github";
import type { RepoRow, ScanRow } from "@/lib/types";

export type RouteParams = { params: Promise<{ id: string }> };

export async function loadScan(supabase: SupabaseClient, id: string) {
  const { data } = await supabase
    .from("mostviable_scans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as ScanRow | null;
}

// Loads every repo row for the user (RLS scopes it) and filters in memory,
// which avoids putting up to 150 ids into a query string.
export async function loadRepos(supabase: SupabaseClient, ids?: string[]) {
  const { data, error } = await supabase.from("mostviable_repos").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RepoRow[];
  if (!ids) return rows;
  const wanted = new Set(ids);
  return rows.filter((r) => wanted.has(r.id));
}

// `fatal` tells the client to stop the whole scan (bad key, revoked GitHub
// access) rather than skip one repo and carry on.
export function stepError(err: unknown) {
  console.error("Scan step failed", err);
  if (err instanceof GitHubError && err.status === 401) {
    return NextResponse.json(
      { error: "GitHub access was revoked. Reconnect GitHub.", fatal: true },
      { status: 401 },
    );
  }
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    return NextResponse.json(
      { error: "The Claude API key was rejected. Check ANTHROPIC_API_KEY.", fatal: true },
      { status: 500 },
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return NextResponse.json(
      { error: "Claude API rate limit reached. Try again shortly.", fatal: false },
      { status: 429 },
    );
  }
  if (err instanceof ModelRefusedError) {
    return NextResponse.json({ error: err.message, fatal: false }, { status: 422 });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message, fatal: false }, { status: 500 });
}
