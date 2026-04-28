# Arrival Counter Standalone Shell — Frontend Plan

> **Source plan:** `docs/superpowers/plans/2026-04-28-arrival-counter-standalone-shell.md`
> **Parallel sibling:** `docs/superpowers/plans/2026-04-28-arrival-counter-standalone-shell-backend.md`
> **Integration:** Backend plan must complete B2 (Frappe route registered) before the real Frappe shell smoke test in F7 step 7. All other frontend tasks have zero backend source dependencies.

**Goal:** Frontend half — boot validation, API client CSRF switch, response validation, transport isolation, keyboard-first state/UI, print security, build configuration, and tests.

**Workdir:** `frontend/head-app`

---

## Task F1: Frontend Boot Adapter And Runtime Validation

**Files:**
- Create: `frontend/head-app/src/lib/boot/boot.ts`
- Create: `frontend/head-app/src/lib/boot/boot.test.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/types.ts`

- [ ] **Step 1: Write failing boot adapter tests first**

Create `frontend/head-app/src/lib/boot/boot.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getClinicFlowBoot, resetBootForTests } from "./boot";

const validBoot = {
  app: "clinic_flow",
  slice: "arrival-counter",
  route: "/clinic/arrival-counter",
  siteName: "site1.localhost",
  user: "staff@example.com",
  roles: ["Queue Manager"],
  csrfToken: "csrf-123",
  realtime: { enabled: false, mode: "polling" },
  permissions: {
    canUseArrivalCounter: true,
    canConfirmArrival: true,
    canPrintTokenSlip: true,
  },
};

describe("getClinicFlowBoot", () => {
  beforeEach(() => {
    resetBootForTests();
    delete (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot;
  });

  it("returns a valid boot object", () => {
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = validBoot;
    expect(getClinicFlowBoot().csrfToken).toBe("csrf-123");
  });

  it("rejects a missing boot object", () => {
    expect(() => getClinicFlowBoot()).toThrow("Arrival Counter boot data is missing");
  });

  it("rejects the wrong slice", () => {
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = { ...validBoot, slice: "other" };
    expect(() => getClinicFlowBoot()).toThrow("Arrival Counter boot data is invalid");
  });

  it("rejects a missing CSRF token", () => {
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = { ...validBoot, csrfToken: "" };
    expect(() => getClinicFlowBoot()).toThrow("Arrival Counter boot data is invalid");
  });

  it("rejects route permission denial", () => {
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = {
      ...validBoot,
      permissions: { ...validBoot.permissions, canUseArrivalCounter: false },
    };
    expect(() => getClinicFlowBoot()).toThrow("Arrival Counter access is not permitted");
  });
});
```

- [ ] **Step 2: Run boot tests to verify they fail**

```bash
npm run test -- src/lib/boot/boot.test.ts
```

Expected: FAIL because `src/lib/boot/boot.ts` does not exist.

- [ ] **Step 3: Add boot types**

Append to `frontend/head-app/src/lib/arrival-counter/types.ts`:

```ts
export type ArrivalRealtimeMode = "frappe" | "polling" | "disabled";

export interface ArrivalCounterBoot {
  app: "clinic_flow";
  slice: "arrival-counter";
  route: "/clinic/arrival-counter";
  siteName: string;
  user: string;
  roles: string[];
  csrfToken: string;
  realtime: {
    enabled: boolean;
    mode: ArrivalRealtimeMode;
  };
  permissions: {
    canUseArrivalCounter: boolean;
    canConfirmArrival: boolean;
    canPrintTokenSlip: boolean;
  };
}
```

- [ ] **Step 4: Implement the boot adapter**

Create `frontend/head-app/src/lib/boot/boot.ts`:

```ts
import type { ArrivalCounterBoot, ArrivalRealtimeMode } from "$arrival/types";

declare global {
  interface Window {
    clinicFlowBoot?: unknown;
  }
}

let cachedBoot: ArrivalCounterBoot | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRealtimeMode(value: unknown): value is ArrivalRealtimeMode {
  return value === "frappe" || value === "polling" || value === "disabled";
}

export function parseArrivalCounterBoot(raw: unknown): ArrivalCounterBoot {
  if (!isRecord(raw)) throw new Error("Arrival Counter boot data is missing");

  const realtime = raw.realtime;
  const permissions = raw.permissions;
  if (!isRecord(realtime) || !isRecord(permissions)) {
    throw new Error("Arrival Counter boot data is invalid");
  }

  const boot = {
    app: raw.app,
    slice: raw.slice,
    route: raw.route,
    siteName: raw.siteName,
    user: raw.user,
    roles: raw.roles,
    csrfToken: raw.csrfToken,
    realtime,
    permissions,
  };

  const valid =
    boot.app === "clinic_flow" &&
    boot.slice === "arrival-counter" &&
    boot.route === "/clinic/arrival-counter" &&
    typeof boot.siteName === "string" &&
    boot.siteName.length > 0 &&
    typeof boot.user === "string" &&
    boot.user.length > 0 &&
    isStringArray(boot.roles) &&
    typeof boot.csrfToken === "string" &&
    boot.csrfToken.length > 0 &&
    typeof realtime.enabled === "boolean" &&
    isRealtimeMode(realtime.mode) &&
    typeof permissions.canUseArrivalCounter === "boolean" &&
    typeof permissions.canConfirmArrival === "boolean" &&
    typeof permissions.canPrintTokenSlip === "boolean";

  if (!valid) throw new Error("Arrival Counter boot data is invalid");
  if (!permissions.canUseArrivalCounter) throw new Error("Arrival Counter access is not permitted");

  return boot as ArrivalCounterBoot;
}

export function getClinicFlowBoot(): ArrivalCounterBoot {
  if (!cachedBoot) cachedBoot = parseArrivalCounterBoot(window.clinicFlowBoot);
  return cachedBoot;
}

export function resetBootForTests() {
  cachedBoot = null;
}
```

