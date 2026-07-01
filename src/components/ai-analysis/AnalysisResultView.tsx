"use client";

/**
 * AnalysisResultView — full analysis result display.
 *
 * Sections:
 *   - Summary (collapsible if > 200 chars)
 *   - StageConfidenceBar
 *   - Idea type chip + confidence %
 *   - Stage reasoning (expandable)
 *   - RecommendedActionBadge with reasoning
 *   - PortfolioMatchCards
 *   - FeasibilityChart
 *   - ScoreOverrideForm (visible for bd_reviewer / admin)
 *   - Override history table (rendered inside ScoreOverrideForm)
 *
 * Props:
 *   analysis  — AIAnalysis result object
 *   userRole  — optional role string for showing override form
 *
 * Task 4.2
 */

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { AIAnalysis } from "@/modules/ai-analysis/types";
import { cn } from "@/lib/utils";
import { StageConfidenceBar } from "./StageConfidenceBar";
import { RecommendedActionBadge } from "./RecommendedActionBadge";
import { FeasibilityChart } from "./FeasibilityChart";
import { PortfolioMatchCards } from "./PortfolioMatchCards";
import { ScoreOverrideForm } from "./ScoreOverrideForm";

// ─── Constants ────────────────────────────────────────────────────────────────

const SUMMARY_TRUNCATE_THRESHOLD = 200;
const OVERRIDE_ROLES = ["bd_reviewer", "admin"] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AnalysisResultViewProps {
  analysis: AIAnalysis;
  userRole?: string;
  className?: string;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

// ─── Collapsible text ─────────────────────────────────────────────────────────

function CollapsibleText({
  text,
  threshold = SUMMARY_TRUNCATE_THRESHOLD,
  expandLabel = "อ่านเพิ่มเติม",
  collapseLabel = "ย่อ",
}: {
  text: string;
  threshold?: number;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const needsCollapse = text.length > threshold;
  const displayText = !needsCollapse || expanded ? text : text.slice(0, threshold) + "…";
  const regionId = React.useId();

  return (
    <div>
      <p id={regionId} className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {displayText}
      </p>
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={regionId}
          className="mt-1 flex items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          {expanded ? (
            <ChevronUp className="size-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3" aria-hidden="true" />
          )}
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}

// ─── Stage reasoning (expandable) ────────────────────────────────────────────

function StageReasoning({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const reasoningId = React.useId();

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={reasoningId}
        className="flex items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {expanded ? (
          <ChevronUp className="size-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3" aria-hidden="true" />
        )}
        {expanded ? "ซ่อนเหตุผล stage" : "ดูเหตุผล stage"}
      </button>

      {expanded && (
        <div
          id={reasoningId}
          className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground"
        >
          <p className="whitespace-pre-wrap">{reasoning}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AnalysisResultView({ analysis, userRole, className }: AnalysisResultViewProps) {
  const [currentAnalysis, setCurrentAnalysis] = React.useState<AIAnalysis>(analysis);

  // Keep analysis in sync when parent passes a new one
  React.useEffect(() => {
    setCurrentAnalysis(analysis);
  }, [analysis]);

  const canOverride =
    userRole !== undefined && (OVERRIDE_ROLES as readonly string[]).includes(userRole);

  // Build feasibility object for FeasibilityChart
  const feasibility =
    currentAnalysis.strategicFitScore !== null
      ? {
          strategicFit: currentAnalysis.strategicFitScore ?? 1,
          marketPotential: currentAnalysis.marketPotentialScore ?? 1,
          technicalFeasibility: currentAnalysis.technicalFeasibilityScore ?? 1,
          resourceRequirement: currentAnalysis.resourceRequirementScore ?? 1,
          businessImpact: currentAnalysis.businessImpactScore ?? 1,
        }
      : null;

  const portfolioMatches = (currentAnalysis.portfolioMatches ?? []).map((m) => ({
    product: m.product,
    relevance: m.relevance as "High" | "Medium" | "Low",
    reasoning: m.reasoning,
  }));

  const ideaTypeConfidencePct =
    currentAnalysis.ideaTypeConfidence !== null
      ? Math.round((currentAnalysis.ideaTypeConfidence ?? 0) * 100)
      : null;

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* ── Summary ──────────────────────────────────────────────────────── */}
      {currentAnalysis.summary && (
        <Section title="สรุปผลการวิเคราะห์">
          <CollapsibleText text={currentAnalysis.summary} />
        </Section>
      )}

      {/* ── Stage + confidence ───────────────────────────────────────────── */}
      {currentAnalysis.stage && currentAnalysis.stageConfidence !== null && (
        <Section title="Stage ในกระบวนการ Launch PAD 2.0">
          <StageConfidenceBar
            stage={currentAnalysis.stage}
            confidence={currentAnalysis.stageConfidence ?? 0}
          />
          {currentAnalysis.stageReasoning && (
            <StageReasoning reasoning={currentAnalysis.stageReasoning} />
          )}
        </Section>
      )}

      {/* ── Idea type ────────────────────────────────────────────────────── */}
      {currentAnalysis.ideaType && (
        <Section title="ประเภท Idea">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-0.5 text-sm font-medium text-secondary-foreground">
              {currentAnalysis.ideaType}
              {ideaTypeConfidencePct !== null && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  – {ideaTypeConfidencePct}%
                </span>
              )}
            </span>
          </div>
        </Section>
      )}

      {/* ── Recommended action ───────────────────────────────────────────── */}
      {currentAnalysis.recommendedAction && (
        <Section title="คำแนะนำการดำเนินการ">
          <RecommendedActionBadge
            action={currentAnalysis.recommendedAction}
            reasoning={currentAnalysis.recommendedActionReasoning}
          />
        </Section>
      )}

      {/* ── Feasibility chart ────────────────────────────────────────────── */}
      <Section title="การประเมิน Feasibility (1–5)">
        <FeasibilityChart feasibility={feasibility} />
      </Section>

      {/* ── Portfolio matches ────────────────────────────────────────────── */}
      <Section title="ความเชื่อมโยงกับ Portfolio">
        <PortfolioMatchCards portfolioMatches={portfolioMatches} />
      </Section>

      {/* ── Score override form (bd_reviewer / admin only) ───────────────── */}
      {canOverride && (
        <ScoreOverrideForm
          ideaId={currentAnalysis.ideaId}
          analysis={currentAnalysis}
          onSuccess={setCurrentAnalysis}
        />
      )}
    </div>
  );
}
