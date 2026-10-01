-- mostviable schema. Lives in the shared "100-day-sandbox" project, so every
-- table is prefixed and row-level security isolates each user's rows.

create table public.mostviable_github_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  github_login text not null,
  -- AES-256-GCM ciphertext. RLS lets a user read their own row from the browser,
  -- so the token is only usable with the server-side key.
  access_token_enc text not null,
  scopes text,
  created_at timestamptz not null default now()
);

create table public.mostviable_repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  github_id bigint not null,
  full_name text not null,
  owner text not null,
  name text not null,
  description text,
  html_url text not null,
  homepage text,
  is_private boolean not null default false,
  is_fork boolean not null default false,
  is_archived boolean not null default false,
  language text,
  stars integer not null default 0,
  pushed_at timestamptz,
  included boolean not null default true,
  triage jsonb,
  triage_score numeric,
  -- pushed_at value the triage/research was computed against. A rescan only
  -- redoes work for repos where this no longer matches pushed_at.
  triaged_pushed_at timestamptz,
  research jsonb,
  researched_at timestamptz,
  researched_pushed_at timestamptz,
  -- Every row seen in one GitHub sync gets the same timestamp, so rows with an
  -- older value are repos that were deleted or are no longer accessible.
  synced_at timestamptz not null default now(),
  unique (user_id, github_id)
);

create table public.mostviable_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'triage'
    check (status in ('triage', 'research', 'ranking', 'complete', 'failed')),
  repo_ids uuid[] not null default '{}',
  shortlist_ids uuid[] not null default '{}',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.mostviable_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scan_id uuid not null references public.mostviable_scans (id) on delete cascade,
  repo_id uuid not null references public.mostviable_repos (id) on delete cascade,
  position integer not null default 0,
  task text not null,
  why text,
  effort text,
  done boolean not null default false
);

create index mostviable_repos_user_idx on public.mostviable_repos (user_id);
create index mostviable_scans_user_idx on public.mostviable_scans (user_id, created_at desc);
create index mostviable_checklist_scan_idx on public.mostviable_checklist_items (scan_id);
create index mostviable_checklist_user_idx on public.mostviable_checklist_items (user_id);
create index mostviable_checklist_repo_idx on public.mostviable_checklist_items (repo_id);

alter table public.mostviable_github_connections enable row level security;
alter table public.mostviable_repos enable row level security;
alter table public.mostviable_scans enable row level security;
alter table public.mostviable_checklist_items enable row level security;

create policy "own connection" on public.mostviable_github_connections
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own repos" on public.mostviable_repos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- No delete policy on scans: the daily scan cap counts rows, so a user must
-- not be able to erase their own history to reset it.
create policy "read own scans" on public.mostviable_scans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "create own scans" on public.mostviable_scans
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own scans" on public.mostviable_scans
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own checklist" on public.mostviable_checklist_items
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
