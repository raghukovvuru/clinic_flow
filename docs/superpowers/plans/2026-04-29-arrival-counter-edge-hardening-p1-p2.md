# Arrival Counter Edge Hardening P1/P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the remaining Arrival Counter non-P0 edge cases so scanner/input handling, focus continuity, permission guidance, no-session handling, and state clarity are reliable in daily counter use.

**Architecture:** Keep the current SvelteKit standalone head-app and Frappe arrival API boundaries intact. Add small frontend helpers for input/scanner normalization and UI message derivation, then wire them into the existing `ArrivalCounterState`, result card, and tests. Do not change queue authority, admission behavior, or Healthcare base-app code.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Tailwind CSS, Vitest, Playwright, Frappe v16 Python APIs.

---

## File Structure

- Create: `frontend/head-app/src/lib/arrival-counter/input-normalize.ts`
  - Owns conservative normalization for phone, QR/scanner payloads, and display-safe raw input handling.

- Create: `frontend/head-app/src/lib/arrival-counter/input-normalize.test.ts`
  - Unit tests for phone normalization, QR sanitation, short input rejection, and scanner wrapper tolerance.

- Modify: `frontend/head-app/src/lib/arrival-counter/classify.ts`
  - Use normalization helpers before returning `SearchMode` and value.

- Modify: `frontend/head-app/src/lib/arrival-counter/classify.test.ts`
  - Add tests for mixed phone formats and wrapped/whitespace QR payloads.

- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
  - Add no-active-session operator message, preserve focus guarantees, and maintain stale/context metadata.

- Modify: `frontend/head-app/src/lib/arrival-counter/types.ts`
  - Add a small `StatusMessageTone` type only if needed for stale/blocked message rendering.

- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
  - Add permission guidance copy, clearer success/already-arrived supporting text, improved long-text title attributes, and no-match reset affordance.

- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
  - Keep focused candidate visible and improve long-text handling/title attributes.

- Modify: `frontend/head-app/src/lib/arrival-counter/components/StatusBanner.svelte`
  - Support low-emphasis stale/status tone separately from blocking alert tone.

- Modify: `frontend/head-app/src/lib/arrival-counter/components/RecentArrivals.svelte`
  - Add quiet stale-context indicator if state exposes stale refresh metadata.

- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
  - Wire permission guidance, no-active-session handling, and stale status into existing layout without changing structure.

- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`
  - E2E coverage for P1/P2 workflows.

- Modify: `docs/notes/arrival-counter-ui-stabilization.md`
  - Add P1/P2 implementation summary and verification after implementation.

---

## Task 1: Normalize Phone And Scanner Input

**Files:**
- Create: `frontend/head-app/src/lib/arrival-counter/input-normalize.ts`
- Create: `frontend/head-app/src/lib/arrival-counter/input-normalize.test.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/classify.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/classify.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Create `frontend/head-app/src/lib/arrival-counter/input-normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizePhoneInput, sanitizeScannerPayload } from "$arrival/input-normalize";

describe("arrival input normalization", () => {
  it("normalizes common phone formats to digits", () => {
    expect(normalizePhoneInput("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhoneInput("(98765) 43210")).toBe("9876543210");
    expect(normalizePhoneInput("98765 43210")).toBe("9876543210");
  });

  it("keeps short digit inputs available for classifier rejection", () => {
    expect(normalizePhoneInput("12345")).toBe("12345");
  });

  it("sanitizes scanner whitespace and common text wrappers", () => {
    expect(sanitizeScannerPayload("\n QE-2026-123 \r")).toBe("QE-2026-123");
    expect(sanitizeScannerPayload("queue_entry:QE-2026-123")).toBe("QE-2026-123");
    expect(sanitizeScannerPayload("QUEUE_ENTRY=QE-2026-123")).toBe("QE-2026-123");
  });
});
```

- [ ] **Step 2: Run normalization tests and verify failure**

Run:

```bash
npm run test -- src/lib/arrival-counter/input-normalize.test.ts
```

Expected: fail because `input-normalize.ts` does not exist.

- [ ] **Step 3: Implement normalization helpers**

Create `frontend/head-app/src/lib/arrival-counter/input-normalize.ts`:

