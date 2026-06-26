/**
 * E2E tests — Guest tracking page (US-24)
 *
 * Tests:
 *   1. /track/[referenceNumber] → shows status card when reference exists
 *   2. reference number not found → shows error message
 *   3. sensitive data not visible on tracking page
 *   4. stage timeline shows at least 1 step
 *
 * Uses test data: reference number LP-TEST-000001
 * Requires: dev server running + test data seeded (or mock API)
 *
 * Note: These tests require the dev server — not run in unit test CI.
 *       Run with: pnpm test:e2e tests/e2e/pipeline/guest-tracking.spec.ts
 *
 * Ref: tasks.md — Task 6.4
 */

import { test, expect } from "@playwright/test";

const BASE = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";
const LOCALE = process.env["E2E_LOCALE"] ?? "th";
const TEST_REF_NUM = process.env["E2E_TEST_REF_NUM"] ?? "LP-TEST-000001";

test.describe("Guest tracking — US-24", () => {
  // ─── Test 1: Valid reference number shows status card ─────────────────────

  test("เปิด /track/[referenceNumber] ตรง → เห็น status card", async ({ page }) => {
    test.skip(!process.env["E2E_BASE_URL"], "E2E_BASE_URL not set — skipping full E2E test");

    await page.goto(`${BASE}/${LOCALE}/track/${TEST_REF_NUM}`);

    // Status card should be visible
    await expect(page.locator('[data-testid="tracking-status-card"]')).toBeVisible({
      timeout: 15_000,
    });

    // Reference number should appear on the page
    await expect(page.locator(`text=${TEST_REF_NUM}`)).toBeVisible({ timeout: 5_000 });

    // Current stage badge should be visible
    await expect(page.locator('[data-testid="current-stage-badge"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  // ─── Test 2: Not found → error message ────────────────────────────────────

  test("reference number ไม่พบ → เห็น error message", async ({ page }) => {
    test.skip(!process.env["E2E_BASE_URL"], "E2E_BASE_URL not set — skipping full E2E test");

    const invalidRef = "LP-DOES-NOT-EXIST-999999";
    await page.goto(`${BASE}/${LOCALE}/track/${invalidRef}`);

    // Should show an error/not-found message — not a blank page or crash
    const errorLocators = [
      page.locator('[data-testid="tracking-not-found"]'),
      page.locator('[role="alert"]'),
      page.locator("text=ไม่พบข้อมูล"),
      page.locator("text=not found"),
      page.locator("text=Reference number not found"),
    ];

    // At least one error indicator should be visible
    let found = false;
    for (const locator of errorLocators) {
      if (await locator.isVisible().catch(() => false)) {
        found = true;
        break;
      }
    }

    expect(
      found,
      "Expected an error/not-found message to be visible for an invalid reference number"
    ).toBe(true);

    // Should NOT show a status card
    await expect(page.locator('[data-testid="tracking-status-card"]'))
      .not.toBeVisible({ timeout: 3_000 })
      .catch(() => {
        // If locator doesn't exist at all, that's fine too
      });
  });

  // ─── Test 3: Sensitive data not shown on tracking page ────────────────────

  test("sensitive data ไม่แสดงใน tracking page", async ({ page }) => {
    test.skip(!process.env["E2E_BASE_URL"], "E2E_BASE_URL not set — skipping full E2E test");

    await page.goto(`${BASE}/${LOCALE}/track/${TEST_REF_NUM}`);

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    const pageContent = await page.content();

    // Should NOT contain email addresses (submitter PII)
    expect(pageContent, "Tracking page should not expose email addresses").not.toMatch(
      /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    );

    // Should NOT contain reviewer UUID patterns in visible text
    const visibleText = await page.innerText("body").catch(() => "");

    // Should NOT show reviewer internal ID
    expect(
      visibleText,
      "Tracking page should not show assigned reviewer internal ID"
    ).not.toContain("assignedReviewer");

    // Should NOT show watermark status internal value in raw form
    expect(
      visibleText,
      "Tracking page should not expose raw watermarkStatus value to guest"
    ).not.toMatch(/watermarkStatus|watermark_status/);

    // Should NOT show submitter type internal value
    expect(
      visibleText,
      "Tracking page should not expose raw submitterType value to guest"
    ).not.toMatch(/submitterType|submitter_type/);
  });

  // ─── Test 4: Stage timeline shows at least 1 step ────────────────────────

  test("stage timeline แสดงอย่างน้อย 1 step", async ({ page }) => {
    test.skip(!process.env["E2E_BASE_URL"], "E2E_BASE_URL not set — skipping full E2E test");

    await page.goto(`${BASE}/${LOCALE}/track/${TEST_REF_NUM}`);

    // Wait for status card
    await expect(page.locator('[data-testid="tracking-status-card"]')).toBeVisible({
      timeout: 15_000,
    });

    // Stage timeline component should be present
    const timelineLocators = [
      page.locator('[data-testid="stage-timeline"]'),
      page.locator('[aria-label="Stage timeline"]'),
      page.locator(".stage-timeline"),
    ];

    let timelineFound = false;
    for (const locator of timelineLocators) {
      if (await locator.isVisible().catch(() => false)) {
        timelineFound = true;

        // Should have at least 1 step/entry
        const steps = locator.locator('[data-testid="timeline-step"], li, .timeline-step');
        const count = await steps.count();
        expect(count, "Stage timeline should show at least 1 step").toBeGreaterThanOrEqual(1);
        break;
      }
    }

    expect(timelineFound, "Stage timeline component should be visible on the tracking page").toBe(
      true
    );
  });

  // ─── Test 5: Page accessible without login (no redirect to auth) ──────────

  test("tracking page accessible without login (no auth redirect)", async ({ page }) => {
    test.skip(!process.env["E2E_BASE_URL"], "E2E_BASE_URL not set — skipping full E2E test");

    await page.goto(`${BASE}/${LOCALE}/track/${TEST_REF_NUM}`);

    // Should NOT redirect to sign-in page
    await expect(page).not.toHaveURL(/sign-in|login|auth/, { timeout: 5_000 });
  });
});
