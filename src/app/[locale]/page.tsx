/**
 * Landing page — public home.
 *
 * Shows hero section with links to submit idea, sign in, or track idea.
 */
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      {/* Hero */}
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Launch<span className="text-blue-600">PAD</span> Portal
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          AI-powered idea submission &amp; evaluation platform for AppliCAD Business Development
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href={`/${locale}/submit`}
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-blue-600 px-6 text-sm font-medium text-white shadow hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            Submit an Idea
          </Link>
          <Link
            href={`/${locale}/auth/sign-in`}
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-6 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            Sign In
          </Link>
        </div>

        {/* Track link */}
        <p className="mt-6 text-sm text-slate-500">
          Already submitted?{" "}
          <Link
            href={`/${locale}/track/LP-`}
            className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-500"
          >
            Track your idea
          </Link>
        </p>
      </div>

      {/* Footer */}
      <footer className="mt-20 text-xs text-slate-400">
        © {new Date().getFullYear()} AppliCAD Co., Ltd. — LaunchPAD 2.0
      </footer>
    </div>
  );
}
