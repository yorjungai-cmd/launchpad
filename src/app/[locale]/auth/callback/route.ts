/**
 * Auth callback route — handles magic link and OAuth redirects.
 *
 * Supabase appends `?code=xxx` to this URL after a magic link click.
 * We exchange the code for a session and redirect to the app.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/en/dashboard/executive";

  if (code) {
    const response = NextResponse.redirect(new URL(redirectTo, origin));

    const supabase = createServerClient(
      process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
      process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response;
    }
  }

  // If no code or error, redirect to sign-in
  return NextResponse.redirect(new URL("/en/auth/sign-in", origin));
}
