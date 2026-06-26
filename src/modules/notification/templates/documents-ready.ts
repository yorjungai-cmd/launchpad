/**
 * Email template: Documents Ready.
 * Sent to submitter when all generated documents are ready for viewing.
 *
 * Task 3.1
 */

import type { TemplateRenderResult } from "../schemas";
import { wrapInLayout } from "./base-layout";

export interface DocumentsReadyData {
  title: string;
  documentsLink: string;
}

const COPY = {
  th: {
    subject: (title: string) => `[Launch PAD] เอกสารพร้อมดูแล้ว — "${title}"`,
    heading: "เอกสารของคุณพร้อมแล้ว",
    body: (data: DocumentsReadyData) => `
      <p style="margin: 0 0 16px 0;">เอกสาร Launch PAD สำหรับ idea <strong>"${data.title}"</strong> ถูกสร้างเรียบร้อยแล้ว</p>
      <p style="margin: 0 0 16px 0;">เอกสารที่พร้อมดูประกอบด้วย:</p>
      <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #374151;">
        <li style="margin-bottom: 6px;">Feasibility Report</li>
        <li style="margin-bottom: 6px;">Business Model Canvas</li>
        <li style="margin-bottom: 6px;">Launch PAD Plan</li>
        <li style="margin-bottom: 6px;">และเอกสารอื่น ๆ ตามขั้นตอน</li>
      </ul>
      <p style="margin: 0;">
        <a href="${data.documentsLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">ดูเอกสาร</a>
      </p>
    `,
  },
  en: {
    subject: (title: string) => `[Launch PAD] Documents ready — "${title}"`,
    heading: "Your documents are ready",
    body: (data: DocumentsReadyData) => `
      <p style="margin: 0 0 16px 0;">The Launch PAD documents for your idea <strong>"${data.title}"</strong> have been generated.</p>
      <p style="margin: 0 0 16px 0;">Available documents include:</p>
      <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #374151;">
        <li style="margin-bottom: 6px;">Feasibility Report</li>
        <li style="margin-bottom: 6px;">Business Model Canvas</li>
        <li style="margin-bottom: 6px;">Launch PAD Plan</li>
        <li style="margin-bottom: 6px;">And other stage-specific documents</li>
      </ul>
      <p style="margin: 0;">
        <a href="${data.documentsLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">View Documents</a>
      </p>
    `,
  },
} as const;

export function renderDocumentsReady(
  data: DocumentsReadyData,
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
