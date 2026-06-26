/**
 * Unit tests for email templates — all 7 templates × 2 locales.
 *
 * Tests:
 *   - Each template renders valid { subject, html } for both 'th' and 'en'
 *   - subject is non-empty
 *   - html is non-empty and contains <!DOCTYPE html>
 *   - getTemplateByType() returns a working function for each type
 *
 * Ref: tasks.md — Task 6.2
 */

import { describe, it, expect } from "vitest";
import {
  renderIdeaReceived,
  renderAnalysisComplete,
  renderDocumentsReady,
  renderStageChanged,
  renderIdeaApproved,
  renderIdeaRejected,
  renderBDNewIdea,
  getTemplateByType,
} from "@/modules/notification/templates";
import { NotificationType } from "@/modules/notification/schemas";
import type { IdeaReceivedData } from "@/modules/notification/templates/idea-received";
import type { AnalysisCompleteData } from "@/modules/notification/templates/analysis-complete";
import type { DocumentsReadyData } from "@/modules/notification/templates/documents-ready";
import type { StageChangedData } from "@/modules/notification/templates/stage-changed";
import type { IdeaApprovedData } from "@/modules/notification/templates/idea-approved";
import type { IdeaRejectedData } from "@/modules/notification/templates/idea-rejected";
import type { BDNewIdeaData } from "@/modules/notification/templates/bd-new-idea";

// ─── Mock data ────────────────────────────────────────────────────────────────

const ideaReceivedData: IdeaReceivedData = {
  title: "AI-Powered CRM",
  referenceNumber: "LP-2024-000001",
  trackingLink: "http://localhost:3000/track/LP-2024-000001",
};

const analysisCompleteData: AnalysisCompleteData = {
  title: "AI-Powered CRM",
  stage: "Validation Sprint",
  recommendedAction: "Proceed to Build Sprint",
  draftLink: "http://localhost:3000/ideas/uuid-001/documents",
};

const documentsReadyData: DocumentsReadyData = {
  title: "AI-Powered CRM",
  documentsLink: "http://localhost:3000/ideas/uuid-001/documents",
};

const stageChangedData: StageChangedData = {
  title: "AI-Powered CRM",
  fromStage: "sandbox",
  toStage: "validation_sprint",
};

const ideaApprovedData: IdeaApprovedData = {
  title: "AI-Powered CRM",
  approvedLink: "http://localhost:3000/ideas/uuid-001/documents?status=approved",
};

const ideaRejectedData: IdeaRejectedData = {
  title: "AI-Powered CRM",
  reason: "Does not align with current portfolio strategy",
};

const bdNewIdeaData: BDNewIdeaData = {
  ideaTitle: "AI-Powered CRM",
  submitterName: "John Doe",
  submitterType: "employee",
  referenceNumber: "LP-2024-000001",
};

// ─── Helper to validate render output ─────────────────────────────────────────

function assertValidRender(result: { subject: string; html: string }, _locale: "th" | "en") {
  expect(result.subject).toBeDefined();
  expect(result.subject.length).toBeGreaterThan(0);
  expect(result.html).toBeDefined();
  expect(result.html.length).toBeGreaterThan(0);
  expect(result.html).toContain("<!DOCTYPE html>");
}

// ─── renderIdeaReceived ───────────────────────────────────────────────────────

describe("renderIdeaReceived", () => {
  it('renders valid output for locale "th"', () => {
    const result = renderIdeaReceived(ideaReceivedData, "th");
    assertValidRender(result, "th");
    // Thai subject should contain the reference number
    expect(result.subject).toContain("LP-2024-000001");
  });

  it('renders valid output for locale "en"', () => {
    const result = renderIdeaReceived(ideaReceivedData, "en");
    assertValidRender(result, "en");
    expect(result.subject).toContain("LP-2024-000001");
  });
});

// ─── renderAnalysisComplete ───────────────────────────────────────────────────

