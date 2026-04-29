// @ts-nocheck
import { expect, test } from "@playwright/test";

test.skip(!process.env.FRAPPE_BASE_URL, "Set FRAPPE_BASE_URL=http://site1.localhost:8000 and provide an authenticated storage state before running this smoke test.");

async function loginViaApi(page: import("@playwright/test").Page, usr: string, pwd: string) {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ usr, pwd }) => {
      const response = await fetch("/api/method/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        credentials: "same-origin",
        body: new URLSearchParams({ usr, pwd }).toString(),
      });
      const payload = await response.json();
      return { ok: response.ok, payload };
    },
    { usr, pwd }
  );

  if (!result.ok || result.payload?.message !== "Logged In") {
    throw new Error("Unable to establish wrong-role session for access-denied test.");
  }
}

test.describe("Clinic Flow login shell", () => {
  test.use({ baseURL: process.env.FRAPPE_BASE_URL });

  test("guest user sees login form at /clinic/login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/clinic/login");
    await expect(page.getByText("Sign in to continue")).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
    await expect(page.getByText("or go to")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("login page boot context has correct structure", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/clinic/login");
    const boot = await page.evaluate(() => window.clinicFlowBoot);
    expect(boot.slice).toBe("login");
    expect(boot.route).toBe("/clinic/login");
    expect(boot.csrfToken.length).toBeGreaterThan(0);
    expect(boot.mode).toBe("login");
  });

  test("guest redirect from /clinic/arrival-counter goes to /clinic/login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/clinic/arrival-counter");
    await page.waitForURL(/\/clinic\/login/);
    expect(page.url()).toContain("/clinic/login");
    expect(page.url()).toContain("redirect-to=/clinic/arrival-counter");
  });

  test("slice navigation is present as secondary action", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/clinic/login");
    const arrivalNav = page.getByRole("link", { name: "Arrival Counter" });
    await expect(arrivalNav).toBeVisible();
    await expect(arrivalNav).toHaveClass(/slice-card/);
  });

  test("password visibility toggle is keyboard accessible", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/clinic/login");
    const pwd = page.locator("#pwd");
    await expect(pwd).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /show password/i }).press("Enter");
    await expect(pwd).toHaveAttribute("type", "text");
  });

  test("access-denied sign-out returns to login with redirect target", async ({ page }) => {
    const readyUrl = process.env.FRAPPE_WRONG_ROLE_ACCESS_DENIED_URL;
    const wrongRoleUser = process.env.FRAPPE_WRONG_ROLE_USER;
    const wrongRolePwd = process.env.FRAPPE_WRONG_ROLE_PASSWORD;

    if (readyUrl) {
      await page.goto(readyUrl);
    } else {
      test.skip(!(wrongRoleUser && wrongRolePwd), "Set FRAPPE_WRONG_ROLE_ACCESS_DENIED_URL or FRAPPE_WRONG_ROLE_USER + FRAPPE_WRONG_ROLE_PASSWORD.");
      await page.context().clearCookies();
      await loginViaApi(page, wrongRoleUser!, wrongRolePwd!);
      await page.goto("/clinic/login?redirect-to=/clinic/arrival-counter");
      await expect(page.getByText("You are signed in as")).toBeVisible();
    }

    await page.getByRole("button", { name: "Sign out and use a different account" }).click();
    await page.waitForURL(/\/clinic\/login\?redirect-to=%2Fclinic%2Farrival-counter/);
  });
});
