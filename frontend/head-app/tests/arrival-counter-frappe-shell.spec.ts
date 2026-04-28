/**
 * Frappe-served shell integration test.
 *
 * REQUIRED MANUAL VERIFICATION before merge:
 *   FRAPPE_BASE_URL=http://site1.localhost:8000 \
 *   FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json \
 *   npx playwright test tests/arrival-counter-frappe-shell.spec.ts
 *
 * This test is skipped in CI because it requires a running Frappe instance
 * with authenticated session storage state.
 */
// @ts-nocheck
import { expect, test } from "@playwright/test";

test.describe("Frappe-served Arrival Counter shell", () => {
  test.skip(!process.env.FRAPPE_BASE_URL, "Set FRAPPE_BASE_URL=http://site1.localhost:8000 and provide an authenticated storage state before running this smoke test.");

  test.use({ baseURL: process.env.FRAPPE_BASE_URL, storageState: process.env.FRAPPE_STORAGE_STATE || undefined });

  test("loads canonical shell without iframe", async ({ page }) => {
    await page.goto("/clinic/arrival-counter");
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByText("Arrival Counter")).toBeVisible();
    const boot = await page.evaluate(() => window.clinicFlowBoot);
    expect(boot.route).toBe("/clinic/arrival-counter");
    expect(boot.csrfToken.length).toBeGreaterThan(0);
  });
});
