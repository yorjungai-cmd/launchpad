export interface PromptConfigJsonb {
  systemPrompt: string;
  sections: Record<string, Record<string, string>>;
}

export const DEFAULT_PROMPT_CONFIG: PromptConfigJsonb = {
  systemPrompt: `You are a business analyst assistant for AppliCAD, a Thai software company.
You generate professional, concise narrative sections for business documents based on structured idea analysis data.
ALWAYS write the narrative content in Thai (ภาษาไทย), regardless of the language of the idea input. Use professional Thai business writing. Product names, framework terms (e.g. Launch PAD, BMC, Go/No Go), and established technical terms may stay in English where that reads naturally.
Be factual, professional, and avoid hyperbole. Keep each section focused and actionable.
Format output as clean markdown — no excessive headers within a section.`,
  sections: {
    feasibility_report: {
      executive_summary:
        "เขียนบทสรุปผู้บริหาร 2-3 ย่อหน้า ครอบคลุมวัตถุประสงค์หลัก ศักยภาพตลาด และข้อเสนอแนะเชิงกลยุทธ์",
    },
    poc_proposal: {
      poc_objective:
        "อธิบายวัตถุประสงค์ POC อย่างชัดเจน ระบุสิ่งที่ต้องการพิสูจน์และเกณฑ์ความสำเร็จ",
      poc_scope: "กำหนดขอบเขต POC ให้ชัดเจน ระบุสิ่งที่รวมและไม่รวม และระยะเวลาที่คาดหวัง",
      poc_timeline: "สร้าง timeline POC แบบ phase-by-phase พร้อม milestone หลัก",
    },
    bmc: {
      bmc_canvas:
        "สร้าง Business Model Canvas 9 ช่อง: Customer Segments, Value Propositions, Channels, Customer Relationships, Revenue Streams, Key Resources, Key Activities, Key Partnerships, Cost Structure",
    },
    launch_pad_plan: {
      validation_sprint:
        "ออกแบบ validation sprint 2-4 สัปดาห์ ระบุ hypothesis ที่ต้องทดสอบและ experiments",
      success_metrics: "กำหนด OKR และตัวชี้วัดความสำเร็จที่วัดได้ชัดเจน",
    },
    project_requirements: {
      functional_requirements:
        "ระบุ functional requirements แบบ user story format ครอบคลุม use cases หลัก",
      non_functional_requirements:
        "ระบุ non-functional requirements ด้าน performance, security, scalability",
    },
    resource_plan: {
      resource_requirements:
        "ระบุทรัพยากรที่ต้องการ ทั้ง human resource, infrastructure, และ tools",
      budget_estimate: "ประมาณการงบประมาณแบ่งตาม category พร้อม assumption ที่ชัดเจน",
    },
    action_plan: {
      milestones: "กำหนด milestones หลัก 3-6 จุด พร้อม deliverable และ timeline",
      tasks_owners: "แบ่งงานระดับ task พร้อมผู้รับผิดชอบและ deadline",
    },
    gtm_summary: {
      target_market: "วิเคราะห์ตลาดเป้าหมาย ระบุ ICP (Ideal Customer Profile) และ market size",
      go_to_market_strategy: "กำหนดกลยุทธ์ GTM ครอบคลุม channel, messaging, และ pricing",
      launch_metrics: "กำหนด launch metrics และ KPI ที่จะวัด 30/60/90 วันหลัง launch",
    },
    executive_presentation: {
      executive_overview: "สรุปภาพรวมสำหรับผู้บริหาร กระชับ ตรงประเด็น เน้น business value",
    },
    stage_gate_guide: {},
    project_proposal: {
      executive_summary:
        "เขียนบทสรุปผู้บริหาร 2-3 ย่อหน้า ครอบคลุมวัตถุประสงค์หลัก ศักยภาพตลาด และข้อเสนอแนะเชิงกลยุทธ์",
      problem_opportunity:
        "วิเคราะห์ปัญหาและโอกาสทางธุรกิจที่ชัดเจน ระบุ pain points และ market gap",
      proposed_solution:
        "อธิบายแนวทางแก้ไขที่เสนอ ระบุ unique value proposition และความแตกต่างจากทางเลือกอื่น",
      launch_pad_plan: "สรุปแผน Launch PAD: validation sprint, milestones, และตัวชี้วัดความสำเร็จ",
      resource_investment: "สรุปทรัพยากรและการลงทุนที่ต้องการ: บุคลากร งบประมาณ และ timeline",
      expected_outcomes: "ระบุผลลัพธ์ที่คาดหวัง ROI และตัวชี้วัดความสำเร็จหลังดำเนินการ",
      next_steps: "กำหนดขั้นตอนถัดไปที่ชัดเจน: ใคร ทำอะไร ภายในเมื่อไหร่",
    },
  },
};

