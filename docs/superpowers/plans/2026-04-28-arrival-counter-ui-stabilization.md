# Arrival Counter UI Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the standalone Arrival Counter head-app UI into conformance with the stabilized UI/product spec while preserving the current standalone-shell architecture, workflow, and backend authority.

**Architecture:** Keep the current SvelteKit route, boot adapter, API adapter, and polling transport intact. Refactor only the presentation layer, light local page state, and tests so the slice expresses the locked single-column scan-first layout, shared result-card shell, quiet header/recent-arrivals support surfaces, and stronger visual acceptance rules.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Tailwind CSS, Vitest, Playwright, Frappe-served standalone shell

---

## File Structure

- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
  - Tighten page composition, spacing, and wiring between working surface and support surfaces.
- Modify: `frontend/head-app/src/routes/app.css`
  - Align page canvas, gradients, global typography, and shared surface feel to `DESIGN.md` tokens.
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
  - Keep state logic minimal, but add any low-risk UI-state fields needed for degraded banners or print-safe reset timing.
- Modify: `frontend/head-app/src/lib/arrival-counter/types.ts`
  - Add any UI-facing message/banner discriminators needed by the stabilized presentation.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/HeaderBar.svelte`
  - Make header quieter, more chip-like, and less dashboard-like.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`
  - Make the input the strongest idle-state element and update placeholder copy for QR/name/mobile lookup.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
  - Enforce stable shell across states and fix action hierarchy for pre-confirm, already-arrived, and success.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
  - Keep candidate rows compact and keyboard-visible inside the shared result-card footprint.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/RecentArrivals.svelte`
  - Make recent arrivals visually quiet and locally readable.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/StatusBanner.svelte`
  - Support low-disruption operational/degraded banners without breaking page structure.
- Test: `frontend/head-app/src/lib/arrival-counter/state.test.ts`
  - Preserve active decision state and any print/reset handling changes.
- Test: `frontend/head-app/src/lib/arrival-counter/print-slip.test.ts`
  - Keep safe print rendering and add any regression coverage for reset/print messaging if needed.
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`
  - Lock the updated visual hierarchy, button visibility, keyboard flow, and result-card shell behavior.
- Create: `docs/notes/arrival-counter-ui-stabilization.md`
  - Document what changed, what was verified, what stayed out of scope, and the next integration step.

---

### Task 1: Stabilize Page Canvas And Shared Layout

**Files:**
- Modify: `frontend/head-app/src/routes/app.css`
- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write the failing e2e expectation for the single working column and stable section order**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails or is too weak for the current UI**

Run: `npm run test:e2e -- tests/arrival-counter.spec.ts --grep "single working column"`
Expected: FAIL or missing assertion coverage for the stabilized layout.

- [ ] **Step 3: Tighten page shell spacing and max-width around one dominant working column**

```svelte
<div class="mx-auto flex min-h-screen w-full max-w-[72rem] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
  <HeaderBar context={pageState.context} />
  <main class="flex flex-col gap-5">
    <InputSurface
      bind:value={pageState.inputValue}
      focusSignal={pageState.shouldFocusInput}
      onSubmit={handleSubmit}
      disabled={pageState.resultState === "loading"}
    />

    <StatusBanner message={pageState.message} />

    <ResultCard
      card={pageState.selected}
      state={pageState.resultState}
      candidates={pageState.candidates}
      focusedCandidateIndex={pageState.focusedCandidateIndex}
      canConfirm={boot?.permissions.canConfirmArrival ?? false}
      canPrint={boot?.permissions.canPrintTokenSlip ?? false}
      onConfirm={handleConfirm}
      onReset={() => pageState.reset()}
      onPrint={() => pageState.selected && boot?.permissions.canPrintTokenSlip && printTokenSlip(pageState.selected)}
      onChoose={handleChoose}
      onMoveCandidateFocus={handleMoveFocus}
    />

    <RecentArrivals context={pageState.context} />
  </main>
