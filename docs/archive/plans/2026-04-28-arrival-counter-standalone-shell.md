# Arrival Counter Standalone Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Arrival Counter v1 from a static iframe/head-app drift into the approved Frappe-served standalone SvelteKit shell at `/clinic/arrival-counter`.

**Architecture:** Keep Frappe as the source of truth for session auth, route authorization, CSRF, arrival lookup, arrival mutation, token slip data, and permissions. Serve the existing SvelteKit Arrival Counter route through a minimal authenticated Frappe website shell that injects a runtime-validated boot object, loads the built head-app assets, and keeps the legacy Desk page as a coexistence bridge rather than the canonical operator URL.

**Tech Stack:** Frappe v16, Python 3.11, Frappe website route rules, SvelteKit static build, Svelte 5 runes, TypeScript, Tailwind CSS, Vitest, Playwright, `IntegrationTestCase`, same-origin session auth, boot-provided CSRF, polling-first transport with optional injected Frappe realtime.

---

## Source Inputs

- `AGENTS.md`
- `PRODUCT.md`
- `DESIGN.md`
- `ARCHITECTURE.md`
- `CONTEXT_INDEX.md`
- `docs/healthcare-compatibility-audit.md`
- `docs/receptionist-backend-policy.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md`
- `docs/superpowers/specs/2026-04-28-arrival-counter-standalone-shell-design.md`
- `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md`
- `docs/notes/arrival-counter-v1-frontend.md`
- `docs/notes/arrival-frontend-contract-enrichment.md`

## Current Implementation Map

- `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`
  - Current static iframe host. It points to `/assets/clinic_flow/head-app/arrival-counter.html` and is the core drift to retire from canonical use.
- `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.py`
  - Current Desk page context only. It sets no-cache and title, but does not own the standalone route shell.
- `clinic_flow/api/arrival.py`
  - Backend authority for arrival session resolution, lookup, arrival mutation, QR SVG generation, and header context. It currently has typed whitelisted methods but no explicit staff permission enforcement.
- `frontend/head-app/src/lib/api/client.ts`
  - Thin Frappe RPC client. It currently reads `window.frappe?.csrf_token`, which breaks the standalone shell contract.
- `frontend/head-app/src/lib/api/arrival.ts`
  - Arrival API wrapper. It currently trusts TypeScript types without runtime response validation.
- `frontend/head-app/src/lib/arrival-counter/types.ts`
  - Arrival frontend contract types. It currently lacks `ArrivalCounterBoot`, normalized error, transport state, and stricter state fields.