- [ ] **Step 5: Run boot tests**

```bash
npm run test -- src/lib/boot/boot.test.ts
```

Expected: PASS, 5 tests pass.

- [ ] **Step 6: Commit this task**

```bash
git add frontend/head-app/src/lib/boot frontend/head-app/src/lib/arrival-counter/types.ts && git commit -m "feat: add arrival counter boot validation"
```

---

## Task F2: API Client CSRF Switch And Error Normalization

**Files:**
- Modify: `frontend/head-app/src/lib/api/client.ts`
- Create: `frontend/head-app/src/lib/api/client.test.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/types.ts`

- [ ] **Step 1: Write failing API client tests first**

Create `frontend/head-app/src/lib/api/client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callFrappe, FrappeClientError } from "./client";
import { resetBootForTests } from "$lib/boot/boot";

const boot = {
  app: "clinic_flow",
  slice: "arrival-counter",
  route: "/clinic/arrival-counter",
  siteName: "site1.localhost",
  user: "staff@example.com",
  roles: ["Queue Manager"],
  csrfToken: "boot-csrf-token",
  realtime: { enabled: false, mode: "polling" },
  permissions: {
    canUseArrivalCounter: true,
    canConfirmArrival: true,
    canPrintTokenSlip: true,
  },
};

describe("callFrappe", () => {
  beforeEach(() => {
    resetBootForTests();
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = boot;
    vi.restoreAllMocks();
  });

  it("sends the boot CSRF token, not window.frappe", async () => {
    (window as typeof window & { frappe?: { csrf_token?: string } }).frappe = { csrf_token: "wrong-token" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ message: { ok: true } }), { status: 200 }));

    await callFrappe<{ ok: boolean }>("clinic_flow.api.arrival.get_arrival_session_context", {});

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Frappe-CSRF-Token"]).toBe("boot-csrf-token");
  });

  it("normalizes forbidden responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ exc_type: "PermissionError" }), { status: 403 }));

    await expect(callFrappe("clinic_flow.api.arrival.get_arrival_session_context", {})).rejects.toMatchObject({
      category: "forbidden",
      status: 403,
    });
  });

  it("normalizes validation responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ _server_messages: '[{"message":"Phone is too short"}]' }), { status: 417 }));

    await expect(callFrappe("clinic_flow.api.arrival.lookup_arrival_candidate", {})).rejects.toMatchObject({
      category: "validation",
      message: "Phone is too short",
    });
  });
});
```

- [ ] **Step 2: Run API client tests to verify they fail**

```bash
npm run test -- src/lib/api/client.test.ts
```

Expected: FAIL because `client.ts` does not export `FrappeClientError` and still reads `window.frappe?.csrf_token`.

- [ ] **Step 3: Add normalized error types**

Append to `frontend/head-app/src/lib/arrival-counter/types.ts`:

```ts
export type ArrivalErrorCategory =
  | "unauthenticated"
  | "forbidden"
  | "csrf"
  | "validation"
  | "network"
  | "stale"
  | "unknown";

export interface ArrivalClientErrorShape {
  category: ArrivalErrorCategory;
  status: number;
  message: string;
}
```

- [ ] **Step 4: Replace the API client implementation**

Modify `frontend/head-app/src/lib/api/client.ts`:

```ts
import { getClinicFlowBoot } from "$lib/boot/boot";
import type { ArrivalClientErrorShape, ArrivalErrorCategory } from "$arrival/types";

type FrappeErrorPayload = {
  exc_type?: string;
  exception?: string;
  _server_messages?: string;
  message?: unknown;
};

export class FrappeClientError extends Error implements ArrivalClientErrorShape {
  category: ArrivalErrorCategory;
  status: number;

  constructor(shape: ArrivalClientErrorShape) {
    super(shape.message);
    this.name = "FrappeClientError";
    this.category = shape.category;
    this.status = shape.status;
  }
}

function categoryFromStatus(status: number, payload: FrappeErrorPayload): ArrivalErrorCategory {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 417) return payload.exc_type === "CSRFTokenError" ? "csrf" : "validation";
  return "unknown";
}

function messageFromPayload(payload: FrappeErrorPayload, fallback: string): string {
  if (typeof payload._server_messages === "string") {
    try {
      const parsed = JSON.parse(payload._server_messages) as Array<{ message?: string }>;
      const message = parsed.find((item) => typeof item.message === "string")?.message;
      if (message) return message.replace(/<[^>]*>/g, "");
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function readJson(response: Response): Promise<FrappeErrorPayload> {
  try {
    return (await response.json()) as FrappeErrorPayload;
  } catch {
    return {};
  }
}

export async function callFrappe<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const boot = getClinicFlowBoot();
  let response: Response;

  try {
    response = await fetch(`/api/method/${method}`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Frappe-CSRF-Token": boot.csrfToken,
      },
      credentials: "same-origin",
      body: JSON.stringify(args),
    });
  } catch {
    throw new FrappeClientError({ category: "network", status: 0, message: "Network connection failed. Retry when the connection is stable." });
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const category = categoryFromStatus(response.status, payload);
    throw new FrappeClientError({
      category,
      status: response.status,
      message: messageFromPayload(payload, category === "forbidden" ? "Access denied for Arrival Counter." : "Request failed. Try again."),
    });
  }

  if (!("message" in payload)) {
    throw new FrappeClientError({ category: "unknown", status: response.status, message: "Server response was incomplete. Refresh and try again." });
  }

  return payload.message as T;
}
```

