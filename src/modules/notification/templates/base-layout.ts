/**
 * Base HTML email layout — AppliCAD Launch PAD branding.
 *
 * Inline CSS only (email-safe). Max-width 600px.
 * Includes: branded header, content slot, automated footer.
 *
 * Task 3.1
 */

export function wrapInLayout(content: string, locale: "th" | "en"): string {
  const footerText =
    locale === "th"
      ? "อีเมลนี้ส่งอัตโนมัติจากระบบ Launch PAD Portal — ไม่ต้องตอบกลับ"
      : "This email was sent automatically by Launch PAD Portal — please do not reply.";

  return `<!DOCTYPE html>
<html lang="${locale}" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Launch PAD</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1e40af; padding: 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.025em;">AppliCAD</span>
                    <span style="font-size: 20px; font-weight: 400; color: #93c5fd; margin-left: 8px;">Launch PAD</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px; font-size: 15px; line-height: 1.6; color: #1f2937;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e5e7eb; background-color: #f9fafb;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #6b7280;">
                ${footerText}
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} AppliCAD Co., Ltd. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
