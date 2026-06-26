/**
 * Stage Gate Metrics — adaptive metric/threshold config per idea type.
 *
 * Provides Go/Conditional Go/No Go criteria for each of the 4 gates,
 * tailored to the 6 idea types in the Launch PAD 2.0 framework.
 *
 * Ref: design/components.md — Component 3: DocumentTemplateRegistry
 *      requirements.md — US-13.2
 * Task 3.2
 */

import type { IdeaTypeDisplay } from "../types";

export interface GateCriteria {
  gate: "Gate 1" | "Gate 2" | "Gate 3" | "Gate 4";
  label: string; // e.g. "Sandbox → Validation Sprint"
  keyHypotheses: string[];
  minimumEvidence: string[];
  goCriteria: string[];
  conditionalGoCriteria: string[];
  noGoCriteria: string[];
}

export interface StageGateMetrics {
  ideaType: IdeaTypeDisplay;
  gates: GateCriteria[];
}

// ─── Gate labels (same for all idea types) ────────────────────────────────────

const GATE_LABELS: Record<GateCriteria["gate"], string> = {
  "Gate 1": "Sandbox → Validation Sprint",
  "Gate 2": "Validation Sprint → Build Sprint",
  "Gate 3": "Build Sprint → Launch & Test",
  "Gate 4": "Launch & Test → Scale / Exit",
};

// ─── SaaS ────────────────────────────────────────────────────────────────────

const SAAS_GATES: GateCriteria[] = [
  {
    gate: "Gate 1",
    label: GATE_LABELS["Gate 1"],
    keyHypotheses: [
      "Target customer segment is identifiable",
      "Problem is real and recurring",
      "Subscription model viable",
    ],
    minimumEvidence: [
      "5+ customer interviews",
      "Problem statement validated",
      "Competitor landscape mapped",
    ],
    goCriteria: [
      "Clear ICP defined",
      "≥3 customers express willingness to pay",
      "No blocking technical risk",
    ],
    conditionalGoCriteria: [
      "Partial customer validation (2–3)",
      "Technical unknowns identified with mitigation plan",
    ],
    noGoCriteria: [
      "No paying customer interest",
      "Market too small (<THB 10M TAM)",
      "Regulatory blocker unresolved",
    ],
  },
  {
    gate: "Gate 2",
    label: GATE_LABELS["Gate 2"],
    keyHypotheses: [
      "MVP feature set is sufficient",
      "Monetization model tested",
      "CAC/LTV ratio positive",
    ],
    minimumEvidence: [
      "MVP prototype tested",
      "≥10 beta users",
      "Revenue model validated with at least 1 paying user",
    ],
    goCriteria: ["Retention >40% (week 2)", "MRR > 0", "NPS ≥ 30"],
    conditionalGoCriteria: ["Retention 20–40%", "Revenue pipeline exists", "NPS 0–29"],
    noGoCriteria: [
      "0 paying users after MVP",
      "Retention <20%",
      "Core value prop not demonstrated",
    ],
  },
  {
    gate: "Gate 3",
    label: GATE_LABELS["Gate 3"],
    keyHypotheses: [
      "Product-market fit achieved",
      "Scalable infrastructure ready",
      "Sales motion repeatable",
    ],
    minimumEvidence: [
      "MRR growth ≥10%/month",
      "≥3 referenceable customers",
      "Support process documented",
    ],
    goCriteria: ["MRR ≥ THB 100K", "Churn <5%/month", "Sales cycle documented"],
    conditionalGoCriteria: ["MRR THB 30K–100K", "Churn 5–10%", "Manual sales process"],
    noGoCriteria: ["MRR flat", "Churn >10%", "No repeatable sales motion"],
  },
  {
    gate: "Gate 4",
    label: GATE_LABELS["Gate 4"],
    keyHypotheses: ["Unit economics positive", "Market expansion feasible", "Team can scale"],
    minimumEvidence: [
      "12 months revenue data",
      "CAC payback < 12 months",
      "Expansion roadmap defined",
    ],
    goCriteria: ["LTV/CAC > 3", "NPS ≥ 50", "Expansion market identified"],
    conditionalGoCriteria: ["LTV/CAC 1.5–3", "NPS 30–49", "Expansion plan at concept stage"],
    noGoCriteria: ["LTV/CAC < 1.5", "NPS < 30", "No path to profitability"],
  },
];

