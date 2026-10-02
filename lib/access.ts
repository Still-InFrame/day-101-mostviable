import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type Access = {
  role: "user" | "admin";
  status: "active" | "pending" | "blocked";
  // Already resolved: the user's own limit, or the app default.
  daily_scan_limit: number;
};

// Registers the visit and returns the caller's access. The row behind this is
// writable only by admins, so the answer cannot be forged from the browser.
export async function touchAccess(supabase: SupabaseClient): Promise<Access> {
  const { data, error } = await supabase.rpc("mostviable_touch");
  if (error) throw new Error(`Could not check access: ${error.message}`);
  return data as Access;
}

export const ACCESS_MESSAGES: Record<Exclude<Access["status"], "active">, string> = {
  pending: "Your access is waiting for approval.",
  blocked: "Your access to mostviable has been turned off.",
};

// For route handlers: the caller's access, or the response to send instead.
// `fatal` stops a running scan rather than skipping one repo.
export async function requireActive(supabase: SupabaseClient): Promise<Access | NextResponse> {
  const access = await touchAccess(supabase);
  if (access.status === "active") return access;
  return NextResponse.json(
    { error: ACCESS_MESSAGES[access.status], fatal: true },
    { status: 403 },
  );
}
