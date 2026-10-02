-- mostviable admin: access control and usage telemetry.
-- Applied after schema.sql. Users can read their own access row but never
-- write it; every change goes through a function that checks the caller is an
-- admin. Admin functions return emails and usage numbers only, never another
-- user's repos or reports.

create table public.mostviable_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'pending', 'blocked')),
  -- null means "use the default from mostviable_settings".
  daily_scan_limit integer check (daily_scan_limit is null or daily_scan_limit >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.mostviable_settings (
  -- Single-row table: the primary key can only ever be true.
  id boolean primary key default true check (id),
  require_approval boolean not null default false,
  default_daily_scan_limit integer not null default 5 check (default_daily_scan_limit >= 0),
  updated_at timestamptz not null default now()
);
insert into public.mostviable_settings default values;

create table public.mostviable_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scan_id uuid references public.mostviable_scans (id) on delete set null,
  step text not null check (step in ('triage', 'research', 'rank', 'kit')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  web_searches integer not null default 0,
  est_cost_usd numeric(10, 4) not null default 0,
  duration_ms integer,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index mostviable_usage_user_idx on public.mostviable_usage (user_id, created_at desc);
create index mostviable_usage_created_idx on public.mostviable_usage (created_at desc);
create index mostviable_usage_scan_idx on public.mostviable_usage (scan_id);

-- security definer so RLS policies can call it without recursing into the
-- access table's own policy.
create function public.mostviable_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.mostviable_access
    where user_id = (select auth.uid()) and role = 'admin' and status = 'active'
  );
$$;

alter table public.mostviable_access enable row level security;
alter table public.mostviable_settings enable row level security;
alter table public.mostviable_usage enable row level security;

create policy "read own access or admin" on public.mostviable_access
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.mostviable_is_admin()));

create policy "read settings" on public.mostviable_settings
  for select to authenticated using (true);

create policy "log own usage" on public.mostviable_usage
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "read own usage or admin" on public.mostviable_usage
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.mostviable_is_admin()));

-- Called on every signed-in page load and scan step. Creates the caller's
-- access row on first visit (pending when approval is required) and returns
-- their role, status and effective daily limit.
create function public.mostviable_touch()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cfg public.mostviable_settings;
  acc public.mostviable_access;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into cfg from public.mostviable_settings;
  insert into public.mostviable_access (user_id, email, status)
  values (
    uid,
    (select u.email from auth.users u where u.id = uid),
    case when cfg.require_approval then 'pending' else 'active' end
  )
  on conflict (user_id) do update
    set last_seen_at = now(), email = excluded.email
  returning * into acc;
  return jsonb_build_object(
    'role', acc.role,
    'status', acc.status,
    'daily_scan_limit', coalesce(acc.daily_scan_limit, cfg.default_daily_scan_limit)
  );
end;
$$;

