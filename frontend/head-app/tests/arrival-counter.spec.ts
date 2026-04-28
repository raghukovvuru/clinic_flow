import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.addInitScript(() => {
    window.clinicFlowBoot = {
      app: "clinic_flow",
      slice: "arrival-counter",
      route: "/clinic/arrival-counter",
      siteName: "site1.localhost",
      user: "staff@example.com",
      roles: ["Queue Manager"],
      csrfToken: "csrf",
      realtime: { enabled: false, mode: "polling" },
      permissions: { canUseArrivalCounter: true, canConfirmArrival: true, canPrintTokenSlip: true },
    };
  });
});

test("renders multiple matches inside the shared result-card shell", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 2 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });
  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-1", queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient", print_context: { queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", qr_svg: "<svg></svg>" } },
      { name: "QE-2", queue_entry: "QE-2", display_token: "OPD-002", patient_name: "Mimi Two", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient", print_context: { queue_entry: "QE-2", display_token: "OPD-002", patient_name: "Mimi Two", qr_svg: "<svg></svg>" } },
    ] } } });
  });

  await page.goto("/arrival-counter");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Scan barcode or enter patient ID").fill("Mimi");
  await page.keyboard.press("Enter");

  const resultCard = page.getByTestId("arrival-result-card");
  await expect(resultCard.getByText("Select patient")).toBeVisible();
  await expect(page.getByTestId("arrival-multiple-matches-outside-card")).toHaveCount(0);
});

test("supports keyboard candidate selection and reset", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 1 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });
  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-1", queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient", print_context: { queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", qr_svg: "<svg></svg>" } },
      { name: "QE-2", queue_entry: "QE-2", display_token: "OPD-002", patient_name: "Mimi Two", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient", print_context: { queue_entry: "QE-2", display_token: "OPD-002", patient_name: "Mimi Two", qr_svg: "<svg></svg>" } },
    ] } } });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan barcode or enter patient ID").fill("Mimi");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="arrival-result-card"]');
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.getByText("OPD-002")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Scan a token slip or search for a patient to begin.")).toBeVisible();
  await expect(page.getByPlaceholder("Scan barcode or enter patient ID")).toBeFocused();
});

test("keeps input, result card, and recent arrivals in one vertical working column", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 3, awaiting_arrival: 5 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });

  await page.goto("/arrival-counter");

  const regions = page.locator("main > *");
  await expect(regions.nth(0)).toContainText("Scan or Search");
  await expect(regions.nth(1)).toHaveAttribute("data-testid", "arrival-result-card");
  await expect(regions.nth(2)).toContainText("Recent Arrivals");
});

test("renders a quiet header with current/next session chips and exact stat labels", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: {
      has_active: true,
      stats: { arrived: 4, awaiting_arrival: 7 },
      current_session: { name: "QS-1", session_name: "Morning Clinic", status: "Active", start_time: "09:00:00" },
      next_session: { name: "QS-2", session_name: "Afternoon Clinic", status: "Scheduled", start_time: "13:00:00" },
      recent_arrivals: []
    } } });
  });

  await page.goto("/arrival-counter");
  await expect(page.getByText("Active: Morning Clinic")).toBeVisible();
  await expect(page.getByText("Next: Afternoon Clinic")).toBeVisible();
  await expect(page.getByText("Arrived")).toBeVisible();
  await expect(page.getByText("Awaiting Arrival")).toBeVisible();
});

test.describe("permission denied", () => {
  test.beforeEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.addInitScript(() => {
      window.clinicFlowBoot = {
        app: "clinic_flow",
        slice: "arrival-counter",
        route: "/clinic/arrival-counter",
        siteName: "site1.localhost",
        user: "staff@example.com",
        roles: ["Queue Manager"],
        csrfToken: "csrf",
        realtime: { enabled: false, mode: "polling" },
        permissions: { canUseArrivalCounter: true, canConfirmArrival: false, canPrintTokenSlip: false },
      };
    });
  });

  test("hides action buttons when permissions are denied", async ({ page }) => {
    await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
      await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 1 }, current_session: null, next_session: null, recent_arrivals: [] } } });
    });
    await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
      await route.fulfill({ json: { message: { candidates: [
        { name: "QE-1", queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient", print_context: { queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", qr_svg: "<svg></svg>" } },
      ] } } });
    });
    await page.route("/api/method/clinic_flow.api.arrival.confirm_arrival", async (route) => {
      await route.fulfill({ json: { message: { queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", state_label: "Arrived", status: "Arrived", print_context: { queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", qr_svg: "<svg></svg>" } } } });
    });

    await page.goto("/arrival-counter");
    await page.waitForLoadState("networkidle");
    await page.getByPlaceholder("Scan barcode or enter patient ID").fill("Mimi");
    await page.keyboard.press("Enter");

    await expect(page.getByText("Confirm Arrival")).not.toBeVisible();

    // Simulate arrival via direct API call so we can check print button gating.
    // The UI won't let us confirm (button is hidden), so we mock the state change.
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { data: { type: "clinic_flow:arrival:confirmed", payload: { queue_entry: "QE-1", display_token: "OPD-001" } } })));
    await expect(page.getByText("Print Token Slip")).not.toBeVisible();
  });
});