- [ ] **Step 5: Run API client tests**

```bash
npm run test -- src/lib/api/client.test.ts
```

Expected: PASS, 3 tests pass.

- [ ] **Step 6: Commit this task**

```bash
git add frontend/head-app/src/lib/api/client.ts frontend/head-app/src/lib/api/client.test.ts frontend/head-app/src/lib/arrival-counter/types.ts && git commit -m "fix: use boot csrf in arrival API client"
```

---

## Task F3: Runtime Validation For Arrival API Responses

**Files:**
- Modify: `frontend/head-app/src/lib/api/arrival.ts`
- Create: `frontend/head-app/src/lib/api/arrival.test.ts`

- [ ] **Step 1: Write failing arrival response validation tests first**

Create `frontend/head-app/src/lib/api/arrival.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getArrivalSessionContext, lookupArrivalCandidate, markArrived } from "./arrival";
import { resetBootForTests } from "$lib/boot/boot";

const boot = {
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

function mockMessage(message: unknown) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ message }), { status: 200 }));
}

describe("arrival API validation", () => {
  beforeEach(() => {
    resetBootForTests();
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = boot;
    vi.restoreAllMocks();
  });

  it("rejects invalid session context", async () => {
    mockMessage({ has_active: true });
    await expect(getArrivalSessionContext()).rejects.toThrow("Arrival session context response is invalid");
  });

  it("accepts valid empty session context", async () => {
    mockMessage({ has_active: false, stats: { arrived: 0, awaiting_arrival: 0 }, current_session: null, next_session: null, recent_arrivals: [] });
    await expect(getArrivalSessionContext()).resolves.toMatchObject({ has_active: false });
  });

  it("rejects invalid lookup candidates", async () => {
    mockMessage({ candidates: [{ queue_entry: "QE-1" }] });
    await expect(lookupArrivalCandidate({ qr_code: "QE-1" })).rejects.toThrow("Arrival candidate response is invalid");
  });

  it("rejects invalid mutation payload", async () => {
    mockMessage({ status: "Arrived", already_arrived: false });
    await expect(markArrived("QE-1")).rejects.toThrow("Arrival mutation response is invalid");
  });
});
```

- [ ] **Step 2: Run validation tests to verify they fail**

```bash
npm run test -- src/lib/api/arrival.test.ts
```

Expected: FAIL because `arrival.ts` does not validate response payloads.

- [ ] **Step 3: Implement hand-written validators**

Modify `frontend/head-app/src/lib/api/arrival.ts`:

```ts
import { callFrappe } from "$api/client";
import type { ArrivalCandidateResponse, ArrivalCardRecord, ArrivalMarkResult, ArrivalSessionContext } from "$arrival/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionContext(value: unknown): value is ArrivalSessionContext {
  return isRecord(value)
    && typeof value.has_active === "boolean"
    && isRecord(value.stats)
    && typeof value.stats.arrived === "number"
    && typeof value.stats.awaiting_arrival === "number"
    && Array.isArray(value.recent_arrivals);
}

function isCardRecord(value: unknown): value is ArrivalCardRecord {
  return isRecord(value)
    && typeof value.queue_entry === "string"
    && typeof value.display_token === "string"
    && typeof value.patient_name === "string"
    && typeof value.queue_session === "string"
    && typeof value.status === "string"
    && typeof value.state_label === "string"
    && typeof value.visit_label === "string"
    && isRecord(value.print_context)
    && typeof value.print_context.display_token === "string"
    && typeof value.print_context.patient_name === "string"
    && typeof value.print_context.qr_svg === "string";
}

function isCandidateResponse(value: unknown): value is ArrivalCandidateResponse {
  return isRecord(value) && Array.isArray(value.candidates) && value.candidates.every(isCardRecord);
}

function isMarkResult(value: unknown): value is ArrivalMarkResult {
  return isRecord(value)
    && typeof value.status === "string"
    && typeof value.already_arrived === "boolean"
    && isCardRecord(value.result_card);
}

export async function getArrivalSessionContext(deptAbbr = "") {
  const response = await callFrappe<unknown>("clinic_flow.api.arrival.get_arrival_session_context", { dept_abbr: deptAbbr });
  if (!isSessionContext(response)) throw new Error("Arrival session context response is invalid");
  return response;
}

export async function lookupArrivalCandidate(input: { qr_code?: string; phone?: string; name_query?: string; dept_abbr?: string }) {
  const response = await callFrappe<unknown>("clinic_flow.api.arrival.lookup_arrival_candidate", input);
  if (!isCandidateResponse(response)) throw new Error("Arrival candidate response is invalid");
  return response;
}

export async function markArrived(queueEntry: string, queueSession = "") {
  const response = await callFrappe<unknown>("clinic_flow.api.arrival.mark_arrived", {
    queue_entry: queueEntry,
    queue_session: queueSession,
  });
  if (!isMarkResult(response)) throw new Error("Arrival mutation response is invalid");
  return response;
}
```

- [ ] **Step 4: Run arrival validation tests**

```bash
npm run test -- src/lib/api/arrival.test.ts
```

Expected: PASS, 4 tests pass.

- [ ] **Step 5: Commit this task**

```bash
git add frontend/head-app/src/lib/api/arrival.ts frontend/head-app/src/lib/api/arrival.test.ts && git commit -m "feat: validate arrival API responses"
```

---

## Task F4: Realtime And Polling Adapter Without Page-Level `window.frappe`

