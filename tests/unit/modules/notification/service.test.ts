/**
 * Unit tests for NotificationService.
 *
 * Tests:
 *   1. notifyIdeaReceived — happy path (create + send + updateStatus SENT)
 *   2. notifyIdeaReceived — sender fails → updateStatus FAILED + no throw
 *   3. notifyBDNewIdea — query BD reviewers → send per reviewer → create log per reviewer
 *   4. notifyBDNewIdea — 0 BD reviewers → no throw, log warning
 *   5. resolveLocale — userId=null → 'th'
 *   6. resolveLocale — userId with locale='en' → 'en'
 *   7. fire-and-forget safety — repository.create throws → service does not throw
 *
 * Ref: tasks.md — Task 6.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock: repository ─────────────────────────────────────────────────────────

vi.mock("@/modules/notification/repository", () => ({
  notificationRepository: {
    create: vi.fn(),
    updateStatus: vi.fn(),
  },
  NotificationRepository: vi.fn(),
}));

// ─── Mock: sender ─────────────────────────────────────────────────────────────

vi.mock("@/modules/notification/sender", () => ({
  emailSender: {
    send: vi.fn(),
  },
}));

// ─── Mock: Supabase (admin client for resolveLocale/getBDReviewers) ───────────

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    from: mockFrom,
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

// ─── Typed mock references (imported after vi.mock hoisting) ─────────────────

import { notificationRepository } from "@/modules/notification/repository";
import { emailSender } from "@/modules/notification/sender";
import { NotificationService } from "@/modules/notification/service";
import { NotificationStatus } from "@/modules/notification/schemas";
import logger from "@/lib/logger";

const mockCreate = vi.mocked(notificationRepository.create);
const mockUpdateStatus = vi.mocked(notificationRepository.updateStatus);
const mockSend = vi.mocked(emailSender.send);
const mockWarn = vi.mocked(logger.warn);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIdeaReceivedInput() {
  return {
    id: "idea-uuid-001",
    title: "Test Idea",
    referenceNumber: "LP-2024-000001",
    submitterEmail: "submitter@example.com",
    submitterName: "Submitter Name",
    submitterUserId: null,
  };
}

function makeBDNewIdeaInput() {
  return {
    id: "idea-uuid-002",
    title: "BD Idea",
    referenceNumber: "LP-2024-000002",
    submitterName: "BD Submitter",
    submitterType: "employee",
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let service: NotificationService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new NotificationService();

  // Default: resolveLocale returns 'th' (null userId)
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

// ─── Test: notifyIdeaReceived — happy path ────────────────────────────────────

describe("NotificationService.notifyIdeaReceived()", () => {
  it("calls repository.create + sender.send + repository.updateStatus(SENT)", async () => {
    mockCreate.mockResolvedValue("notif-uuid-001");
    mockSend.mockResolvedValue({ success: true });
    mockUpdateStatus.mockResolvedValue(undefined);

    await service.notifyIdeaReceived(makeIdeaReceivedInput());

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "idea_received",
        recipientEmail: "submitter@example.com",
        ideaId: "idea-uuid-001",
      })
    );

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(
      "submitter@example.com",
      expect.any(String),
      expect.any(String)
    );

    expect(mockUpdateStatus).toHaveBeenCalledOnce();
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      "notif-uuid-001",
      NotificationStatus.SENT,
      undefined
    );
  });

  it("sender fails → updateStatus(FAILED) + does not throw", async () => {
    mockCreate.mockResolvedValue("notif-uuid-002");
    mockSend.mockResolvedValue({ success: false, error: "Connection timeout" });
    mockUpdateStatus.mockResolvedValue(undefined);

    // Should not throw
    await expect(service.notifyIdeaReceived(makeIdeaReceivedInput())).resolves.not.toThrow();

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      "notif-uuid-002",
      NotificationStatus.FAILED,
      "Connection timeout"
    );
  });
});

// ─── Test: notifyBDNewIdea ────────────────────────────────────────────────────

describe("NotificationService.notifyBDNewIdea()", () => {
  it("queries BD reviewers → send email per reviewer → create log per reviewer", async () => {
    // Mock getBDReviewers via Supabase query chain
    const reviewers = [
      { email: "bd1@example.com", full_name: "BD One", locale: "th" },
      { email: "bd2@example.com", full_name: "BD Two", locale: "en" },
      { email: "bd3@example.com", full_name: "BD Three", locale: "th" },
    ];

    // For getBDReviewers, the mock chain is: from('profiles').select(...).eq('role', 'bd_reviewer')
    // Returns directly from the eq call (not maybeSingle)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: reviewers, error: null }),
      }),
    } as any);

    mockCreate.mockResolvedValue("notif-uuid-bd");
    mockSend.mockResolvedValue({ success: true });
    mockUpdateStatus.mockResolvedValue(undefined);

    await service.notifyBDNewIdea(makeBDNewIdeaInput());

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockUpdateStatus).toHaveBeenCalledTimes(3);

    // Verify each reviewer gets their own email
    expect(mockSend).toHaveBeenCalledWith(
      "bd1@example.com",
      expect.any(String),
      expect.any(String)
    );
    expect(mockSend).toHaveBeenCalledWith(
      "bd2@example.com",
      expect.any(String),
      expect.any(String)
    );
    expect(mockSend).toHaveBeenCalledWith(
      "bd3@example.com",
      expect.any(String),
      expect.any(String)
    );
  });

  it("0 BD reviewers → does not throw, logs warning", async () => {
    // Mock: returns empty array from Supabase
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    } as any);

    await expect(service.notifyBDNewIdea(makeBDNewIdeaInput())).resolves.not.toThrow();

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ ideaId: "idea-uuid-002" }),
      expect.stringContaining("No BD reviewers")
    );
  });
});

// ─── Test: resolveLocale ──────────────────────────────────────────────────────

describe("NotificationService — resolveLocale (via notifyIdeaReceived)", () => {
  it('userId=null → locale resolves to "th"', async () => {
    mockCreate.mockResolvedValue("notif-uuid-locale");
    mockSend.mockResolvedValue({ success: true });
    mockUpdateStatus.mockResolvedValue(undefined);

    const input = { ...makeIdeaReceivedInput(), submitterUserId: null };
    await service.notifyIdeaReceived(input);

    // Verify create was called with locale 'th'
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ locale: "th" }));
  });

  it('userId with locale="en" → resolves to "en"', async () => {
    // Mock Supabase profile query to return locale='en'
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { locale: "en" }, error: null }),
        }),
      }),
    } as any);

    mockCreate.mockResolvedValue("notif-uuid-locale-en");
    mockSend.mockResolvedValue({ success: true });
    mockUpdateStatus.mockResolvedValue(undefined);

    const input = { ...makeIdeaReceivedInput(), submitterUserId: "user-uuid-001" };
    await service.notifyIdeaReceived(input);

    // Verify create was called with locale 'en'
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
  });
});

// ─── Test: fire-and-forget safety ─────────────────────────────────────────────

describe("NotificationService — fire-and-forget safety", () => {
  it("repository.create throws → service does not throw to caller", async () => {
    mockCreate.mockRejectedValue(new Error("DB connection lost"));

    await expect(service.notifyIdeaReceived(makeIdeaReceivedInput())).resolves.not.toThrow();

    // sender should not have been called since create failed
    expect(mockSend).not.toHaveBeenCalled();
  });
});