// ─── SI (System Integration) ─────────────────────────────────────────────────

const SI_GATES: GateCriteria[] = [
  {
    gate: "Gate 1",
    label: GATE_LABELS["Gate 1"],
    keyHypotheses: [
      "Client need is concrete",
      "Solution technically feasible",
      "AppliCAD has delivery capability",
    ],
    minimumEvidence: [
      "Client brief / RFI received",
      "High-level solution design",
      "Capability assessment done",
    ],
    goCriteria: ["Client confirms budget", "No blocking tech dependency", "Margin > 25% estimated"],
    conditionalGoCriteria: [
      "Budget TBC but sponsor engaged",
      "Tech risk identified with workaround",
    ],
    noGoCriteria: [
      "No client budget",
      "Delivery capability gap > 6 months to fill",
      "Margin < 10%",
    ],
  },
  {
    gate: "Gate 2",
    label: GATE_LABELS["Gate 2"],
    keyHypotheses: [
      "Proof-of-concept demonstrates value",
      "Project scope locked",
      "Contract terms agreed",
    ],
    minimumEvidence: [
      "POC accepted by client",
      "Signed contract or LOI",
      "Implementation plan approved",
    ],
    goCriteria: ["Contract signed", "Resources allocated", "Timeline agreed"],
    conditionalGoCriteria: ["LOI signed, contract in negotiation", "Resources partially allocated"],
    noGoCriteria: ["Client rejects POC", "Contract terms unacceptable", "Resource unavailable"],
  },
  {
    gate: "Gate 3",
    label: GATE_LABELS["Gate 3"],
    keyHypotheses: [
      "Delivery on track",
      "Client satisfaction maintained",
      "Change requests managed",
    ],
    minimumEvidence: [
      "≥70% deliverables completed",
      "Client sign-off on milestones",
      "Budget variance < 10%",
    ],
    goCriteria: ["UAT passed", "Client satisfaction score ≥ 4/5", "On-time and in-budget"],
    conditionalGoCriteria: ["UAT in progress", "Minor scope changes", "Budget variance 10–20%"],
    noGoCriteria: ["UAT failed", "Client satisfaction < 3/5", "Budget overrun > 20%"],
  },
  {
    gate: "Gate 4",
    label: GATE_LABELS["Gate 4"],
    keyHypotheses: [
      "Project delivered and accepted",
      "Support model in place",
      "Referenceable for next deal",
    ],
    minimumEvidence: ["Final acceptance signed", "Warranty/support contract", "Case study drafted"],
    goCriteria: ["Full payment received", "NPS ≥ 4/5", "Client willing to be reference"],
    conditionalGoCriteria: ["Payment > 80% received", "NPS 3/5", "Client open to follow-on"],
    noGoCriteria: ["Disputed payment", "NPS < 3/5", "Legal dispute"],
  },
];

// ─── Platform ────────────────────────────────────────────────────────────────

