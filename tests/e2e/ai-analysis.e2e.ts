/**
 * E2E smoke tests — AI Analysis feature
 *
 * Tests:
 *   1. Guest can track idea analysis status
 *   2. Analysis result page shows key sections when completed
 *   3. BD Reviewer override form is NOT visible to guests
 *
 * Note: These are smoke tests using mocked tRPC responses.
 * No real Claude API calls are made. The page is intercepted at the
 * tRPC network layer via Playwright route mocking.
 *
 * Playwright config:
 *   - baseURL: http://localhost:3000 (or PLAYWRIGHT_BASE_URL env)
 *   - testMatch: **\/*.e2e.{ts,tsx}  ← this file uses .spec.ts but matches via e2e dir
 *
 * Ref: tasks.md — Task 5.3
 *      design/components.md — AnalysisStatusPoller, AnalysisResultView
 *      design/api-spec.md — analysis.getByIdeaId
 */

import { test, expect } from "@playwright/test";

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const TEST_IDEA_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

/**
 * Minimal mock pending analysis — used for the "tracking in progress" test.
 * Mirrors the AIAnalysis interface camelCase shape as returned by the tRPC procedure.
 */
const MOCK_PENDING_ANALYSIS = {
  id: "analysis-e2e-smoke-001",
  ideaId: TEST_IDEA_ID,
  processingStatus: "pending",
  attemptCount: 0,
  lastError: null,
  summary: null,
  stage: null,
  stageConfidence: null,
  stageReasoning: null,
  ideaType: null,
  ideaTypeConfidence: null,
  portfolioMatches: [],
  feasibility: {
    strategicFit: null,
    marketPotential: null,
    technicalFeasibility: null,
    resourceRequirement: null,
    businessImpact: null,
  },
  strategicFitScore: null,
  strategicFitReasoning: null,
  marketPotentialScore: null,
  marketPotentialReasoning: null,
  technicalFeasibilityScore: null,
  technicalFeasibilityReasoning: null,
  resourceRequirementScore: null,
  resourceRequirementReasoning: null,
  businessImpactScore: null,
  businessImpactReasoning: null,
  recommendedAction: null,
  recommendedActionReasoning: null,
  scoreOverrides: [],
  rawClaudeResponse: null,
  completedAt: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

/**
 * Completed analysis with all AI results — used for the "result page" test.
 */
const MOCK_COMPLETED_ANALYSIS = {
  ...MOCK_PENDING_ANALYSIS,
  processingStatus: "completed",
  summary: "ระบบ AI วิเคราะห์ idea นี้ว่ามีศักยภาพสูงในการพัฒนาเป็น SaaS platform สำหรับตลาด B2B",
  stage: "Validation Sprint",
  stageConfidence: 0.85,
  stageReasoning:
    "Idea มีขอบเขต MVP ที่ชัดเจน กลุ่มเป้าหมายระบุได้ และมีแนวทางการ validate ที่เป็นรูปธรรม",
  ideaType: "SaaS",
  ideaTypeConfidence: 0.92,
  portfolioMatches: [
    {
      product: "APP.AI",
      relevance: "High",
      reasoning: "ใช้ AI engine ร่วมกันได้",
    },
    {
      product: "CRM",
      relevance: "Medium",
      reasoning: "อาจ integrate กับ CRM ได้",
    },
  ],
  feasibility: {
    strategicFit: { score: 4, reasoning: "สอดคล้องกับทิศทางองค์กร" },
    marketPotential: { score: 4, reasoning: "ตลาด B2B SEA ขนาดใหญ่" },
    technicalFeasibility: { score: 4, reasoning: "ทำได้ด้วยเทคโนโลยีปัจจุบัน" },
    resourceRequirement: { score: 3, reasoning: "ต้องการทรัพยากรพอสมควร" },
    businessImpact: { score: 4, reasoning: "ผลกระทบต่อรายได้สูง" },
  },
  strategicFitScore: 4,
  strategicFitReasoning: "สอดคล้องกับทิศทางองค์กร",
  marketPotentialScore: 4,
  marketPotentialReasoning: "ตลาด B2B SEA ขนาดใหญ่",
  technicalFeasibilityScore: 4,
  technicalFeasibilityReasoning: "ทำได้ด้วยเทคโนโลยีปัจจุบัน",
  resourceRequirementScore: 3,
  resourceRequirementReasoning: "ต้องการทรัพยากรพอสมควร",
  businessImpactScore: 4,
  businessImpactReasoning: "ผลกระทบต่อรายได้สูง",
  recommendedAction: "Go",
  recommendedActionReasoning: "คะแนนทุกมิติอยู่ในเกณฑ์ดี ควรดำเนินการ Validation Sprint ทันที",
  scoreOverrides: [],
  rawClaudeResponse: null,
  completedAt: "2024-01-01T01:30:00Z",
  updatedAt: "2024-01-01T01:30:00Z",
};

/**
 * Build a tRPC-compatible JSON response for a successful query result.
 * The tRPC HTTP batch handler returns an array of results.
 */
function buildTrpcSuccessResponse(data: unknown) {
  return JSON.stringify([{ result: { data } }]);
}

/**
 * Intercept the tRPC analysis.getByIdeaId endpoint and return a mocked response.
 * Works for both full batch URL and legacy single-call patterns.
 */
async function _mockAnalysisEndpoint(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  analysisData: typeof MOCK_PENDING_ANALYSIS | typeof MOCK_COMPLETED_ANALYSIS
) {
  await page.route("**/api/trpc/analysis.getByIdeaId*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: buildTrpcSuccessResponse(analysisData),
    });
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe("AI Analysis — E2E Smoke Tests", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Guest can track idea analysis status
  // ──────────────────────────────────────────────────────────────────────────

  test("Guest can track idea analysis status", async ({ page }) => {
    // Mock the tRPC endpoint to return a pending analysis
    await page.route("**/api/trpc/analysis.getByIdeaId*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: buildTrpcSuccessResponse(MOCK_PENDING_ANALYSIS),
      });
    });

    // Navigate to the analysis page with a ref query param (guest access)
    const response = await page.goto(`/en/ideas/${TEST_IDEA_ID}/analysis?ref=TEST-REF-001`);

    // Page should respond with a successful HTTP status
    expect(response?.status()).toBeLessThan(400);

    // Assert: Page shows the analysis heading
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 5000 });

    // Assert: Either the "AI กำลังวิเคราะห์" polling indicator OR the analysis result container is visible.
    // AnalysisStatusPoller renders "AI กำลังวิเคราะห์..." when status is pending/processing.
    // We use a broader selector to handle both the text and aria-busy containers.
    const pollingIndicator = page.getByText("AI กำลังวิเคราะห์");
    const resultContainer = page.getByRole("region", { name: "ผลการวิเคราะห์ AI" });

    // At least one of the two states should be visible within the timeout
    await expect(pollingIndicator.or(resultContainer)).toBeVisible({ timeout: 8000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Analysis result page shows key sections when completed
  // ──────────────────────────────────────────────────────────────────────────

  test("Analysis result page shows key sections when completed", async ({ page }) => {
    // Mock tRPC endpoint to return a completed analysis with full data
    await page.route("**/api/trpc/analysis.getByIdeaId*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: buildTrpcSuccessResponse(MOCK_COMPLETED_ANALYSIS),
      });
    });

    // Navigate to the analysis result page
    const response = await page.goto(`/en/ideas/${TEST_IDEA_ID}/analysis`);
    expect(response?.status()).toBeLessThan(400);

    // Wait for the result region to appear (AnalysisStatusPoller completed state)
    const resultRegion = page.getByRole("region", { name: "ผลการวิเคราะห์ AI" });
    await expect(resultRegion).toBeVisible({ timeout: 8000 });

    // Assert: "Validation Sprint" stage badge is visible
    // AnalysisResultView renders the stage inside StageConfidenceBar
    await expect(page.getByText("Validation Sprint")).toBeVisible({ timeout: 5000 });

    // Assert: "Go" recommendation badge is visible
    // RecommendedActionBadge renders the recommendedAction text
    await expect(page.getByText("Go")).toBeVisible({ timeout: 5000 });

    // Assert: Feasibility chart container is visible
    // AnalysisResultView section title: "การประเมิน Feasibility (1–5)"
    await expect(page.getByText("การประเมิน Feasibility (1–5)")).toBeVisible({ timeout: 5000 });

    // Assert: Portfolio section heading "ความเชื่อมโยงกับ Portfolio" is visible
    // AnalysisResultView section title for portfolio matches
    await expect(page.getByText("ความเชื่อมโยงกับ Portfolio")).toBeVisible({ timeout: 5000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: BD Reviewer override form is NOT visible to guests
  // ──────────────────────────────────────────────────────────────────────────

  test("Score override form is NOT visible to guests (unauthenticated)", async ({ page }) => {
    // Mock tRPC endpoint to return completed analysis (so the result page renders)
    await page.route("**/api/trpc/analysis.getByIdeaId*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: buildTrpcSuccessResponse(MOCK_COMPLETED_ANALYSIS),
      });
    });

    // Navigate to the analysis page WITHOUT authentication
    // (no auth cookie, no session — guest view)
    await page.goto(`/en/ideas/${TEST_IDEA_ID}/analysis`);

    // Wait for the result region to be visible (page fully rendered)
    const resultRegion = page.getByRole("region", { name: "ผลการวิเคราะห์ AI" });
    await expect(resultRegion).toBeVisible({ timeout: 8000 });

    // Assert: The score override form heading is NOT visible to guests
    // ScoreOverrideForm renders h3 "แก้ไขคะแนน Feasibility" — only for bd_reviewer / admin
    // The AnalysisResultView conditionally renders ScoreOverrideForm based on canOverride
    // Since userRole is undefined for guests, canOverride = false → form not rendered
    await expect(page.getByRole("heading", { name: "แก้ไขคะแนน Feasibility" })).not.toBeVisible({
      timeout: 3000,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4 (bonus): Analysis page handles error state gracefully
  // ──────────────────────────────────────────────────────────────────────────

  test("Analysis page shows error state when tRPC returns error", async ({ page }) => {
    // Mock tRPC endpoint to return a tRPC error response
    await page.route("**/api/trpc/analysis.getByIdeaId*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            error: {
              json: {
                message: "Analysis not found",
                code: -32004,
                data: { code: "NOT_FOUND", httpStatus: 404 },
              },
            },
          },
        ]),
      });
    });

    await page.goto(`/en/ideas/${TEST_IDEA_ID}/analysis`);

    // Page should load (HTTP 200 for the Next.js page)
    // The error UI rendered by AnalysisStatusPoller should appear
    const errorAlert = page.getByRole("alert");

    // Wait for error to be visible — the component renders role="alert" for errors
    await expect(errorAlert).toBeVisible({ timeout: 8000 });
  });
});