</div>
```

```css
:root {
  color: var(--cf-ink);
  background: var(--cf-canvas);
}

html, body {
  min-height: 100%;
  font-family: "Source Sans 3", sans-serif;
  background:
    radial-gradient(circle at top right, rgba(13, 111, 105, 0.05), transparent 28%),
    radial-gradient(circle at left center, rgba(221, 235, 231, 0.8), transparent 32%),
    var(--cf-canvas);
}

body {
  margin: 0;
}
```

- [ ] **Step 4: Run e2e plus typecheck to verify the stabilized page shell passes**

Run: `npm run test:e2e -- tests/arrival-counter.spec.ts --grep "single working column" && npm run check`
Expected: PASS for the new layout check and `svelte-check found 0 errors and 0 warnings`.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/routes/app.css frontend/head-app/src/routes/arrival-counter/+page.svelte frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "feat: stabilize arrival counter page shell"
```

### Task 2: Make The Header Quiet And Operational

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/HeaderBar.svelte`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write the failing e2e expectation for quiet header chips and exact stat labels**

```ts
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
```

- [ ] **Step 2: Run the header-focused e2e test**

Run: `npm run test:e2e -- tests/arrival-counter.spec.ts --grep "quiet header"`
Expected: FAIL or insufficient coverage for the stabilized header presentation.

- [ ] **Step 3: Replace the dashboard-like header tiles with quieter chips and restrained stats**

```svelte
<header class="grid gap-4 rounded-[1.5rem] border border-[#d9ddd8] bg-white/88 p-5 shadow-panel lg:grid-cols-[1.8fr_auto] lg:items-start">
  <div class="min-w-0">
    <div class="font-display text-[1.75rem] font-bold text-[#10211f]">Arrival Counter</div>
    <div class="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
      <span class="rounded-full border border-[#d9ddd8] bg-[#f1ece5] px-3 py-1.5">Active: {context?.current_session?.session_name ?? "No active session"}</span>
      <span class="rounded-full border border-[#d9ddd8] bg-white px-3 py-1.5">Next: {context?.next_session?.session_name ?? "No next session"}</span>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-2 sm:min-w-[15rem]">
    <div class="rounded-2xl border border-[#d9ddd8] bg-[#ddebe7] px-4 py-3">
      <div class="font-display text-2xl font-bold text-[#10211f]">{context?.stats.arrived ?? 0}</div>
      <div class="text-sm text-slate-600">Arrived</div>
    </div>
    <div class="rounded-2xl border border-[#d9ddd8] bg-[#f1ece5] px-4 py-3">
      <div class="font-display text-2xl font-bold text-[#10211f]">{context?.stats.awaiting_arrival ?? 0}</div>
      <div class="text-sm text-slate-600">Awaiting Arrival</div>
    </div>
  </div>
</header>
```

- [ ] **Step 4: Run e2e to verify exact copy and quiet-header structure**

Run: `npm run test:e2e -- tests/arrival-counter.spec.ts --grep "quiet header"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/HeaderBar.svelte frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "feat: quiet arrival counter header context"
```

### Task 3: Promote The Scan/Search Input To The Idle-State Anchor

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write the failing test for accurate placeholder copy and focus-ready input**

```ts
test("uses the stabilized scan-first placeholder copy and restores input focus after reset", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 0 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });

  await page.goto("/arrival-counter");
  const input = page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number");
  await expect(input).toBeFocused();
});
```

- [ ] **Step 2: Run the focused placeholder/focus e2e test**

Run: `npm run test:e2e -- tests/arrival-counter.spec.ts --grep "scan-first placeholder copy"`
Expected: FAIL because the current placeholder still says `Scan barcode or enter patient ID`.

- [ ] **Step 3: Restyle the input surface and update the placeholder copy**

```svelte
<section class="rounded-[1.5rem] border border-[#d9ddd8] bg-white/95 p-6 shadow-panel lg:p-7">
  <label for="arrival-scan-input" class="mb-3 block font-display text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
    Scan or Search
  </label>
  <div class="flex items-center gap-3 rounded-[1.25rem] border border-[#d9ddd8] bg-[#f6f5f1] px-5 py-4 transition-colors focus-within:border-[#0d6f69] focus-within:ring-2 focus-within:ring-[#0d6f69]/20 lg:px-6 lg:py-5">
    <input
      id="arrival-scan-input"
      bind:this={inputEl}
      bind:value
      class="w-full border-0 bg-transparent p-0 text-lg text-[#10211f] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2 lg:text-[1.35rem]"
      placeholder="Scan QR code or enter patient name, child name, or mobile number"
      {disabled}
      onkeydown={handleKeydown}
    />
    <button class="cursor-pointer rounded-xl border border-[#0d6f69] bg-[#0d6f69] px-4 py-2.5 text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={submit} {disabled}>
      Go
    </button>
  </div>
