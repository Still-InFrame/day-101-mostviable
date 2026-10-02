"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import type { AdminOverview, AdminScan, AdminSettings, AdminUser } from "@/lib/admin";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { key: "overview", label: "Telemetry" },
  { key: "users", label: "People and access" },
  { key: "scans", label: "Recent scans" },
  { key: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const usd = (n: number) =>
  Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
const compact = (n: number) =>
  Number(n).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

// Daily buckets are UTC days, so they are labelled in UTC on both server and
// client.
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const noop = () => () => {};

// Timestamps render in UTC on the server and switch to the viewer's own time
// zone in the browser, without a hydration mismatch.
function LocalTime({ iso }: { iso: string | null }) {
  const format = (timeZone?: string) =>
    iso
      ? new Date(iso).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone,
        })
      : "never";
  const text = useSyncExternalStore(
    noop,
    () => format(),
    () => format("UTC"),
  );
  return <time dateTime={iso ?? undefined}>{text}</time>;
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="surface rounded-2xl p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-mono text-3xl tabular-nums">{value}</p>
      {detail && <p className="mt-1.5 text-sm text-muted">{detail}</p>}
    </div>
  );
}

// One series per chart, so the title names it and no legend is needed. Each
// column is a hover target taller than its bar, with the exact value shown on
// hover and in the table underneath.
function BarChart({
  title,
  data,
  format,
}: {
  title: string;
  data: { day: string; value: number }[];
  format: (n: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const middle = Math.floor((data.length - 1) / 2);

  return (
    <section className="surface rounded-2xl p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="eyebrow">{title}</h3>
        <span className="font-mono text-xs text-muted">peak {format(max)}</span>
      </div>

      {max === 0 ? (
        <p className="mt-6 text-sm text-muted">Nothing recorded in the last 14 days.</p>
      ) : (
        <div className="mt-6 flex h-36 items-end gap-0.5 border-b border-line" role="img" aria-label={`${title}, last 14 days`}>
          {data.map((d) => (
            <div
              key={d.day}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <div
                className="w-full max-w-7 rounded-t bg-accent/80 transition-colors group-hover:bg-accent"
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
              />
              <div className="pointer-events-none absolute -top-9 z-10 hidden rounded-md border border-line bg-raised px-2 py-1 text-xs whitespace-nowrap shadow-lg group-hover:block">
                <span className="text-muted">{dayLabel(d.day)}</span>{" "}
                <span className="font-mono">{format(d.value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
        <span>{dayLabel(data[0].day)}</span>
        <span>{dayLabel(data[middle].day)}</span>
        <span>{dayLabel(data[data.length - 1].day)}</span>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted hover:text-text">View as table</summary>
        <table className="mt-3 w-full text-left">
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-line/60">
                <td className="py-1.5 text-muted">{dayLabel(d.day)}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Overview({ overview }: { overview: AdminOverview }) {
  const finished = overview.scans_complete + overview.scans_failed;
  const completion = finished
    ? `${Math.round((overview.scans_complete / finished) * 100)}%`
    : "n/a";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="People"
          value={String(overview.users_total)}
          detail={`${overview.users_active_7d} active in the last 7 days`}
        />
        <Tile
          label="Scans"
          value={String(overview.scans_total)}
          detail={`${overview.scans_7d} in the last 7 days`}
        />
        <Tile
          label="Scans completed"
          value={completion}
          detail={`${overview.scans_failed} failed, ${overview.scans_unfinished} unfinished`}
        />
        <Tile
          label="Est. Claude cost, 30 days"
          value={usd(overview.cost_30d)}
          detail={`${compact(overview.input_tokens_30d)} tokens in, ${compact(overview.output_tokens_30d)} out`}
        />
      </div>

      {(overview.users_pending > 0 || overview.users_blocked > 0) && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-5 py-3 text-sm">
          {overview.users_pending} waiting for approval, {overview.users_blocked} blocked. Manage
          them under People and access.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <BarChart
          title="Scans started per day"
          data={overview.daily.map((d) => ({ day: d.day, value: d.scans }))}
          format={(n) => String(n)}
        />
        <BarChart
          title="Estimated Claude cost per day"
          data={overview.daily.map((d) => ({ day: d.day, value: Number(d.cost) }))}
          format={usd}
        />
      </div>

      <section className="surface rounded-2xl p-6">
        <h3 className="eyebrow">Model calls by step, last 30 days</h3>
        {overview.by_step.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No model calls recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-normal">Step</th>
                  <th className="py-2 pr-4 text-right font-normal">Calls</th>
                  <th className="py-2 pr-4 text-right font-normal">Failed</th>
                  <th className="py-2 pr-4 text-right font-normal">Avg time</th>
                  <th className="py-2 pr-4 text-right font-normal">Tokens in</th>
                  <th className="py-2 pr-4 text-right font-normal">Tokens out</th>
                  <th className="py-2 pr-4 text-right font-normal">Searches</th>
                  <th className="py-2 text-right font-normal">Est. cost</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {overview.by_step.map((s) => (
                  <tr key={s.step} className="border-b border-line/60 last:border-b-0">
                    <td className="py-2.5 pr-4 font-sans capitalize">{s.step}</td>
                    <td className="py-2.5 pr-4 text-right">{s.calls}</td>
                    <td className={cx("py-2.5 pr-4 text-right", s.failed > 0 && "text-warn")}>
                      {s.failed}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {s.avg_ms === null ? "n/a" : `${Math.round(s.avg_ms / 1000)}s`}
                    </td>
                    <td className="py-2.5 pr-4 text-right">{compact(s.input_tokens)}</td>
                    <td className="py-2.5 pr-4 text-right">{compact(s.output_tokens)}</td>
                    <td className="py-2.5 pr-4 text-right">{s.web_searches}</td>
                    <td className="py-2.5 text-right">{usd(s.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        Cost is estimated from token counts at list prices and does not include web search
        fees, so your actual bill will be somewhat higher.{" "}
        {overview.usage_since ? (
          <>
            Usage has been recorded since <LocalTime iso={overview.usage_since} />; scans before
            that show no cost.
          </>
        ) : (
          "Usage recording has just been switched on, so cost appears from the next scan onward."
        )}{" "}
        Days are counted in UTC. You see emails and usage numbers here, never other people&apos;s
        repos or reports.
      </p>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  active: "border-accent/40 bg-accent/10 text-accent",
  complete: "border-accent/40 bg-accent/10 text-accent",
  pending: "border-warn/40 bg-warn/10 text-warn",
  failed: "border-warn/40 bg-warn/10 text-warn",
  blocked: "border-warn/40 bg-warn/10 text-warn",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full border px-2 py-0.5 font-mono text-[11px]",
        STATUS_TONE[status] ?? "border-line bg-raised text-muted",
      )}
    >
      {status}
    </span>
  );
}

const selectClass =
  "rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50";

function UserRow({
  user,
  isSelf,
  defaultLimit,
}: {
  user: AdminUser;
  isSelf: boolean;
  defaultLimit: number;
}) {
  const router = useRouter();
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [limit, setLimit] = useState(user.daily_scan_limit?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    role !== user.role ||
    status !== user.status ||
    limit !== (user.daily_scan_limit?.toString() ?? "");

  async function save(next?: { status: AdminUser["status"] }) {
    const parsed = limit.trim() === "" ? null : Number(limit);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0)) {
      setError("The limit must be a whole number, or blank for the default.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: rpcError } = await createClient().rpc("mostviable_admin_set_access", {
      target: user.user_id,
      new_role: role,
      new_status: next?.status ?? status,
      new_limit: parsed,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (next) setStatus(next.status);
    router.refresh();
  }

  return (
    <tr className="border-b border-line/60 align-top last:border-b-0">
      <td className="py-3 pr-4">
        <p className="font-medium break-all">
          {user.email ?? "unknown"}
          {isSelf && <span className="ml-2 font-normal text-muted">(you)</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {user.github_login ? `GitHub @${user.github_login}` : "GitHub not connected"} · last
          seen <LocalTime iso={user.last_seen_at} />
        </p>
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-warn">
            {error}
          </p>
        )}
      </td>
      <td className="py-3 pr-4">
        <select
          aria-label={`Access for ${user.email}`}
          value={status}
          disabled={isSelf}
          onChange={(e) => setStatus(e.target.value as AdminUser["status"])}
          className={selectClass}
        >
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
        </select>
      </td>
      <td className="py-3 pr-4">
        <select
          aria-label={`Role for ${user.email}`}
          value={role}
          disabled={isSelf}
          onChange={(e) => setRole(e.target.value as AdminUser["role"])}
          className={selectClass}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="py-3 pr-4">
        <input
          aria-label={`Daily scan limit for ${user.email}`}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          inputMode="numeric"
          placeholder={`${defaultLimit} (default)`}
          className="w-28 rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
      </td>
      <td className="py-3 pr-4 text-right font-mono tabular-nums">
        {user.scans_total}
        <span className="block text-xs whitespace-nowrap text-muted">{user.scans_24h} today</span>
      </td>
      <td className="py-3 pr-4 text-right font-mono tabular-nums">{usd(user.cost_30d)}</td>
      <td className="py-3 text-right">
        <div className="flex justify-end gap-2">
          {user.status === "pending" && !dirty && (
            <button
              onClick={() => save({ status: "active" })}
              disabled={saving}
              className="btn-primary rounded-full px-3 py-1.5 text-sm"
            >
              Approve
            </button>
          )}
          <button
            onClick={() => save()}
            disabled={!dirty || saving}
            className="rounded-full border border-line px-3 py-1.5 text-sm transition-colors enabled:hover:border-accent/60 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function Users({
  users,
  currentUserId,
  defaultLimit,
}: {
  users: AdminUser[];
  currentUserId: string;
  defaultLimit: number;
}) {
  return (
    <section className="surface rounded-2xl p-6">
      <h3 className="eyebrow">Everyone who has opened the app</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Blocked and pending people can sign in and read their own earlier reports, but cannot
        connect GitHub or run scans. Admins see this page and have no daily scan limit. You
        cannot change your own access, so there is always at least one admin.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[54rem] text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-4 font-normal">Person</th>
              <th className="py-2 pr-4 font-normal">Access</th>
              <th className="py-2 pr-4 font-normal">Role</th>
              <th className="py-2 pr-4 font-normal">Scans per day</th>
              <th className="py-2 pr-4 text-right font-normal">Scans</th>
              <th className="py-2 pr-4 text-right font-normal">Est. cost, 30d</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow
                // Remount when the saved values change so the row's edits reset.
                key={`${user.user_id}:${user.role}:${user.status}:${user.daily_scan_limit}`}
                user={user}
                isSelf={user.user_id === currentUserId}
                defaultLimit={defaultLimit}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function duration(scan: AdminScan) {
  if (!scan.completed_at) return "n/a";
  const seconds = Math.round(
    (new Date(scan.completed_at).getTime() - new Date(scan.created_at).getTime()) / 1000,
  );
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function Scans({ scans }: { scans: AdminScan[] }) {
  return (
    <section className="surface rounded-2xl p-6">
      <h3 className="eyebrow">Latest {scans.length} scans</h3>
      {scans.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No scans yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">Started</th>
                <th className="py-2 pr-4 font-normal">Person</th>
                <th className="py-2 pr-4 font-normal">Status</th>
                <th className="py-2 pr-4 text-right font-normal">Repos</th>
                <th className="py-2 pr-4 text-right font-normal">Researched</th>
                <th className="py-2 pr-4 text-right font-normal">Took</th>
                <th className="py-2 pr-4 text-right font-normal">Tokens</th>
                <th className="py-2 text-right font-normal">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.scan_id} className="border-b border-line/60 align-top last:border-b-0">
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <LocalTime iso={scan.created_at} />
                  </td>
                  <td className="py-2.5 pr-4 break-all">
                    {scan.email ?? "unknown"}
                    {scan.error && (
                      <span className="mt-0.5 block text-xs text-warn">{scan.error}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusPill status={scan.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{scan.repos}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {scan.shortlisted}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {duration(scan)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {scan.tokens > 0 ? compact(scan.tokens) : "n/a"}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums">
                    {scan.tokens > 0 ? usd(scan.cost) : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Settings({ settings }: { settings: AdminSettings }) {
  const router = useRouter();
  const [requireApproval, setRequireApproval] = useState(settings.require_approval);
  const [limit, setLimit] = useState(String(settings.default_daily_scan_limit));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = Number(limit);
    if (limit.trim() === "" || !Number.isInteger(parsed) || parsed < 0) {
      setError("The default limit must be a whole number, zero or more.");
      return;
    }
    setState("saving");
    setError(null);
    const { error: rpcError } = await createClient().rpc("mostviable_admin_set_settings", {
      new_require_approval: requireApproval,
      new_default_limit: parsed,
    });
    if (rpcError) {
      setState("idle");
      setError(rpcError.message);
      return;
    }
    setState("saved");
    router.refresh();
  }

  return (
    <section className="surface max-w-2xl rounded-2xl p-6">
      <h3 className="eyebrow">Who can use the app</h3>

      <label className="mt-5 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={requireApproval}
          onChange={(e) => {
            setRequireApproval(e.target.checked);
            setState("idle");
          }}
          className="mt-1 size-4 accent-accent"
        />
        <span>
          <span className="font-medium">Require approval for new people</span>
          <span className="mt-1 block text-sm leading-relaxed text-muted">
            When on, anyone signing in for the first time starts as Pending and cannot scan
            until you approve them. People who already have access keep it.
          </span>
        </span>
      </label>

      <label className="mt-6 block">
        <span className="font-medium">Default scans per person per day</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">
          Applies to everyone without their own limit. Set it to 0 to pause scanning for
          everyone except admins.
        </span>
        <input
          value={limit}
          onChange={(e) => {
            setLimit(e.target.value);
            setState("idle");
          }}
          inputMode="numeric"
          className="mt-3 w-28 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 text-sm text-warn">
          {error}
        </p>
      )}

      <button
        onClick={save}
        disabled={state === "saving"}
        className="btn-primary mt-6 rounded-full px-5 py-2.5 text-sm"
      >
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save settings"}
      </button>
    </section>
  );
}

export function Admin({
  overview,
  users,
  scans,
  settings,
  currentUserId,
  initialTab,
}: {
  overview: AdminOverview;
  users: AdminUser[];
  scans: AdminScan[];
  settings: AdminSettings;
  currentUserId: string;
  initialTab?: string;
}) {
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.key === initialTab) ? (initialTab as Tab) : "overview",
  );

  function go(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-16">
      <div className="pt-10">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.05]">Access and telemetry</h1>
      </div>

      <nav aria-label="Admin" className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={cx(
              "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors",
              tab === t.key
                ? "border-accent/60 bg-accent/10 text-text"
                : "border-line bg-panel text-muted hover:border-muted/50 hover:text-text",
            )}
          >
            {t.label}
            {t.key === "users" && overview.users_pending > 0 && (
              <span className="rounded-full bg-warn px-1.5 font-mono text-[11px] text-bg">
                {overview.users_pending}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div key={tab} className="rise mt-5">
        {tab === "overview" && <Overview overview={overview} />}
        {tab === "users" && (
          <Users
            users={users}
            currentUserId={currentUserId}
            defaultLimit={settings.default_daily_scan_limit}
          />
        )}
        {tab === "scans" && <Scans scans={scans} />}
        {tab === "settings" && <Settings settings={settings} />}
      </div>
    </main>
  );
}
