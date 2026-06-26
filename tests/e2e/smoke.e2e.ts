/**
 * Smoke E2E test — verifies the app loads and responds.
 * Full sign-in + locale switch E2E added in Task 9.6.
 */
import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("homepage loads without errors", async ({ page }) => {
    const response = await page.goto("/th");
    expect(response?.status()).toBeLessThan(400);
  });
});
