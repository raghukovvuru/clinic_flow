# Arrival Counter V1 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first standalone Arrival Counter frontend slice as a calm, scan-first, desktop-first staff console, while keeping `clinic_flow.api.arrival` as the backend authority and preserving the legacy Desk page during coexistence.

**Architecture:** Build a dedicated `frontend/head-app` SvelteKit workspace for the long-lived head app, but host Arrival Counter v1 in phase 1 through a thin Frappe mount surface that owns auth/session context only and leaves all operational UI logic inside the bundled frontend modules. Extend `clinic_flow.api.arrival` compatibly so the new frontend gets richer session context, recent arrivals, and print-slip data without breaking the current `arrival_counter` Desk page.

**Tech Stack:** Frappe v16, Python 3.11, Svelte 5, SvelteKit, Tailwind CSS, TypeScript, Vitest, Playwright, same-domain session auth, `clinic_flow.api.*` whitelisted methods with full type annotations, `IntegrationTestCase`, `bench --site site1.localhost run-tests`, `graphify update .`

---

## Source Inputs

- Specs:
  - `docs/superpowers/specs/2026-04-27-head-app-frontend-architecture-design.md`
  - `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md`
- Required context: `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CONTEXT_INDEX.md`
- Focused policy docs: `docs/receptionist-backend-policy.md`, `docs/service-point-policy.md`, `docs/token-display-policy.md`, `docs/healthcare-compatibility-audit.md`
- Graph context: `graphify-out/GRAPH_REPORT.md`
- Runtime files inspected for this plan:
  - `clinic_flow/api/arrival.py`
  - `clinic_flow/queue/engine.py`
  - `clinic_flow/clinic_flow/page/arrival_counter/arrival_counter.js`
  - `clinic_flow/clinic_flow/page/arrival_counter/arrival_counter.py`
  - `clinic_flow/clinic_flow/page/receptionist_dashboard/receptionist_dashboard.js`
  - `clinic_flow/tests/test_slice3_checkin_boundary.py`
  - `clinic_flow/utils.py`
  - `clinic_flow/www/queue-dashboard.py`

## Scope

In scope:

- Create the initial `frontend/head-app` workspace and scripts.
- Add a thin same-domain Frappe host surface for Arrival Counter v1.
- Extend the arrival API contract compatibly for richer header context, recent arrivals, and print-slip support.
- Build the Arrival Counter v1 route, components, local/server state, and transport adapter.
- Add backend contract tests, frontend unit tests, and frontend end-to-end tests.
- Update implementation notes and core docs after behavior changes.

Out of scope:

- No edits under `apps/healthcare/`.
- No rewrite of queue authority, token allocation, ETA authority, or receptionist triage rules.
- No removal of the legacy `clinic_flow/clinic_flow/page/arrival_counter/` Desk page.
- No receptionist shell, live queue rail, phone admission, walk-in admission, token board, or doctor workspace head-app slice.
- No separate BFF layer.
- No frontend-owned queue ranking or token decisions.

## File Structure

- Create: `frontend/head-app/package.json`
  - SvelteKit workspace with dev, build, test, and e2e scripts.
- Create: `frontend/head-app/svelte.config.js`
  - Static/head-app-friendly SvelteKit configuration.
- Create: `frontend/head-app/vite.config.ts`
  - Shared frontend tooling config.
- Create: `frontend/head-app/tsconfig.json`
  - TypeScript config.
- Create: `frontend/head-app/postcss.config.cjs`
  - Tailwind/PostCSS integration.
- Create: `frontend/head-app/tailwind.config.ts`
  - Type-safe Tailwind setup with design-token extension.
- Create: `frontend/head-app/src/app.html`
  - Font imports and application shell.
- Create: `frontend/head-app/src/lib/api/client.ts`
  - Thin same-origin API wrapper for Frappe whitelisted methods.
- Create: `frontend/head-app/src/lib/api/arrival.ts`
  - Arrival-specific fetch/mutation functions.
- Create: `frontend/head-app/src/lib/realtime/frappe-transport.ts`
  - Realtime adapter that uses `window.frappe.realtime` when present and falls back to timed invalidation.
- Create: `frontend/head-app/src/lib/arrival-counter/types.ts`
  - Stable frontend contract types.
- Create: `frontend/head-app/src/lib/arrival-counter/classify.ts`
  - Unified QR/phone/name classifier.
- Create: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
  - Local/server-state orchestration for lookup, selection, confirm, success reset, and refresh.
- Create: `frontend/head-app/src/lib/arrival-counter/print-slip.ts`
  - Browser print helper using backend QR payload.
- Create:
  - `frontend/head-app/src/lib/arrival-counter/components/HeaderBar.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/RecentArrivals.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/StatusBanner.svelte`
  - UI modules split by operational purpose, not by one giant route file.
- Create: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
  - Arrival Counter v1 page composition.
- Create:
  - `frontend/head-app/src/lib/arrival-counter/classify.test.ts`
  - `frontend/head-app/src/lib/arrival-counter/state.test.ts`
  - `frontend/head-app/tests/arrival-counter.spec.ts`
  - Frontend unit and end-to-end tests.
- Create:
  - `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`
  - `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.py`
  - `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.json`
  - Thin Frappe mount surface for same-domain session auth and bundle mounting.
- Modify: `clinic_flow/hooks.py`
  - Register any additional asset or route wiring needed by the new mount surface.
- Modify: `clinic_flow/api/arrival.py`
  - Keep old keys for legacy callers but add richer frontend-ready payload fields.
- Create: `clinic_flow/tests/test_arrival_frontend_contract.py`
  - Backend contract tests for the enriched arrival payloads.
