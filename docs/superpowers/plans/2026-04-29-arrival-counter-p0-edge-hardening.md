# Arrival Counter P0 Edge Case Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` recommended, or `superpowers:executing-plans`, to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Arrival Counter against wrong check-ins, ambiguous patient identity, duplicated scanner submissions, and uncertain backend outcomes.

**Architecture:** Keep the existing SvelteKit head-app, boot adapter, API adapter, and Frappe backend authority intact. Add focused frontend guards, clearer result-state behavior, and backend-safe reconciliation where needed. Do not change queue authority or Healthcare base app behavior.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Tailwind CSS, Vitest, Playwright, Frappe v16 Python APIs.

---

## File Structure

- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
  - Owns local workflow state, duplicate-submit guards, confirm reconciliation, session-drift handling, and candidate selection behavior.

- Modify: `frontend/head-app/src/lib/arrival-counter/types.ts`
  - Add lightweight UI/state discriminators only if needed.

- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
  - Display clearer multiple-match identity details and blocked/uncertain outcome messages.

- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
  - Improve candidate row disambiguation and keyboard-visible selection.

- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
  - Keep keyboard shortcut boundaries safe and prevent duplicate action execution.

- Modify: `frontend/head-app/src/lib/api/arrival.ts`
  - Add minimal confirm/reconcile response handling if current API wrapper loses useful error state.

- Modify: `frontend/head-app/src/lib/api/arrival.test.ts`
  - Unit coverage for API error/response normalization.

- Modify: `frontend/head-app/src/lib/arrival-counter/state.test.ts`
  - Unit coverage for P0 workflow guards.

- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`
  - E2E coverage for scanner duplication, multiple-match ambiguity, session drift, and timeout uncertainty.

- Modify: `docs/notes/arrival-counter-ui-stabilization.md`
  - Add summary of P0 hardening changes and verification.

---

## Task 1: Lock Enter Confirm Safety

**Risk:** Pressing `Enter` from the wrong place can accidentally confirm arrival.

**Files:**
- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write failing e2e test for positive keyboard confirm path**

Add a test proving `Enter` confirms only when the confirm button/result-card decision context is focused.

```ts
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
  await page.keyboard.press("Enter");

  const confirmButton = page.getByRole("button", { name: "Confirm Arrival" });
  await expect(confirmButton).toBeVisible();
  await confirmButton.focus();
  await expect(confirmButton).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page.getByText("Print Token Slip")).toBeVisible();
  expect(markArrivedCalls).toBe(1);
});
```

- [ ] **Step 2: Run focused test**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "confirms arrival with Enter only when confirm action is focused"
```

Expected: pass if current patch already supports this. If it fails, it should fail because Enter does not confirm when the focused button is in the result card.

- [ ] **Step 3: Keep existing negative guard test**

Ensure the existing test remains:

```ts
test("does not confirm arrival on Enter when input keeps focus in pre-confirm", async ({ page }) => {
  // existing regression test
});
```

- [ ] **Step 4: Run full arrival-counter e2e suite**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts
```

Expected:

```text
9+ passed
```

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/routes/arrival-counter/+page.svelte frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "test: lock arrival counter enter confirm boundary"
```

---

## Task 2: Block Duplicate Scanner And Confirm Submissions

**Risk:** Scanner newline spam or repeated `Enter` can create duplicate lookups/confirms.

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
- Test: `frontend/head-app/src/lib/arrival-counter/state.test.ts`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write unit test for duplicate lookup guard**

Add to `state.test.ts`:

```ts
it("ignores duplicate lookup while a lookup is pending", async () => {
  let resolveLookup: (value: { candidates: typeof mockCard[] }) => void = () => {};
  vi.mocked(lookupArrivalCandidate).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
  );

  const state = new ArrivalCounterState();

  const first = state.lookup("Mimi Test");
  const second = state.lookup("Mimi Test");

  expect(lookupArrivalCandidate).toHaveBeenCalledTimes(1);

  resolveLookup({ candidates: [mockCard] });
  await first;
  await second;

  expect(state.resultState).toBe("pre-confirm");
});
```

- [ ] **Step 2: Write unit test for duplicate confirm guard**

Add to `state.test.ts`:

