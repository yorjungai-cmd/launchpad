/**
 * Idea Status page — displays StatusCardDetail for the given idea.
 *
 * Lives in (app) route group — protected by auth middleware.
 *
 * Task 5.3
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TRPCReactProvider } from "@/lib/trpc/provider";
import { StatusCardDetail } from "@/components/pipeline/StatusCardDetail";

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pipeline" });
  return { title: t("statusCard.pageTitle") };
}

export default async function IdeaStatusPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "pipeline" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <h1 className="sr-only">{t("statusCard.pageTitle")}</h1>
      </header>

      <TRPCReactProvider>
        <StatusCardDetail ideaId={id} />
      </TRPCReactProvider>
    </div>
  );
}