- Modify: `ARCHITECTURE.md`
  - Record the phase-1 head-app slice and coexistence host decision.
- Create: `docs/notes/arrival-counter-v1-frontend.md`
  - Implementation summary note with verification and next integration step.
- Do not modify: `clinic_flow/clinic_flow/page/arrival_counter/arrival_counter.js`
  - Keep the legacy Desk page running until the new slice is accepted.

---

### Task 1: Create the Frontend Slice Worktree and Baseline

**Files:**

- Verify: `/home/raghu/frappe-bench/apps/clinic_flow`
- Create worktree: `.worktrees/frontend-arrival-counter-v1`

- [ ] **Step 1: Verify the current branch and worktree ignore rule**

Run:

```bash
git status --short --branch
```

Expected:

```text
## backend/receptionist-queue-refactor
```

If the branch name differs, continue on the real active branch. Do not create the slice from a stale branch guess.

- [ ] **Step 2: Confirm `.worktrees/` is ignored before creating the worktree**

Run:

```bash
git check-ignore .worktrees
```

Expected:

```text
.worktrees
```

- [ ] **Step 3: Create the dedicated worktree and branch**

Run:

```bash
git worktree add .worktrees/frontend-arrival-counter-v1 -b frontend/arrival-counter-v1
```

Expected:

```text
Preparing worktree (new branch 'frontend/arrival-counter-v1')
```

- [ ] **Step 4: Verify the new worktree is clean**

Run:

```bash
git status --short --branch
```

Workdir: `/home/raghu/frappe-bench/apps/clinic_flow/.worktrees/frontend-arrival-counter-v1`

Expected:

```text
## frontend/arrival-counter-v1
```

- [ ] **Step 5: Commit the worktree bootstrap only after the slice is truly started**

Run:

```bash
git commit --allow-empty -m "chore: start arrival counter v1 frontend slice"
```

Expected:

```text
[frontend/arrival-counter-v1 ...] chore: start arrival counter v1 frontend slice
```

---

### Task 2: Scaffold the `frontend/head-app` Workspace

**Files:**

- Create:
  - `frontend/head-app/package.json`
  - `frontend/head-app/svelte.config.js`
  - `frontend/head-app/vite.config.ts`
  - `frontend/head-app/tsconfig.json`
  - `frontend/head-app/postcss.config.cjs`
  - `frontend/head-app/tailwind.config.ts`
  - `frontend/head-app/src/app.html`
  - `frontend/head-app/src/app.d.ts`
  - `frontend/head-app/src/routes/+layout.svelte`
  - `frontend/head-app/src/routes/+page.svelte`

- [ ] **Step 1: Write the head-app workspace manifest**

Create `frontend/head-app/package.json`:

```json
{
  "name": "clinic-flow-head-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --host 0.0.0.0 --port 4173",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "@sveltejs/adapter-auto": "^4.0.0",
    "@sveltejs/kit": "^2.16.0",
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "@tailwindcss/forms": "^0.5.10",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "svelte": "^5.19.0",
    "svelte-check": "^4.1.1",
    "tailwindcss": "^3.4.17",
    "tslib": "^2.8.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Add the minimal SvelteKit/Tailwind config files**

Create `frontend/head-app/svelte.config.js`:

```javascript
import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      "$arrival": "src/lib/arrival-counter",
      "$api": "src/lib/api",
      "$realtime": "src/lib/realtime"
    }
  }
};

export default config;
```

Create `frontend/head-app/vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"]
  }
});
```

Create `frontend/head-app/postcss.config.cjs`:

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 3: Add TypeScript, Tailwind, and shell files**

Create `frontend/head-app/tsconfig.json`:

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": false,
    "checkJs": false,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "types": ["vitest/globals"]
  }
}
```

Create `frontend/head-app/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f5f1",
        ink: "#10211f",
        mineral: "#0d6f69",
        mint: "#dcebe6",
        sand: "#f1ece5",
        line: "#d9ddd8"
      },
      fontFamily: {
        display: ["Lexend", "sans-serif"],
        body: ["Source Sans 3", "sans-serif"]
      },
      boxShadow: {
        panel: "0 18px 50px rgba(16, 33, 31, 0.08)"
      },
      borderRadius: {
        panel: "1.5rem"
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
} satisfies Config;
```

Create `frontend/head-app/src/app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 4: Add a tiny root layout so the toolchain runs before feature code lands**

Create `frontend/head-app/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import "./app.css";
</script>

<slot />
```

Create `frontend/head-app/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";

  goto("/arrival-counter", { replaceState: true });
</script>
```

- [ ] **Step 5: Install dependencies and verify the scaffold**

Run:

```bash
npm install && npm run check
```

Workdir: `/home/raghu/frappe-bench/apps/clinic_flow/.worktrees/frontend-arrival-counter-v1/frontend/head-app`

Expected:

```text
... svelte-check found 0 errors and 0 warnings
```

- [ ] **Step 6: Commit the scaffold**

Run:

```bash
git add frontend/head-app && git commit -m "feat: scaffold clinic flow head app workspace"
```

---

### Task 3: Add the Thin Same-Domain Frappe Host for Arrival Counter V1

**Files:**

- Create:
  - `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.json`
  - `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.py`
  - `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`
- Modify: `clinic_flow/hooks.py`

- [ ] **Step 1: Define the new Frappe page metadata**

Create `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.json`:

```json
{
  "content": "[]",
  "creation": "2026-04-27 00:00:00.000000",
  "docstatus": 0,
  "doctype": "Page",
  "idx": 0,
  "modified": "2026-04-27 00:00:00.000000",
  "modified_by": "Administrator",
  "module": "Clinic Flow",
  "name": "arrival-counter-v1",
  "owner": "Administrator",
  "page_name": "arrival-counter-v1",
  "roles": [
    { "role": "Healthcare Administrator" },
    { "role": "Queue Manager" },
    { "role": "System Manager" }
  ],
  "script": "",
  "standard": "Yes",
  "style": ""
}
```

- [ ] **Step 2: Add a no-cache Python context for the host page**

Create `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.py`:

```python
import frappe