- `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
  - Local/server state orchestration. It currently lacks pending flags, candidate keyboard index, typed errors, and focus/reset coordination.
- `frontend/head-app/src/routes/arrival-counter/+page.svelte`
  - SvelteKit Arrival Counter page. It directly reads `(window as any).frappe?.realtime`, renders multiple matches outside `ResultCard`, and has incomplete keyboard flow.
- `frontend/head-app/src/lib/realtime/frappe-transport.ts`
  - Transport adapter. It accepts an optional realtime object but does not own typed transport state or boot-mode decisions.
- `frontend/head-app/src/lib/arrival-counter/print-slip.ts`
  - Print helper. It uses `document.write()` with raw patient-controlled values and QR SVG interpolation.
- `frontend/head-app/tests/arrival-counter.spec.ts`
  - Vite-route e2e tests only. They do not prove real Frappe-shell behavior.
- `clinic_flow/tests/test_arrival_frontend_contract.py`
  - Backend contract tests for enriched arrival payloads. It does not test permissions yet.
- `frontend/head-app/package.json`
  - Frontend scripts: `check`, `test`, `test:e2e`, `build`.
- `frontend/head-app/svelte.config.js`
  - Static adapter build for `/` and `/arrival-counter`. It does not set asset paths for Frappe shell delivery.
- `frontend/head-app/copy-build-to-frappe.js`
  - Copies static build to `clinic_flow/public/head-app`. It does not verify the route artifact or produce shell-friendly diagnostics.
- `clinic_flow/hooks.py`
  - Website routes currently include `/queue-dashboard` only. It must add `/clinic/arrival-counter -> clinic/arrival_counter` without globally injecting head-app assets.

## Target File Structure And Responsibilities

- Create: `clinic_flow/api/arrival_permissions.py`
  - Single source for Arrival Counter role constants, staff enforcement, and boot permission flags.
- Modify: `clinic_flow/api/arrival.py`
  - Enforce staff permissions in every Arrival Counter whitelisted method, including `resolve_arrival_sessions` if it remains whitelisted.
- Create: `clinic_flow/www/clinic/arrival_counter.py`
  - Authenticated no-cache Frappe route controller for `/clinic/arrival-counter`. It builds `window.clinicFlowBoot`, denies non-staff users, and loads the built head-app HTML fragment through a small helper.
- Create: `clinic_flow/www/clinic/arrival_counter.html`
  - Minimal standalone route shell. No Desk chrome, no iframe, no queue controls, no global Desk asset injection.
- Modify: `clinic_flow/hooks.py`
  - Add a website route rule from `/clinic/arrival-counter` to `clinic/arrival_counter`.
- Modify: `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`
  - Convert the Desk compatibility page from iframe host to a clear bridge link or redirect to `/clinic/arrival-counter`.
- Modify: `frontend/head-app/svelte.config.js`
  - Set Frappe asset path behavior so built `_app` assets resolve from `/assets/clinic_flow/head-app/_app/...` when loaded by the Frappe shell.
- Modify: `frontend/head-app/copy-build-to-frappe.js`
  - Verify `build/arrival-counter.html` exists and copy built assets. Fail visibly when route output is missing.
- Create: `frontend/head-app/src/lib/boot/boot.ts`
  - Typed boot object reader and runtime validator for `window.clinicFlowBoot`.
- Create: `frontend/head-app/src/lib/boot/boot.test.ts`
  - Unit tests for valid boot, missing boot, invalid slice, missing CSRF, and denied permission flags.
- Modify: `frontend/head-app/src/lib/api/client.ts`
  - Read CSRF from validated boot, normalize Frappe errors, preserve same-origin credentials, and stop reading `window.frappe`.
- Create: `frontend/head-app/src/lib/api/client.test.ts`
  - Unit tests for CSRF header, `message` unwrapping, 401/403/417/500 normalization, and malformed response handling.
- Modify: `frontend/head-app/src/lib/api/arrival.ts`
  - Runtime-validate critical API response boundaries.
- Create: `frontend/head-app/src/lib/api/arrival.test.ts`
  - Tests for invalid session context, invalid lookup candidates, and invalid mutation payloads.
- Modify: `frontend/head-app/src/lib/realtime/frappe-transport.ts`
  - Make transport boot-driven. Page code passes a transport factory or boot object, not `window.frappe`.
- Create: `frontend/head-app/src/lib/realtime/frappe-transport.test.ts`
  - Tests for polling fallback, invalidation, cleanup, stale state, and optional injected realtime.
- Modify: `frontend/head-app/src/lib/arrival-counter/types.ts`
  - Add boot, error, transport, candidate focus, pending mutation, and strict state types.
- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
  - Add keyboard-first state, pending guards, selected candidate index, background refresh preservation, normalized errors, and reset focus signal.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`
  - Add focus restoration hooks and visible focus rules.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
  - Render idle/loading/no-match/multiple/pre-confirm/already-arrived/success inside one shared result-card shell.
- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
  - Make it an inner content component used by `ResultCard`, with keyboard roving focus and accessible row names.
- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
  - Use boot adapter, API/transport adapters, keyboard loop, and shared result-card shell. No direct `window.frappe` reads.
- Modify: `frontend/head-app/src/lib/arrival-counter/print-slip.ts`
  - Escape text, construct DOM instead of writing raw interpolated HTML, allow QR SVG only from trusted app-owned backend payload, and report popup failure.
- Create: `frontend/head-app/src/lib/arrival-counter/print-slip.test.ts`
  - Tests for escaping patient name/token and not enabling print before arrived/success states.
- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`
  - Cover multiple matches inside result-card shell, keyboard-only lookup/select/confirm/reset, and print availability.
- Create: `frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts`
  - Real Frappe-route smoke test for `/clinic/arrival-counter`, boot injection, no iframe, and built bundle presence. This test requires a running Frappe site with an authenticated staff session state.
- Modify: `clinic_flow/tests/test_arrival_frontend_contract.py`
  - Add permission tests for every Arrival Counter whitelisted method.
- Create: `clinic_flow/tests/test_arrival_counter_shell.py`
  - Backend tests for shell boot object, route authorization, asset loading failure, and no-cache context.
- Modify: `ARCHITECTURE.md`
  - Replace the iframe-host statement in section 13 with the standalone shell route.
- Modify: `docs/notes/arrival-counter-v1-frontend.md`
  - Add a correction section explaining what changed, what was verified, what stayed out of scope, and next integration step.
- Create: `docs/notes/arrival-counter-standalone-shell.md`
  - Focused implementation summary note for this correction.
- Do not modify: anything under `apps/healthcare/`.
- Do not modify as queue authority: `Patient Appointment` lifecycle hooks or legacy appointment check-in paths.

---

### Task 1: Backend Permission Enforcement For Arrival APIs

**Files:**

- Create: `clinic_flow/api/arrival_permissions.py`
- Modify: `clinic_flow/api/arrival.py`
- Modify: `clinic_flow/tests/test_arrival_frontend_contract.py`

- [ ] **Step 1: Write failing permission tests first**

Append these tests and helper methods to `clinic_flow/tests/test_arrival_frontend_contract.py`:

```python
    def test_arrival_api_methods_reject_non_staff_user(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=11)
        user = self.make_queue_viewer_user()

        protected_calls = [
            lambda: frappe.get_attr("clinic_flow.api.arrival.resolve_arrival_sessions")(),
            lambda: frappe.get_attr("clinic_flow.api.arrival.get_arrival_session_context")(),
            lambda: frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(qr_code=entry.name),
            lambda: frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(queue_entry=entry.name),
            lambda: frappe.get_attr("clinic_flow.api.arrival.get_token_qr")(queue_entry=entry.name),
        ]

        try:
            frappe.set_user(user.name)
            for call in protected_calls:
                with self.assertRaises(frappe.PermissionError):
                    call()
        finally:
            frappe.set_user("Administrator")

    def test_arrival_api_methods_allow_queue_manager_user(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=12)
        user = self.make_arrival_staff_user("Queue Manager")

        try:
            frappe.set_user(user.name)
            context = frappe.get_attr("clinic_flow.api.arrival.get_arrival_session_context")()
            lookup = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(qr_code=entry.name)
            result = frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(queue_entry=entry.name)
            qr = frappe.get_attr("clinic_flow.api.arrival.get_token_qr")(queue_entry=entry.name)

            self.assertIn("stats", context)
            self.assertEqual(lookup["candidates"][0]["queue_entry"], entry.name)
            self.assertEqual(result["status"], "Arrived")
            self.assertIn("<svg", qr)
        finally:
            frappe.set_user("Administrator")

    def make_queue_viewer_user(self):
        return self.make_arrival_staff_user("Queue Viewer")

    def make_arrival_staff_user(self, role: str):
        email = f"arrival-{role.lower().replace(' ', '-')}-{frappe.generate_hash(length=8)}@example.com"
        return frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Arrival",
            "last_name": role.replace(" ", ""),
            "user_type": "System User",
            "enabled": 1,
            "send_welcome_email": 0,
            "roles": [{"role": role}],
        }).insert(ignore_permissions=True)
```

- [ ] **Step 2: Run permission tests to verify they fail**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract --test test_arrival_api_methods_reject_non_staff_user
```

Expected: FAIL because `resolve_arrival_sessions`, `get_arrival_session_context`, `lookup_arrival_candidate`, `mark_arrived`, and `get_token_qr` do not yet raise `frappe.PermissionError` for `Queue Viewer`.

- [ ] **Step 3: Add the shared permission helper**

Create `clinic_flow/api/arrival_permissions.py`:

```python
from __future__ import annotations

import frappe

ARRIVAL_COUNTER_ROLES: tuple[str, ...] = (
	"Healthcare Administrator",
	"Queue Manager",
	"System Manager",
)


def enforce_arrival_counter_access() -> None:
	"""Require a staff role for Arrival Counter shell and APIs."""
	frappe.only_for(ARRIVAL_COUNTER_ROLES)


def get_arrival_counter_permissions() -> dict:
	roles = set(frappe.get_roles(frappe.session.user))
	can_use = bool(roles.intersection(ARRIVAL_COUNTER_ROLES))
	return {
		"canUseArrivalCounter": can_use,
		"canConfirmArrival": can_use,
		"canPrintTokenSlip": can_use,
	}
```

- [ ] **Step 4: Enforce the helper in every Arrival Counter whitelist**

Modify `clinic_flow/api/arrival.py`:

```python
from clinic_flow.api.arrival_permissions import enforce_arrival_counter_access
```

Then add `enforce_arrival_counter_access()` as the first statement inside these whitelisted methods:

```python
@frappe.whitelist()
def resolve_arrival_sessions(dept_abbr: str = "") -> list:
	enforce_arrival_counter_access()
	...

@frappe.whitelist()
def lookup_arrival_candidate(
	qr_code: str = "",
	phone: str = "",
	name_query: str = "",
	dept_abbr: str = "",
) -> dict:
	enforce_arrival_counter_access()
	...

@frappe.whitelist()
def mark_arrived(queue_entry: str, queue_session: str = "") -> dict:
	enforce_arrival_counter_access()
	...

@frappe.whitelist()
def get_token_qr(queue_entry: str) -> str:
	enforce_arrival_counter_access()
	...

@frappe.whitelist()
def get_arrival_session_context(dept_abbr: str = "") -> dict:
	enforce_arrival_counter_access()
	...
```

