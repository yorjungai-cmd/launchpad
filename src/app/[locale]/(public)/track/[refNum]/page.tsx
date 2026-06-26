/**
 * Guest pipeline tracking page — track idea status by reference number.
 *
 * Public route, no auth required.
 * Calls api.pipeline.trackByReference (public procedure) via TrackingForm.
 *
 * Task 5.4 (pipeline-tracking unit)
 *
 * Note: this route was previously used by idea-submission's TrackView (email
 * verification). It has been updated to use the pipeline TrackingForm which
 * uses the dedicated public `trackByReference` procedure (no email required).
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TRPCReactProvider } from "@/lib/trpc/provider";
import { TrackingForm } from "@/components/pipeline/TrackingForm";

interface Props {
  params: Promise<{ locale: string; refNum: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pipeline" });
  return {
    title: t("tracking.pageTitle"),
    description: t("tracking.pageDescription"),
  };
}

export default async function TrackPage({ params }: Props) {
  const { locale, refNum } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "pipeline" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t("tracking.pageTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("tracking.pageDescription")}</p>
      </header>

      <TRPCReactProvider>
        <TrackingForm referenceNumber={refNum} />
      </TRPCReactProvider>
    </div>
  );
}
