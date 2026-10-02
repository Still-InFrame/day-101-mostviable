// Shapes returned by the mostviable_admin_* database functions.

export type AdminOverview = {
  users_total: number;
  users_active_7d: number;
  users_pending: number;
  users_blocked: number;
  scans_total: number;
  scans_7d: number;
  scans_complete: number;
  scans_failed: number;
  scans_unfinished: number;
  cost_30d: number;
  input_tokens_30d: number;
  output_tokens_30d: number;
  // When usage logging began; null until the first model call is recorded.
  usage_since: string | null;
  daily: { day: string; scans: number; cost: number }[];
  by_step: {
    step: string;
    calls: number;
    failed: number;
    avg_ms: number | null;
    input_tokens: number;
    output_tokens: number;
    web_searches: number;
    cost: number;
  }[];
};

export type AdminUser = {
  user_id: string;
  email: string | null;
  role: "user" | "admin";
  status: "active" | "pending" | "blocked";
  daily_scan_limit: number | null;
  first_seen_at: string;
  last_seen_at: string;
  github_login: string | null;
  scans_total: number;
  scans_24h: number;
  last_scan_at: string | null;
  cost_30d: number;
  tokens_30d: number;
};

export type AdminScan = {
  scan_id: string;
  email: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  repos: number;
  shortlisted: number;
  error: string | null;
  cost: number;
  tokens: number;
};

export type AdminSettings = {
  require_approval: boolean;
  default_daily_scan_limit: number;
};
