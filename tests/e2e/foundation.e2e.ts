/**
 * Task 9.6 — Foundation E2E smoke tests.
 *
 * These tests require a running dev server (pnpm dev) and are NOT run in CI
 * without a server. They verify:
 *   1. Homepage loads with correct Thai locale (/ redirects to /th/)
 *   2. Locale switcher is visible on page
 *   3. Navigation to sign-in page works (/th/auth/sign-in returns 200)
 *
 * Full sign-in flow test is deferred to auth integration tests
 * (requires real Supabase credentials).
 */
import { test, expect } from "@playwright/test";

test.describe("Foundation smoke — locale & navigation", () => {
  test("1. Homepage redirects to /th locale by default", async ({ page }) => {
    // Navigate to root — expect redirect to /th (defaultLocale = 'th')
    await page.goto("/");

    // Should be redirected to /th or /th/...
    await expect(page).toHaveURL(/\/th(\/|$)/);
  });

  test("2. /th page loads without JS errors", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    const response = await page.goto("/th");

    expect(response?.status()).toBeLessThan(400);
    expect(jsErrors).toHaveLength(0);
  });

  test("3. Locale switcher is visible on /th page", async ({ page }) => {
    await page.goto("/th");

    // The LocaleSwitcher renders a button to switch to EN
    // aria-label is "Switch to English" on /th
    const switcher = page.getByRole("button", { name: /switch to english|en/i });
    await expect(switcher).toBeVisible();
  });

  test("4. Sign-in page responds with 200 at /th/auth/sign-in", async ({ page }) => {
    const response = await page.goto("/th/auth/sign-in");

    // Page should exist and load (not 404 or 500)
    expect(response?.status()).toBeLessThan(400);
  });

  test("5. HTML lang attribute matches locale for /th", async ({ page }) => {
    await page.goto("/th");

    // next-intl sets lang on <html> via locale layout
    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("th");
  });

  test("6. HTML lang attribute matches locale for /en", async ({ page }) => {
    await page.goto("/en");

    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("en");
  });
});