**Files:**
- Modify: `frontend/head-app/src/lib/realtime/frappe-transport.ts`
- Create: `frontend/head-app/src/lib/realtime/frappe-transport.test.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/types.ts`

- [ ] **Step 1: Write failing transport tests first**

Create `frontend/head-app/src/lib/realtime/frappe-transport.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachArrivalTransport } from "./frappe-transport";

describe("attachArrivalTransport", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls when boot mode is polling", () => {
    const invalidate = vi.fn();
    const transport = attachArrivalTransport({ mode: "polling", invalidate, intervalMs: 30000 });

    vi.advanceTimersByTime(30000);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(transport.state.mode).toBe("polling");
    transport.detach();
  });

  it("cleans polling interval", () => {
    const invalidate = vi.fn();
    const transport = attachArrivalTransport({ mode: "polling", invalidate, intervalMs: 30000 });

    transport.detach();
    vi.advanceTimersByTime(30000);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("uses injected realtime without reading window.frappe", () => {
    const invalidate = vi.fn();
    const callbacks: Record<string, () => void> = {};
    const realtime = { on: vi.fn((event: string, cb: () => void) => { callbacks[event] = cb; return () => {}; }) };

    const transport = attachArrivalTransport({ mode: "frappe", invalidate, realtime, intervalMs: 30000 });
    callbacks.queue_update();

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(realtime.on).toHaveBeenCalledWith("queue_update", expect.any(Function));
    transport.detach();
  });
});
```

- [ ] **Step 2: Run transport tests to verify they fail**

```bash
npm run test -- src/lib/realtime/frappe-transport.test.ts
```

Expected: FAIL because `attachArrivalTransport` has the old positional signature.

- [ ] **Step 3: Add transport state types**

Append to `frontend/head-app/src/lib/arrival-counter/types.ts`:

```ts
export interface ArrivalTransportState {
  mode: ArrivalRealtimeMode;
  lastRefreshAt: number | null;
  stale: boolean;
  failureCount: number;
}

export interface ArrivalRealtimeClient {
  on?: (event: string, cb: (payload: unknown) => void) => unknown;
}
```

- [ ] **Step 4: Replace the transport adapter implementation**

Modify `frontend/head-app/src/lib/realtime/frappe-transport.ts`:

```ts
import type { ArrivalRealtimeClient, ArrivalRealtimeMode, ArrivalTransportState } from "$arrival/types";

export function attachArrivalTransport({
  mode,
  invalidate,
  realtime,
  intervalMs = 30000,
}: {
  mode: ArrivalRealtimeMode;
  invalidate: () => void | Promise<void>;
  realtime?: ArrivalRealtimeClient;
  intervalMs?: number;
}) {
  const cleanups: Array<() => void> = [];
  const state: ArrivalTransportState = {
    mode,
    lastRefreshAt: null,
    stale: false,
    failureCount: 0,
  };

  async function safeInvalidate() {
    try {
      await invalidate();
      state.lastRefreshAt = Date.now();
      state.stale = false;
      state.failureCount = 0;
    } catch {
      state.failureCount += 1;
      state.stale = true;
    }
  }

  if (mode === "frappe" && realtime?.on) {
    for (const event of ["queue_update", "session_status"] as const) {
      const cleanup = realtime.on(event, () => void safeInvalidate());
      if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
    }
  }

  if (mode === "polling" || mode === "frappe") {
    const interval = window.setInterval(() => void safeInvalidate(), intervalMs);
    cleanups.push(() => window.clearInterval(interval));
  }

  return {
    state,
    detach() {
      for (const cleanup of cleanups) cleanup();
    },
  };
}
```

- [ ] **Step 5: Run transport tests**

```bash
npm run test -- src/lib/realtime/frappe-transport.test.ts
```

Expected: PASS, 3 tests pass.

- [ ] **Step 6: Commit this task**

```bash
git add frontend/head-app/src/lib/realtime/frappe-transport.ts frontend/head-app/src/lib/realtime/frappe-transport.test.ts frontend/head-app/src/lib/arrival-counter/types.ts && git commit -m "feat: isolate arrival counter transport adapter"
```

---

## Task F5: Keyboard-First State And Shared Result-Card Shell

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/state.test.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`
- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`

This is the largest task. Follow each step in order.

- [ ] **Step 1: Write failing state tests for keyboard workflow**

Append to `frontend/head-app/src/lib/arrival-counter/state.test.ts`:

```ts
  it("tracks focused candidate for keyboard selection", async () => {
    // Set up mock with two candidates
    const mockCard = { name: "QE-0001", queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready", visit_label: "New", print_context: { queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", qr_svg: "<svg/>" } };
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({ candidates: [mockCard, { ...mockCard, queue_entry: "QE-0002", name: "QE-0002" }] });
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");

    expect(state.resultState).toBe("multiple");
    expect(state.focusedCandidateIndex).toBe(0);

    state.moveCandidateFocus(1);
    expect(state.focusedCandidateIndex).toBe(1);

    state.selectFocusedCandidate();
    expect(state.selected?.queue_entry).toBe("QE-0002");
    expect(state.resultState).toBe("pre-confirm");
  });

  it("does not overwrite an active decision during context refresh", async () => {
    const mockCard = { name: "QE-0001", queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready", visit_label: "New", print_context: { queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", qr_svg: "<svg/>" } };
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({ candidates: [mockCard] });
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    await state.refreshContext();

    expect(state.selected?.queue_entry).toBe("QE-0001");
    expect(state.resultState).toBe("pre-confirm");
  });
```

- [ ] **Step 2: Write failing Playwright tests for multiple shell and keyboard loop**

Replace `frontend/head-app/tests/arrival-counter.spec.ts` with:

```ts
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
```