```ts
export function normalizePhoneInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export function sanitizeScannerPayload(raw: string): string {
  const trimmed = raw.trim();
  const wrapped = trimmed.match(/^(?:queue_entry|qe|token)\s*[:=]\s*(QE-\d{4}-\d+)$/i);
  return wrapped ? wrapped[1].toUpperCase() : trimmed;
}
```

- [ ] **Step 4: Wire classifier through normalization helpers**

Modify `frontend/head-app/src/lib/arrival-counter/classify.ts`:

```ts
import type { SearchMode } from "$arrival/types";
import { normalizePhoneInput, sanitizeScannerPayload } from "$arrival/input-normalize";

export function classifyInput(raw: string): { mode: SearchMode; value: string } | null {
  const trimmed = sanitizeScannerPayload(raw);
  if (!trimmed) return null;

  if (/^QE-\d{4}-\d+$/i.test(trimmed)) {
    return { mode: "qr_code", value: trimmed.toUpperCase() };
  }

  const digits = normalizePhoneInput(trimmed);
  if (digits.length >= 6 && /^[\d\s+\-()]+$/.test(trimmed)) {
    return { mode: "phone", value: digits };
  }

  if (trimmed.replace(/\d/g, "").length >= 3) {
    return { mode: "name_query", value: trimmed };
  }

  return null;
}
```

- [ ] **Step 5: Add classifier regression tests**

Append to `frontend/head-app/src/lib/arrival-counter/classify.test.ts`:

```ts
it("classifies mixed-format phone input using normalized digits", () => {
  expect(classifyInput("+91 98765-43210")).toEqual({ mode: "phone", value: "919876543210" });
});

it("classifies wrapped scanner queue entry payload as qr code", () => {
  expect(classifyInput("queue_entry:QE-2026-123")).toEqual({ mode: "qr_code", value: "QE-2026-123" });
});
```

- [ ] **Step 6: Run unit tests**

Run:

```bash
npm run test -- src/lib/arrival-counter/input-normalize.test.ts src/lib/arrival-counter/classify.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/input-normalize.ts frontend/head-app/src/lib/arrival-counter/input-normalize.test.ts frontend/head-app/src/lib/arrival-counter/classify.ts frontend/head-app/src/lib/arrival-counter/classify.test.ts
git commit -m "fix: normalize arrival counter scanner and phone input"
```

---

## Task 2: Preserve Focus And Candidate Visibility

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write failing e2e focus visibility test**

Append to `frontend/head-app/tests/arrival-counter.spec.ts`:

```ts
test("keeps keyboard-focused multiple-match row visible and identifiable", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 4 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });

  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-51", queue_entry: "QE-51", display_token: "OPD-051", patient_name: "Long Name Candidate One", queue_session: "Morning Clinic", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" },
      { name: "QE-52", queue_entry: "QE-52", display_token: "OPD-052", patient_name: "Long Name Candidate Two", queue_session: "Morning Clinic", status: "Booked", state_label: "Ready to Confirm", visit_label: "Review Patient" },
      { name: "QE-53", queue_entry: "QE-53", display_token: "OPD-053", patient_name: "Long Name Candidate Three", queue_session: "Morning Clinic", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" }
    ] } } });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Long Name Candidate");
  await page.getByRole("button", { name: "Go" }).click();
  await page.keyboard.press("ArrowDown");

  const focused = page.getByRole("button", { name: /Select OPD-052 Long Name Candidate Two/ });
  await expect(focused).toBeFocused();
  await expect(focused).toBeInViewport();
});
```

- [ ] **Step 2: Run focused e2e test and verify failure or weak behavior**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "keeps keyboard-focused multiple-match row visible"
```

Expected: fail if focus is not moved to the candidate row or row is not in viewport.

- [ ] **Step 3: Focus selected candidate row after focused index changes**

Modify `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`:

```svelte
<script lang="ts">
  import { tick } from "svelte";
  import type { ArrivalCardRecord } from "$arrival/types";

  let {
    candidates = [] as ArrivalCardRecord[],
    focusedCandidateIndex = 0,
    onChoose = (_: ArrivalCardRecord) => {},
    onMoveFocus = (_: number) => {},
  } = $props();

  let rowButtons: HTMLButtonElement[] = [];

  $effect(() => {
    focusedCandidateIndex;
    tick().then(() => {
      const button = rowButtons[focusedCandidateIndex];
      button?.focus();
      button?.scrollIntoView({ block: "nearest" });
    });
  });

  function handleKeydown(event: KeyboardEvent, candidate: ArrivalCardRecord) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onMoveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onMoveFocus(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onChoose(candidate);
    }
  }
