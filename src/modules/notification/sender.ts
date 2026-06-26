/**
 * EmailSender — Task 4.1
 *
 * Wrapper around Resend for sending transactional emails.
 * Fire-and-forget pattern: never throws — always returns a result object.
 *
 * Since the `resend` package is not yet installed, this uses `Resend` directly.
 * Install with: pnpm add resend
 *
 * Required env variables:
 * - RESEND_API_KEY: Resend API key
 * - RESEND_FROM_DOMAIN: sender domain (e.g., launchpad.applicad.com)
 */

import { Resend } from "resend";
import logger from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendResult {
  success: boolean;
  error?: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getFromAddress(): string {
  const domain = process.env["RESEND_FROM_DOMAIN"] ?? "launchpad.applicad.com";
  return `AppliCAD Launch PAD <noreply@${domain}>`;
}

// ─── EmailSender ──────────────────────────────────────────────────────────────

/**
 * Send an email via Resend.
 * Never throws — returns { success: true } or { success: false, error }.
 */
export async function send(to: string, subject: string, html: string): Promise<SendResult> {
  try {
    const client = getResendClient();

    await client.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
    });

    logger.info({ to, subject }, "Email sent successfully");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    logger.error({ to, subject, err: error }, "Email send failed");
    return { success: false, error: message };
  }
}

// ─── Singleton export (object form for consistency with design) ───────────────

export const emailSender = { send };
