import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, getViewer, STATE_COOKIE } from "@/lib/github";
import { syncRepos } from "@/lib/repos";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const back = (status: string) => {
    const response = NextResponse.redirect(`${origin}/?github=${status}`);
    response.cookies.delete(STATE_COOKIE);
    return response;
  };

  const { supabase, user } = await getSession();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  // GitHub sends ?error=access_denied when the user cancels on its consent screen.
  if (searchParams.get("error")) return back("denied");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return back("failed");

  try {
    const { token, scope } = await exchangeCode(code, `${origin}/api/github/callback`);
    const viewer = await getViewer(token);
    const { error } = await supabase.from("mostviable_github_connections").upsert({
      user_id: user.id,
      github_login: viewer.login,
      access_token_enc: encrypt(token),
      scopes: scope,
    });
    if (error) throw new Error(error.message);
    await syncRepos(supabase, token);
  } catch (err) {
    console.error("GitHub connect failed", err);
    return back("failed");
  }

  return back("connected");
}