Keep the existing type annotations unchanged. Do not add `allow_guest=True` to any Arrival Counter method.

- [ ] **Step 5: Run backend contract and permission tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract
```

Expected: `Ran 5 tests` and `OK`.

- [ ] **Step 6: Run neighboring arrival boundary tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
```

Expected: `Ran 5 tests` and `OK`.

- [ ] **Step 7: Commit this task**

Run:

```bash
git add clinic_flow/api/arrival.py clinic_flow/api/arrival_permissions.py clinic_flow/tests/test_arrival_frontend_contract.py && git commit -m "fix: enforce arrival counter API permissions"
```

Expected: commit succeeds. Do not push.

---

### Task 2: Frappe Standalone Shell Route At `/clinic/arrival-counter`

**Files:**

- Create: `clinic_flow/www/clinic/arrival_counter.py`
- Create: `clinic_flow/www/clinic/arrival_counter.html`
- Modify: `clinic_flow/hooks.py`
- Create: `clinic_flow/tests/test_arrival_counter_shell.py`

- [ ] **Step 1: Write failing shell tests first**

Create `clinic_flow/tests/test_arrival_counter_shell.py`:

```python
import frappe
from frappe.tests import IntegrationTestCase


class TestArrivalCounterShell(IntegrationTestCase):
	def test_shell_context_includes_typed_boot_and_no_cache(self):
		from clinic_flow.www.clinic.arrival_counter import get_context

		context = frappe._dict()
		get_context(context)

		self.assertEqual(context.no_cache, 1)
		self.assertEqual(context.no_header, 1)
		self.assertEqual(context.no_breadcrumbs, 1)
		self.assertEqual(context.boot["app"], "clinic_flow")
		self.assertEqual(context.boot["slice"], "arrival-counter")
		self.assertEqual(context.boot["route"], "/clinic/arrival-counter")
		self.assertTrue(context.boot["csrfToken"])
		self.assertTrue(context.boot["permissions"]["canUseArrivalCounter"])
		self.assertNotIn("iframe", context.shell_html.lower())

	def test_shell_rejects_non_staff_user(self):
		from clinic_flow.www.clinic.arrival_counter import get_context

		user = self.make_queue_viewer_user()
		try:
			frappe.set_user(user.name)
			with self.assertRaises(frappe.PermissionError):
				get_context(frappe._dict())
		finally:
			frappe.set_user("Administrator")

	def make_queue_viewer_user(self):
		email = f"arrival-shell-{frappe.generate_hash(length=8)}@example.com"
		return frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": "Arrival",
			"last_name": "ShellViewer",
			"user_type": "System User",
			"enabled": 1,
			"send_welcome_email": 0,
			"roles": [{"role": "Queue Viewer"}],
		}).insert(ignore_permissions=True)
```

- [ ] **Step 2: Run shell tests to verify they fail**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_counter_shell
```

Expected: FAIL with `ModuleNotFoundError` for `clinic_flow.www.clinic.arrival_counter`.

- [ ] **Step 3: Add the Frappe route controller**

Create `clinic_flow/www/clinic/arrival_counter.py`:

```python
from __future__ import annotations

from pathlib import Path

import frappe

from clinic_flow.api.arrival_permissions import (
	ARRIVAL_COUNTER_ROLES,
	enforce_arrival_counter_access,
	get_arrival_counter_permissions,
)


def _json_for_script(data: dict) -> str:
	return frappe.as_json(data).replace("</", "<\\/")


def _load_head_app_shell(boot_json: str) -> str:
	path = Path(frappe.get_app_path("clinic_flow", "public", "head-app", "arrival-counter.html"))
	if not path.exists():
		frappe.throw(
			"Arrival Counter frontend build is missing. Run `npm run build` in frontend/head-app.",
			frappe.ValidationError,
		)

	html = path.read_text(encoding="utf-8")
	html = html.replace('href="./_app/', 'href="/assets/clinic_flow/head-app/_app/')
	html = html.replace('src="./_app/', 'src="/assets/clinic_flow/head-app/_app/')
	html = html.replace('import("./_app/', 'import("/assets/clinic_flow/head-app/_app/')
	body_index = html.find("<body")
	if body_index == -1:
		frappe.throw("Arrival Counter frontend build is malformed: missing body tag.", frappe.ValidationError)
	body_open_end = html.find(">", body_index)
	if body_open_end == -1:
		frappe.throw("Arrival Counter frontend build is malformed: incomplete body tag.", frappe.ValidationError)
	boot_script = f"\n<script>window.clinicFlowBoot = {boot_json};</script>\n"
	return html[: body_open_end + 1] + boot_script + html[body_open_end + 1 :]