```ts
it("ignores duplicate confirm while confirm is pending", async () => {
  let resolveConfirm: (value: Awaited<ReturnType<typeof markArrived>>) => void = () => {};
  vi.mocked(markArrived).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveConfirm = resolve;
      }),
  );

  const state = new ArrivalCounterState();
  state.selected = mockCard;

  const first = state.confirmArrival();
  const second = state.confirmArrival();

  expect(markArrived).toHaveBeenCalledTimes(1);

  resolveConfirm({
    status: "Arrived",
    already_arrived: false,
    queue_entry: mockCard.queue_entry,
    patient_name: mockCard.patient_name,
    result_card: { ...mockCard, status: "Arrived", state_label: "Checked In" },
  });

  await first;
  await second;

  expect(state.resultState).toBe("success");
});
```

- [ ] **Step 3: Run unit tests and verify failure**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts
```

Expected: duplicate lookup test fails because `lookupArrivalCandidate` is called twice.

- [ ] **Step 4: Implement minimal duplicate lookup guard**

In `state.svelte.ts`, at the top of `lookup(raw: string)`:

```ts
async lookup(raw: string) {
  if (this.isLookupPending) return;

  this.inputValue = raw;
  // existing logic continues
}
```

- [ ] **Step 5: Confirm duplicate confirm guard exists**

Current code already has:

```ts
if (!this.selected || this.isConfirmPending) return;
```

Do not change it unless the new unit test exposes a real issue.

- [ ] **Step 6: Run unit tests**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts
```

Expected:

```text
pass
```

- [ ] **Step 7: Write e2e scanner double-enter test**

Add to `arrival-counter.spec.ts`:

```ts
test("does not duplicate lookup or confirm when scanner sends repeated Enter", async ({ page }) => {
  let lookupCalls = 0;
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
    lookupCalls += 1;
    await route.fulfill({
      json: {
        message: {
          candidates: [
            {
              name: "QE-20",
              queue_entry: "QE-20",
              display_token: "OPD-020",
              patient_name: "Double Enter",
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
          queue_entry: "QE-20",
          patient_name: "Double Enter",
          result_card: {
            name: "QE-20",
            queue_entry: "QE-20",
            display_token: "OPD-020",
            patient_name: "Double Enter",
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
```

