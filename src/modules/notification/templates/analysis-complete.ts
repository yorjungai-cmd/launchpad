/**
 * Email template: Analysis Complete.
 * Sent to submitter when AI analysis finishes.
 *
 * Task 3.1
 */

import type { TemplateRenderResult } from "../schemas";
import { wrapInLayout } from "./base-layout";

export interface AnalysisCompleteData {
  title: string;
  stage: string;
  recommendedAction: string;
  draftLink: string;
}

const COPY = {
  th: {
    subject: (title: string) => `[Launch PAD] วิเคราะห์เสร็จแล้ว — "${title}"`,
    heading: "การวิเคราะห์ AI เสร็จสมบูรณ์",
    body: (data: AnalysisCompleteData) => `
      <p style="margin: 0 0 16px 0;">ระบบ AI ได้วิเคราะห์ idea <strong>"${data.title}"</strong> เรียบร้อยแล้ว</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Stage ที่แนะนำ</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${data.stage}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; font-size: 13px; color: #6b7280;">คำแนะนำ</td>
          <td style="padding: 12px 16px; font-weight: 500;">${data.recommendedAction}</td>
        </tr>
      </table>
      <p style="margin: 0 0 16px 0;">คุณสามารถดู AI Draft ฉบับเต็มได้ที่ลิงก์ด้านล่าง (อยู่ระหว่างรอ BD Review)</p>
      <p style="margin: 0;">
        <a href="${data.draftLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">ดู AI Draft</a>
      </p>
    `,
  },
  en: {
    subject: (title: string) => `[Launch PAD] Analysis complete — "${title}"`,
    heading: "AI Analysis Complete",
    body: (data: AnalysisCompleteData) => `
      <p style="margin: 0 0 16px 0;">The AI system has completed its analysis of your idea <strong>"${data.title}"</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">Recommended Stage</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${data.stage}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; background-color: #f9fafb; font-size: 13px; color: #6b7280;">Recommendation</td>
          <td style="padding: 12px 16px; font-weight: 500;">${data.recommendedAction}</td>
        </tr>
      </table>
      <p style="margin: 0 0 16px 0;">You can view the full AI Draft below (pending BD Review).</p>
      <p style="margin: 0;">
        <a href="${data.draftLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">View AI Draft</a>
      </p>
    `,
  },
} as const;

export function renderAnalysisComplete(
  data: AnalysisCompleteData,
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