def _build_boot() -> dict:
	return {
		"app": "clinic_flow",
		"slice": "arrival-counter",
		"route": "/clinic/arrival-counter",
		"siteName": frappe.local.site,
		"user": frappe.session.user,
		"roles": frappe.get_roles(frappe.session.user),
		"csrfToken": frappe.sessions.get_csrf_token(),
		"realtime": {
			"enabled": False,
			"mode": "polling",
		},
		"permissions": get_arrival_counter_permissions(),
	}


def get_context(context):
	enforce_arrival_counter_access()
	boot = _build_boot()

	context.no_cache = 1
	context.no_header = 1
	context.no_breadcrumbs = 1
	context.no_sidebar = 1
	context.sitemap = 0
	context.title = "Arrival Counter"
	context.allowed_roles = ARRIVAL_COUNTER_ROLES
	context.boot = boot
	context.boot_json = _json_for_script(boot)
	context.shell_html = _load_head_app_shell(context.boot_json)
```

- [ ] **Step 4: Add the minimal Frappe shell template**

Create `clinic_flow/www/clinic/arrival_counter.html` as a full-page shell passthrough:

```html
{{ shell_html | safe }}
```

This route intentionally does not use an iframe. It serves the generated SvelteKit document through an authenticated Frappe controller that rewrites asset paths and injects boot data immediately after the opening body tag.

- [ ] **Step 5: Register the canonical website route**

Modify `clinic_flow/hooks.py`:

```python
website_route_rules = [
	{"from_route": "/queue-dashboard", "to_route": "queue-dashboard"},
	{"from_route": "/clinic/arrival-counter", "to_route": "clinic/arrival_counter"},
]
```

Keep `app_include_css = []` and `app_include_js = []`. Do not globally inject the head app into Desk.

- [ ] **Step 6: Run shell tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_counter_shell
```

Expected: `Ran 2 tests` and `OK`.

- [ ] **Step 7: Commit this task**

Run:

```bash
git add clinic_flow/www/clinic/arrival_counter.py clinic_flow/www/clinic/arrival_counter.html clinic_flow/hooks.py clinic_flow/tests/test_arrival_counter_shell.py && git commit -m "feat: add arrival counter standalone shell route"
```

Expected: commit succeeds. Do not push.

---

### Task 3: Frontend Boot Adapter And Runtime Validation

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

Run:

```bash
npm run test -- src/lib/boot/boot.test.ts
```

Workdir: `frontend/head-app`

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

Run:

```bash
npm run test -- src/lib/boot/boot.test.ts
```

Workdir: `frontend/head-app`

Expected: PASS, 5 tests pass.

- [ ] **Step 6: Commit this task**

Run:

```bash
git add frontend/head-app/src/lib/boot frontend/head-app/src/lib/arrival-counter/types.ts && git commit -m "feat: add arrival counter boot validation"
```

Expected: commit succeeds. Do not push.

---

### Task 4: API Client CSRF Switch And Error Normalization

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

Run:

```bash
npm run test -- src/lib/api/client.test.ts
```

Workdir: `frontend/head-app`

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

Run:

```bash
npm run test -- src/lib/api/client.test.ts
```

Workdir: `frontend/head-app`

Expected: PASS, 3 tests pass.

- [ ] **Step 6: Commit this task**

Run:

```bash
git add frontend/head-app/src/lib/api/client.ts frontend/head-app/src/lib/api/client.test.ts frontend/head-app/src/lib/arrival-counter/types.ts && git commit -m "fix: use boot csrf in arrival API client"
```

Expected: commit succeeds. Do not push.

---

### Task 5: Runtime Validation For Arrival API Responses

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

Run:

```bash
npm run test -- src/lib/api/arrival.test.ts
```

Workdir: `frontend/head-app`

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

Run:

```bash
npm run test -- src/lib/api/arrival.test.ts
```

Workdir: `frontend/head-app`

Expected: PASS, 4 tests pass.

- [ ] **Step 5: Commit this task**

Run:

```bash
git add frontend/head-app/src/lib/api/arrival.ts frontend/head-app/src/lib/api/arrival.test.ts && git commit -m "feat: validate arrival API responses"
```

Expected: commit succeeds. Do not push.

---

### Task 6: Realtime And Polling Adapter Without Page-Level `window.frappe`

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

Run:

```bash
npm run test -- src/lib/realtime/frappe-transport.test.ts
```

Workdir: `frontend/head-app`

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

Run:

```bash
npm run test -- src/lib/realtime/frappe-transport.test.ts
```

Workdir: `frontend/head-app`

Expected: PASS, 3 tests pass.

- [ ] **Step 6: Commit this task**

Run:

```bash
git add frontend/head-app/src/lib/realtime/frappe-transport.ts frontend/head-app/src/lib/realtime/frappe-transport.test.ts frontend/head-app/src/lib/arrival-counter/types.ts && git commit -m "feat: isolate arrival counter transport adapter"
```

Expected: commit succeeds. Do not push.

---

### Task 7: Keyboard-First State And Shared Result-Card Shell

**Files:**

- Modify: `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/state.test.ts`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/ResultCard.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/MultipleMatchesList.svelte`
- Modify: `frontend/head-app/src/lib/arrival-counter/components/InputSurface.svelte`
- Modify: `frontend/head-app/src/routes/arrival-counter/+page.svelte`
- Modify: `frontend/head-app/tests/arrival-counter.spec.ts`

- [ ] **Step 1: Write failing state tests for keyboard workflow**

Append to `frontend/head-app/src/lib/arrival-counter/state.test.ts`:

```ts
  it("tracks focused candidate for keyboard selection", async () => {
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

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts && npm run test:e2e
```

Workdir: `frontend/head-app`

Expected: FAIL because candidate focus, shared card multiple rendering, and keyboard reset are not implemented.

- [ ] **Step 4: Add keyboard state methods**

Modify `frontend/head-app/src/lib/arrival-counter/state.svelte.ts`:

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

Update `lookup`, `confirmArrival`, and `reset` in the same file:

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

Modify `frontend/head-app/src/routes/arrival-counter/+page.svelte`:

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

Run:

```bash
npm run test -- src/lib/arrival-counter/state.test.ts && npm run test:e2e
```

Workdir: `frontend/head-app`

Expected: PASS. Existing and new state tests pass. Playwright reports all Arrival Counter e2e tests pass.

- [ ] **Step 10: Commit this task**

Run:

```bash
git add frontend/head-app/src/lib/arrival-counter frontend/head-app/src/routes/arrival-counter/+page.svelte frontend/head-app/tests/arrival-counter.spec.ts && git commit -m "fix: harden arrival counter keyboard result shell"
```

Expected: commit succeeds. Do not push.

---

### Task 8: Secure Print Slip Rendering

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

Run:

```bash
npm run test -- src/lib/arrival-counter/print-slip.test.ts
```

Workdir: `frontend/head-app`

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

Run:

```bash
npm run test -- src/lib/arrival-counter/print-slip.test.ts
```

Workdir: `frontend/head-app`

Expected: PASS, 3 tests pass.

- [ ] **Step 5: Commit this task**

Run:

```bash
git add frontend/head-app/src/lib/arrival-counter/print-slip.ts frontend/head-app/src/lib/arrival-counter/print-slip.test.ts && git commit -m "fix: escape arrival token slip printing"
```

Expected: commit succeeds. Do not push.

---

### Task 9: Build Output And Desk Compatibility Bridge

**Files:**

- Modify: `frontend/head-app/svelte.config.js`
- Modify: `frontend/head-app/copy-build-to-frappe.js`
- Modify: `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`
- Modify: `frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts`

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

Run:

```bash
npm run test:e2e
```

Workdir: `frontend/head-app`

Expected: local Vite-route tests pass and `arrival-counter-frappe-shell.spec.ts` is skipped unless `FRAPPE_BASE_URL` is set.

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

- [ ] **Step 5: Convert the Desk page to a bridge, not an iframe host**

Modify `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`:

```javascript
frappe.pages["arrival-counter-v1"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Arrival Counter",
    single_column: true,
  });

  page.main.empty();
  page.main.html(`
    <div class="p-6">
      <div class="mb-3 text-muted">Arrival Counter now runs outside Desk chrome.</div>
      <a class="btn btn-primary" href="/clinic/arrival-counter">Open Arrival Counter</a>
    </div>
  `);
};
```

Do not use an iframe. Keep the legacy Desk page available during coexistence.

- [ ] **Step 6: Run frontend build and local tests**

Run:

```bash
npm run check && npm run test && npm run build && npm run test:e2e
```

Workdir: `frontend/head-app`

Expected: `svelte-check found 0 errors and 0 warnings`; Vitest passes; build copies output to `clinic_flow/public/head-app`; Playwright local tests pass.

- [ ] **Step 7: Run optional real Frappe shell smoke when authenticated state is available**

Run:

```bash
FRAPPE_BASE_URL=http://site1.localhost:8000 FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json npm run test:e2e -- tests/arrival-counter-frappe-shell.spec.ts
```

Workdir: `frontend/head-app`

Expected: PASS when `/tmp/clinic-flow-staff-storage.json` contains a logged-in staff session. If the storage state file is absent, create it manually by logging into `site1.localhost` as a staff user in Playwright before executing this optional smoke test.

- [ ] **Step 8: Commit this task**

Run:

```bash
git add frontend/head-app/svelte.config.js frontend/head-app/copy-build-to-frappe.js frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js clinic_flow/public/head-app && git commit -m "fix: serve arrival counter through Frappe shell"
```

Expected: commit succeeds. Do not push.

---

### Task 10: Documentation Updates Required By `AGENTS.md`

**Files:**

- Modify: `ARCHITECTURE.md`
- Modify: `docs/notes/arrival-counter-v1-frontend.md`
- Create: `docs/notes/arrival-counter-standalone-shell.md`

- [ ] **Step 1: Update `ARCHITECTURE.md` for live behavior**

Replace section `## 13. Arrival Counter V1 Head-App Slice` in `ARCHITECTURE.md` with:

