/**
 * Email template: BD New Idea notification.
 * Sent to all BD Reviewers when a new idea is submitted.
 *
 * Task 3.1
 */

import type { TemplateRenderResult } from "../schemas";
import { wrapInLayout } from "./base-layout";

export interface BDNewIdeaData {
  ideaTitle: string;
  submitterName: string;
  submitterType: string;
  referenceNumber: string;
}

/** Maps submitter type keys to human-readable labels */
const SUBMITTER_TYPE_LABELS: Record<string, Record<"th" | "en", string>> = {
  employee: { th: "พนักงาน", en: "Employee" },
  executive: { th: "ผู้บริหาร", en: "Executive" },
  partner: { th: "พาร์ทเนอร์", en: "Partner" },
  vendor: { th: "Vendor", en: "Vendor" },
};

function getSubmitterTypeLabel(type: string, locale: "th" | "en"): string {
  return SUBMITTER_TYPE_LABELS[type]?.[locale] ?? type;
}

const COPY = {
  th: {
    subject: (ref: string) => `[Launch PAD] 📥 idea ใหม่เข้าระบบ — ${ref}`,
    heading: "มี idea ใหม่รอ review",
    body: (data: BDNewIdeaData, locale: "th" | "en") => `
      <p style="margin: 0 0 16px 0;">มี idea ใหม่เข้ามาในระบบ Launch PAD พร้อมให้ review</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; width: 140px;">Reference</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-family: monospace;">${data.referenceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">ชื่อ Idea</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${data.ideaTitle}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">ผู้ส่ง</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">${data.submitterName || "ไม่ระบุชื่อ"}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; font-size: 13px; color: #6b7280;">ประเภทผู้ส่ง</td>
          <td style="padding: 12px 16px;">${getSubmitterTypeLabel(data.submitterType, locale)}</td>
        </tr>
      </table>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">ระบบ AI กำลังวิเคราะห์ — คุณจะได้รับแจ้งเมื่อ AI Draft พร้อม review</p>
    `,
  },
  en: {
    subject: (ref: string) => `[Launch PAD] 📥 New idea submitted — ${ref}`,
    heading: "New idea awaiting review",
    body: (data: BDNewIdeaData, locale: "th" | "en") => `
      <p style="margin: 0 0 16px 0;">A new idea has been submitted to the Launch PAD system and is ready for review.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; width: 140px;">Reference</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-family: monospace;">${data.referenceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Idea Title</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${data.ideaTitle}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Submitter</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">${data.submitterName || "Anonymous"}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; font-size: 13px; color: #6b7280;">Submitter Type</td>
          <td style="padding: 12px 16px;">${getSubmitterTypeLabel(data.submitterType, locale)}</td>
        </tr>
      </table>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">AI analysis is in progress — you'll be notified when the AI Draft is ready for review.</p>
    `,
  },
} as const;

export function renderBDNewIdea(data: BDNewIdeaData, locale: "th" | "en"): TemplateRenderResult {
  const copy = COPY[locale];
  const content = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #111827;">${copy.heading}</h2>
    ${copy.body(data, locale)}
  `;
  return {
    subject: copy.subject(data.referenceNumber),
    html: wrapInLayout(content, locale),
  };
}