export const SAMPLE_TEST_IDEA = {
  title: "ระบบ AI ช่วยวิเคราะห์ใบเสนอราคา",
  summary:
    "พัฒนาระบบ AI ที่ช่วย BD team วิเคราะห์ใบเสนอราคาจากลูกค้า เพื่อประเมินความเป็นไปได้และจัดลำดับความสำคัญของโอกาสทางธุรกิจ ลดเวลาวิเคราะห์จาก 2 ชั่วโมงเหลือ 15 นาทีต่อใบ",
  stage: "Sandbox" as const,
  ideaType: "Internal Tool",
  recommendedAction: "Proceed to POC",
  recommendedActionReasoning: "ความต้องการชัดเจน มีข้อมูลเพียงพอสำหรับทำ POC",
  feasibilityScores: {
    strategicFit: 4,
    marketPotential: 3,
    technicalFeasibility: 4,
    resourceRequirement: 3,
    businessImpact: 4,
  },
  feasibilityReasons: {
    strategicFit: "สอดคล้องกับทิศทาง AI-first ของ AppliCAD",
    marketPotential: "ตลาดภายในองค์กร จำกัดแต่ impact สูง",
    technicalFeasibility: "มี LLM API พร้อมใช้ ทีม dev มีประสบการณ์",
    resourceRequirement: "ต้องการ 1 dev + 1 BD 2 เดือน",
    businessImpact: "ประหยัดเวลา BD team ~8 ชั่วโมง/สัปดาห์",
  },
  portfolioMatches: [
    {
      product: "AppliCAD ERP",
      relevance: "High",
      reasoning: "Integration กับข้อมูล customer ที่มีอยู่",
    },
  ],
  referenceNumber: "TEST-001",
  submitterName: "Sample User",
} as const;

/** Document types in Proposal workflow order — used by UI sidebar */
export const DOCUMENT_TYPES_IN_WORKFLOW_ORDER = [
  { type: "feasibility_report", label: "รายงานความเป็นไปได้" },
  { type: "poc_proposal", label: "ข้อเสนอ POC" },
  { type: "bmc", label: "Business Model Canvas" },
  { type: "launch_pad_plan", label: "แผน Launch PAD" },
  { type: "project_requirements", label: "ข้อกำหนดโครงการ" },
  { type: "resource_plan", label: "แผนทรัพยากร" },
  { type: "action_plan", label: "แผนปฏิบัติการ" },
  { type: "gtm_summary", label: "สรุปแผน Go-to-Market" },
  { type: "executive_presentation", label: "สรุปสำหรับผู้บริหาร" },
  { type: "stage_gate_guide", label: "คู่มือประเมิน Stage Gate" },
  { type: "project_proposal", label: "ข้อเสนอโครงการ (สมบูรณ์)" },
] as const;

export type WorkflowDocumentType = (typeof DOCUMENT_TYPES_IN_WORKFLOW_ORDER)[number]["type"];
