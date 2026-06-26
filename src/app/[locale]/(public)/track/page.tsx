/**
 * /track — Idea tracking search page (no reference number yet).
 *
 * Public route. User enters their reference number → navigates to
 * /track/[refNum] which shows status + AI result.
 */

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { TrackSearch } from "@/components/pipeline/TrackSearch";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Track your idea | LaunchPad Portal",
    description: "ติดตามสถานะ idea ของคุณด้วยหมายเลขอ้างอิง",
  };
}

export default async function TrackSearchPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">ติดตามสถานะ Idea</h1>
        <p className="mt-2 text-muted-foreground">
          กรอกหมายเลขอ้างอิง (เช่น LP-XXXXXXXX) เพื่อดูสถานะและผลวิเคราะห์ AI
        </p>
      </header>
      <TrackSearch locale={locale} />
    </div>
  );
}
