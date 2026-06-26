/**
 * Integration tests for notification flow.
 *
 * Tests the full flow from service → repository → sender with mocked externals.
 * Mock: emailSender (no real email), Supabase (in-memory state)
 *
 * Tests:
 *   1. notifyIdeaReceived → notification row created (type=idea_received, status=sent)
 *   2. notifyIdeaRejected → notification row created (type=idea_rejected, status=sent, error=null)
 *   3. sender fails → notification row updated (status=failed, error_message has value)
 *   4. notifyBDNewIdea with 3 BD reviewers → 3 notification rows created
 *
 * Ref: tasks.md — Task 6.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── In-memory notification store ─────────────────────────────────────────────

interface NotificationRow {
  id: string;
  type: string;
  recipientEmail: string;
  recipientName: string | null;
  ideaId: string;
  locale: string;
  subject: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

let notificationStore: NotificationRow[] = [];
let idCounter = 0;

function resetStore() {
  notificationStore = [];
  idCounter = 0;
}

// ─── Mock: repository (in-memory) ─────────────────────────────────────────────

vi.mock("@/modules/notification/repository", () => ({
  notificationRepository: {
    create: vi.fn(async (input: any) => {
      const id = `notif-intg-${++idCounter}`;
      notificationStore.push({
        id,
        type: input.type,
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName ?? null,
        ideaId: input.ideaId,
        locale: input.locale ?? "th",
        subject: input.subject,
        status: input.status ?? "pending",
        errorMessage: null,
        sentAt: null,
        createdAt: new Date().toISOString(),
      });
      return id;
    }),
    updateStatus: vi.fn(async (id: string, status: string, errorMessage?: string) => {
      const row = notificationStore.find((r) => r.id === id);
      if (row) {
        row.status = status;
        row.errorMessage = errorMessage ?? null;
        if (status === "sent") {
          row.sentAt = new Date().toISOString();
        }
      }
    }),
  },
}));

// ─── Mock: emailSender ────────────────────────────────────────────────────────

const mockEmailSend = vi.fn();

vi.mock("@/modules/notification/sender", () => ({
  emailSender: {
    send: (...args: unknown[]) => mockEmailSend(...args),
  },
}));

// ─── Mock: Supabase ───────────────────────────────────────────────────────────

const mockSupabaseFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  })),
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(),
    auth: { getUser: vi.fn(), getSession: vi.fn() },
  })),
}));

// ─── Mock: logger ─────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Import service (after mocks are set up) ─────────────────────────────────

import { NotificationService } from "@/modules/notification/service";

// ─── Setup ────────────────────────────────────────────────────────────────────

let service: NotificationService;

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  service = new NotificationService();

  // Default: resolveLocale returns 'th' (guest user)
  mockSupabaseFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  });
});

// ─── Test 1: notifyIdeaReceived → notification row created (sent) ─────────────

describe("Integration: notifyIdeaReceived", () => {
  it("creates notification row with type=idea_received and status=sent", async () => {
    mockEmailSend.mockResolvedValue({ success: true });

    await service.notifyIdeaReceived({
      id: "idea-intg-001",
      title: "Integration Test Idea",
      referenceNumber: "LP-2024-INT001",
      submitterEmail: "submitter@test.com",
      submitterName: "Test Submitter",
      submitterUserId: null,
    });

    expect(notificationStore).toHaveLength(1);
    const row = notificationStore[0]!;
    expect(row.type).toBe("idea_received");
    expect(row.status).toBe("sent");
    expect(row.recipientEmail).toBe("submitter@test.com");
    expect(row.ideaId).toBe("idea-intg-001");
    expect(row.errorMessage).toBeNull();
    expect(row.sentAt).not.toBeNull();
  });
});

// ─── Test 2: notifyIdeaRejected → notification row created (sent) ─────────────

describe("Integration: notifyIdeaRejected", () => {
  it("creates notification row with type=idea_rejected, status=sent, error=null", async () => {
    mockEmailSend.mockResolvedValue({ success: true });

    await service.notifyIdeaRejected({
      id: "idea-intg-002",
      title: "Rejected Idea",
      submitterEmail: "rejected@test.com",
      submitterName: "Reject User",
      submitterUserId: null,
      reason: "Not aligned with strategy",
    });

    expect(notificationStore).toHaveLength(1);
    const row = notificationStore[0]!;
    expect(row.type).toBe("idea_rejected");
    expect(row.status).toBe("sent");
    expect(row.errorMessage).toBeNull();
    expect(row.recipientEmail).toBe("rejected@test.com");
  });
});

// ─── Test 3: sender fails → status=failed, error_message has value ────────────

describe("Integration: sender failure", () => {
  it("notification row updated with status=failed and error_message", async () => {
    mockEmailSend.mockResolvedValue({ success: false, error: "SMTP connection refused" });

    await service.notifyIdeaReceived({
      id: "idea-intg-003",
      title: "Fail Test Idea",
      referenceNumber: "LP-2024-INT003",
      submitterEmail: "fail@test.com",
      submitterName: "Fail User",
      submitterUserId: null,
    });

    expect(notificationStore).toHaveLength(1);
    const row = notificationStore[0]!;
    expect(row.status).toBe("failed");
    expect(row.errorMessage).toBe("SMTP connection refused");
    expect(row.sentAt).toBeNull();
  });
});

// ─── Test 4: notifyBDNewIdea with 3 BD reviewers → 3 rows created ────────────

describe("Integration: notifyBDNewIdea", () => {
  it("3 BD reviewers → 3 notification rows created with status=sent", async () => {
    // Mock getBDReviewers
    const reviewers = [
      { email: "bd1@test.com", full_name: "BD Reviewer 1", locale: "th" },
      { email: "bd2@test.com", full_name: "BD Reviewer 2", locale: "en" },
      { email: "bd3@test.com", full_name: "BD Reviewer 3", locale: "th" },
    ];

    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: reviewers, error: null }),
      }),
    });

    mockEmailSend.mockResolvedValue({ success: true });

    await service.notifyBDNewIdea({
      id: "idea-intg-004",
      title: "BD Test Idea",
      referenceNumber: "LP-2024-INT004",
      submitterName: "BD Submitter",
      submitterType: "employee",
    });

    expect(notificationStore).toHaveLength(3);

    // Verify all rows are BD notifications
    notificationStore.forEach((row) => {
      expect(row.type).toBe("bd_new_idea");
      expect(row.status).toBe("sent");
      expect(row.ideaId).toBe("idea-intg-004");
    });

    // Verify each reviewer got their own notification
    const recipientEmails = notificationStore.map((r) => r.recipientEmail);
    expect(recipientEmails).toContain("bd1@test.com");
    expect(recipientEmails).toContain("bd2@test.com");
    expect(recipientEmails).toContain("bd3@test.com");

    // Verify email was sent to each reviewer
    expect(mockEmailSend).toHaveBeenCalledTimes(3);
  });
});