- [ ] **Step 3: Run state and e2e tests to verify they fail**

```bash
npm run test -- src/lib/arrival-counter/state.test.ts && npm run test:e2e
```

Expected: FAIL because candidate focus, shared card multiple rendering, and keyboard reset are not implemented.

- [ ] **Step 4: Add keyboard state methods**

Modify `frontend/head-app/src/lib/arrival-counter/state.svelte.ts` to add these fields and methods:

```ts
  focusedCandidateIndex = $state(0);
  isLookupPending = $state(false);
  isConfirmPending = $state(false);
  shouldFocusInput = $state(0);

  moveCandidateFocus(delta: number) {
    if (!this.candidates.length) return;
    this.focusedCandidateIndex = (this.focusedCandidateIndex + delta + this.candidates.length) % this.candidates.length;
  }

  selectFocusedCandidate() {
    const card = this.candidates[this.focusedCandidateIndex];
    if (!card) return;
    this.selected = card;
    this.resultState = card.status === "Arrived" ? "already-arrived" : "pre-confirm";
  }

  requestInputFocus() {
    this.shouldFocusInput += 1;
  }
```

Also update `lookup`, `confirmArrival`, and `reset` methods:

```ts
  async lookup(raw: string) {
    this.inputValue = raw;
    const classified = classifyInput(raw);
    if (!classified) {
      this.resultState = "error";
      this.message = "Scan a QR code, enter 6+ phone digits, or type at least 3 letters.";
      return;
    }

    this.isLookupPending = true;
    this.resultState = "loading";
    try {
      const response = await lookupArrivalCandidate({ [classified.mode]: classified.value });
      this.candidates = response.candidates;
      this.focusedCandidateIndex = 0;
    } catch (error) {
      this.resultState = "error";
      this.message = error instanceof Error ? error.message : "Lookup failed. Try again.";
      return;
    } finally {
      this.isLookupPending = false;
    }

    if (!this.candidates.length) {
      this.resultState = "no-match";
      return;
    }

    if (this.candidates.length > 1) {
      this.resultState = "multiple";
      return;
    }

    this.selected = this.candidates[0];
    this.resultState = this.selected.status === "Arrived" ? "already-arrived" : "pre-confirm";
  }

  async confirmArrival() {
    if (!this.selected || this.isConfirmPending) return;
    this.isConfirmPending = true;
    try {
      const result = await markArrived(this.selected.queue_entry, this.selected.queue_session);
      this.selected = result.result_card;
      this.resultState = result.already_arrived ? "already-arrived" : "success";
      await this.refreshContext();
    } catch (error) {
      this.resultState = "error";
      this.message = error instanceof Error ? error.message : "Could not confirm arrival. Try again.";
    } finally {
      this.isConfirmPending = false;
    }
  }

  reset() {
    this.inputValue = "";
    this.message = "";
    this.selected = null;
    this.candidates = [];
    this.focusedCandidateIndex = 0;
    this.resultState = "idle";
    this.requestInputFocus();
  }
```

- [ ] **Step 5: Move multiple matches into the shared result card**

Modify `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte` so the root section owns all states:

```svelte
<script lang="ts">
  import MultipleMatchesList from "$arrival/components/MultipleMatchesList.svelte";
  import type { ArrivalCardRecord, ResultState } from "$arrival/types";

  let {
    card = null,
    state = "idle",
    candidates = [] as ArrivalCardRecord[],
    focusedCandidateIndex = 0,
    onConfirm = () => {},
    onReset = () => {},
    onPrint = () => {},
    onChoose = (_: ArrivalCardRecord) => {},
    onMoveCandidateFocus = (_: number) => {},
  } = $props();
</script>

<section data-testid="arrival-result-card" class="min-h-[20rem] rounded-[1.5rem] border border-[#d9ddd8] bg-white p-6 shadow-panel">
  {#if state === "idle"}
    <div class="flex h-full items-center justify-center text-slate-500">Scan a token slip or search for a patient to begin.</div>
  {:else if state === "loading"}
    <div class="flex h-full items-center justify-center gap-3 text-slate-500">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0d6f69]"></div>
      <span>Looking up patient...</span>
    </div>
  {:else if state === "no-match"}
    <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div class="text-lg font-semibold text-slate-600">No match found</div>
      <div class="text-sm text-slate-500">Check the barcode or try searching by phone or name.</div>
      <button class="rounded-xl border border-[#d9ddd8] px-4 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={onReset}>Start over</button>
    </div>
  {:else if state === "multiple"}
    <MultipleMatchesList {candidates} {focusedCandidateIndex} onChoose={onChoose} onMoveFocus={onMoveCandidateFocus} />
  {:else if card}
    <div class="flex h-full flex-col justify-between gap-6">
      <div>
        <div class="text-sm uppercase tracking-[0.18em] text-slate-500">{card.state_label}</div>
        <div class="mt-3 font-display text-6xl font-extrabold text-[#10211f]">{card.display_token}</div>
        <div class="mt-4 text-3xl font-semibold text-[#10211f]">{card.patient_name}</div>
        <div class="mt-3 text-base text-slate-600">{card.visit_label}</div>
      </div>
      <div class="flex flex-wrap gap-3">
        {#if state === "pre-confirm"}
          <button class="rounded-2xl bg-[#0d6f69] px-5 py-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={onConfirm}>Confirm Arrival</button>
          <button class="rounded-2xl px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={onReset}>Not this patient</button>
        {:else if state === "success" || state === "already-arrived"}
          {#if state === "already-arrived"}<div class="rounded-2xl bg-mint px-5 py-3 font-semibold text-[#10211f]">Already checked in</div>{/if}
          <button class="rounded-2xl bg-[#0d6f69] px-5 py-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={onPrint}>Print Token Slip</button>
          <button class="rounded-2xl px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={onReset}>Next patient</button>
        {/if}
      </div>
    </div>
  {/if}
</section>
```

