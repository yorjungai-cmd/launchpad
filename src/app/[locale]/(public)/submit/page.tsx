/**
 * Idea submission page — public route, no auth required.
 *
 * Server Component wrapping the SubmissionForm client island.
 * TRPCReactProvider is supplied by the locale layout (not re-added here).
 *
 * Task 4.6
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TRPCReactProvider } from "@/lib/trpc/provider";
import { SubmissionForm } from "@/modules/idea-submission/components/SubmissionForm";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "submission" });
  return {
    title: t("pageTitle"),
    description: t("pageDescription"),
  };
}

export default async function SubmitPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "submission" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Page heading */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t("pageTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("pageDescription")}</p>
      </header>

      {/* Client island: tRPC + form */}
      <TRPCReactProvider>
        <SubmissionForm />
      </TRPCReactProvider>
    </div>
  );
}