def get_context(context):
    context.no_cache = 1
    context.page_title = "Arrival Counter"
```

- [ ] **Step 3: Mount the frontend bundle from a tiny Desk-page loader, not a monolith**

Create `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`:

```javascript
frappe.pages["arrival-counter-v1"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Arrival Counter",
    single_column: true,
  });

  page.main.addClass("arrival-counter-v1-host");
  page.main.html('<div id="arrival-counter-v1-root"></div>');

  frappe.require("/assets/clinic_flow/head-app/arrival-counter-v1.js", () => {
    const mount = window.clinicFlowArrivalCounterV1;
    if (!mount || typeof mount.mount !== "function") {
      page.main.html('<div class="text-muted">Arrival Counter bundle failed to load.</div>');
      return;
    }

    mount.mount({
      target: page.main.find("#arrival-counter-v1-root")[0],
      props: {
        realtime: frappe.realtime,
        siteName: frappe.boot?.sitename || "site1.localhost",
        user: frappe.session.user,
      },
    });
  });
};
```

- [ ] **Step 4: Wire the new page into hooks only if the bundle path needs app-level asset exposure**

Modify `clinic_flow/hooks.py` to keep the desk asset lists empty and add a comment documenting the page host:

```python
# The head-app bundles are loaded lazily by thin page hosts such as
# `arrival_counter_v1.js`; do not inject them globally into Desk.
app_include_css = []
app_include_js = []
```

- [ ] **Step 5: Verify the new host page resolves in Desk before feature code is mounted**

Run:

```bash
bench --site site1.localhost clear-cache
```

Expected:

```text
Queued rebuilding of website cache
```

- [ ] **Step 6: Commit the host mount surface**

Run:

```bash
git add clinic_flow/clinic_flow/page/arrival_counter_v1 clinic_flow/hooks.py && git commit -m "feat: add arrival counter v1 host page"
```

---

### Task 4: Enrich the Arrival Backend Contract Without Breaking the Legacy Page

**Files:**

- Modify: `clinic_flow/api/arrival.py`
- Create: `clinic_flow/tests/test_arrival_frontend_contract.py`

- [ ] **Step 1: Write failing backend contract tests first**

Create `clinic_flow/tests/test_arrival_frontend_contract.py`:

```python
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestArrivalFrontendContract(IntegrationTestCase):
    def test_session_context_includes_current_next_stats_and_recent_arrivals(self):
        session = self.make_queue_session(status="Active", start_time="09:00:00")
        next_session = self.make_queue_session(status="Scheduled", start_time="13:00:00")
        arrived = self.make_queue_entry(session, status="Arrived", token_number=1)
        waiting = self.make_queue_entry(session, status="Booked", token_number=2)

        result = frappe.get_attr("clinic_flow.api.arrival.get_arrival_session_context")()

        self.assertTrue(result["has_active"])
        self.assertEqual(result["stats"]["arrived"], 1)
        self.assertEqual(result["stats"]["awaiting_arrival"], 1)
        self.assertEqual(result["current_session"]["name"], session.name)
        self.assertEqual(result["next_session"]["name"], next_session.name)
        self.assertEqual(result["recent_arrivals"][0]["queue_entry"], arrived.name)

    def test_lookup_arrival_candidate_keeps_legacy_candidates_and_adds_ui_fields(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=7)

        result = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(qr_code=entry.name)

        self.assertEqual(result["candidates"][0]["name"], entry.name)
        self.assertEqual(result["candidates"][0]["display_token"], entry.token)
        self.assertIn("print_context", result["candidates"][0])
        self.assertIn("state_label", result["candidates"][0])

    def test_mark_arrived_returns_success_card_payload(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=3)

        result = frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(queue_entry=entry.name)

        self.assertEqual(result["status"], "Arrived")
        self.assertFalse(result["already_arrived"])
        self.assertEqual(result["result_card"]["display_token"], entry.token)
        self.assertIn("print_context", result["result_card"])
```

- [ ] **Step 2: Add serialization helpers to `clinic_flow/api/arrival.py`**

Insert near the top of `clinic_flow/api/arrival.py`:

```python
from clinic_flow.utils import get_token_qr_svg


def _session_summary(row: dict) -> dict:
    return {
        "name": row.get("name"),
        "session_name": row.get("session_name"),
        "dept_abbr": row.get("dept_abbr"),
        "practitioner": row.get("practitioner"),
        "status": row.get("status"),
        "start_time": str(row.get("start_time") or ""),
    }


def _candidate_summary(row: dict) -> dict:
    display_token = row.get("token") or row.get("name")
    return {
        **dict(row),
        "queue_entry": row.get("name"),
        "display_token": display_token,
        "state_label": "Already Arrived" if row.get("status") == "Arrived" else "Ready to Confirm",
        "visit_label": "Review Patient" if row.get("load_class") == "review_load" else "New Patient",
        "print_context": {
            "queue_entry": row.get("name"),
            "display_token": display_token,
            "patient_name": row.get("patient_name"),
            "qr_svg": get_token_qr_svg(row.get("name")),
        },
    }