- [ ] **Step 6: Add roving keyboard behavior to the multiple list**

Modify `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`:

```svelte
<script lang="ts">
  import type { ArrivalCardRecord } from "$arrival/types";

  let {
    candidates = [] as ArrivalCardRecord[],
    focusedCandidateIndex = 0,
    onChoose = (_: ArrivalCardRecord) => {},
    onMoveFocus = (_: number) => {},
  } = $props();

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

<div class="flex h-full flex-col gap-4">
  <div>
    <div class="font-display text-lg font-semibold text-[#10211f]">Select patient</div>
    <div class="text-sm text-slate-500">Use arrow keys, then Enter.</div>
  </div>
  <div class="space-y-3">
    {#each candidates as candidate, index (candidate.queue_entry)}
      <button
        class="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2"
        class:border-[#0d6f69]={index === focusedCandidateIndex}
        class:border-[#d9ddd8]={index !== focusedCandidateIndex}
        aria-label={`Select ${candidate.display_token} ${candidate.patient_name}`}
        tabindex={index === focusedCandidateIndex ? 0 : -1}
        onkeydown={(event) => handleKeydown(event, candidate)}
        onclick={() => onChoose(candidate)}
      >
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

- [ ] **Step 7: Add input focus restoration**

Modify `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`:

```svelte
<script lang="ts">
  import { tick } from "svelte";

  let { value = $bindable(), disabled = false, focusSignal = 0, onSubmit }: { value?: string; disabled?: boolean; focusSignal?: number; onSubmit: (raw: string) => void } = $props();
  let inputEl: HTMLInputElement;

  $effect(() => {
    focusSignal;
    tick().then(() => inputEl?.focus());
  });

  function submit() {
    if (value) onSubmit(value);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") submit();
  }
</script>

<section class="rounded-[1.5rem] border border-[#d9ddd8] bg-white/92 p-6 shadow-panel">
  <label for="arrival-scan-input" class="mb-3 block font-display text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Scan or Search</label>
  <div class="flex items-center gap-3 rounded-[1.25rem] border border-[#d9ddd8] bg-[#f6f5f1] px-5 py-4 focus-within:border-[#0d6f69] focus-within:ring-2 focus-within:ring-[#0d6f69]/20">
    <input
      id="arrival-scan-input"
      bind:this={inputEl}
      bind:value
      class="w-full border-0 bg-transparent p-0 text-xl text-[#10211f] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2"
      placeholder="Scan barcode or enter patient ID"
      {disabled}
      onkeydown={handleKeydown}
    />
    <button class="rounded-xl bg-[#0d6f69] px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={submit} {disabled}>Go</button>
  </div>
</section>
```

- [ ] **Step 8: Update page composition and keyboard shortcuts**

Modify `frontend/head-app/src/routes/arrival-counter/+page.svelte` to load boot and use adapters:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { getClinicFlowBoot } from "$lib/boot/boot";
  import HeaderBar from "$arrival/components/HeaderBar.svelte";
  import InputSurface from "$arrival/components/InputSurface.svelte";
  import ResultCard from "$arrival/components/ResultCard.svelte";
  import RecentArrivals from "$arrival/components/RecentArrivals.svelte";
  import StatusBanner from "$arrival/components/StatusBanner.svelte";
  import { ArrivalCounterState } from "$arrival/state.svelte";
  import { attachArrivalTransport } from "$realtime/frappe-transport";
  import { printTokenSlip } from "$arrival/print-slip";

  const boot = getClinicFlowBoot();
  const state = new ArrivalCounterState();
  let resetTimer = 0;

  async function handleSubmit(raw: string) {
    clearTimeout(resetTimer);
    await state.lookup(raw);
  }

  async function handleConfirm() {
    await state.confirmArrival();
    if (state.resultState === "success") {
      resetTimer = window.setTimeout(() => state.reset(), 5000);
    }
  }

  function handleRouteKeydown(event: KeyboardEvent) {
    if (state.isLookupPending || state.isConfirmPending) return;
    if (event.key === "Escape" && state.resultState !== "idle") {
      event.preventDefault();
      state.reset();
    } else if (state.resultState === "multiple" && event.key === "ArrowDown") {
      event.preventDefault();
      state.moveCandidateFocus(1);
    } else if (state.resultState === "multiple" && event.key === "ArrowUp") {
      event.preventDefault();
      state.moveCandidateFocus(-1);
    } else if (state.resultState === "multiple" && event.key === "Enter") {
      event.preventDefault();
      state.selectFocusedCandidate();
    } else if (state.resultState === "pre-confirm" && event.key === "Enter") {
      event.preventDefault();
      void handleConfirm();
    }
  }

  onMount(() => {
    state.requestInputFocus();
    void state.refreshContext();
    const transport = attachArrivalTransport({ mode: boot.realtime.mode, invalidate: () => state.refreshContext() });
    return () => {
      clearTimeout(resetTimer);
      transport.detach();
    };
  });
</script>

<svelte:window onkeydown={handleRouteKeydown} />
```

Replace the old separate `<MultipleMatchesList>` block with this `ResultCard` call:

