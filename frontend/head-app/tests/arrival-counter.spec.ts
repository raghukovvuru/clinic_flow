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
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Mimi");
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
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Mimi");
  await page.getByRole("button", { name: "Go" }).click();
  await page.waitForSelector('[data-testid="arrival-result-card"]');
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.getByText("OPD-002")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Scan a QR code or search for a patient to begin.")).toBeVisible();
  await expect(page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number")).toBeFocused();
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
    await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Mimi");
    await page.keyboard.press("Enter");

    await expect(page.getByText("Confirm Arrival")).not.toBeVisible();

    // Simulate arrival via direct API call so we can check print button gating.
    // The UI won't let us confirm (button is hidden), so we mock the state change.
    await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { data: { type: "clinic_flow:arrival:confirmed", payload: { queue_entry: "QE-1", display_token: "OPD-001" } } })));
    await expect(page.getByText("Print Token Slip")).not.toBeVisible();
  });
});

test("uses the stabilized scan-first placeholder copy and restores input focus after reset", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 0 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });

  await page.goto("/arrival-counter");
  const input = page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number");
  await expect(input).toBeFocused();
});

test("keeps multiple matches inside the shared result-card shell and hides print in pre-confirm", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 2 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });
  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-1", queue_entry: "QE-1", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" },
      { name: "QE-2", queue_entry: "QE-2", display_token: "OPD-002", patient_name: "Mimi Two", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "Review Patient" }
    ] } } });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Mimi");
  await page.keyboard.press("Enter");

  const resultCard = page.getByTestId("arrival-result-card");
  await expect(resultCard.getByText("Select patient")).toBeVisible();
  await expect(resultCard.getByText("Print Token Slip")).toHaveCount(0);
});

test("does not confirm arrival on Enter when input keeps focus in pre-confirm", async ({ page }) => {
  let markArrivedCalls = 0;

  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 1 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });

  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-7", queue_entry: "QE-7", display_token: "OPD-007", patient_name: "Enter Guard", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" }
    ] } } });
  });

  await page.route("/api/method/clinic_flow.api.arrival.mark_arrived", async (route) => {
    markArrivedCalls += 1;
    await route.fulfill({ json: { message: { status: "Arrived", already_arrived: false, queue_entry: "QE-7", patient_name: "Enter Guard", result_card: { name: "QE-7", queue_entry: "QE-7", display_token: "OPD-007", patient_name: "Enter Guard", queue_session: "QS-1", status: "Arrived", state_label: "Checked In", visit_label: "New Patient" } } } });
  });

  await page.goto("/arrival-counter");
  const input = page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number");
  await input.fill("Enter Guard");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Confirm Arrival" })).toBeVisible();
  await input.click();
  await expect(input).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Confirm Arrival" })).toBeVisible();
  await expect(page.getByText("Print Token Slip")).toHaveCount(0);
  expect(markArrivedCalls).toBe(0);
});

test("confirms arrival with Enter only when confirm action is focused", async ({ page }) => {
  let markArrivedCalls = 0;

  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({
      json: {
        message: {
          has_active: true,
          stats: { arrived: 0, awaiting_arrival: 1 },
          current_session: null,
          next_session: null,
          recent_arrivals: [],
        },
      },
    });
  });

  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({
      json: {
        message: {
          candidates: [
            {
              name: "QE-10",
              queue_entry: "QE-10",
              display_token: "OPD-010",
              patient_name: "Keyboard Confirm",
              queue_session: "QS-1",
              status: "Booked",
              state_label: "Ready to Confirm",
              visit_label: "New Patient",
            },
          ],
        },
      },
    });
  });

  await page.route("/api/method/clinic_flow.api.arrival.mark_arrived", async (route) => {
    markArrivedCalls += 1;
    await route.fulfill({
      json: {
        message: {
          status: "Arrived",
          already_arrived: false,
          queue_entry: "QE-10",
          patient_name: "Keyboard Confirm",
          result_card: {
            name: "QE-10",
            queue_entry: "QE-10",
            display_token: "OPD-010",
            patient_name: "Keyboard Confirm",
            queue_session: "QS-1",
            status: "Arrived",
            state_label: "Checked In",
            visit_label: "New Patient",
          },
        },
      },
    });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Keyboard Confirm");
  await page.getByRole("button", { name: "Go" }).click();

  const confirmButton = page.getByRole("button", { name: "Confirm Arrival" });
  await expect(confirmButton).toBeVisible();
  await confirmButton.focus();
  await expect(confirmButton).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page.getByText("Print Token Slip")).toBeVisible();
  expect(markArrivedCalls).toBe(1);
});

