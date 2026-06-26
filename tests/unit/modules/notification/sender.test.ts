/**
 * Unit tests for EmailSender (sender.ts).
 *
 * Tests:
 *   1. send success → return { success: true }
 *   2. send failure → return { success: false, error: 'msg' } (no throw)
 *   3. RESEND_API_KEY not set → getResendClient throws internally,
 *      but sender.send catches and returns { success: false, error }
 *
 * Ref: tasks.md — Task 6.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock: Resend ─────────────────────────────────────────────────────────────

const mockEmailsSend = vi.fn();

vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = { send: mockEmailsSend };
    },
  };
});

// ─── Mock: logger ─────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("emailSender.send()", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache to get fresh resendClient state
    vi.resetModules();
    originalEnv = process.env["RESEND_API_KEY"];
    process.env["RESEND_API_KEY"] = "test-api-key";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["RESEND_API_KEY"] = originalEnv;
    } else {
      delete process.env["RESEND_API_KEY"];
    }
  });

  it("send success → returns { success: true }", async () => {
    mockEmailsSend.mockResolvedValue({ id: "email-id-001" });

    // Re-import after module reset
    const { emailSender } = await import("@/modules/notification/sender");

    const result = await emailSender.send(
      "recipient@example.com",
      "Test Subject",
      "<html><body>Hello</body></html>"
    );

    expect(result).toEqual({ success: true });
    expect(mockEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "recipient@example.com",
        subject: "Test Subject",
        html: "<html><body>Hello</body></html>",
      })
    );
  });

  it('send failure → returns { success: false, error: "msg" } (no throw)', async () => {
    mockEmailsSend.mockRejectedValue(new Error("Rate limit exceeded"));

    const { emailSender } = await import("@/modules/notification/sender");

    const result = await emailSender.send(
      "recipient@example.com",
      "Test Subject",
      "<html><body>Hello</body></html>"
    );

    expect(result).toEqual({ success: false, error: "Rate limit exceeded" });
  });

  it("RESEND_API_KEY not set → send returns { success: false, error } (no throw out)", async () => {
    delete process.env["RESEND_API_KEY"];

    const { emailSender } = await import("@/modules/notification/sender");

    const result = await emailSender.send(
      "recipient@example.com",
      "Test Subject",
      "<html><body>Hello</body></html>"
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("RESEND_API_KEY");
  });
});
