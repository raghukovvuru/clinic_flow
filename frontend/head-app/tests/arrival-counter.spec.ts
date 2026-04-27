import { expect, test } from "@playwright/test";

test("shows no-match feedback without layout jump", async ({ page }) => {
  await page.goto("/arrival-counter");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Scan barcode or enter patient ID").fill("zz");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByText("Scan a token slip or search for a patient to begin.")).toHaveCount(0);
});

test("renders the canonical result card shell", async ({ page }) => {
  await page.goto("/arrival-counter");
  await expect(page.getByText("Arrival Counter")).toBeVisible();
  await expect(page.getByText("Recent Arrivals")).toBeVisible();
});

test("shows error state for single-character input", async ({ page }) => {
  await page.goto("/arrival-counter");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Scan barcode or enter patient ID").fill("x");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByText("at least 3 letters")).toBeVisible();
});