- [ ] **Step 8: Run e2e test**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "does not duplicate lookup or confirm"
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/state.svelte.ts frontend/head-app/src/lib/arrival-counter/state.test.ts frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "fix: block duplicate arrival counter submissions"
```

---

## Task 3: Strengthen Multiple-Match Identity

**Risk:** Similar names can cause staff to select the wrong patient.

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write e2e test for disambiguation display**

Add to `arrival-counter.spec.ts`:

```ts
test("shows enough identity detail to disambiguate multiple matches", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({
      json: {
        message: {
          has_active: true,
          stats: { arrived: 0, awaiting_arrival: 2 },
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
              name: "QE-31",
              queue_entry: "QE-31",
              display_token: "OPD-031",
              patient_name: "Ravi Kumar",
              queue_session: "Morning Clinic",
              status: "Booked",
              state_label: "Ready to Confirm",
              visit_label: "New Patient",
            },
            {
              name: "QE-32",
              queue_entry: "QE-32",
              display_token: "OPD-032",
              patient_name: "Ravi Kumar",
              queue_session: "Afternoon Clinic",
              status: "Booked",
              state_label: "Ready to Confirm",
              visit_label: "Review Patient",
            },
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
```

- [ ] **Step 2: Run test and verify failure if session detail is not visible**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "shows enough identity detail"
```

Expected: fail if `queue_session` is not shown in candidate rows.

- [ ] **Step 3: Update candidate row layout**

In `MultipleMatchesList.svelte`, change row body to include token, name, session, visit label, and status.

```svelte
<div class="min-w-0">
  <div class="font-display font-semibold text-[#10211f]">{candidate.display_token}</div>
  <div class="truncate text-sm text-slate-700">{candidate.patient_name}</div>
  <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
    <span>{candidate.queue_session}</span>
    <span>{candidate.visit_label}</span>
    <span>{candidate.status}</span>
  </div>
</div>
```

Keep the current focused-row border behavior.

- [ ] **Step 4: Run focused e2e test**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "shows enough identity detail"
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "fix: disambiguate arrival counter multiple matches"
```

---

## Task 4: Handle Already-Arrived Race On Confirm

**Risk:** Another counter may mark the same patient arrived after lookup but before confirm.

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Test: `frontend/head-app/src/lib/arrival-counter/state.test.ts`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Add unit test for already-arrived confirm response**

Add to `state.test.ts`:

```ts
it("shows already-arrived state when confirm response reports already arrived", async () => {
  const state = new ArrivalCounterState();
  state.selected = mockCard;

  vi.mocked(markArrived).mockResolvedValueOnce({
    status: "Arrived",
    already_arrived: true,
    queue_entry: mockCard.queue_entry,
    patient_name: mockCard.patient_name,
    result_card: { ...mockCard, status: "Arrived", state_label: "Already Arrived" },
  });

  await state.confirmArrival();

  expect(state.resultState).toBe("already-arrived");
  expect(state.selected?.state_label).toBe("Already Arrived");
});
```

- [ ] **Step 2: Run unit test**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts
```

Expected: pass if current behavior already handles `already_arrived`.

- [ ] **Step 3: Add e2e race test**

Add to `arrival-counter.spec.ts`:

```ts
test("shows already arrived when another counter confirms first", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({
      json: {
        message: {
          has_active: true,
          stats: { arrived: 1, awaiting_arrival: 0 },
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
              name: "QE-40",
              queue_entry: "QE-40",
              display_token: "OPD-040",
              patient_name: "Race Patient",
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
    await route.fulfill({
      json: {
        message: {
          status: "Arrived",
          already_arrived: true,
          queue_entry: "QE-40",
          patient_name: "Race Patient",
          result_card: {
            name: "QE-40",
            queue_entry: "QE-40",
            display_token: "OPD-040",
            patient_name: "Race Patient",
            queue_session: "QS-1",
            status: "Arrived",
            state_label: "Already Arrived",
            visit_label: "New Patient",
          },
        },
      },
    });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Race Patient");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Confirm Arrival" }).click();

  const resultCard = page.getByTestId("arrival-result-card");
  await expect(resultCard.getByText("Already Arrived")).toBeVisible();
  await expect(resultCard.getByText("Print Token Slip")).toBeVisible();
});
```

- [ ] **Step 4: Run e2e race test**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "another counter confirms first"
```

Expected: pass if current behavior already maps already-arrived response correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/state.test.ts frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "test: cover already-arrived confirm race"
```

---

## Task 5: Stop Confirm When Session Authority Changes

**Risk:** Patient is selected under one session, but session closes/changes before confirm.

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Test: `frontend/head-app/src/lib/arrival-counter/state.test.ts`

- [ ] **Step 1: Write unit test for inactive session before confirm**

Add to `state.test.ts`:

```ts
it("blocks confirm when refreshed context reports no active session", async () => {
  const state = new ArrivalCounterState();
  state.selected = mockCard;
  state.context = {
    has_active: true,
    stats: { arrived: 0, awaiting_arrival: 1 },
    current_session: { name: "QS-1", session_name: "Morning Clinic", status: "Active", start_time: "09:00:00" },
    next_session: null,
    recent_arrivals: [],
  };

  vi.mocked(getArrivalSessionContext).mockResolvedValueOnce({
    has_active: false,
    stats: { arrived: 0, awaiting_arrival: 1 },
    current_session: null,
    next_session: null,
    recent_arrivals: [],
  });

  await state.confirmArrival();

  expect(markArrived).not.toHaveBeenCalled();
  expect(state.resultState).toBe("pre-confirm");
  expect(state.message).toBe("Arrival session is no longer active. Refresh the counter or contact the queue manager.");
});
```

- [ ] **Step 2: Run unit test and verify failure**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts
```

Expected: fail because confirm currently calls `markArrived` without pre-confirm context check.

- [ ] **Step 3: Add active-session refresh before confirm**

In `confirmArrival()`, before setting `isConfirmPending = true` or before calling `markArrived`, refresh context and block if inactive.

```ts
async confirmArrival() {
  if (!this.selected || this.isConfirmPending) return;

  await this.refreshContext();
  if (this.context && !this.context.has_active) {
    this.message = "Arrival session is no longer active. Refresh the counter or contact the queue manager.";
    return;
  }

  this.isConfirmPending = true;
  // existing confirm logic
}
```

- [ ] **Step 4: Run state unit tests**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts
```

Expected: pass.

- [ ] **Step 5: Run arrival e2e suite**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/state.svelte.ts frontend/head-app/src/lib/arrival-counter/state.test.ts
git commit -m "fix: block arrival confirm after inactive session drift"
```

---

## Task 6: Reconcile Uncertain Confirm Timeout

**Risk:** Confirm request times out; UI cannot tell whether backend marked arrived.

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Test: `frontend/head-app/src/lib/arrival-counter/state.test.ts`

- [ ] **Step 1: Write unit test for timeout reconciliation**

Add to `state.test.ts`:

```ts
it("reconciles selected candidate after confirm timeout before showing retry guidance", async () => {
  const state = new ArrivalCounterState();
  state.selected = mockCard;

  vi.mocked(markArrived).mockRejectedValueOnce(new Error("Request timed out"));
  vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({
    candidates: [{ ...mockCard, status: "Arrived", state_label: "Already Arrived" }],
  });

  await state.confirmArrival();

  expect(lookupArrivalCandidate).toHaveBeenCalledWith({ queue_entry: mockCard.queue_entry });
  expect(state.resultState).toBe("already-arrived");
  expect(state.selected?.status).toBe("Arrived");
});
```

- [ ] **Step 2: Run unit test and verify failure**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts
```

Expected: fail because confirm catch currently only sets a message.

- [ ] **Step 3: Add private reconciliation helper**

In `state.svelte.ts`, add a method inside the class:

```ts
async reconcileSelectedAfterConfirmFailure() {
  if (!this.selected?.queue_entry) return false;

  try {
    const response = await lookupArrivalCandidate({ queue_entry: this.selected.queue_entry });
    const reconciled = response.candidates[0];
    if (!reconciled) return false;

    this.selected = reconciled;
    this.resultState = reconciled.status === "Arrived" ? "already-arrived" : "pre-confirm";
    return reconciled.status === "Arrived";
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Use reconciliation in confirm catch**

Change the `catch` block in `confirmArrival()`:

```ts
} catch (error) {
  const reconciled = await this.reconcileSelectedAfterConfirmFailure();
  if (reconciled) {
    this.message = "Arrival was already confirmed. Token slip can be printed if needed.";
    return;
  }

  this.message = error instanceof Error ? error.message : "Could not confirm arrival. Try again.";
}
```

- [ ] **Step 5: Run unit tests**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/state.svelte.ts frontend/head-app/src/lib/arrival-counter/state.test.ts
git commit -m "fix: reconcile uncertain arrival confirm failures"
```

---

## Task 7: Update Documentation Note

**Files:**
- Modify: `docs/notes/arrival-counter-ui-stabilization.md`

- [ ] **Step 1: Add P0 hardening section**

Append:

```md
## P0 Edge Case Hardening

- Blocked duplicate lookup/confirm submissions from repeated scanner Enter or rapid keypresses.
- Locked Enter-confirm so it only works from the result-card decision context.
- Strengthened multiple-match rows with token, patient name, session, visit label, and status.
- Preserved already-arrived race handling so a second counter confirming first becomes a deterministic already-arrived state.
- Blocked confirm when active session authority disappears before mutation.
- Added reconciliation after uncertain confirm failures to avoid unsafe repeat confirmation.
```

- [ ] **Step 2: Update verification section**

Add current verification commands and results:

```md
- `npm run test -- src/lib/arrival-counter/state.test.ts`
- `npm run test:e2e -- tests/arrival-counter.spec.ts`
- `npm run check`
```

- [ ] **Step 3: Commit**

```bash
git add docs/notes/arrival-counter-ui-stabilization.md
git commit -m "docs: record arrival counter p0 hardening"
```

---

## Task 8: Final Verification

**Files:**
- No code edits unless verification fails.

- [ ] **Step 1: Run unit tests**

```bash
npm run test -- src/lib/arrival-counter/state.test.ts src/lib/api/arrival.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run e2e tests**

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts
```

Expected: all pass.

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected:

```text
svelte-check found 0 errors and 0 warnings
```

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: build succeeds and copies generated files to `clinic_flow/public/head-app/`.

- [ ] **Step 5: Run graph update from repo root after code edits**

```bash
graphify update .
```

Expected: graph update completes.

---

## Self-Review

Spec coverage:

- Enter accidental confirm: Task 1.
- Duplicate scanner/submit protection: Task 2.
- Already-arrived race condition: Task 4.
- Identity ambiguity in multiple matches: Task 3.
- Session authority drift mid-flow: Task 5.
- Uncertain confirm outcome on timeout: Task 6.
- Documentation and verification: Tasks 7 and 8.

No placeholders included. All task steps include exact file paths, commands, and expected outcomes.
