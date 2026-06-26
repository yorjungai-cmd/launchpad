/**
 * Email template: Stage Changed.
 * Sent to submitter when their idea moves to a new pipeline stage.
 *
 * Task 3.1
 */

import type { TemplateRenderResult } from "../schemas";
import { wrapInLayout } from "./base-layout";

export interface StageChangedData {
  title: string;
  fromStage: string;
  toStage: string;
}

/** Maps stage keys to human-readable labels */
const STAGE_LABELS: Record<string, Record<"th" | "en", string>> = {
  sandbox: { th: "Sandbox", en: "Sandbox" },
  validation_sprint: { th: "Validation Sprint", en: "Validation Sprint" },
  build_sprint: { th: "Build Sprint", en: "Build Sprint" },
  launch_and_test: { th: "Launch & Test", en: "Launch & Test" },
};

function getStageLabel(stage: string, locale: "th" | "en"): string {
  return STAGE_LABELS[stage]?.[locale] ?? stage;
}

const COPY = {
  th: {
    subject: (title: string, toStage: string) =>
      `[Launch PAD] สถานะเปลี่ยน — "${title}" ย้ายไป ${toStage}`,
    heading: "สถานะ idea ของคุณเปลี่ยนแล้ว",
    body: (data: StageChangedData, locale: "th" | "en") => `
      <p style="margin: 0 0 16px 0;">idea <strong>"${data.title}"</strong> ถูกเปลี่ยนสถานะแล้ว</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="padding: 8px 16px; background-color: #fef2f2; border-radius: 4px; font-size: 14px; color: #991b1b;">
            ${getStageLabel(data.fromStage, locale)}
          </td>
          <td style="padding: 8px 12px; font-size: 18px; color: #9ca3af;">→</td>
          <td style="padding: 8px 16px; background-color: #ecfdf5; border-radius: 4px; font-size: 14px; color: #065f46; font-weight: 600;">
            ${getStageLabel(data.toStage, locale)}
          </td>
        </tr>
      </table>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">ทีม BD กำลังดำเนินการตามขั้นตอนถัดไป คุณจะได้รับแจ้งเมื่อมีความคืบหน้า</p>
    `,
  },
  en: {
    subject: (title: string, toStage: string) =>
      `[Launch PAD] Stage changed — "${title}" moved to ${toStage}`,
    heading: "Your idea stage has changed",
    body: (data: StageChangedData, locale: "th" | "en") => `
      <p style="margin: 0 0 16px 0;">Your idea <strong>"${data.title}"</strong> has been moved to a new stage.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
        <tr>
          <td style="padding: 8px 16px; background-color: #fef2f2; border-radius: 4px; font-size: 14px; color: #991b1b;">
            ${getStageLabel(data.fromStage, locale)}
          </td>
          <td style="padding: 8px 12px; font-size: 18px; color: #9ca3af;">→</td>
          <td style="padding: 8px 16px; background-color: #ecfdf5; border-radius: 4px; font-size: 14px; color: #065f46; font-weight: 600;">
            ${getStageLabel(data.toStage, locale)}
          </td>
        </tr>
      </table>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">The BD team is proceeding with the next steps. You'll be notified when there's further progress.</p>
    `,
  },
} as const;

export function renderStageChanged(
  data: StageChangedData,
  locale: "th" | "en"
): TemplateRenderResult {
  const copy = COPY[locale];
  const content = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #111827;">${copy.heading}</h2>
    ${copy.body(data, locale)}
  `;
  return {
    subject: copy.subject(data.title, getStageLabel(data.toStage, locale)),
    html: wrapInLayout(content, locale),
  };
}
