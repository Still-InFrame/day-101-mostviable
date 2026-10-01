import { NextResponse } from "next/server";
import { getSession, jsonError } from "@/lib/auth";
import { getToken, revokeGrant } from "@/lib/github";

export async function POST() {
  const { supabase, user } = await getSession();
  if (!user) return jsonError("Not signed in", 401);

  const token = await getToken(supabase, user.id);
  if (token) await revokeGrant(token);

  const { error } = await supabase
    .from("mostviable_github_connections")
    .delete()
    .eq("user_id", user.id);
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true });
}
