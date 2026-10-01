import type { SupabaseClient } from "@supabase/supabase-js";
import { listRepos, type GitHubRepo } from "@/lib/github";

function metadata(r: GitHubRepo, syncedAt: string) {
  return {
    github_id: r.id,
    full_name: r.full_name,
    owner: r.owner.login,
    name: r.name,
    description: r.description,
    html_url: r.html_url,
    homepage: r.homepage,
    is_private: r.private,
    is_fork: r.fork,
    is_archived: r.archived,
    language: r.language,
    stars: r.stargazers_count,
    pushed_at: r.pushed_at,
    synced_at: syncedAt,
  };
}

export async function syncRepos(supabase: SupabaseClient, token: string) {
  const repos = await listRepos(token);
  const syncedAt = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from("mostviable_repos")
    .select("github_id");
  if (readError) throw new Error(readError.message);
  const known = new Set((existing ?? []).map((r) => Number(r.github_id)));

  // New repos start excluded when they are forks or archived, since those are
  // rarely the user's own sellable work. Existing rows keep the user's choice.
  const added = repos
    .filter((r) => !known.has(r.id))
    .map((r) => ({ ...metadata(r, syncedAt), included: !r.fork && !r.archived }));
  const updated = repos.filter((r) => known.has(r.id)).map((r) => metadata(r, syncedAt));

  if (added.length) {
    const { error } = await supabase.from("mostviable_repos").insert(added);
    if (error) throw new Error(error.message);
  }
  if (updated.length) {
    const { error } = await supabase
      .from("mostviable_repos")
      .upsert(updated, { onConflict: "user_id,github_id" });
    if (error) throw new Error(error.message);
  }
  return { total: repos.length, added: added.length };
}