create function public.mostviable_admin_users()
returns table (
  user_id uuid,
  email text,
  role text,
  status text,
  daily_scan_limit integer,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  github_login text,
  scans_total bigint,
  scans_24h bigint,
  last_scan_at timestamptz,
  cost_30d numeric,
  tokens_30d bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.mostviable_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    a.user_id, a.email, a.role, a.status, a.daily_scan_limit,
    a.first_seen_at, a.last_seen_at,
    c.github_login,
    (select count(*) from public.mostviable_scans s where s.user_id = a.user_id),
    (select count(*) from public.mostviable_scans s
      where s.user_id = a.user_id and s.created_at > now() - interval '24 hours'),
    (select max(s.created_at) from public.mostviable_scans s where s.user_id = a.user_id),
    coalesce((select sum(u.est_cost_usd) from public.mostviable_usage u
      where u.user_id = a.user_id and u.created_at > now() - interval '30 days'), 0),
    coalesce((select sum(u.input_tokens + u.output_tokens) from public.mostviable_usage u
      where u.user_id = a.user_id and u.created_at > now() - interval '30 days'), 0)::bigint
  from public.mostviable_access a
  left join public.mostviable_github_connections c on c.user_id = a.user_id
  order by a.last_seen_at desc;
end;
$$;

create function public.mostviable_admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.mostviable_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'users_total', (select count(*) from public.mostviable_access),
    'users_active_7d', (select count(*) from public.mostviable_access
      where last_seen_at > now() - interval '7 days'),
    'users_pending', (select count(*) from public.mostviable_access where status = 'pending'),
    'users_blocked', (select count(*) from public.mostviable_access where status = 'blocked'),
    'scans_total', (select count(*) from public.mostviable_scans),
    'scans_7d', (select count(*) from public.mostviable_scans
      where created_at > now() - interval '7 days'),
    'scans_complete', (select count(*) from public.mostviable_scans where status = 'complete'),
    'scans_failed', (select count(*) from public.mostviable_scans where status = 'failed'),
    'scans_unfinished', (select count(*) from public.mostviable_scans
      where status in ('triage', 'research', 'ranking')),
    'cost_30d', coalesce((select sum(est_cost_usd) from public.mostviable_usage
      where created_at > now() - interval '30 days'), 0),
    'input_tokens_30d', coalesce((select sum(input_tokens) from public.mostviable_usage
      where created_at > now() - interval '30 days'), 0),
    'output_tokens_30d', coalesce((select sum(output_tokens) from public.mostviable_usage
      where created_at > now() - interval '30 days'), 0),
    'usage_since', (select min(created_at) from public.mostviable_usage),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'scans', (select count(*) from public.mostviable_scans s
          where s.created_at >= d and s.created_at < d + interval '1 day'),
        'cost', coalesce((select sum(u.est_cost_usd) from public.mostviable_usage u
          where u.created_at >= d and u.created_at < d + interval '1 day'), 0)
      ) order by d)
      from generate_series(
        date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day'
      ) as d
    ),
    'by_step', coalesce((
      select jsonb_agg(jsonb_build_object(
        'step', t.step, 'calls', t.calls, 'failed', t.failed, 'avg_ms', t.avg_ms,
        'input_tokens', t.input_tokens, 'output_tokens', t.output_tokens,
        'web_searches', t.web_searches, 'cost', t.cost
      ) order by t.cost desc)
      from (
        select u.step, count(*) as calls, count(*) filter (where not u.ok) as failed,
          round(avg(u.duration_ms)) as avg_ms, sum(u.input_tokens) as input_tokens,
          sum(u.output_tokens) as output_tokens, sum(u.web_searches) as web_searches,
          sum(u.est_cost_usd) as cost
        from public.mostviable_usage u
        where u.created_at > now() - interval '30 days'
        group by u.step
      ) t
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.mostviable_admin_recent_scans(lim integer default 25)
returns table (
  scan_id uuid,
  email text,
  status text,
  created_at timestamptz,
  completed_at timestamptz,
  repos integer,
  shortlisted integer,
  error text,
  cost numeric,
  tokens bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.mostviable_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    s.id, a.email, s.status, s.created_at, s.completed_at,
    coalesce(cardinality(s.repo_ids), 0), coalesce(cardinality(s.shortlist_ids), 0), s.error,
    coalesce((select sum(u.est_cost_usd) from public.mostviable_usage u where u.scan_id = s.id), 0),
    coalesce((select sum(u.input_tokens + u.output_tokens) from public.mostviable_usage u
      where u.scan_id = s.id), 0)::bigint
  from public.mostviable_scans s
  left join public.mostviable_access a on a.user_id = s.user_id
  order by s.created_at desc
  limit greatest(1, least(lim, 200));
end;
$$;

create function public.mostviable_admin_set_access(
  target uuid, new_role text, new_status text, new_limit integer
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mostviable_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- An admin cannot lock themselves out; another admin has to do it.
  if target = auth.uid() and (new_role <> 'admin' or new_status <> 'active') then
    raise exception 'You cannot remove your own admin access';
  end if;
  update public.mostviable_access
    set role = new_role, status = new_status, daily_scan_limit = new_limit
    where user_id = target;
  if not found then
    raise exception 'No such user';
  end if;
end;
$$;

create function public.mostviable_admin_set_settings(
  new_require_approval boolean, new_default_limit integer
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mostviable_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.mostviable_settings
    set require_approval = new_require_approval,
        default_daily_scan_limit = new_default_limit,
        updated_at = now();
end;
$$;

-- Functions in the public schema are callable by anyone by default; limit
-- them to signed-in users (each admin function also checks the caller).
revoke execute on function
  public.mostviable_is_admin(),
  public.mostviable_touch(),
  public.mostviable_admin_users(),
  public.mostviable_admin_overview(),
  public.mostviable_admin_recent_scans(integer),
  public.mostviable_admin_set_access(uuid, text, text, integer),
  public.mostviable_admin_set_settings(boolean, integer)
from public, anon;
grant execute on function
  public.mostviable_is_admin(),
  public.mostviable_touch(),
  public.mostviable_admin_users(),
  public.mostviable_admin_overview(),
  public.mostviable_admin_recent_scans(integer),
  public.mostviable_admin_set_access(uuid, text, text, integer),
  public.mostviable_admin_set_settings(boolean, integer)
to authenticated;

-- First admin. Everyone who used the app before this migration keeps access.
-- Replace the placeholder with the first admin's sign-in email before running.
insert into public.mostviable_access (user_id, email, role, status)
select u.id, u.email,
  case when u.email = 'FIRST_ADMIN_EMAIL' then 'admin' else 'user' end, 'active'
from auth.users u
where u.id in (
  select user_id from public.mostviable_github_connections
  union select user_id from public.mostviable_scans
)
on conflict (user_id) do nothing;