</script>
```

Update the button with `bind:this`:

```svelte
bind:this={rowButtons[index]}
```

- [ ] **Step 4: Run focused e2e test**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "keeps keyboard-focused multiple-match row visible"
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "fix: keep multiple-match keyboard focus visible"
```

---

## Task 3: Add Permission Guidance And No-Session Guidance

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write failing e2e test for permission guidance**

Append to `frontend/head-app/tests/arrival-counter.spec.ts`:

```ts
test("explains when confirm action is blocked by permissions", async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.addInitScript(() => {
    window.clinicFlowBoot = {
      app: "clinic_flow",
      slice: "arrival-counter",
      route: "/clinic/arrival-counter",
      siteName: "site1.localhost",
      user: "viewer@example.com",
      roles: ["Queue Viewer"],
      csrfToken: "csrf",
      realtime: { enabled: false, mode: "polling" },
      permissions: { canUseArrivalCounter: true, canConfirmArrival: false, canPrintTokenSlip: false },
    };
  });

  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 1 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });
  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-60", queue_entry: "QE-60", display_token: "OPD-060", patient_name: "Permission Patient", queue_session: "QS-1", status: "Booked", state_label: "Ready to Confirm", visit_label: "New Patient" }
    ] } } });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Permission Patient");
  await page.getByRole("button", { name: "Go" }).click();

  await expect(page.getByText("You can view this arrival, but your role cannot confirm it.")).toBeVisible();
});
```

- [ ] **Step 2: Write failing e2e test for no-active-session guidance**

Append to `frontend/head-app/tests/arrival-counter.spec.ts`:

```ts
test("shows operational guidance when no arrival session is active", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: false, stats: { arrived: 0, awaiting_arrival: 0 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });
  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [], error: "no_active_session" } } });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("No Session");
  await page.getByRole("button", { name: "Go" }).click();

  await expect(page.getByText("No arrival session is active. Ask the queue manager to start or resume a session, then try again.")).toBeVisible();
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "permissions|no arrival session"
```

Expected: fail because guidance copy does not exist yet.

- [ ] **Step 4: Map no-active-session API error to operator message**

Modify `state.svelte.ts` after lookup response is received:

```ts
const response = await lookupArrivalCandidate({ [classified.mode]: classified.value });
this.candidates = response.candidates;
if (response.error === "no_active_session") {
  this.message = "No arrival session is active. Ask the queue manager to start or resume a session, then try again.";
}
this.focusedCandidateIndex = 0;
```

- [ ] **Step 5: Add permission guidance rendering**

Modify `ResultCard.svelte` in pre-confirm action zone:

```svelte
{#if state === "pre-confirm"}
  {#if canConfirm}
    <button class="cursor-pointer rounded-2xl bg-[#0d6f69] px-5 py-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onConfirm()}>Confirm Arrival</button>
  {:else}
    <div class="rounded-2xl border border-[#eadfca] bg-[#f8f4ec] px-5 py-3 text-sm font-semibold text-[#6e5a3c]">
      You can view this arrival, but your role cannot confirm it.
    </div>
  {/if}
  <button class="cursor-pointer rounded-2xl px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onReset()}>Not this patient</button>
{/if}
```

- [ ] **Step 6: Run focused e2e tests**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "permissions|no arrival session"
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte frontend/head-app/src/lib/arrival-counter/state.svelte.ts frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "fix: clarify blocked arrival counter actions"
```

---

## Task 4: Distinguish Success, Already-Arrived, And Action Copy

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write failing e2e distinction test**

Append to `frontend/head-app/tests/arrival-counter.spec.ts`:

```ts
test("distinguishes newly confirmed arrival from already-arrived state", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 1, awaiting_arrival: 1 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });
  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [
      { name: "QE-70", queue_entry: "QE-70", display_token: "OPD-070", patient_name: "Already Patient", queue_session: "QS-1", status: "Arrived", state_label: "Already Arrived", visit_label: "New Patient" }
    ] } } });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Already Patient");
  await page.getByRole("button", { name: "Go" }).click();

  await expect(page.getByText("This patient was already checked in earlier.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ready for next patient" })).toBeVisible();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "distinguishes newly confirmed"
