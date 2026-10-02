import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";

// `repo` is the only classic OAuth scope that can read private repositories.
const GITHUB_SCOPE = "repo";
export const STATE_COOKIE = "gh_oauth_state";

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function credentials() {
  const id = process.env.GITHUB_CLIENT_ID;
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set");
  }
  return { id, secret };
}

export function authorizeUrl(redirectUri: string, state: string) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", credentials().id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", GITHUB_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = credentials();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: id,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new GitHubError(res.status, body.error ?? "Token exchange failed");
  }
  return { token: body.access_token, scope: body.scope ?? "" };
}

// Best effort: removes the app's grant on GitHub so a disconnected token is dead.
export async function revokeGrant(token: string) {
  const { id, secret } = credentials();
  await fetch(`${API}/applications/${id}/grant`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: JSON.stringify({ access_token: token }),
  }).catch(() => undefined);
}

async function gh(token: string, path: string, accept = "application/vnd.github+json") {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GitHubError(res.status, `GitHub ${res.status} on ${path}`);
  }
  return res;
}

export async function getToken(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("mostviable_github_connections")
    .select("access_token_enc")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? decrypt(data.access_token_enc) : null;
}

export async function getViewer(token: string) {
  const res = await gh(token, "/user");
  return (await res.json()) as { login: string };
}

export type GitHubRepo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  language: string | null;
  stargazers_count: number;
  pushed_at: string | null;
};

const MAX_PAGES = 10;

export async function listRepos(token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await gh(
      token,
      `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,organization_member`,
    );
    const batch = (await res.json()) as GitHubRepo[];
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

const MANIFESTS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "pubspec.yaml",
  "composer.json",
];

// Caps keep one huge README from dominating the triage prompt. When a cap is
// hit the prompt says so, so the model knows it is seeing a partial file.
const README_CAP = 12_000;
const MANIFEST_CAP = 4_000;

function capped(text: string, cap: number) {
  return text.length > cap
    ? { text: text.slice(0, cap), truncated: true }
    : { text, truncated: false };
}

async function rawFile(token: string, path: string) {
  try {
    const res = await gh(token, path, "application/vnd.github.raw+json");
    return await res.text();
  } catch (err) {
    // 404 = file or repo content does not exist (e.g. an empty repo).
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}

export type RepoSnapshot = {
  readme: { text: string; truncated: boolean } | null;
  files: string[];
  manifest: { name: string; text: string; truncated: boolean } | null;
};

export async function repoSnapshot(token: string, fullName: string): Promise<RepoSnapshot> {
  const [readme, listing] = await Promise.all([
    rawFile(token, `/repos/${fullName}/readme`),
    gh(token, `/repos/${fullName}/contents/`)
      .then((r) => r.json() as Promise<{ name: string; type: string }[]>)
      .catch((err) => {
        if (err instanceof GitHubError && err.status === 404) return [];
        throw err;
      }),
  ]);

  const files = Array.isArray(listing)
    ? listing.map((f) => (f.type === "dir" ? `${f.name}/` : f.name))
    : [];

  const manifestName = MANIFESTS.find((m) => files.includes(m));
  const manifestText = manifestName
    ? await rawFile(token, `/repos/${fullName}/contents/${manifestName}`)
    : null;

  return {
    readme: readme ? capped(readme, README_CAP) : null,
    files,
    manifest:
      manifestName && manifestText
        ? { name: manifestName, ...capped(manifestText, MANIFEST_CAP) }
        : null,
  };
}
