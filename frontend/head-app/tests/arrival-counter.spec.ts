import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.getByText("OPD-002")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Scan a token slip or search for a patient to begin.")).toBeVisible();
  await expect(page.getByPlaceholder("Scan barcode or enter patient ID")).toBeFocused();
});
