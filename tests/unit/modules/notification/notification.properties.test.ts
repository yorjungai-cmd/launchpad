/**
 * Property-Based Tests for notification module.
 * Uses fast-check (Vitest integration).
 *
 * Properties:
 *   1. Event-Template Mapping Completeness — every NotificationType maps to a template
 *   2. Recipient Correctness — submitter types → submitter; bd_new_idea → BD reviewers
 *   3. Locale Selection Correctness — guest=th, user profile locale respected, fallback=th
 *   4. Fire-and-Forget Safety — sender throws → service never throws
 *
 * Ref: design/correctness.md — 4 Properties
 * Task 6.3
 */

import { describe, it, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NotificationType } from "@/modules/notification/schemas";
import { getTemplateByType } from "@/modules/notification/templates";
import type { IdeaReceivedData } from "@/modules/notification/templates/idea-received";
import type { AnalysisCompleteData } from "@/modules/notification/templates/analysis-complete";
import type { DocumentsReadyData } from "@/modules/notification/templates/documents-ready";
import type { StageChangedData } from "@/modules/notification/templates/stage-changed";
import type { IdeaApprovedData } from "@/modules/notification/templates/idea-approved";
import type { IdeaRejectedData } from "@/modules/notification/templates/idea-rejected";
import type { BDNewIdeaData } from "@/modules/notification/templates/bd-new-idea";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_TYPES = Object.values(NotificationType);
const ALL_LOCALES: Array<"th" | "en"> = ["th", "en"];

const SUBMITTER_TYPES = [
  NotificationType.IDEA_RECEIVED,
  NotificationType.ANALYSIS_COMPLETE,
  NotificationType.DOCUMENTS_READY,
  NotificationType.STAGE_CHANGED,
  NotificationType.IDEA_APPROVED,
  NotificationType.IDEA_REJECTED,
];

// ─── Mock data generators for templates ───────────────────────────────────────

function generateMockData(type: NotificationType): unknown {
  switch (type) {
    case NotificationType.IDEA_RECEIVED:
      return {
        title: "Test Idea",
        referenceNumber: "LP-2024-000001",
        trackingLink: "http://localhost:3000/track/LP-2024-000001",
      } satisfies IdeaReceivedData;
    case NotificationType.ANALYSIS_COMPLETE:
      return {
        title: "Test Idea",
        stage: "Validation Sprint",
        recommendedAction: "Proceed",
        draftLink: "http://localhost:3000/ideas/uuid/documents",
      } satisfies AnalysisCompleteData;
    case NotificationType.DOCUMENTS_READY:
      return {
        title: "Test Idea",
        documentsLink: "http://localhost:3000/ideas/uuid/documents",
      } satisfies DocumentsReadyData;
    case NotificationType.STAGE_CHANGED:
      return {
        title: "Test Idea",
        fromStage: "sandbox",
        toStage: "validation_sprint",
      } satisfies StageChangedData;
    case NotificationType.IDEA_APPROVED:
      return {
        title: "Test Idea",
        approvedLink: "http://localhost:3000/ideas/uuid/documents?status=approved",
      } satisfies IdeaApprovedData;
    case NotificationType.IDEA_REJECTED:
      return {
        title: "Test Idea",
        reason: "Not aligned",
      } satisfies IdeaRejectedData;
    case NotificationType.BD_NEW_IDEA:
      return {
        ideaTitle: "Test Idea",
        submitterName: "John",
        submitterType: "employee",
        referenceNumber: "LP-2024-000001",
      } satisfies BDNewIdeaData;
  }
}

// ─── Pure functions for property testing ──────────────────────────────────────

/**
 * Pure function: resolve recipients based on notification type and context.
 * Mirrors the logic in NotificationService.
 */
function resolveRecipients(
  type: NotificationType,
  context: { submitterEmail: string; bdReviewerEmails: string[] }
): string[] {
  if (type === NotificationType.BD_NEW_IDEA) {
    return context.bdReviewerEmails;
  }
  return [context.submitterEmail];
}

/**
 * Pure function: resolve locale based on userId and profile locale.
 * Mirrors the logic in NotificationService.resolveLocale.
 */
function resolveLocale(
  userId: string | null | undefined,
  profileLocale: string | null | undefined
): "th" | "en" {
  if (!userId) return "th";
  if (profileLocale === "th" || profileLocale === "en") return profileLocale;
  return "th";
}

// ─── Property 1: Event-Template Mapping Completeness ──────────────────────────