describe("renderAnalysisComplete", () => {
  it('renders valid output for locale "th"', () => {
    const result = renderAnalysisComplete(analysisCompleteData, "th");
    assertValidRender(result, "th");
    expect(result.html).toContain("AI-Powered CRM");
  });

  it('renders valid output for locale "en"', () => {
    const result = renderAnalysisComplete(analysisCompleteData, "en");
    assertValidRender(result, "en");
    expect(result.html).toContain("AI-Powered CRM");
  });
});

// ─── renderDocumentsReady ─────────────────────────────────────────────────────

describe("renderDocumentsReady", () => {
  it('renders valid output for locale "th"', () => {
    const result = renderDocumentsReady(documentsReadyData, "th");
    assertValidRender(result, "th");
    expect(result.html).toContain("AI-Powered CRM");
  });

  it('renders valid output for locale "en"', () => {
    const result = renderDocumentsReady(documentsReadyData, "en");
    assertValidRender(result, "en");
    expect(result.html).toContain("AI-Powered CRM");
  });
});

// ─── renderStageChanged ───────────────────────────────────────────────────────

describe("renderStageChanged", () => {
  it('renders valid output for locale "th"', () => {
    const result = renderStageChanged(stageChangedData, "th");
    assertValidRender(result, "th");
    expect(result.html).toContain("AI-Powered CRM");
  });

  it('renders valid output for locale "en"', () => {
    const result = renderStageChanged(stageChangedData, "en");
    assertValidRender(result, "en");
    expect(result.html).toContain("AI-Powered CRM");
  });
});

// ─── renderIdeaApproved ───────────────────────────────────────────────────────

describe("renderIdeaApproved", () => {
  it('renders valid output for locale "th"', () => {
    const result = renderIdeaApproved(ideaApprovedData, "th");
    assertValidRender(result, "th");
    expect(result.html).toContain("AI-Powered CRM");
  });

  it('renders valid output for locale "en"', () => {
    const result = renderIdeaApproved(ideaApprovedData, "en");
    assertValidRender(result, "en");
    expect(result.html).toContain("AI-Powered CRM");
  });
});

// ─── renderIdeaRejected ───────────────────────────────────────────────────────

describe("renderIdeaRejected", () => {
  it('renders valid output for locale "th"', () => {
    const result = renderIdeaRejected(ideaRejectedData, "th");
    assertValidRender(result, "th");
    expect(result.html).toContain("AI-Powered CRM");
  });

  it('renders valid output for locale "en"', () => {
    const result = renderIdeaRejected(ideaRejectedData, "en");
    assertValidRender(result, "en");
    expect(result.html).toContain("AI-Powered CRM");
  });
});

// ─── renderBDNewIdea ──────────────────────────────────────────────────────────

describe("renderBDNewIdea", () => {
  it('renders valid output for locale "th"', () => {
    const result = renderBDNewIdea(bdNewIdeaData, "th");
    assertValidRender(result, "th");
    expect(result.html).toContain("AI-Powered CRM");
  });

  it('renders valid output for locale "en"', () => {
    const result = renderBDNewIdea(bdNewIdeaData, "en");
    assertValidRender(result, "en");
    expect(result.html).toContain("AI-Powered CRM");
  });
});

// ─── getTemplateByType ────────────────────────────────────────────────────────

describe("getTemplateByType()", () => {
  const allTypes = Object.values(NotificationType);

  it.each(allTypes)('returns a function for type "%s"', (type) => {
    const fn = getTemplateByType(type);
    expect(fn).toBeDefined();
    expect(typeof fn).toBe("function");
  });

  it("returned function produces valid render result for IDEA_RECEIVED", () => {
    const fn = getTemplateByType(NotificationType.IDEA_RECEIVED);
    const result = fn(ideaReceivedData, "th");
    assertValidRender(result, "th");
  });

  it("returned function produces valid render result for BD_NEW_IDEA", () => {
    const fn = getTemplateByType(NotificationType.BD_NEW_IDEA);
    const result = fn(bdNewIdeaData, "en");
    assertValidRender(result, "en");
  });
});