const PLATFORM_GATES: GateCriteria[] = [
  {
    gate: "Gate 1",
    label: GATE_LABELS["Gate 1"],
    keyHypotheses: [
      "Two-sided market exists",
      "Critical mass achievable",
      "Platform economics favorable",
    ],
    minimumEvidence: [
      "Both sides of market interviewed",
      "Chicken-and-egg strategy defined",
      "Network effect model mapped",
    ],
    goCriteria: [
      "Both sides show demand",
      "Seeding strategy validated",
      "Initial supply committed",
    ],
    conditionalGoCriteria: ["One side validated, other in progress", "Seeding strategy drafted"],
    noGoCriteria: [
      "No demand on either side",
      "Platform economics negative",
      "Existing dominant player with lock-in",
    ],
  },
  {
    gate: "Gate 2",
    label: GATE_LABELS["Gate 2"],
    keyHypotheses: [
      "Minimum viable platform functional",
      "First transactions facilitated",
      "Take rate acceptable to both sides",
    ],
    minimumEvidence: ["MVP live", "≥10 transactions completed", "Take rate set and tested"],
    goCriteria: ["Transaction growth 20%+/month", "Both sides retained", "Take rate sustainable"],
    conditionalGoCriteria: ["Transactions growing but slowly", "One side retained"],
    noGoCriteria: ["No repeat transactions", "Either side churning", "Take rate rejected"],
  },
  {
    gate: "Gate 3",
    label: GATE_LABELS["Gate 3"],
    keyHypotheses: [
      "Network effects demonstrated",
      "Monetization scaling",
      "Defensible moat emerging",
    ],
    minimumEvidence: [
      "Organic growth > paid acquisition",
      "Revenue growing",
      "Key integrations live",
    ],
    goCriteria: [
      "GMV growing 30%+/month",
      "Contribution margin positive",
      "Moat visible (data/network)",
    ],
    conditionalGoCriteria: ["GMV growing 10–30%", "Unit economics improving"],
    noGoCriteria: ["GMV flat", "Burn rate unsustainable", "No network effects observed"],
  },
  {
    gate: "Gate 4",
    label: GATE_LABELS["Gate 4"],
    keyHypotheses: [
      "Platform dominance or sustainable niche",
      "Profitability path clear",
      "Ecosystem expanding",
    ],
    minimumEvidence: [
      "Market share ≥20% in target segment",
      "Path to profitability < 18 months",
      "Partner ecosystem growing",
    ],
    goCriteria: [
      "Market leader in niche",
      "Profitable or funded to profitability",
      "API/ecosystem open",
    ],
    conditionalGoCriteria: ["Top 3 in niche", "Path to profitability 18–24 months"],
    noGoCriteria: ["Market share < 5%", "No path to profitability", "Ecosystem stagnant"],
  },
];

// ─── Hardware ────────────────────────────────────────────────────────────────

const HARDWARE_GATES: GateCriteria[] = [
  {
    gate: "Gate 1",
    label: GATE_LABELS["Gate 1"],
    keyHypotheses: ["Physical problem solvable", "Manufacturing feasible", "BOM cost acceptable"],
    minimumEvidence: [
      "Technical spec drafted",
      "Initial BOM estimate",
      "≥5 target user interviews",
    ],
    goCriteria: [
      "Technical feasibility confirmed",
      "BOM < 40% of target price",
      "Regulatory path identified",
    ],
    conditionalGoCriteria: ["Technical unknowns with mitigation", "BOM 40–60% of target price"],
    noGoCriteria: [
      "Technical blocker unresolved",
      "BOM > 60% of target price",
      "Regulatory barrier >12 months",
    ],
  },
  {
    gate: "Gate 2",
    label: GATE_LABELS["Gate 2"],
    keyHypotheses: [
      "Prototype proves core function",
      "Supply chain identified",
      "Early adopter interest validated",
    ],
    minimumEvidence: ["Working prototype", "Supply chain shortlisted", "≥3 pre-orders or LOIs"],
    goCriteria: ["Prototype performance meets spec", "Supplier confirmed", "Pre-orders ≥ MOQ"],
    conditionalGoCriteria: [
      "Prototype partial",
      "Backup supplier identified",
      "LOIs but no pre-orders",
    ],
    noGoCriteria: ["Prototype fails key spec", "No viable supplier", "No pre-order interest"],
  },
  {
    gate: "Gate 3",
    label: GATE_LABELS["Gate 3"],
    keyHypotheses: [
      "Mass production quality maintained",
      "Logistics scalable",
      "Warranty model viable",
    ],
    minimumEvidence: [
      "Pilot production run ≥100 units",
      "Quality pass rate ≥95%",
      "Distribution channel active",
    ],
    goCriteria: ["Production ramp on plan", "Quality ≥95%", "Channel partnerships signed"],
    conditionalGoCriteria: [
      "Production delayed <3 months",
      "Quality 90–95%",
      "Channel in negotiation",
    ],
    noGoCriteria: ["Production fails", "Quality <90%", "No distribution channel"],
  },
  {
    gate: "Gate 4",
    label: GATE_LABELS["Gate 4"],
    keyHypotheses: [
      "Market penetration sustainable",
      "After-sales profitable",
      "Next gen roadmap viable",
    ],
    minimumEvidence: ["Sales > forecast by 10%", "NPS ≥ 40", "Roadmap approved"],
    goCriteria: ["Sales on target", "Warranty cost < 5% revenue", "V2 development funded"],
    conditionalGoCriteria: ["Sales 80% of target", "Warranty cost 5–10%"],
    noGoCriteria: ["Sales < 50% of target", "Warranty cost > 10%", "No next-gen roadmap"],
  },
];

