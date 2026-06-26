/**
 * E2E smoke tests — idea submission flow.
 *
 * Note: Full E2E with real Supabase deferred — these are smoke tests
 * verifying that the submission page loads and key elements are visible.
 *
 * Task 6.4
 */

import { test, expect } from "@playwright/test";

test.describe("Idea Submission — smoke tests", () => {
  test("submit page loads correctly (TH locale)", async ({ page }) => {
    const response = await page.goto("/th/submit");
    // Page should respond successfully
    expect(response?.status()).toBeLessThan(400);

    // Heading should be visible
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Idea title field should be visible
    await expect(page.getByRole("textbox", { name: /ชื่อ idea/i })).toBeVisible();
  });

  test("submit page loads correctly (EN locale)", async ({ page }) => {
    const response = await page.goto("/en/submit");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Form should be present
    await expect(page.getByRole("form")).toBeVisible();
  });

  test("submit page has accessible form structure", async ({ page }) => {
    await page.goto("/th/submit");

    // Form must have aria-label
    await expect(page.getByRole("form")).toBeVisible();

    // Submit button must be present
    await expect(page.getByRole("button", { name: /ส่ง idea/i })).toBeVisible();
  });

  test("track page loads with reference number in URL", async ({ page }) => {
    const response = await page.goto("/th/track/LP-ABCD1234");
    expect(response?.status()).toBeLessThan(400);

    // Reference number heading visible
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Email input for verification must be present
    await expect(page.getByRole("textbox", { name: /อีเมลติดต่อ/i })).toBeVisible();
  });
});
