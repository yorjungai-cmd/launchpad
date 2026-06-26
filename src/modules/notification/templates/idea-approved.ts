/**
 * Email template: Idea Approved.
 * Sent to submitter when their idea is approved by BD.
 *
 * Task 3.1
 */

import type { TemplateRenderResult } from "../schemas";
import { wrapInLayout } from "./base-layout";

export interface IdeaApprovedData {
  title: string;
  approvedLink: string;
}

const COPY = {
  th: {
    subject: (title: string) => `[Launch PAD] ✅ Idea ของคุณผ่านการอนุมัติ — "${title}"`,
    heading: "🎉 Idea ของคุณได้รับการอนุมัติแล้ว",
    body: (data: IdeaApprovedData) => `
      <p style="margin: 0 0 16px 0;">ยินดีด้วย! idea <strong>"${data.title}"</strong> ได้ผ่านการ review จากทีม BD และได้รับการอนุมัติเรียบร้อยแล้ว</p>
      <div style="margin: 0 0 24px 0; padding: 16px; background-color: #ecfdf5; border-radius: 6px; border-left: 4px solid #10b981;">
        <p style="margin: 0; color: #065f46; font-weight: 500;">เอกสารฉบับสมบูรณ์ (Approved Version) พร้อมใช้งานแล้ว</p>
      </div>
      <p style="margin: 0;">
        <a href="${data.approvedLink}" style="display: inline-block; padding: 12px 24px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">ดูเอกสารที่อนุมัติแล้ว</a>
      </p>
    `,
  },
  en: {
    subject: (title: string) => `[Launch PAD] ✅ Your idea has been approved — "${title}"`,
    heading: "🎉 Your idea has been approved",
    body: (data: IdeaApprovedData) => `
      <p style="margin: 0 0 16px 0;">Congratulations! Your idea <strong>"${data.title}"</strong> has been reviewed and approved by the BD team.</p>
      <div style="margin: 0 0 24px 0; padding: 16px; background-color: #ecfdf5; border-radius: 6px; border-left: 4px solid #10b981;">
        <p style="margin: 0; color: #065f46; font-weight: 500;">The Approved Version of your documents is now available.</p>
      </div>
      <p style="margin: 0;">
        <a href="${data.approvedLink}" style="display: inline-block; padding: 12px 24px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">View Approved Documents</a>
      </p>
    `,
  },
} as const;

export function renderIdeaApproved(
  data: IdeaApprovedData,
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
