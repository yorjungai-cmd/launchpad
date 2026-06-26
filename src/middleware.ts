/**
 * Next.js Middleware — Auth + Locale (composed)
 *
 * Execution order per request:
 *   1. Run next-intl locale routing (prefix every URL, redirect bare paths)
 *   2. Protect /[locale]/(app)/* routes — redirect to sign-in if no session
 *   3. Allow /[locale]/(public)/*, /[locale]/auth/*, /api/trpc/* without auth
 *
 * Supabase session handling:
 *   - Uses @supabase/ssr `createServerClient` with middleware cookie helpers
 *     so the session cookie is refreshed on every request (prevents expiry).
 *   - Auth verification uses `getUser()` (server-validated JWT), not `getSession()`.
 *
 * Task 7.1: Locale routing (next-intl) — already present.
 * Task 3.3: Auth protection — composed on top, does NOT replace locale routing.
 */
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";

import { defaultLocale, locales } from "@/lib/i18n/config";
import { SIGN_IN_PATH } from "@/lib/auth/config";

// ─── Locale middleware (next-intl) ────────────────────────────────────────────

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

// ─── Route patterns ───────────────────────────────────────────────────────────

/**
 * Routes that require an authenticated session.
 * Matches /[locale]/(app)/... in the Next.js App Router route groups.
 */
const PROTECTED_PATTERN = /^\/[^/]+\/(?!auth|_next|api)(.*)/;

/**
 * Routes that are always public — no auth check required.
 * Auth pages, public route group paths, API routes.
 */
const PUBLIC_PATTERNS = [
  /^\/[^/]+\/auth(\/.*)?$/, // /[locale]/auth/* (sign-in, callback…)
  /^\/[^/]+\/submit$/, // /[locale]/submit (idea submission)
  /^\/[^/]+\/track(\/.*)?$/, // /[locale]/track/* (guest tracking)
  /^\/api\/trpc(\/.*)?$/, // /api/trpc/*
  /^\/_next(\/.*)?$/, // Next.js internals
  /^\/[^/]+$/, // /[locale] (home page)
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isProtectedPath(pathname: string): boolean {
  return !isPublicPath(pathname) && PROTECTED_PATTERN.test(pathname);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip middleware entirely for API routes — they don't need locale or auth
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 2. Run locale routing for all non-API paths
  const intlResponse = intlMiddleware(request);

  // 3. Skip auth check for public paths
  if (!isProtectedPath(pathname)) {
    return intlResponse;
  }

  // 3. Build a Supabase client that can read + refresh session cookies
  //    in the middleware context (no `cookies()` from next/headers here —
  //    we use the raw request/response cookie API instead).
  //
  //    IMPORTANT: supabaseResponse must be the SAME object passed to setAll.
  //    Creating a new NextResponse.next() inside setAll loses intlResponse headers
  //    (locale redirects, x-intl-locale etc.) and breaks session cookie propagation.
  const supabaseResponse = intlResponse ?? NextResponse.next({ request });

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies into BOTH request and the existing supabaseResponse
          // so the client receives refreshed tokens without losing intl headers.
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // 4. Verify session using getUser() (validates JWT against Supabase Auth)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 5. No valid session → redirect to localised sign-in page
  if (!user) {
    // Extract the locale from the first path segment (e.g. /th/dashboard → "th")
    const localeMatch = pathname.match(/^\/([^/]+)/);
    const locale = localeMatch?.[1] ?? defaultLocale;

    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = `/${locale}${SIGN_IN_PATH}`;
    // Preserve the original destination so we can redirect back after sign-in
    signInUrl.searchParams.set("redirectTo", pathname);

    return NextResponse.redirect(signInUrl);
  }

  // 6. Authenticated — return the response with refreshed cookies
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all pathnames except Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