```md
## 13. Arrival Counter V1 Standalone Head-App Slice

- `/clinic/arrival-counter` is the canonical operator route for Arrival Counter v1.
- The route is a Frappe-served standalone shell outside Desk chrome.
- The shell injects `window.clinicFlowBoot` with user, roles, CSRF token, realtime mode, and Arrival Counter permission flags.
- The shell is no-cache and staff-only for `Healthcare Administrator`, `Queue Manager`, and `System Manager`.
- The active backend authority remains `clinic_flow.api.arrival`.
- Arrival lookup, arrival confirmation, token slip content, and live context remain backend-owned.
- The legacy `arrival_counter` and `arrival_counter_v1` Desk pages remain available during coexistence, but they are not the canonical operator route.
- The previous static iframe host at `/assets/clinic_flow/head-app/arrival-counter.html` is compatibility debt and must not be treated as an authenticated operational shell.
```

- [ ] **Step 2: Add a correction section to the existing implementation note**

Append to `docs/notes/arrival-counter-v1-frontend.md`:

```md
## Standalone Shell Correction - 2026-04-28

### What Changed

- Replaced the canonical iframe/static asset host with a Frappe-served shell at `/clinic/arrival-counter`.
- Added typed boot data with user, roles, CSRF token, realtime mode, and Arrival Counter permissions.
- Switched frontend API calls from `window.frappe?.csrf_token` to the boot-provided CSRF token.
- Added backend staff permission enforcement to all Arrival Counter whitelisted methods.
- Kept the legacy Desk page as a coexistence bridge only.
- Hardened print-slip rendering so patient-controlled text is escaped.
- Corrected multiple-match rendering to stay inside the shared result-card shell.

### What Was Verified

- Backend permission and contract tests for `clinic_flow.api.arrival`.
- Shell context tests for boot data, no-cache behavior, and non-staff denial.
- Frontend boot, API, response validation, transport, state, print-slip, and e2e tests.
- SvelteKit build copied assets into `clinic_flow/public/head-app`.
- Real Frappe-route shell smoke when authenticated staff storage state was available.

### What Stayed Out of Scope

- No changes inside `apps/healthcare/`.
- No full-headless OAuth or separate frontend deployment.
- No queue authority rewrite.
- No Patient Appointment lifecycle routing for arrival authority.
- No removal of legacy Desk pages.

### Next Integration Step

- Run staff acceptance on desktop counters at `/clinic/arrival-counter`, then decide whether the older `arrival_counter_v1` Desk bridge should redirect automatically or remain as an explicit link during coexistence.
```

- [ ] **Step 3: Create the focused correction note**

Create `docs/notes/arrival-counter-standalone-shell.md`:

```md
# Arrival Counter Standalone Shell

Date: 2026-04-28
Spec: `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md`
Spec: `docs/superpowers/specs/2026-04-28-arrival-counter-standalone-shell-design.md`
Plan: `docs/superpowers/plans/2026-04-28-arrival-counter-standalone-shell.md`

## What Changed

- Arrival Counter is served canonically at `/clinic/arrival-counter` through a Frappe website shell.
- The shell injects typed boot context and does not use Desk chrome or an iframe.
- Frontend API, transport, and print helpers were adapted for the standalone shell contract.
- Backend Arrival Counter APIs enforce staff permissions directly.

## What Was Verified

- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract`
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_counter_shell`
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary`
- `npm run check`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- Optional real shell smoke: `FRAPPE_BASE_URL=http://site1.localhost:8000 FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json npm run test:e2e -- tests/arrival-counter-frappe-shell.spec.ts`