```svelte
<ResultCard
  card={state.selected}
  state={state.resultState}
  candidates={state.candidates}
  focusedCandidateIndex={state.focusedCandidateIndex}
  onConfirm={handleConfirm}
  onReset={() => state.reset()}
  onPrint={() => state.selected && boot.permissions.canPrintTokenSlip && printTokenSlip(state.selected)}
  onChoose={(card) => {
    state.selected = card;
    state.resultState = card.status === "Arrived" ? "already-arrived" : "pre-confirm";
  }}
  onMoveCandidateFocus={(delta) => state.moveCandidateFocus(delta)}
/>
```

Update `InputSurface` usage:

```svelte
<InputSurface bind:value={state.inputValue} focusSignal={state.shouldFocusInput} onSubmit={handleSubmit} disabled={state.resultState === "loading"} />
```

- [ ] **Step 9: Run keyboard and UI tests**

```bash
npm run test -- src/lib/arrival-counter/state.test.ts && npm run test:e2e
```

Expected: PASS. State tests pass. Playwright reports all Arrival Counter e2e tests pass.

- [ ] **Step 10: Commit this task**

```bash
git add frontend/head-app/src/lib/arrival-counter frontend/head-app/src/routes/arrival-counter/+page.svelte frontend/head-app/tests/arrival-counter.spec.ts && git commit -m "fix: harden arrival counter keyboard result shell"
```

---

## Task F6: Secure Print Slip Rendering

**Files:**
- Modify: `frontend/head-app/src/lib/arrival-counter/print-slip.ts`
- Create: `frontend/head-app/src/lib/arrival-counter/print-slip.test.ts`

- [ ] **Step 1: Write failing print-slip security tests first**

Create `frontend/head-app/src/lib/arrival-counter/print-slip.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTokenSlipDocument, printTokenSlip } from "./print-slip";
import type { ArrivalCardRecord } from "./types";

const record: ArrivalCardRecord = {
  name: "QE-1",
  queue_entry: "QE-1",
  display_token: "OPD-001",
  patient_name: "<img src=x onerror=alert(1)>",
  queue_session: "QS-1",
  status: "Arrived",
  state_label: "Already Arrived",
  visit_label: "New Patient",
  print_context: {
    queue_entry: "QE-1",
    display_token: "OPD-001<script>alert(1)</script>",
    patient_name: "<img src=x onerror=alert(1)>",
    qr_svg: "<svg viewBox=\"0 0 1 1\"></svg>",
  },
};

describe("print slip", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("escapes patient-controlled text", () => {
    const doc = document.implementation.createHTMLDocument("print");
    buildTokenSlipDocument(doc, record);

    expect(doc.body.textContent).toContain("OPD-001<script>alert(1)</script>");
    expect(doc.body.innerHTML).not.toContain("onerror");
    expect(doc.body.querySelector("img")).toBeNull();
  });

  it("does not use document.write", () => {
    const doc = document.implementation.createHTMLDocument("print");
    const writeSpy = vi.spyOn(doc, "write");
    buildTokenSlipDocument(doc, record);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("reports popup failure", () => {
    vi.spyOn(window, "open").mockReturnValueOnce(null);
    expect(printTokenSlip(record)).toEqual({ ok: false, reason: "popup-blocked" });
  });
});
```

- [ ] **Step 2: Run print tests to verify they fail**

```bash
npm run test -- src/lib/arrival-counter/print-slip.test.ts
```

Expected: FAIL because `buildTokenSlipDocument` does not exist and current print helper uses `document.write()`.

- [ ] **Step 3: Replace print helper with DOM construction**

Modify `frontend/head-app/src/lib/arrival-counter/print-slip.ts`:

```ts
import type { ArrivalCardRecord } from "$arrival/types";

export type PrintSlipResult = { ok: true } | { ok: false; reason: "popup-blocked" };

function appendText(parent: Element, className: string, text: string) {
  const el = parent.ownerDocument.createElement("div");
  el.className = className;
  el.textContent = text;
  parent.appendChild(el);
}

function trustedQrContainer(doc: Document, qrSvg: string) {
  const wrapper = doc.createElement("div");
  wrapper.className = "qr";
  const template = doc.createElement("template");
  template.innerHTML = qrSvg.trim();
  const svg = template.content.firstElementChild;
  if (svg?.tagName.toLowerCase() === "svg") {
    wrapper.appendChild(svg);
  }
  return wrapper;
}

export function buildTokenSlipDocument(doc: Document, record: ArrivalCardRecord) {
  doc.title = record.print_context.display_token;
  const style = doc.createElement("style");
  style.textContent = "body{font-family:'Source Sans 3',sans-serif;padding:20px;color:#10211f}.token{font-family:'Lexend',sans-serif;font-size:40px;font-weight:800}.name{margin-top:12px;font-size:22px;font-weight:600}.qr{margin-top:20px}";
  doc.head.appendChild(style);

  doc.body.replaceChildren();
  appendText(doc.body, "token", record.print_context.display_token);
  appendText(doc.body, "name", record.print_context.patient_name);
  doc.body.appendChild(trustedQrContainer(doc, record.print_context.qr_svg));
}

export function printTokenSlip(record: ArrivalCardRecord): PrintSlipResult {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return { ok: false, reason: "popup-blocked" };

  buildTokenSlipDocument(win.document, record);
  win.document.close();
  win.print();
  return { ok: true };
}
```

- [ ] **Step 4: Run print tests**

```bash
npm run test -- src/lib/arrival-counter/print-slip.test.ts
```

Expected: PASS, 3 tests pass.

- [ ] **Step 5: Commit this task**

```bash
git add frontend/head-app/src/lib/arrival-counter/print-slip.ts frontend/head-app/src/lib/arrival-counter/print-slip.test.ts && git commit -m "fix: escape arrival token slip printing"
```

---

## Task F7: Build Output Configuration And Frappe Shell Smoke Test