</section>
```

- [ ] **Step 4: Run e2e and confirm the new placeholder and focus behavior**

Run: `npm run test:e2e -- tests/arrival-counter.spec.ts --grep "scan-first placeholder copy"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "feat: sharpen arrival counter input surface"
```

### Task 4: Rebuild The Result Card As One Stable Decision Surface

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write failing e2e checks for action hierarchy and multiple-match shell stability**

```ts
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
```

- [ ] **Step 2: Run the result-card focused e2e test**

Run: `npm run test:e2e -- tests/arrival-counter.spec.ts --grep "shared result-card shell"`
Expected: FAIL or expose missing action-hierarchy coverage.

- [ ] **Step 3: Rework the result card and candidate rows to preserve one stable shell**

```svelte
<section data-testid="arrival-result-card" class="min-h-[21rem] rounded-[1.5rem] border border-[#d9ddd8] bg-white p-6 shadow-panel lg:p-7">
  {#if state === "idle"}
    <div class="flex h-full items-center justify-center text-center text-slate-500">Scan a QR code or search for a patient to begin.</div>
  {:else if state === "loading"}
    <div class="flex h-full items-center justify-center gap-3 text-slate-500">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0d6f69]"></div>
      <span>Looking up patient...</span>
    </div>
  {:else if state === "no-match"}
    <div class="flex h-full flex-col justify-between gap-6">
      <div>
        <div class="text-sm uppercase tracking-[0.18em] text-slate-500">No match</div>
        <div class="mt-4 text-2xl font-semibold text-[#10211f]">No patient found</div>
        <div class="mt-3 text-base text-slate-600">Check the QR code, patient name, child name, or mobile number and try again.</div>
      </div>
      <div class="flex flex-wrap gap-3">
        <button class="rounded-2xl border border-[#d9ddd8] px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onReset()}>Start over</button>
      </div>
    </div>
  {:else if state === "multiple"}
    <MultipleMatchesList {candidates} {focusedCandidateIndex} onChoose={onChoose} onMoveFocus={onMoveCandidateFocus} />
  {:else if card}
    <div class="flex h-full flex-col justify-between gap-6">
      <div>
        <div class="text-sm uppercase tracking-[0.18em] text-slate-500">{card.state_label}</div>
        <div class="mt-3 font-display text-[3.75rem] font-extrabold leading-none text-[#10211f]">{card.display_token}</div>
        <div class="mt-4 text-[2rem] font-semibold leading-tight text-[#10211f]">{card.patient_name}</div>
        <div class="mt-3 text-base text-slate-600">{card.visit_label}</div>
      </div>
      <div class="flex flex-wrap gap-3">
        {#if state === "pre-confirm"}
          {#if canConfirm}
            <button class="cursor-pointer rounded-2xl bg-[#0d6f69] px-5 py-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onConfirm()}>Confirm Arrival</button>
          {/if}
          <button class="cursor-pointer rounded-2xl px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onReset()}>Not this patient</button>
        {:else}
          {#if state === "already-arrived"}
            <div class="rounded-2xl bg-[#ddebe7] px-5 py-3 font-semibold text-[#10211f]">Already checked in</div>
          {/if}
          {#if canPrint}
            <button class="cursor-pointer rounded-2xl border border-[#d9ddd8] bg-white px-5 py-3 font-semibold text-[#10211f] focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onPrint()}>Print Token Slip</button>
          {/if}
          <button class="cursor-pointer rounded-2xl px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onReset()}>Next patient</button>
        {/if}
      </div>
    </div>
  {/if}
</section>
```

```svelte
<div class="flex h-full flex-col justify-between gap-6">
  <div>
    <div class="font-display text-lg font-semibold text-[#10211f]">Select patient</div>
    <div class="text-sm text-slate-500">Use arrow keys, then Enter.</div>
  </div>
  <div class="space-y-3">
    {#each candidates as candidate, index (candidate.queue_entry)}
      <button
        class="flex w-full cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2"
        class:border-[#0d6f69]={index === focusedCandidateIndex}
        class:border-[#d9ddd8]={index !== focusedCandidateIndex}
        aria-label={`Select ${candidate.display_token} ${candidate.patient_name}`}
        tabindex={index === focusedCandidateIndex ? 0 : -1}
        onkeydown={(event) => handleKeydown(event, candidate)}
        onclick={() => onChoose(candidate)}>
        <div>
          <div class="font-display font-semibold text-[#10211f]">{candidate.display_token}</div>
          <div class="text-sm text-slate-600">{candidate.patient_name}</div>
        </div>
        <div class="text-sm text-slate-500">{candidate.visit_label}</div>
      </button>
    {/each}
  </div>
</div>
```

- [ ] **Step 4: Run e2e plus unit coverage for keyboard selection**

Run: `npm run test:e2e -- tests/arrival-counter.spec.ts --grep "shared result-card shell" && npm run test -- src/lib/arrival-counter/state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte frontend/head-app/tests/arrival-counter.spec.ts frontend/head-app/src/lib/arrival-counter/state.test.ts
git commit -m "feat: stabilize arrival counter result card states"
```

### Task 5: Quiet Recent Arrivals And Degraded Banner Behavior

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/RecentArrivals.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/StatusBanner.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/types.ts`
- Test: `frontend/head-app/src/lib/arrival-counter/state.test.ts`
- Test: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write a failing unit test for preserving context while showing a degraded banner message**

```ts
it("keeps current context when refresh fails and preserves the visible decision state", async () => {
  const state = new ArrivalCounterState();
  state.context = {
    has_active: true,
    stats: { arrived: 1, awaiting_arrival: 2 },
    current_session: null,
    next_session: null,
    recent_arrivals: [],
  };
  vi.mocked(getArrivalSessionContext).mockRejectedValueOnce(new Error("Network connection failed. Retry when the connection is stable."));

  await state.refreshContext();

  expect(state.context?.stats.arrived).toBe(1);
});
```

- [ ] **Step 2: Run the unit test to verify current degraded handling is under-specified**

Run: `npm run test -- src/lib/arrival-counter/state.test.ts`
Expected: FAIL or missing explicit degraded-state assertion coverage.

- [ ] **Step 3: Restyle recent arrivals and keep degraded banners low-disruption**

```svelte
<section class="rounded-[1.5rem] border border-[#d9ddd8] bg-white/78 p-5">
  <div class="mb-4 font-display text-lg font-semibold text-[#10211f]">Recent Arrivals</div>

  {#if !context?.recent_arrivals.length}
    <p class="text-sm text-slate-500">No arrivals captured yet for the current session.</p>
  {:else}
    <div class="space-y-2.5">
      {#each context.recent_arrivals as row (row.queue_entry)}
        <div class="flex items-center justify-between rounded-2xl border border-[#e4e7e3] bg-[#f6f5f1] px-4 py-3">
          <div class="min-w-0">
            <div class="font-display text-base font-semibold text-[#10211f]">{row.display_token}</div>
            <div class="truncate text-sm text-slate-600" title={row.patient_name}>{row.patient_name}</div>
          </div>
          <div class="ml-4 text-right text-sm text-slate-500">
            <div>{row.status}</div>
            <div>{row.arrived_at}</div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
```

```svelte
{#if message}
  <div class="rounded-xl border border-[#eadfca] bg-[#f8f4ec] px-4 py-3 text-sm text-[#6e5a3c]" role="alert">
    {message}
  </div>
{/if}
```

```ts
async refreshContext() {
  try {
    this.context = await getArrivalSessionContext();
  } catch {
    // stale-while-revalidate: keep current context on error
  }
}
```

- [ ] **Step 4: Run unit and e2e coverage for quiet support surfaces**

Run: `npm run test -- src/lib/arrival-counter/state.test.ts && npm run test:e2e -- tests/arrival-counter.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/RecentArrivals.svelte frontend/head-app/src/lib/arrival-counter/components/StatusBanner.svelte frontend/head-app/src/lib/arrival-counter/state.svelte.ts frontend/head-app/src/lib/arrival-counter/types.ts frontend/head-app/src/lib/arrival-counter/state.test.ts frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "feat: quiet arrival counter support surfaces"
```

### Task 6: Final Verification, Notes, And Graph Update

**Files:**
- Create: `docs/notes/arrival-counter-ui-stabilization.md`
- Modify: `docs/notes/arrival-counter-v1-frontend.md`

- [ ] **Step 1: Write the implementation note**

```md
# Arrival Counter UI Stabilization

Date: 2026-04-28
Spec: `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md`

## What Changed

- Tightened the standalone Arrival Counter head-app layout to a single dominant working column.
- Reworked the header, input surface, result card, and recent arrivals to match the stabilized UI/product spec.
- Preserved the existing standalone-shell architecture, backend authority, and keyboard-first workflow.

## What Was Verified

- `npm run check`
- `npm run test`
- `npm run test:e2e`
- real Frappe shell smoke where available

## What Stayed Out Of Scope

- no architecture changes
- no backend contract changes
- no new receptionist or doctor surfaces

## Next Integration Step

- Run staff acceptance at `/clinic/arrival-counter` and collect any final polish feedback before broader head-app slice rollout.
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm run check && npm run test && npm run test:e2e && npm run build`
Expected: `svelte-check found 0 errors and 0 warnings`, all Vitest tests pass, all Playwright tests pass, and build output copies into `clinic_flow/public/head-app`.

- [ ] **Step 3: Update the original implementation note with a stabilization addendum and refresh the graph**

Run: `graphify update .`
Expected: graph update completes without API-cost errors.

```md
## UI Stabilization Follow-Up - 2026-04-28

- Aligned the standalone shell UI with the stabilized Arrival Counter UI/product spec.
- Kept architecture, permissions, and backend authority unchanged.
- Verified the scan-first layout, shared result-card shell, and quiet support surfaces through frontend tests.
```

- [ ] **Step 4: Commit notes and finalized frontend build output references**

```bash
git add docs/notes/arrival-counter-ui-stabilization.md docs/notes/arrival-counter-v1-frontend.md frontend/head-app
git commit -m "docs: record arrival counter ui stabilization"
```

- [ ] **Step 5: Final repo verification before handoff**

Run: `git status --short`
Expected: no unintended modified files beyond the planned work.

---

## Self-Review

### Spec Coverage

- Single-column layout and stable hierarchy: Tasks 1, 2, 5
- Shared result-card shell across all 7 states: Task 4
- Scan-first unified input with QR/name/mobile wording: Task 3
- Quiet session context and recent arrivals: Tasks 2 and 5
- Stronger action hierarchy and print gating: Task 4
- Degraded-state feedback without page redesign: Task 5
- Verification, docs note, and graph refresh: Task 6

### Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation markers remain.
- All tasks contain exact file paths, commands, and target code blocks.

### Type Consistency

- `ArrivalCounterState`, `ArrivalSessionContext`, `ArrivalCardRecord`, and the existing route/component names remain consistent with the current codebase.
- No new backend API methods are introduced by this plan.