```

- [ ] **Step 3: Extend `get_arrival_session_context()` compatibly**

Replace the return shape in `get_arrival_session_context()` with:

```python
    sessions = sorted(
        sessions,
        key=lambda row: (
            0 if row.get("status") in ("Active", "Paused") else 1,
            str(row.get("start_time") or ""),
        ),
    )

    current_session = _session_summary(sessions[0]) if sessions else None
    next_session = _session_summary(sessions[1]) if len(sessions) > 1 else None

    recent_rows = frappe.get_all(
        "Queue Entry",
        filters={
            "queue_session": ["in", session_names],
            "status": "Arrived",
        },
        fields=["name", "token", "patient_name", "arrived_at"],
        order_by="arrived_at desc",
        limit=8,
    )

    return {
        "sessions": sessions,
        "has_active": True,
        "arrived_count": arrived_count,
        "waiting_count": waiting_count,
        "stats": {
            "arrived": arrived_count,
            "awaiting_arrival": waiting_count,
        },
        "current_session": current_session,
        "next_session": next_session,
        "recent_arrivals": [
            {
                "queue_entry": row.get("name"),
                "display_token": row.get("token") or row.get("name"),
                "patient_name": row.get("patient_name"),
                "arrived_at": str(row.get("arrived_at") or ""),
                "status": "Arrived",
            }
            for row in recent_rows
        ],
    }
```

- [ ] **Step 4: Extend `lookup_arrival_candidate()` and `mark_arrived()` with UI-ready result-card data**

Update the candidate return block in `lookup_arrival_candidate()`:

```python
    return {
        "candidates": [_candidate_summary(dict(c)) for c in candidates],
        "sessions": sessions,
    }
```

Update the idempotent branch in `mark_arrived()`:

```python
        result_card = _candidate_summary(dict(entry))
        return {
            "status": "Arrived",
            "already_arrived": True,
            "token": entry.token,
            "patient_name": entry.patient_name,
            "result_card": result_card,
        }
```

Update the success branch in `mark_arrived()`:

```python
    refreshed = frappe.db.get_value(
        "Queue Entry",
        queue_entry,
        [
            "name",
            "token",
            "token_number",
            "patient",
            "patient_name",
            "queue_session",
            "status",
            "queue_position",
            "dept_abbr",
            "load_class",
            "priority",
            "channel",
            "arrived_at",
        ],
        as_dict=True,
    )

    return {
        "status": "Arrived",
        "already_arrived": False,
        "token": refreshed.token,
        "token_number": refreshed.token_number,
        "patient_name": refreshed.patient_name,
        "queue_entry": refreshed.name,
        "result_card": _candidate_summary(dict(refreshed)),
    }
```

- [ ] **Step 5: Run the backend tests and make sure the new contract passes**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract
```

Expected:

```text
Ran 3 tests
OK
```

- [ ] **Step 6: Run the existing arrival boundary tests to guard regressions**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
```

Expected:

```text
Ran 5 tests
OK
```

- [ ] **Step 7: Commit the backend contract slice**

Run:

```bash
git add clinic_flow/api/arrival.py clinic_flow/tests/test_arrival_frontend_contract.py && git commit -m "feat: enrich arrival frontend contract"
```

---

### Task 5: Build Shared Frontend API, Transport, and State Modules

**Files:**

- Create:
  - `frontend/head-app/src/lib/api/client.ts`
  - `frontend/head-app/src/lib/api/arrival.ts`
  - `frontend/head-app/src/lib/realtime/frappe-transport.ts`
  - `frontend/head-app/src/lib/arrival-counter/types.ts`
  - `frontend/head-app/src/lib/arrival-counter/classify.ts`
  - `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
  - `frontend/head-app/src/lib/arrival-counter/print-slip.ts`
  - `frontend/head-app/src/lib/arrival-counter/classify.test.ts`
  - `frontend/head-app/src/lib/arrival-counter/state.test.ts`

- [ ] **Step 1: Create the typed API client and arrival API wrapper**

Create `frontend/head-app/src/lib/api/client.ts`:

```ts
export async function callFrappe<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/api/method/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": window.frappe?.csrf_token ?? "",
    },
    credentials: "same-origin",
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(`Frappe request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { message: T };
  return payload.message;
}
```

Create `frontend/head-app/src/lib/api/arrival.ts`:

```ts
import { callFrappe } from "$api/client";
import type { ArrivalCandidateResponse, ArrivalMarkResult, ArrivalSessionContext } from "$arrival/types";

export function getArrivalSessionContext(deptAbbr = "") {
  return callFrappe<ArrivalSessionContext>("clinic_flow.api.arrival.get_arrival_session_context", { dept_abbr: deptAbbr });
}

export function lookupArrivalCandidate(input: { qr_code?: string; phone?: string; name_query?: string; dept_abbr?: string }) {
  return callFrappe<ArrivalCandidateResponse>("clinic_flow.api.arrival.lookup_arrival_candidate", input);
}

export function markArrived(queueEntry: string, queueSession = "") {
  return callFrappe<ArrivalMarkResult>("clinic_flow.api.arrival.mark_arrived", {
    queue_entry: queueEntry,
    queue_session: queueSession,
  });
}
```

- [ ] **Step 2: Create the shared contract types and classifier**

Create `frontend/head-app/src/lib/arrival-counter/types.ts`:

```ts
export type SearchMode = "qr_code" | "phone" | "name_query";
export type ResultState = "idle" | "loading" | "no-match" | "multiple" | "pre-confirm" | "already-arrived" | "success" | "error";

