/**
 * AppliCAD Product Portfolio Context
 *
 * Descriptions of the 4 AppliCAD products used in the AI analysis system prompt.
 * Claude uses these descriptions to determine portfolio_matches for each idea.
 *
 * Ref: design/components.md — PromptBuilder (portfolio context)
 *
 * Task 2.2
 */

export interface ProductDescription {
  name: string;
  fullName: string;
  category: string;
  description: string;
  targetUsers: string;
  keyFeatures: string[];
}

export const APPLCAD_PRODUCTS: Record<string, ProductDescription> = {
  PTCAD: {
    name: "PTCAD",
    fullName: "PTCAD (Production CAD Software)",
    category: "CAD / Engineering Software",
    description:
      "ซอฟต์แวร์ออกแบบ CAD สำหรับงานอุตสาหกรรมการผลิต (production manufacturing) ช่วยวิศวกรและนักออกแบบสร้าง 2D/3D model, ทำ BOM, และจัดการ drawing อย่างมืออาชีพ เหมาะกับโรงงาน SME ถึงขนาดกลางในภาคการผลิตของไทยและ ASEAN",
    targetUsers: "วิศวกรออกแบบ, ทีม R&D, โรงงานการผลิต, ผู้รับเหมาในอุตสาหกรรม",
    keyFeatures: [
      "2D/3D CAD modeling",
      "BOM management",
      "Technical drawing",
      "Manufacturing process integration",
      "Multi-language support (TH/EN)",
    ],
  },

  "APP.AI": {
    name: "APP.AI",
    fullName: "APP.AI (AI-Powered Applications Platform)",
    category: "AI Platform / No-Code / Low-Code",
    description:
      "แพลตฟอร์ม AI สำหรับสร้าง business application แบบ no-code/low-code ให้องค์กรสร้าง AI-powered workflow, chatbot, document processing, และ data pipeline โดยไม่ต้องมี developer เต็มรูปแบบ มุ่งเน้น SME และ enterprise ในไทยที่ต้องการ digital transformation",
    targetUsers: "Business users, ทีม IT องค์กร, SME ที่ต้องการ automation",
    keyFeatures: [
      "No-code AI workflow builder",
      "Document AI (OCR, extraction)",
      "Chatbot / conversational AI",
      "Data pipeline automation",
      "Integration with Thai business systems",
    ],
  },

  COBO: {
    name: "COBO",
    fullName: "COBO (ERP / Accounting System)",
    category: "ERP / Accounting / Business Management",
    description:
      "ระบบ ERP และบัญชีสำหรับธุรกิจไทย ครอบคลุม accounting, inventory, procurement, HR/payroll, และ financial reporting รองรับมาตรฐานบัญชีไทย (TAS) และภาษีมูลค่าเพิ่ม (VAT) เหมาะกับ SME ไทยที่ต้องการระบบบัญชีครบวงจรราคาที่เข้าถึงได้",
    targetUsers: "นักบัญชี, ทีม Finance, ผู้บริหาร SME, ธุรกิจการค้าและบริการ",
    keyFeatures: [
      "Thai accounting standards (TAS) compliance",
      "VAT & tax management",
      "Inventory management",
      "HR & payroll",
      "Financial reporting & dashboard",
      "Multi-branch support",
    ],
  },

  CRM: {
    name: "CRM",
    fullName: "CRM (Customer Relationship Management)",
    category: "CRM / Sales / Customer Success",
    description:
      "ระบบ CRM สำหรับจัดการลูกค้า, pipeline การขาย, และ customer success ช่วยทีมขายและ BD ติดตาม lead, จัดการ deal, บันทึก interaction history, และวิเคราะห์ performance การขาย รองรับทั้ง B2B และ B2C สำหรับธุรกิจไทย",
    targetUsers: "ทีมขาย, Account Manager, BD Team, Customer Success",
    keyFeatures: [
      "Lead & opportunity management",
      "Sales pipeline visualization",
      "Customer interaction history",
      "Sales performance analytics",
      "Email & task integration",
      "Mobile-friendly interface",
    ],
  },
} as const;

/**
 * Formats product descriptions as a structured text block for injection into system prompt.
 */
export function formatPortfolioContext(): string {
  const products = Object.values(APPLCAD_PRODUCTS);
  return products
    .map(
      (p) =>
        `**${p.fullName}**\n` +
        `Category: ${p.category}\n` +
        `Description: ${p.description}\n` +
        `Target Users: ${p.targetUsers}\n` +
        `Key Features: ${p.keyFeatures.join(", ")}`
    )
    .join("\n\n");
}
