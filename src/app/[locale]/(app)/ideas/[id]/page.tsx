/**
 * Confirmation page (authenticated) — shows ConfirmationView for the idea.
 *
 * Lives in the (app) route group — protected by middleware (auth required).
 *
 * Task 5.2
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TRPCReactProvider } from "@/lib/trpc/provider";
import { ConfirmationView } from "@/modules/idea-submission/components/ConfirmationView";

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "confirmation" });
  return { title: t("pageTitle") };
}

export default async function IdeaConfirmationPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "confirmation" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t("pageTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("pageDescription")}</p>
      </header>

      <TRPCReactProvider>
        <ConfirmationView ideaId={id} />
      </TRPCReactProvider>
    </div>
  );
}
