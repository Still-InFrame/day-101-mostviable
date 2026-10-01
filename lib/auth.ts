import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