export interface ArrivalCardRecord {
  name: string;
  queue_entry: string;
  display_token: string;
  patient_name: string;
  queue_session: string;
  status: string;
  state_label: string;
  visit_label: string;
  print_context: {
    queue_entry: string;
    display_token: string;
    patient_name: string;
    qr_svg: string;
  };
}

export interface ArrivalSessionContext {
  has_active: boolean;
  stats: { arrived: number; awaiting_arrival: number };
  current_session: null | { name: string; session_name: string; status: string; start_time: string };
  next_session: null | { name: string; session_name: string; status: string; start_time: string };
  recent_arrivals: Array<{ queue_entry: string; display_token: string; patient_name: string; arrived_at: string; status: string }>;
}

export interface ArrivalCandidateResponse {
  candidates: ArrivalCardRecord[];
  error?: string;
}

export interface ArrivalMarkResult {
  status: string;
  already_arrived: boolean;
  result_card: ArrivalCardRecord;
}
```

Create `frontend/head-app/src/lib/arrival-counter/classify.ts`:

```ts
import type { SearchMode } from "$arrival/types";

export function classifyInput(raw: string): { mode: SearchMode; value: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^QE-\d{4}-\d+$/i.test(trimmed)) {
    return { mode: "qr_code", value: trimmed.toUpperCase() };
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length >= 6 && /^[\d\s+\-()]+$/.test(trimmed)) {
    return { mode: "phone", value: trimmed };
  }

  if (trimmed.replace(/\d/g, "").length >= 2) {
    return { mode: "name_query", value: trimmed };
  }

  return null;
}
```

- [ ] **Step 3: Create the realtime adapter and state container**

Create `frontend/head-app/src/lib/realtime/frappe-transport.ts`:

```ts
export function attachArrivalTransport(invalidate: () => void, realtime?: { on?: (event: string, cb: (payload: unknown) => void) => void }) {
  if (realtime?.on) {
    realtime.on("queue_update", () => invalidate());
    realtime.on("session_status", () => invalidate());
  }

  const interval = window.setInterval(invalidate, 30000);
  return () => window.clearInterval(interval);
}
```

Create `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`:

```ts
import { getArrivalSessionContext, lookupArrivalCandidate, markArrived } from "$api/arrival";
import { classifyInput } from "$arrival/classify";
import type { ArrivalCardRecord, ArrivalSessionContext, ResultState } from "$arrival/types";

export class ArrivalCounterState {
  context = $state<ArrivalSessionContext | null>(null);
  resultState = $state<ResultState>("idle");
  inputValue = $state("");
  message = $state("");
  selected = $state<ArrivalCardRecord | null>(null);
  candidates = $state<ArrivalCardRecord[]>([]);

  async refreshContext() {
    this.context = await getArrivalSessionContext();
  }

  async lookup(raw: string) {
    const classified = classifyInput(raw);
    if (!classified) {
      this.resultState = "error";
      this.message = "Scan a QR code, enter 6+ phone digits, or type at least 2 letters.";
      return;
    }

    this.resultState = "loading";
    const response = await lookupArrivalCandidate({ [classified.mode]: classified.value });
    this.candidates = response.candidates;

    if (!response.candidates.length) {
      this.resultState = "no-match";
      return;
    }

    if (response.candidates.length > 1) {
      this.resultState = "multiple";
      return;
    }

    this.selected = response.candidates[0];
    this.resultState = this.selected.status === "Arrived" ? "already-arrived" : "pre-confirm";
  }

  async confirmArrival() {
    if (!this.selected) return;
    const result = await markArrived(this.selected.queue_entry, this.selected.queue_session);
    this.selected = result.result_card;
    this.resultState = result.already_arrived ? "already-arrived" : "success";
    await this.refreshContext();
  }

  reset() {
    this.inputValue = "";
    this.message = "";
    this.selected = null;
    this.candidates = [];
    this.resultState = "idle";
  }
}
```

- [ ] **Step 4: Add the print helper and unit tests**

Create `frontend/head-app/src/lib/arrival-counter/print-slip.ts`:

```ts
import type { ArrivalCardRecord } from "$arrival/types";