// ─── Internal Tool ────────────────────────────────────────────────────────────

const INTERNAL_TOOL_GATES: GateCriteria[] = [
  {
    gate: "Gate 1",
    label: GATE_LABELS["Gate 1"],
    keyHypotheses: [
      "Problem causes measurable inefficiency",
      "Internal champion identified",
      "Build vs buy evaluated",
    ],
    minimumEvidence: ["Process pain quantified", "Sponsor sign-off", "Build vs buy decision"],
    goCriteria: ["Efficiency gain > 20% projected", "Budget approved", "Build decision justified"],
    conditionalGoCriteria: [
      "Gain estimated but unquantified",
      "Budget TBC",
      "Buy option still open",
    ],
    noGoCriteria: ["Gain < 5%", "No sponsor", "Existing tool covers 80% of need"],
  },
  {
    gate: "Gate 2",
    label: GATE_LABELS["Gate 2"],
    keyHypotheses: ["MVP solves core pain", "Users willing to adopt", "IT/security approved"],
    minimumEvidence: ["MVP tested by ≥5 users", "IT approval", "Adoption plan drafted"],
    goCriteria: ["≥80% of test users adopt", "No security issues", "Rollout plan approved"],
    conditionalGoCriteria: ["60–80% adopt", "Minor security items", "Rollout plan in review"],
    noGoCriteria: ["<60% adopt", "Security blocker", "Rollout plan rejected"],
  },
  {
    gate: "Gate 3",
    label: GATE_LABELS["Gate 3"],
    keyHypotheses: [
      "Full rollout successful",
      "Efficiency targets met",
      "Support model sustainable",
    ],
    minimumEvidence: [
      "100% target team onboarded",
      "KPI measured at 3 months",
      "Support SLA defined",
    ],
    goCriteria: ["KPI improvement ≥ target", "Adoption ≥ 90%", "Support tickets < 5/month"],
    conditionalGoCriteria: ["KPI 80% of target", "Adoption 70–90%"],
    noGoCriteria: ["KPI flat", "Adoption < 70%", "Excessive support burden"],
  },
  {
    gate: "Gate 4",
    label: GATE_LABELS["Gate 4"],
    keyHypotheses: ["Tool embedded in workflow", "ROI positive", "Sustainable maintenance"],
    minimumEvidence: ["6 months usage data", "ROI calculation done", "Maintenance cost estimated"],
    goCriteria: ["ROI > 3x", "Daily active usage", "Maintenance < 10% of dev cost/year"],
    conditionalGoCriteria: ["ROI 1.5–3x", "Weekly active usage"],
    noGoCriteria: ["ROI < 1x", "Low usage", "Maintenance unsustainable"],
  },
];