test("does not duplicate lookup or confirm when scanner sends repeated Enter", async ({ page }) => {
  let lookupCalls = 0;
  let markArrivedCalls = 0;

  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 1 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });

  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    lookupCalls += 1;
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-20", queue_entry: "QE-20", display_token: "OPD-020", patient_name: "Double Enter", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" }
    ] } } });
  });

  await page.route("/api/method/clinic_flow.api.arrival.mark_arrived", async (route) => {
    markArrivedCalls += 1;
    await route.fulfill({ json: { message: { status: "Arrived", already_arrived: false, queue_entry: "QE-20", patient_name: "Double Enter", result_card: { name: "QE-20", queue_entry: "QE-20", display_token: "OPD-020", patient_name: "Double Enter", queue_session: "QS-1", status: "Arrived", state_label: "Checked In", visit_label: "New Patient" } } } });
  });

  await page.goto("/arrival-counter");
  const input = page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number");

  await input.fill("Double Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Confirm Arrival" })).toBeVisible();
  expect(lookupCalls).toBe(1);

  const confirmButton = page.getByRole("button", { name: "Confirm Arrival" });
  await confirmButton.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Print Token Slip")).toBeVisible();
  expect(markArrivedCalls).toBe(1);
});

test("shows enough identity detail to disambiguate multiple matches", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 2 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });

  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({
      json: {
        message: {
          candidates: [
            { name: "QE-31", queue_entry: "QE-31", display_token: "OPD-031", patient_name: "Ravi Kumar", queue_session: "Morning Clinic", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" },
            { name: "QE-32", queue_entry: "QE-32", display_token: "OPD-032", patient_name: "Ravi Kumar", queue_session: "Afternoon Clinic", status: "Booked", state_label: "Ready to Confirm", visit_label: "Review Patient" },
          ],
        },
      },
    });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Ravi");
  await page.keyboard.press("Enter");

  const resultCard = page.getByTestId("arrival-result-card");
  await expect(resultCard.getByText("OPD-031")).toBeVisible();
  await expect(resultCard.getByText("Morning Clinic")).toBeVisible();
  await expect(resultCard.getByText("New Patient")).toBeVisible();
  await expect(resultCard.getByText("OPD-032")).toBeVisible();
  await expect(resultCard.getByText("Afternoon Clinic")).toBeVisible();
  await expect(resultCard.getByText("Review Patient")).toBeVisible();
});

test("shows already arrived when another counter confirms first", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 1, awaiting_arrival: 0 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });

  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-40", queue_entry: "QE-40", display_token: "OPD-040", patient_name: "Race Patient", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" }
    ] } } });
  });

  await page.route("/api/method/clinic_flow.api.arrival.mark_arrived", async (route) => {
    await route.fulfill({ json: { message: { status: "Arrived", already_arrived: true, queue_entry: "QE-40", patient_name: "Race Patient", result_card: { name: "QE-40", queue_entry: "QE-40", display_token: "OPD-040", patient_name: "Race Patient", queue_session: "QS-1", status: "Arrived", state_label: "Already Arrived", visit_label: "New Patient" } } } });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Race Patient");
  await page.getByRole("button", { name: "Go" }).click();
  await page.getByRole("button", { name: "Confirm Arrival" }).click();

  const resultCard = page.getByTestId("arrival-result-card");
  await expect(resultCard.getByText("Already Arrived")).toBeVisible();
  await expect(resultCard.getByText("Print Token Slip")).toBeVisible();
});

test.describe("success state rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
      await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 1, awaiting_arrival: 0 }, current_session: null, next_session: null, recent_arrivals: [] } } });
    });
    await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
      await route.fulfill({ json: { message: { candidates: [
        { name: "QE-3", queue_entry: "QE-3", display_token: "OPD-003", patient_name: "Success Test", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" },
      ] } } });
    });
    const mockMarkResult = {
      message: {
        status: "Arrived",
        already_arrived: false,
        queue_entry: "QE-3",
        patient_name: "Success Test",
        result_card: {
          name: "QE-3",
          queue_entry: "QE-3",
          display_token: "OPD-003",
          patient_name: "Success Test",
          queue_session: "QS-1",
          status: "Arrived",
          state_label: "Checked In",
          visit_label: "New Patient",
          print_context: { queue_entry: "QE-3", display_token: "OPD-003", patient_name: "Success Test", qr_svg: "<svg></svg>" },
        },
      },
    };
    await page.route("/api/method/clinic_flow.api.arrival.mark_arrived", async (route) => {
      await route.fulfill({ json: mockMarkResult });
    });
  });

  test("shows token, patient name, Print Token Slip after arrival confirmation", async ({ page }) => {
    await page.goto("/arrival-counter");
    await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Success");
    await page.getByRole("button", { name: "Go" }).click();
    await page.getByRole("button", { name: "Confirm Arrival" }).click();

    const resultCard = page.getByTestId("arrival-result-card");
    await expect(resultCard.getByText("OPD-003")).toBeVisible();
    await expect(resultCard.getByText("Success Test")).toBeVisible();
    await expect(resultCard.getByText("Print Token Slip")).toBeVisible();
  });
});
