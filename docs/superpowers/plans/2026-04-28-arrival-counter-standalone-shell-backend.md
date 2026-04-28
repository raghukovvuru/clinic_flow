# Arrival Counter Standalone Shell — Backend Plan

> **Source plan:** `docs/superpowers/plans/2026-04-28-arrival-counter-standalone-shell.md`
> **Parallel sibling:** `docs/superpowers/plans/2026-04-28-arrival-counter-standalone-shell-frontend.md`
> **Integration:** After both plans complete, verify `npm run build` drops assets into `clinic_flow/public/head-app/` and the Frappe route at `/clinic/arrival-counter` serves them with auth.

**Goal:** Backend half — staff permission enforcement, Frappe website shell route, Desk bridge, tests, and docs.

**Dependencies:** No frontend source dependencies. The shell route controller reads a built HTML file from disk but does not import or depend on any frontend source code.

---

## Task B1: Backend Permission Enforcement For Arrival APIs

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

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract --test test_arrival_api_methods_reject_non_staff_user
```

Expected: FAIL because APIs don't yet enforce staff permissions.

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

Then add `enforce_arrival_counter_access()` as the first statement inside each of these whitelisted methods: `resolve_arrival_sessions`, `lookup_arrival_candidate`, `mark_arrived`, `get_token_qr`, `get_arrival_session_context`.

Keep existing type annotations unchanged. Do not add `allow_guest=True`.

- [ ] **Step 5: Run backend contract and permission tests**

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract
```

Expected: `Ran 5 tests` and `OK`.

- [ ] **Step 6: Run neighboring arrival boundary tests**

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
```

Expected: `Ran 5 tests` and `OK`.

- [ ] **Step 7: Commit this task**

```bash
git add clinic_flow/api/arrival.py clinic_flow/api/arrival_permissions.py clinic_flow/tests/test_arrival_frontend_contract.py && git commit -m "fix: enforce arrival counter API permissions"
```

---

## Task B2: Frappe Standalone Shell Route At `/clinic/arrival-counter`

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

This route intentionally does not use an iframe.

- [ ] **Step 5: Register the canonical website route**

Modify `clinic_flow/hooks.py`. Change the existing `website_route_rules` to:

```python
website_route_rules = [
    {"from_route": "/queue-dashboard", "to_route": "queue-dashboard"},
    {"from_route": "/clinic/arrival-counter", "to_route": "clinic/arrival_counter"},
]
```

Keep `app_include_css = []` and `app_include_js = []`. Do not globally inject the head app into Desk.

- [ ] **Step 6: Run shell tests**

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_counter_shell
```

Expected: `Ran 2 tests` and `OK`.

- [ ] **Step 7: Commit this task**

```bash
git add clinic_flow/www/clinic/arrival_counter.py clinic_flow/www/clinic/arrival_counter.html clinic_flow/hooks.py clinic_flow/tests/test_arrival_counter_shell.py && git commit -m "feat: add arrival counter standalone shell route"
```

---

## Task B3: Desk Compatibility Bridge

**Files:**
- Modify: `clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js`

- [ ] **Step 1: Convert the Desk page to a bridge, not an iframe host**

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

- [ ] **Step 2: Run frontend build to verify Desk page is not broken**

```bash
bench build --app clinic_flow
```

Expected: build succeeds without errors.

- [ ] **Step 3: Commit this task**

```bash
git add clinic_flow/clinic_flow/page/arrival_counter_v1/arrival_counter_v1.js && git commit -m "fix: convert arrival counter desk page to shell bridge"
```

---

## Task B4: Documentation Updates

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

```bash
git add ARCHITECTURE.md docs/notes/arrival-counter-v1-frontend.md docs/notes/arrival-counter-standalone-shell.md && git commit -m "docs: record arrival counter standalone shell"
```

---

## Task B5: Backend Final Verification

- [ ] **Step 1: Run all backend test modules**

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract \
  && bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_counter_shell \
  && bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
```

Expected: all three modules report `OK`.

- [ ] **Step 2: Run bench migrate to ensure no broken patches**

```bash
bench --site site1.localhost migrate
```

Expected: migrate succeeds without errors.

- [ ] **Step 3: Review git diff for accidental forbidden changes**

```bash
git diff --stat
```

Expected: no files under `apps/healthcare/`; no changes routing queue authority through `Patient Appointment`; no broad unrelated rewrites.

- [ ] **Step 4: Integration checkpoint — notify frontend plan that backend is ready**

Signal that the Frappe route `/clinic/arrival-counter` is registered and ready to serve the frontend build output.

---

## Self-Review (Backend)

### Spec Coverage
- Staff-only backend permissions: B1
- Frappe route/shell at `/clinic/arrival-counter`: B2, B3
- No static iframe as canonical shell: B2, B3
- Boot object with user/roles/CSRF/permissions: B2
- Docs required by `AGENTS.md`: B4
- No Healthcare edits: B5 diff review
- No queue authority through `Patient Appointment`: B5 diff review

### Task Dependency Order
B1 → B2 → B3 → B4 → B5 (strictly sequential within backend)

### No Frontend Dependencies
None of the backend tasks import, require, or depend on any frontend source code (TypeScript, Svelte, JS modules). B2 reads a built HTML file from disk but does not depend on frontend source.