export function printTokenSlip(record: ArrivalCardRecord) {
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>${record.display_token}</title>
        <style>
          body { font-family: 'Source Sans 3', sans-serif; padding: 20px; color: #10211f; }
          .token { font-family: 'Lexend', sans-serif; font-size: 40px; font-weight: 800; }
          .name { margin-top: 12px; font-size: 22px; font-weight: 600; }
          .qr { margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="token">${record.print_context.display_token}</div>
        <div class="name">${record.print_context.patient_name}</div>
        <div class="qr">${record.print_context.qr_svg}</div>
      </body>
    </html>
  `);
  win.document.close();
  win.print();
}
```

Create `frontend/head-app/src/lib/arrival-counter/classify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyInput } from "$arrival/classify";

describe("classifyInput", () => {
  it("detects queue-entry QR input", () => {
    expect(classifyInput("qe-2026-12")).toEqual({ mode: "qr_code", value: "QE-2026-12" });
  });

  it("detects phone input", () => {
    expect(classifyInput("+251 911 123456")).toEqual({ mode: "phone", value: "+251 911 123456" });
  });

  it("detects name input", () => {
    expect(classifyInput("Mimi")).toEqual({ mode: "name_query", value: "Mimi" });
  });
});
```

Create `frontend/head-app/src/lib/arrival-counter/state.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ArrivalCounterState } from "$arrival/state.svelte";

vi.mock("$api/arrival", () => ({
  getArrivalSessionContext: vi.fn(async () => ({ has_active: true, stats: { arrived: 1, awaiting_arrival: 2 }, current_session: null, next_session: null, recent_arrivals: [] })),
  lookupArrivalCandidate: vi.fn(async () => ({ candidates: [] })),
  markArrived: vi.fn(),
}));

describe("ArrivalCounterState", () => {
  it("moves to no-match when lookup returns no candidates", async () => {
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    expect(state.resultState).toBe("no-match");
  });
});
```

- [ ] **Step 5: Run frontend unit checks before composing UI**

Run:

```bash
npm run check && npm run test
```

Expected:

```text
... svelte-check found 0 errors and 0 warnings
... all tests passed
```

- [ ] **Step 6: Commit the shared frontend foundation**

Run:

```bash
git add frontend/head-app/src/lib frontend/head-app/src/routes && git commit -m "feat: add arrival counter frontend state foundation"
```

---

### Task 6: Build the Arrival Counter V1 Screen and Its Canonical States

**Files:**

- Create:
  - `frontend/head-app/src/routes/arrival-counter/+page.svelte`
  - `frontend/head-app/src/routes/app.css`
  - `frontend/head-app/src/lib/arrival-counter/components/HeaderBar.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/RecentArrivals.svelte`
  - `frontend/head-app/src/lib/arrival-counter/components/StatusBanner.svelte`

- [ ] **Step 1: Create the shared page CSS and visual tokens**

Create `frontend/head-app/src/routes/app.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color: #10211f;
  background: #f6f5f1;
}

html, body {
  min-height: 100%;
  font-family: "Source Sans 3", sans-serif;
  background:
    radial-gradient(circle at top right, rgba(13, 111, 105, 0.05), transparent 28%),
    radial-gradient(circle at left center, rgba(220, 235, 230, 0.85), transparent 32%),
    #f6f5f1;
}

body {
  margin: 0;
}
```

- [ ] **Step 2: Build the header, input, and recent-arrivals components**

Create `frontend/head-app/src/lib/arrival-counter/components/HeaderBar.svelte`:

```svelte
<script lang="ts">
  import type { ArrivalSessionContext } from "$arrival/types";
  export let context: ArrivalSessionContext | null;
</script>

<header class="grid gap-4 rounded-panel border border-line bg-white/90 p-6 shadow-panel lg:grid-cols-[1.6fr_1fr]">
  <div>
    <div class="font-display text-3xl font-bold text-ink">Arrival Counter</div>
    <div class="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
      <span class="rounded-full bg-sand px-3 py-1">Active: {context?.current_session?.session_name ?? "No active session"}</span>
      <span class="rounded-full bg-white px-3 py-1 border border-line">Next: {context?.next_session?.session_name ?? "No next session"}</span>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div class="rounded-2xl bg-mint p-4">
      <div class="font-display text-3xl font-bold text-ink">{context?.stats.arrived ?? 0}</div>
      <div class="text-sm text-slate-600">Arrived</div>
    </div>
    <div class="rounded-2xl bg-sand p-4">
      <div class="font-display text-3xl font-bold text-ink">{context?.stats.awaiting_arrival ?? 0}</div>
      <div class="text-sm text-slate-600">Awaiting Arrival</div>
    </div>
  </div>
</header>
```

Create `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`:

```svelte
<script lang="ts">
  export let value = "";
  export let disabled = false;
  export let onSubmit: (raw: string) => void;

  function submit() {
    onSubmit(value);
  }
</script>

<section class="rounded-panel border border-line bg-white/92 p-6 shadow-panel">
  <label class="mb-3 block font-display text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Scan or Search</label>
  <div class="flex items-center gap-3 rounded-[1.25rem] border border-line bg-canvas px-5 py-4 focus-within:border-mineral focus-within:ring-2 focus-within:ring-mineral/20">
    <input
      bind:value
      class="w-full border-0 bg-transparent p-0 text-xl text-ink placeholder:text-slate-400 focus:outline-none focus:ring-0"
      placeholder="Scan barcode or enter patient ID"
      {disabled}
      on:keydown={(event) => event.key === "Enter" && submit()}
    />
    <button class="rounded-xl bg-mineral px-4 py-2 text-white" on:click={submit} disabled={disabled}>Go</button>
  </div>
</section>
```

Create `frontend/head-app/src/lib/arrival-counter/components/RecentArrivals.svelte`:

```svelte
<script lang="ts">
  import type { ArrivalSessionContext } from "$arrival/types";
  export let context: ArrivalSessionContext | null;
</script>

<section class="rounded-panel border border-line bg-white/72 p-5">
  <div class="mb-4 font-display text-lg font-semibold text-ink">Recent Arrivals</div>

  {#if !context?.recent_arrivals.length}
    <p class="text-sm text-slate-500">No arrivals captured yet for the current session.</p>
  {:else}
    <div class="space-y-3">
      {#each context.recent_arrivals as row}
        <div class="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
          <div>
            <div class="font-display text-base font-semibold text-ink">{row.display_token}</div>
            <div class="text-sm text-slate-600">{row.patient_name}</div>
          </div>
          <div class="text-right text-sm text-slate-500">
            <div>{row.status}</div>
            <div>{row.arrived_at}</div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
```

- [ ] **Step 3: Build the result-card and multiple-match state components**

Create `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`:

```svelte
<script lang="ts">
  import type { ArrivalCardRecord, ResultState } from "$arrival/types";
  export let card: ArrivalCardRecord | null;
  export let state: ResultState;
  export let onConfirm: () => void;
  export let onReset: () => void;
  export let onPrint: () => void;
</script>

<section class="rounded-panel border border-line bg-white p-6 shadow-panel min-h-[20rem]">
  {#if state === "idle"}
    <div class="flex h-full items-center justify-center text-slate-500">Scan a token slip or search for a patient to begin.</div>
  {:else if state === "loading"}
    <div class="flex h-full items-center justify-center gap-3 text-slate-500">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-mineral"></div>
      <span>Looking up patient…</span>
    </div>
  {:else if card}
    <div class="flex h-full flex-col justify-between gap-6">
      <div>
        <div class="text-sm uppercase tracking-[0.18em] text-slate-500">{card.state_label}</div>
        <div class="mt-3 font-display text-6xl font-extrabold text-ink">{card.display_token}</div>
        <div class="mt-4 text-3xl font-semibold text-ink">{card.patient_name}</div>
        <div class="mt-3 text-base text-slate-600">{card.visit_label}</div>
      </div>

      <div class="flex flex-wrap gap-3">
        {#if state === "pre-confirm"}
          <button class="rounded-2xl bg-mineral px-5 py-3 font-semibold text-white" on:click={onConfirm}>Confirm Arrival</button>
          <button class="rounded-2xl px-5 py-3 text-slate-600" on:click={onReset}>Not this patient</button>
        {:else}
          <button class="rounded-2xl bg-mineral px-5 py-3 font-semibold text-white" on:click={onPrint}>Print Token Slip</button>
          <button class="rounded-2xl px-5 py-3 text-slate-600" on:click={onReset}>Next patient</button>
        {/if}
      </div>
    </div>
  {/if}
</section>
```

Create `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`:

```svelte
<script lang="ts">
  import type { ArrivalCardRecord } from "$arrival/types";
  export let candidates: ArrivalCardRecord[] = [];
  export let onChoose: (card: ArrivalCardRecord) => void;
</script>

<section class="rounded-panel border border-line bg-white p-4 shadow-panel">
  <div class="mb-3 font-display text-lg font-semibold text-ink">Select patient</div>
  <div class="space-y-3">
    {#each candidates as candidate}
      <button class="flex w-full items-center justify-between rounded-2xl border border-line px-4 py-3 text-left hover:border-mineral" on:click={() => onChoose(candidate)}>
        <div>
          <div class="font-display font-semibold text-ink">{candidate.display_token}</div>
          <div class="text-sm text-slate-600">{candidate.patient_name}</div>
        </div>
        <div class="text-sm text-slate-500">{candidate.visit_label}</div>
      </button>
    {/each}
  </div>
</section>
```

- [ ] **Step 4: Compose the route from the focused modules and auto-reset success**

Create `frontend/head-app/src/routes/arrival-counter/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import HeaderBar from "$arrival/components/HeaderBar.svelte";
  import InputSurface from "$arrival/components/InputSurface.svelte";
  import ResultCard from "$arrival/components/ResultCard.svelte";
  import MultipleMatchesList from "$arrival/components/MultipleMatchesList.svelte";
  import RecentArrivals from "$arrival/components/RecentArrivals.svelte";
  import { ArrivalCounterState } from "$arrival/state.svelte";
  import { attachArrivalTransport } from "$realtime/frappe-transport";
  import { printTokenSlip } from "$arrival/print-slip";

  const state = new ArrivalCounterState();
  let resetTimer = 0;

  async function handleSubmit(raw: string) {
    await state.lookup(raw);
  }

  async function handleConfirm() {
    await state.confirmArrival();
    if (state.resultState === "success") {
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => state.reset(), 3500);
    }
  }

  onMount(async () => {
    await state.refreshContext();
    const detach = attachArrivalTransport(() => state.refreshContext(), window.frappe?.realtime);
    return () => {
      window.clearTimeout(resetTimer);
      detach();
    };
  });
</script>

<svelte:head>
  <title>Arrival Counter</title>
</svelte:head>

<div class="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10">
  <HeaderBar context={state.context} />
  <main class="grid gap-6">
    <InputSurface bind:value={state.inputValue} onSubmit={handleSubmit} disabled={state.resultState === "loading"} />

    {#if state.resultState === "multiple"}
      <MultipleMatchesList candidates={state.candidates} onChoose={(card) => { state.selected = card; state.resultState = card.status === "Arrived" ? "already-arrived" : "pre-confirm"; }} />
    {/if}

    <ResultCard
      card={state.selected}
      state={state.resultState}
      onConfirm={handleConfirm}
      onReset={() => state.reset()}
      onPrint={() => state.selected && printTokenSlip(state.selected)}
    />

    <RecentArrivals context={state.context} />
  </main>
</div>
```

- [ ] **Step 5: Run the frontend checks again and verify the screen compiles**

Run:

```bash
npm run check && npm run test && npm run build
```

Expected:

```text
... svelte-check found 0 errors and 0 warnings
... all tests passed
... built in ...
```

- [ ] **Step 6: Commit the UI slice**

Run:

```bash
git add frontend/head-app/src && git commit -m "feat: build arrival counter v1 screen"
```

---

### Task 7: Add End-to-End Coverage and Bundle Mount Verification

**Files:**

- Create:
  - `frontend/head-app/playwright.config.ts`
  - `frontend/head-app/tests/arrival-counter.spec.ts`
- Modify:
  - `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`

- [ ] **Step 1: Add Playwright config for local slice verification**

Create `frontend/head-app/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command: "npm run dev -- --strictPort",
    port: 4173,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: Add a focused happy-path and already-arrived e2e test**

Create `frontend/head-app/tests/arrival-counter.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("shows no-match feedback without layout jump", async ({ page }) => {
  await page.goto("/arrival-counter");
  await page.getByPlaceholder("Scan barcode or enter patient ID").fill("zz");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByText("Scan a token slip or search for a patient to begin.")).toHaveCount(0);
});

test("renders the canonical result card shell", async ({ page }) => {
  await page.goto("/arrival-counter");
  await expect(page.getByText("Arrival Counter")).toBeVisible();
  await expect(page.getByText("Recent Arrivals")).toBeVisible();
});
```

- [ ] **Step 3: Export a predictable mount API from the frontend bundle**

Modify the head-app entrypoint by adding `frontend/head-app/src/lib/mount-arrival-counter.ts`:

```ts
import Page from "../routes/arrival-counter/+page.svelte";

export function mount({ target, props }: { target: HTMLElement; props?: Record<string, unknown> }) {
  return new Page({ target, props });
}

declare global {
  interface Window {
    clinicFlowArrivalCounterV1?: { mount: typeof mount };
  }
}

window.clinicFlowArrivalCounterV1 = { mount };
```

Update `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js` so it expects that global exactly:

```javascript
const mount = window.clinicFlowArrivalCounterV1;
```

- [ ] **Step 4: Run the e2e tests**

Run:

```bash
npm run test:e2e
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Build the mount bundle and verify the host page loads it**

Run:

```bash
npm run build
```

Expected:

```text
... built in ...
```

- [ ] **Step 6: Commit the verification layer**

Run:

```bash
git add frontend/head-app/playwright.config.ts frontend/head-app/tests clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js && git commit -m "test: cover arrival counter v1 frontend flows"
```

---

### Task 8: Sync Docs, Verify the Slice End-to-End, and Refresh Graphify

**Files:**

- Modify: `ARCHITECTURE.md`
- Create: `docs/notes/arrival-counter-v1-frontend.md`

- [ ] **Step 1: Update `ARCHITECTURE.md` for the new frontend slice**

Add a new section near the current UI direction and slice history:

```md
## 13. Arrival Counter V1 Head-App Slice

- `arrival-counter-v1` is the first head-app frontend migration slice.
- The active backend authority remains `clinic_flow.api.arrival`.
- The legacy `arrival_counter` Desk page remains available during coexistence.
- The new slice uses a thin Frappe host surface and keeps operational UI logic in the dedicated frontend workspace under `frontend/head-app`.
- Arrival lookup, arrival confirmation, token slip content, and live context remain backend-owned.
```

- [ ] **Step 2: Write the implementation summary note**

Create `docs/notes/arrival-counter-v1-frontend.md`:

```md
# Arrival Counter V1 Frontend

Date: 2026-04-27
Spec: `docs/superpowers/specs/2026-04-27-head-app-frontend-architecture-design.md`
Spec: `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md`
Plan: `docs/superpowers/plans/2026-04-27-arrival-counter-v1-frontend.md`

## Goal

Ship the first head-app frontend slice for Arrival Counter while preserving backend arrival authority and coexistence with the legacy Desk page.

## Implemented in This Slice

- Added `frontend/head-app` with SvelteKit, Tailwind, TypeScript, Vitest, and Playwright.
- Added `arrival_counter_v1` thin Frappe host page.
- Extended `clinic_flow.api.arrival` with richer session context, result-card data, and recent arrivals.
- Built the canonical Arrival Counter v1 layout and state flow.

## Verification Completed

- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract`
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary`
- `npm run check`
- `npm run test`
- `npm run test:e2e`
- `npm run build`
- `graphify update .`

## Out of Scope

- No receptionist shell or token board head-app slice.
- No queue-authority rewrite.
- No removal of the legacy `arrival_counter` page.

## Next Integration Step

Validate the mounted page with real staff operators on desktop counters, then use the same `frontend/head-app` workspace to implement `Reception Shell + Live Queue Rail`.
```

- [ ] **Step 3: Run the final verification set from the worktree**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract && bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary && npm run check && npm run test && npm run test:e2e && npm run build
```

Expected:

```text
OK
... all tests passed
... built in ...
```

- [ ] **Step 4: Refresh graphify after code changes**

Run:

```bash
graphify update .
```

Expected:

```text
Graph update completed
```

- [ ] **Step 5: Commit the docs and verification closure**

Run:

```bash
git add ARCHITECTURE.md docs/notes/arrival-counter-v1-frontend.md graphify-out && git commit -m "docs: record arrival counter v1 frontend slice"
```

---

## Self-Review

- Spec coverage:
  - Dedicated head-app workspace: covered in Tasks 2, 5, and 6.
  - Same-domain staff-only host: covered in Task 3.
  - Canonical layout and state shell: covered in Task 6.
  - Unified QR/phone/name input: covered in Task 5 classifier and Task 6 input component.
  - Compact current/next session plus stats: covered in Task 4 contract and Task 6 header.
  - Quiet recent arrivals: covered in Task 4 contract and Task 6 recent-arrivals component.
  - Print token slip only after arrived/success: covered in Tasks 4, 5, and 6.
  - Realtime/update expectations with backend authority: covered in Task 5 transport adapter and Task 6 route refresh flow.
  - Coexistence with the old page: covered in File Structure and Task 8 docs.
- Placeholder scan: no `TODO`, `TBD`, or “implement later” placeholders remain in this plan.
- Type consistency:
  - Backend-returned card type is `ArrivalCardRecord` throughout.
  - Frontend state values stay `idle`, `loading`, `no-match`, `multiple`, `pre-confirm`, `already-arrived`, `success`, `error` across state and components.
  - The new host expects `window.clinicFlowArrivalCounterV1.mount(...)` consistently.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-arrival-counter-v1-frontend.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