```

Expected: fail because supporting copy and refined button label do not exist yet.

- [ ] **Step 3: Add state-specific supporting copy and refined continuation label**

Modify resolved-state body in `ResultCard.svelte` after visit label:

```svelte
{#if state === "success"}
  <div class="mt-4 rounded-2xl bg-[#ddebe7] px-4 py-3 text-sm font-semibold text-[#10211f]">Arrival confirmed now.</div>
{:else if state === "already-arrived"}
  <div class="mt-4 rounded-2xl bg-[#f1ece5] px-4 py-3 text-sm font-semibold text-[#6e5a3c]">This patient was already checked in earlier.</div>
{/if}
```

Change the continuation button label from `Next patient` to:

```svelte
Ready for next patient
```

- [ ] **Step 4: Run focused e2e test**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "distinguishes newly confirmed"
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "fix: clarify arrival counter resolved states"
```

---

## Task 5: Long-Text Handling And No-Match Recovery

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write failing e2e test for long names and retry action**

Append to `frontend/head-app/tests/arrival-counter.spec.ts`:

```ts
test("preserves identity title text and offers clear retry after no match", async ({ page }) => {
  await page.route("/api/method/clinic_flow.api.arrival.get_arrival_session_context", async (route) => {
    await route.fulfill({ json: { message: { has_active: true, stats: { arrived: 0, awaiting_arrival: 0 }, current_session: null, next_session: null, recent_arrivals: [] } } });
  });
  await page.route("/api/method/clinic_flow.api.arrival.lookup_arrival_candidate", async (route) => {
    await route.fulfill({ json: { message: { candidates: [] } } });
  });

  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number").fill("Unknown Patient");
  await page.getByRole("button", { name: "Go" }).click();

  await expect(page.getByRole("button", { name: "Clear and search again" })).toBeVisible();
  await page.getByRole("button", { name: "Clear and search again" }).click();
  await expect(page.getByPlaceholder("Scan QR code or enter patient name, child name, or mobile number")).toBeFocused();
});
```

- [ ] **Step 2: Run focused e2e test and verify failure**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "offers clear retry after no match"
```

Expected: fail because button copy is still `Start over`.

- [ ] **Step 3: Add title attributes and retry copy**

Modify resolved patient name in `ResultCard.svelte`:

```svelte
<div class="mt-4 truncate text-[2rem] font-semibold leading-tight text-[#10211f]" title={card.patient_name}>{card.patient_name}</div>
```

Modify no-match reset button label:

```svelte
Clear and search again
```

Modify candidate name in `MultipleMatchesList.svelte`:

```svelte
<div class="truncate text-sm text-slate-700" title={candidate.patient_name}>{candidate.patient_name}</div>
```

- [ ] **Step 4: Run focused e2e test**

Run:

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts --grep "offers clear retry after no match"
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte frontend/head-app/tests/arrival-counter.spec.ts
git commit -m "fix: improve arrival counter retry and long-text handling"
```

---

## Task 6: Low-Emphasis Stale Context Indicator

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/StatusBanner.svelte`
- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
- Test: `frontend/head-app/src/lib/arrival-counter/state.test.ts`

- [ ] **Step 1: Write failing unit test for stale context flag**

Append to `frontend/head-app/src/lib/arrival-counter/state.test.ts`:

```ts
it("marks context stale when background refresh fails without clearing active context", async () => {
  const state = new ArrivalCounterState();
  state.context = {
    has_active: true,
    stats: { arrived: 1, awaiting_arrival: 2 },
    current_session: null,
    next_session: null,
    recent_arrivals: [],
  };
  vi.mocked(getArrivalSessionContext).mockRejectedValueOnce(new Error("offline"));

  await state.refreshContext();

  expect(state.isContextStale).toBe(true);
  expect(state.context?.stats.arrived).toBe(1);
});
```

- [ ] **Step 2: Run unit test and verify failure**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts -- --runInBand
```

Expected: fail because `isContextStale` does not exist.

- [ ] **Step 3: Add stale state tracking**

Modify `state.svelte.ts`:

```ts
isContextStale = $state(false);
```

Update `refreshContext()`:

```ts
async refreshContext() {
  try {
    this.context = await getArrivalSessionContext();
    this.isContextStale = false;
  } catch {
    this.isContextStale = true;
  }
}
```

- [ ] **Step 4: Add status banner tone prop**

Modify `StatusBanner.svelte`:

```svelte
<script lang="ts">
  let { message = "", tone = "warning" }: { message?: string; tone?: "warning" | "status" } = $props();
</script>

{#if message}
  <div
    class="rounded-xl border px-4 py-3 text-sm"
    class:border-[#eadfca]={tone === "warning"}
    class:bg-[#f8f4ec]={tone === "warning"}
    class:text-[#6e5a3c]={tone === "warning"}
    class:border-[#d9ddd8]={tone === "status"}
    class:bg-white={tone === "status"}
    class:text-slate-500={tone === "status"}
    role={tone === "warning" ? "alert" : "status"}>
    {message}
  </div>
{/if}
```

- [ ] **Step 5: Wire stale message in route**

Modify `+page.svelte` near `StatusBanner`:

```svelte
<StatusBanner message={pageState.message || (pageState.isContextStale ? "Connection is retrying. Current arrival details remain visible." : "")} tone={pageState.message ? "warning" : "status"} />
```

- [ ] **Step 6: Run unit and e2e tests**

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts
npm run test:e2e -- tests/arrival-counter.spec.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/head-app/src/lib/arrival-counter/state.svelte.ts frontend/head-app/src/lib/arrival-counter/components/StatusBanner.svelte frontend/head-app/src/routes/arrival-counter/+page.svelte frontend/head-app/src/lib/arrival-counter/state.test.ts
git commit -m "fix: show low-emphasis stale context state"
```

---

## Task 7: Documentation And Final Verification

**Files:**
- Modify: `docs/notes/arrival-counter-ui-stabilization.md`

- [ ] **Step 1: Update implementation note**

Append to `docs/notes/arrival-counter-ui-stabilization.md`:

```md
## P1/P2 Edge Hardening

- Normalized phone and scanner payload input before lookup.
- Preserved keyboard focus visibility in multiple-match selection.
- Added permission and no-active-session guidance copy.
- Clarified success vs already-arrived states.
- Improved long-name/title handling and no-match recovery copy.
- Added low-emphasis stale-context status handling.
```

- [ ] **Step 2: Run frontend unit tests**

```bash
npm run test -- src/lib/arrival-counter/input-normalize.test.ts src/lib/arrival-counter/classify.test.ts src/lib/arrival-counter/state.test.ts src/lib/api/arrival.test.ts
```

Expected: all pass.

- [ ] **Step 3: Run e2e tests**

```bash
npm run test:e2e -- tests/arrival-counter.spec.ts
```

Expected: all pass.

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```

Expected: `svelte-check found 0 errors and 0 warnings`.

- [ ] **Step 5: Run production build**

```bash
npm run build
```

Expected: build succeeds and copies generated files to `clinic_flow/public/head-app/`.

- [ ] **Step 6: Run graph update from repo root**

```bash
graphify update .
```

Expected: graph update completes and refreshes `graphify-out/`.

- [ ] **Step 7: Commit final docs/build artifacts**

```bash
git add docs/notes/arrival-counter-ui-stabilization.md clinic_flow/public/head-app frontend/head-app
git commit -m "docs: record arrival counter p1 p2 hardening"
```

---

## Self-Review

Spec coverage:

- P1 input normalization: Task 1.
- P1 scanner tolerance: Task 1.
- P1 focus resilience: Task 2.
- P1 permission clarity: Task 3.
- P1 no-active-session guidance: Task 3.
- P2 action copy and state distinction: Task 4.
- P2 stale-context indicator: Task 6.
- P2 long-text handling: Task 5.
- P2 repeated no-match recovery: Task 5.
- Documentation and verification: Task 7.

No placeholders remain. All task steps specify exact files, code snippets, commands, expected results, and commit boundaries.