// ─── Partnership ──────────────────────────────────────────────────────────────

const PARTNERSHIP_GATES: GateCriteria[] = [
  {
    gate: "Gate 1",
    label: GATE_LABELS["Gate 1"],
    keyHypotheses: [
      "Strategic fit confirmed",
      "Partner has complementary capability",
      "Joint value prop clear",
    ],
    minimumEvidence: ["Partner meeting held", "Capability mapping", "Initial term sheet outline"],
    goCriteria: ["Executive sponsor on both sides", "Value prop agreed", "No competing interests"],
    conditionalGoCriteria: [
      "Working-level agreement",
      "Value prop drafted",
      "Minor overlap manageable",
    ],
    noGoCriteria: ["No partner interest", "Competing interests unresolvable", "No strategic fit"],
  },
  {
    gate: "Gate 2",
    label: GATE_LABELS["Gate 2"],
    keyHypotheses: [
      "Pilot demonstrates joint value",
      "Revenue sharing model agreed",
      "Operational model defined",
    ],
    minimumEvidence: ["Pilot completed", "Revenue model signed", "Joint team structure defined"],
    goCriteria: ["Pilot KPIs met", "Revenue sharing signed", "Governance model agreed"],
    conditionalGoCriteria: ["Pilot partially successful", "Revenue model in negotiation"],
    noGoCriteria: ["Pilot failed", "Revenue model impasse", "Governance unresolved"],
  },
  {
    gate: "Gate 3",
    label: GATE_LABELS["Gate 3"],
    keyHypotheses: ["Joint GTM executing", "Pipeline building", "Relationship healthy"],
    minimumEvidence: ["Joint pipeline ≥ THB 5M", "≥3 joint deals", "Quarterly review in place"],
    goCriteria: ["Pipeline growing", "≥1 closed deal", "Partner satisfaction ≥ 4/5"],
    conditionalGoCriteria: ["Pipeline exists but no closed deal", "Satisfaction 3/5"],
    noGoCriteria: ["No joint pipeline", "Relationship deteriorating", "Satisfaction < 3/5"],
  },
  {
    gate: "Gate 4",
    label: GATE_LABELS["Gate 4"],
    keyHypotheses: [
      "Partnership generates sustainable revenue",
      "Both sides benefit measurably",
      "Renewal likely",
    ],
    minimumEvidence: [
      "Annual revenue from partnership",
      "Both sides report positive ROI",
      "Renewal discussion initiated",
    ],
    goCriteria: ["Revenue > THB 2M/year", "Both sides ROI positive", "Multi-year renewal signed"],
    conditionalGoCriteria: [
      "Revenue THB 500K–2M",
      "One side ROI positive",
      "Renewal in negotiation",
    ],
    noGoCriteria: ["Revenue < THB 500K", "One side ROI negative", "Renewal rejected"],
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

const METRICS_MAP: Record<IdeaTypeDisplay, StageGateMetrics> = {
  SaaS: { ideaType: "SaaS", gates: SAAS_GATES },
  SI: { ideaType: "SI", gates: SI_GATES },
  Hardware: { ideaType: "Hardware", gates: HARDWARE_GATES },
  Platform: { ideaType: "Platform", gates: PLATFORM_GATES },
  "Internal Tool": { ideaType: "Internal Tool", gates: INTERNAL_TOOL_GATES },
  Partnership: { ideaType: "Partnership", gates: PARTNERSHIP_GATES },
};

/**
 * Returns stage gate metrics for the given idea type.
 * Falls back to SaaS metrics for unknown/null types.
 */
export function getStageGateMetrics(ideaType: string | null | undefined): StageGateMetrics {
  if (!ideaType) return METRICS_MAP["SaaS"];
  return METRICS_MAP[ideaType as IdeaTypeDisplay] ?? METRICS_MAP["SaaS"];
}