**Files:**
- Modify: `frontend/head-app/svelte.config.js`
- Modify: `frontend/head-app/copy-build-to-frappe.js`
- Create: `frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts`

- [ ] **Step 1: Write failing Frappe shell e2e smoke test first**

Create `frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run local e2e to verify the shell smoke is skipped without env**

```bash
npm run test:e2e
```

Expected: local Vite-route tests pass and `arrival-counter-frappe-shell.spec.ts` is skipped.

- [ ] **Step 3: Set Frappe asset path in SvelteKit config**

Modify `frontend/head-app/svelte.config.js`:

```javascript
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: undefined,
      precompress: false,
      strict: true,
    }),
    paths: {
      assets: "/assets/clinic_flow/head-app",
    },
    prerender: {
      entries: ["/", "/arrival-counter"],
    },
    alias: {
      "$arrival": "src/lib/arrival-counter",
      "$api": "src/lib/api",
      "$realtime": "src/lib/realtime",
    },
  },
};

export default config;
```

- [ ] **Step 4: Make build copying fail visibly when route output is missing**

Modify `frontend/head-app/copy-build-to-frappe.js`:

```javascript
import { cpSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, "build");
const arrivalHtml = join(buildDir, "arrival-counter.html");
const destDir = join(__dirname, "..", "..", "clinic_flow", "public", "head-app");

if (!existsSync(buildDir)) {
  console.error("Build directory not found. Run `npm run build` first.");
  process.exit(1);
}

if (!existsSync(arrivalHtml)) {
  console.error("Arrival Counter build output missing: build/arrival-counter.html");
  process.exit(1);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

cpSync(buildDir, destDir, { recursive: true });

console.log(`Copied build output to ${destDir}`);
```

- [ ] **Step 5: Run frontend build and local tests**

```bash
npm run check && npm run test && npm run build && npm run test:e2e
```

Expected: `svelte-check found 0 errors and 0 warnings`; Vitest passes; build copies output to `clinic_flow/public/head-app`; Playwright local tests pass.

- [ ] **Step 6: Run optional real Frappe shell smoke when authenticated state is available**

```bash
FRAPPE_BASE_URL=http://site1.localhost:8000 FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json npm run test:e2e -- tests/arrival-counter-frappe-shell.spec.ts
```

Expected: PASS when `/tmp/clinic-flow-staff-storage.json` contains a logged-in staff session. If absent, create it manually first.

- [ ] **Step 7: Commit this task**

```bash
git add frontend/head-app/svelte.config.js frontend/head-app/copy-build-to-frappe.js frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts clinic_flow/public/head-app && git commit -m "fix: serve arrival counter through Frappe shell"
```

---

## Task F8: Frontend Final Verification

- [ ] **Step 1: Run full frontend check + test + build + e2e**

```bash
npm run check && npm run test && npm run build && npm run test:e2e
```

Expected: all pass.

- [ ] **Step 2: Run real Frappe shell smoke if authenticated state available**

```bash
FRAPPE_BASE_URL=http://site1.localhost:8000 FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json npm run test:e2e -- tests/arrival-counter-frappe-shell.spec.ts
```

- [ ] **Step 3: Refresh graphify after code changes**

```bash
graphify update .
```

Expected: completes without errors.

- [ ] **Step 4: Commit verification artifacts if graph output changed**

```bash
git add graphify-out && git commit -m "chore: refresh arrival counter shell artifacts"
```

Only commit if files changed.

---

## Self-Review (Frontend)

### Spec Coverage
- Typed boot object and runtime validation: F1
- Boot-provided CSRF in API client: F2
- Runtime validation for critical API responses: F3
- Realtime/polling adapter with no page-level `window.frappe`: F4
- Keyboard-first workflow + shared result-card shell: F5
- Multiple matches inside shared card: F5
- Print-slip escaping and trusted QR handling: F6
- SvelteKit build with Frappe asset paths: F7
- Real Frappe-route integration smoke: F7

### Task Dependency Order
F1 → F2 → F3 → F5 (state/page uses boot + client + validated APIs)
F4 → F5 (transport feeds into page onMount)
F6 (independent, can run parallel to F1-F5)
F7 (depends on F5 — needs the page to build, and F1-F6 — need the compiled output)

### No Backend Source Dependencies
None of the frontend tasks import backend Python code or depend on the Frappe shell route being active. F7 step 6 (real Frappe smoke) requires the backend route to exist, but the build and local tests do not.

### Integration Handoff
After both plans complete: `npm run build` drops `arrival-counter.html` and `_app/` assets into `clinic_flow/public/head-app/`. The backend shell route at `/clinic/arrival-counter` reads and serves them. Run `bench migrate` and access the route at `http://site1.localhost:8000/clinic/arrival-counter` with staff credentials.

---

## Implementation Addendum — 2026-04-28

### F7.3 Deviation

Plan Step F7.3 specifies `paths: { assets: "/assets/clinic_flow/head-app" }`
in `svelte.config.js`. This literal step was not applied because SvelteKit v2.58
validates `paths.assets` against `/^[a-z]+:\/\//` — it requires a full URL with
protocol, not a root-relative path.

**Compensating control:** Asset path rewriting is performed by the Frappe shell
controller (`_load_head_app_shell()` in `clinic_flow/www/clinic/arrival_counter.py`)
at serve time. This approach is actually more correct since the deployment base URL
is known only at runtime, not at static build time.

**Verification:** Built HTML resolves assets correctly through
`/assets/clinic_flow/head-app/_app/...` when served via `/clinic/arrival-counter`.
Backend shell tests (`test_arrival_counter_shell`) and frontend e2e tests confirm.
