/**
 * Analysis Page — /[locale]/(app)/ideas/[id]/analysis
 *
 * Server Component that:
 *   - Reads ideaId from params.id
 *   - Gets the authenticated user session + role
 *   - Renders <AnalysisStatusPoller> wrapped in TRPCReactProvider
 *
 * Task 4.4 (page)
 */

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { TRPCReactProvider } from "@/lib/trpc/provider";
import { getServerSession } from "@/lib/auth/server";
import { AnalysisStatusPoller } from "@/components/ai-analysis/AnalysisStatusPoller";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { ideaRepository } from "@/modules/idea-submission/repository";
import type { AppRole } from "@/lib/supabase/types";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "ผลการวิเคราะห์ AI | LaunchPad Portal",
    description: "ดูผลการวิเคราะห์ idea โดย AI ของระบบ LaunchPad",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export default async function IdeaAnalysisPage({ params }: Props) {
  const { locale, id: ideaId } = await params;
  setRequestLocale(locale);

  // Get session and extract role
  const session = await getServerSession();
  const userRole = (session?.user?.user_metadata?.["role"] as AppRole | undefined) ?? undefined;

  // Fetch idea metadata for header display
  const db = createAdminSupabaseClient();
  const idea = await ideaRepository.getIdeaById(ideaId, db);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">ผลการวิเคราะห์ AI</h1>
        {idea && (
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{idea.reference_number}</span>
            {idea.title && (
              <>
                <span className="mx-1.5">·</span>
                {idea.title}
              </>
            )}
          </p>
        )}
        {!idea && (
          <p className="mt-1 text-sm text-muted-foreground">
            ระบบ AI วิเคราะห์ idea ของคุณตามกรอบ Launch PAD 2.0
          </p>
        )}
      </header>

      <TRPCReactProvider>
        <AnalysisStatusPoller ideaId={ideaId} userRole={userRole} />
      </TRPCReactProvider>
    </div>
  );
}
