import { NextResponse } from "next/server";
import { requireActive } from "@/lib/access";
import { getSession, jsonError } from "@/lib/auth";
import { getToken, GitHubError } from "@/lib/github";
import { syncRepos } from "@/lib/repos";

export async function POST() {
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);
  const access = await requireActive(supabase);
  if (access instanceof NextResponse) return access;

  const token = await getToken(supabase, user.id);
  if (!token) return jsonError("GitHub is not connected", 400);

  try {
    return NextResponse.json(await syncRepos(supabase, token));
  } catch (err) {
    if (err instanceof GitHubError && err.status === 401) {
      return jsonError("GitHub access was revoked. Reconnect GitHub.", 401);
    }
    console.error("Repo sync failed", err);
    return jsonError("Could not load repos from GitHub", 502);
  }
}
