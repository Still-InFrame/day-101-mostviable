import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeUrl, STATE_COOKIE } from "@/lib/github";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const { user } = await getSession();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(
    authorizeUrl(`${origin}/api/github/callback`, state),
  );
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}