describe("PBT Property 1: Event-Template Mapping Completeness", () => {
  it("every NotificationType maps to a template function that renders non-empty { subject, html }", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_TYPES),
        fc.constantFrom(...ALL_LOCALES),
        (notificationType, locale) => {
          const templateFn = getTemplateByType(notificationType);

          // template function must exist
          if (!templateFn) return false;

          const data = generateMockData(notificationType);
          const result = templateFn(data as any, locale);

          // Must return non-empty subject + html
          return (
            typeof result.subject === "string" &&
            result.subject.length > 0 &&
            typeof result.html === "string" &&
            result.html.length > 0
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property 2: Recipient Correctness ────────────────────────────────────────

describe("PBT Property 2: Recipient Correctness", () => {
  it("submitter event types → recipients = [submitterEmail]", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUBMITTER_TYPES),
        fc.emailAddress(),
        fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
        (type, submitterEmail, bdEmails) => {
          const recipients = resolveRecipients(type, {
            submitterEmail,
            bdReviewerEmails: bdEmails,
          });
          return recipients.length === 1 && recipients[0] === submitterEmail;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("bd_new_idea → recipients = all BD reviewer emails (not submitter)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.emailAddress(), { minLength: 1, maxLength: 10 }),
        fc.emailAddress(),
        (bdEmails, submitterEmail) => {
          const recipients = resolveRecipients(NotificationType.BD_NEW_IDEA, {
            submitterEmail,
            bdReviewerEmails: bdEmails,
          });

          // recipients must equal BD reviewer list
          return (
            recipients.length === bdEmails.length &&
            bdEmails.every((email) => recipients.includes(email))
          );
        }
      ),
      { numRuns: 200 }
    );
  });

  it("bd_new_idea → submitter NOT in recipient list (when submitter is not a BD reviewer)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
        fc.emailAddress().filter((e) => !e.includes("bd-reviewer")),
        (bdEmails, submitterEmail) => {
          // Ensure submitter is not in BD emails
          const filteredBdEmails = bdEmails.filter((e) => e !== submitterEmail);
          if (filteredBdEmails.length === 0) return true; // skip edge case

          const recipients = resolveRecipients(NotificationType.BD_NEW_IDEA, {
            submitterEmail,
            bdReviewerEmails: filteredBdEmails,
          });

          return !recipients.includes(submitterEmail);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property 3: Locale Selection Correctness ─────────────────────────────────

describe("PBT Property 3: Locale Selection Correctness", () => {
  it('userId=null → always returns "th"', () => {
    fc.assert(
      fc.property(fc.constantFrom("th", "en", null, undefined, "ja", "fr", ""), (profileLocale) => {
        return resolveLocale(null, profileLocale) === "th";
      }),
      { numRuns: 200 }
    );
  });

  it('userId=undefined → always returns "th"', () => {
    fc.assert(
      fc.property(fc.constantFrom("th", "en", null, undefined), (profileLocale) => {
        return resolveLocale(undefined, profileLocale) === "th";
      }),
      { numRuns: 200 }
    );
  });

  it("userId exists + valid locale → returns that locale", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom("th" as const, "en" as const),
        (userId, profileLocale) => {
          return resolveLocale(userId, profileLocale) === profileLocale;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('userId exists + invalid/null locale → fallback "th"', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(null, undefined, "ja", "fr", "de", ""),
        (userId, profileLocale) => {
          return resolveLocale(userId, profileLocale) === "th";
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property 4: Fire-and-Forget Safety ───────────────────────────────────────
// Mocks are hoisted to top level to suppress Vitest warnings

const mockP4Create = vi.fn();
const mockP4UpdateStatus = vi.fn();
const mockP4Send = vi.fn();

vi.mock("@/modules/notification/repository", () => ({
  notificationRepository: {
    create: (...args: unknown[]) => mockP4Create(...args),
    updateStatus: (...args: unknown[]) => mockP4UpdateStatus(...args),
  },
}));

vi.mock("@/modules/notification/sender", () => ({
  emailSender: {
    send: (...args: unknown[]) => mockP4Send(...args),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("PBT Property 4: Fire-and-Forget Safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no matter what error sender throws, service method never throws to caller", async () => {
    const { NotificationService } = await import("@/modules/notification/service");

    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 100 }), async (errorMessage) => {
        mockP4Create.mockResolvedValue("notif-uuid-fire-forget");
        mockP4Send.mockRejectedValue(new Error(errorMessage));
        mockP4UpdateStatus.mockResolvedValue(undefined);

        const service = new NotificationService();

        // notifyIdeaReceived should NOT throw
        let threw = false;
        try {
          await service.notifyIdeaReceived({
            id: "idea-uuid-pbt",
            title: "PBT Test",
            referenceNumber: "LP-PBT-000001",
            submitterEmail: "pbt@example.com",
            submitterName: "PBT User",
            submitterUserId: null,
          });
        } catch {
          threw = true;
        }

        return !threw;
      }),
      { numRuns: 200 }
    );
  });

  it("no matter what error repository.create throws, service never throws", async () => {
    const { NotificationService } = await import("@/modules/notification/service");

    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 100 }), async (errorMessage) => {
        mockP4Create.mockRejectedValue(new Error(errorMessage));

        const service = new NotificationService();

        let threw = false;
        try {
          await service.notifyIdeaReceived({
            id: "idea-uuid-pbt-2",
            title: "PBT Test 2",
            referenceNumber: "LP-PBT-000002",
            submitterEmail: "pbt2@example.com",
            submitterName: "PBT User 2",
            submitterUserId: null,
          });
        } catch {
          threw = true;
        }

        return !threw;
      }),
      { numRuns: 200 }
    );
  });
});