## What Stayed Out Of Scope

- No Healthcare base app edits.
- No full-headless OAuth work.
- No custom realtime service.
- No queue authority or token allocation changes.
- No removal of legacy Desk compatibility pages.

## Next Integration Step

- Validate `/clinic/arrival-counter` with real counter staff and then choose the final legacy Desk bridge behavior.
```

- [ ] **Step 4: Commit documentation updates**

Run:

```bash
git add ARCHITECTURE.md docs/notes/arrival-counter-v1-frontend.md docs/notes/arrival-counter-standalone-shell.md && git commit -m "docs: record arrival counter standalone shell"
```

Expected: commit succeeds. Do not push.

---

### Task 11: Final Verification And Graph Refresh

**Files:**

- Update generated graph output only if `graphify update .` changes files.

- [ ] **Step 1: Run backend verification**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract && bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_counter_shell && bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
```

Expected: all three modules report `OK`.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
npm run check && npm run test && npm run build && npm run test:e2e
```

Workdir: `frontend/head-app`

Expected: `svelte-check found 0 errors and 0 warnings`; Vitest passes; build copies output to `clinic_flow/public/head-app`; Playwright local tests pass.

- [ ] **Step 3: Run route-level Frappe smoke if authenticated storage exists**

Run:

```bash
FRAPPE_BASE_URL=http://site1.localhost:8000 FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json npm run test:e2e -- tests/arrival-counter-frappe-shell.spec.ts
```

Workdir: `frontend/head-app`

Expected: PASS when `/tmp/clinic-flow-staff-storage.json` exists and contains a logged-in staff session. If this cannot run, record the reason in `docs/notes/arrival-counter-standalone-shell.md` before closing the implementation.

- [ ] **Step 4: Refresh graphify after code changes**

Run:

```bash
graphify update .
```

Expected: graph update completes without errors.

- [ ] **Step 5: Review git diff for accidental forbidden changes**

Run:

```bash
git diff --stat
```

Expected: no files under `apps/healthcare/`; no changes routing queue authority through `Patient Appointment`; no broad unrelated rewrites.

- [ ] **Step 6: Commit verification artifacts if graph output changed**

Run:

```bash
git add graphify-out clinic_flow/public/head-app && git commit -m "chore: refresh arrival counter shell artifacts"
```

Expected: commit succeeds if files changed. If there are no staged changes, do not create an empty commit.

---

## Self-Review

### Spec Coverage

- Frappe route/shell at `/clinic/arrival-counter`: Tasks 2 and 9.
- No static iframe as canonical shell: Tasks 2 and 9.
- Staff-only shell and backend permissions: Tasks 1 and 2.
- Typed boot object and runtime validation: Tasks 2 and 3.
- Boot-provided CSRF in API client: Task 4.
- Runtime validation for critical API responses: Task 5.
- Realtime/polling adapter with no page-level `window.frappe`: Task 6 and Task 7.
- Print-slip escaping and trusted QR handling: Task 8.
- Multiple matches inside shared result-card shell: Task 7.
- Keyboard-first workflow: Task 7.
- Real Frappe-route integration smoke: Task 9 and Task 11.
- Docs required by `AGENTS.md`: Task 10.
- No Healthcare edits: explicit file map and Task 11 diff review.
- No full-headless OAuth: out of scope in notes and file map.
- No queue authority through `Patient Appointment`: explicit file map and Task 11 diff review.

### Placeholder Scan

- No unfinished-marker patterns remain.
- No deferred implementation language remains.
- Optional route-level smoke has an exact command and exact precondition.

### Type And Name Consistency

- Boot type is consistently `ArrivalCounterBoot`.
- Boot global is consistently `window.clinicFlowBoot`.
- Canonical route is consistently `/clinic/arrival-counter`.
- Frappe internal route target is consistently `clinic/arrival_counter`.
- Staff roles are consistently `Healthcare Administrator`, `Queue Manager`, and `System Manager`.
- Result states remain `idle`, `loading`, `no-match`, `multiple`, `pre-confirm`, `already-arrived`, `success`, and existing `error` for normalized degraded banners.
- Permission helper is consistently `enforce_arrival_counter_access()`.

### Realistic Verification Commands

- Backend commands use `bench --site site1.localhost run-tests --app clinic_flow --module ...` matching existing tests.
- Frontend commands use existing `frontend/head-app/package.json` scripts.
- The Frappe shell smoke is separated from local Vite e2e because it requires an authenticated staff browser storage state.
- Graph refresh uses the repo-required `graphify update .` after code changes.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-arrival-counter-standalone-shell.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Do not start implementation until the user chooses an execution approach in a later implementation session.
