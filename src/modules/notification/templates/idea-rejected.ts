/**
 * Email template: Idea Rejected.
 * Sent to submitter when their idea is rejected by BD, with reason.
 *
 * Task 3.1
 */

import type { TemplateRenderResult } from "../schemas";
import { wrapInLayout } from "./base-layout";

export interface IdeaRejectedData {
  title: string;
  reason: string;
}

const COPY = {
  th: {
    subject: (title: string) => `[Launch PAD] ผลการพิจารณา — "${title}"`,
    heading: "ผลการพิจารณา idea ของคุณ",
    body: (data: IdeaRejectedData) => `
      <p style="margin: 0 0 16px 0;">ขอแจ้งให้ทราบว่า idea <strong>"${data.title}"</strong> ไม่ผ่านการพิจารณาในครั้งนี้</p>
      <div style="margin: 0 0 24px 0; padding: 16px; background-color: #fef2f2; border-radius: 6px; border-left: 4px solid #ef4444;">
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #991b1b; font-weight: 600;">เหตุผล:</p>
        <p style="margin: 0; color: #7f1d1d;">${data.reason}</p>
      </div>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">หากมีข้อสงสัยเพิ่มเติม กรุณาติดต่อทีม BD โดยตรง คุณสามารถส่ง idea ใหม่ได้ทุกเมื่อ</p>
    `,
  },
  en: {
    subject: (title: string) => `[Launch PAD] Review decision — "${title}"`,
    heading: "Review decision for your idea",
    body: (data: IdeaRejectedData) => `
      <p style="margin: 0 0 16px 0;">We'd like to inform you that your idea <strong>"${data.title}"</strong> was not approved at this time.</p>
      <div style="margin: 0 0 24px 0; padding: 16px; background-color: #fef2f2; border-radius: 6px; border-left: 4px solid #ef4444;">
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #991b1b; font-weight: 600;">Reason:</p>
        <p style="margin: 0; color: #7f1d1d;">${data.reason}</p>
      </div>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">If you have questions, please contact the BD team directly. You're welcome to submit a new idea at any time.</p>
    `,
  },
} as const;

export function renderIdeaRejected(
  data: IdeaRejectedData,
  locale: "th" | "en"
): TemplateRenderResult {
  const copy = COPY[locale];
  const content = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #111827;">${copy.heading}</h2>
    ${copy.body(data)}
  `;
  return {
    subject: copy.subject(data.title),
    html: wrapInLayout(content, locale),
  };
}
