/**
 * Email template: Idea Received confirmation.
 * Sent to submitter after successful idea submission.
 *
 * Task 3.1
 */

import type { TemplateRenderResult } from "../schemas";
import { wrapInLayout } from "./base-layout";

export interface IdeaReceivedData {
  title: string;
  referenceNumber: string;
  trackingLink: string;
}

const COPY = {
  th: {
    subject: (ref: string) => `[Launch PAD] รับ idea ของคุณแล้ว — ${ref}`,
    heading: "เราได้รับ idea ของคุณแล้ว",
    body: (data: IdeaReceivedData) => `
      <p style="margin: 0 0 16px 0;">idea <strong>"${data.title}"</strong> ถูกรับเข้าระบบเรียบร้อยแล้ว</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Reference Number:</td>
          <td style="padding: 4px 0 4px 12px; font-weight: 600;">${data.referenceNumber}</td>
        </tr>
      </table>
      <p style="margin: 0 0 16px 0;">ระบบ AI จะเริ่มวิเคราะห์ idea ของคุณ และจะแจ้งผลเมื่อเสร็จสิ้น</p>
      <p style="margin: 0;">
        <a href="${data.trackingLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">ติดตามสถานะ</a>
      </p>
    `,
  },
  en: {
    subject: (ref: string) => `[Launch PAD] Your idea has been received — ${ref}`,
    heading: "We received your idea",
    body: (data: IdeaReceivedData) => `
      <p style="margin: 0 0 16px 0;">Your idea <strong>"${data.title}"</strong> has been successfully submitted to the system.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Reference Number:</td>
          <td style="padding: 4px 0 4px 12px; font-weight: 600;">${data.referenceNumber}</td>
        </tr>
      </table>
      <p style="margin: 0 0 16px 0;">Our AI system will begin analyzing your idea and we'll notify you when the results are ready.</p>
      <p style="margin: 0;">
        <a href="${data.trackingLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">Track Status</a>
      </p>
    `,
  },
} as const;

export function renderIdeaReceived(
  data: IdeaReceivedData,
  locale: "th" | "en"
): TemplateRenderResult {
  const copy = COPY[locale];
  const content = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #111827;">${copy.heading}</h2>
    ${copy.body(data)}
  `;
  return {
    subject: copy.subject(data.referenceNumber),
    html: wrapInLayout(content, locale),
  };
}
