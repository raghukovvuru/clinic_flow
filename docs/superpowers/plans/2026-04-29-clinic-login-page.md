# Clinic Login Page Implementation Plan

Date: 2026-04-29
App: `clinic_flow`
Spec: `docs/superpowers/specs/2026-04-29-clinic-login-page-design.md`

## Overview

Build a unified login and access-denied page at `/clinic/login` that replaces the generic Frappe "Not Permitted" hop for all `/clinic/*` routes.

Implementation order prioritizes backend redirect logic first (eliminates the bad UX immediately), then the Frappe shell route, then the SvelteKit login page.

## Slice Order

| Slice | What | Why First |
|---|---|---|
| 1. Backend redirect | Auth detection in shell routes, `/clinic/login` www route, shared shell helper | Eliminates the "Not Permitted" page immediately; all `/clinic/*` routes benefit |
| 2. SvelteKit login page | Login component, boot adapter, login API client, build pipeline | Completes the visual surface for slice 1 |
| 3. Tests | Backend integration tests, frontend unit tests, Playwright e2e | Validates both slices |

---

## Slice 1: Backend Redirect and Shell Route

### 1.1 Create shared shell helper

**New file:** `clinic_flow/www/clinic/head_app_shell.py`

Extract the shared shell logic from `arrival_counter.py` into a reusable module:

```python
from __future__ import annotations

from pathlib import Path

import frappe


def json_for_script(data: dict) -> str:
    """JSON-encode data safe for embedding in a <script> tag."""
    return frappe.as_json(data).replace("</", "<\\/")


def load_head_app_shell(page_name: str, boot_json: str) -> str:
    """Load a SvelteKit HTML page and inject boot context.

    page_name: e.g. "arrival-counter" or "login"
    boot_json: JSON string of the boot context

    Returns HTML string with boot script injected after <body> and
    asset paths rewritten from relative to absolute.
    """
    path = Path(frappe.get_app_path("clinic_flow", "public", "head-app", f"{page_name}.html"))
    if not path.exists():
        frappe.throw(
            f"Head-app frontend build is missing: {page_name}.html. Run `npm run build` in frontend/head-app.",
            frappe.ValidationError,
        )

    html = path.read_text(encoding="utf-8")
    html = html.replace('href="./_app/', 'href="/assets/clinic_flow/head-app/_app/')
    html = html.replace('src="./_app/', 'src="/assets/clinic_flow/head-app/_app/')
    html = html.replace('import("./_app/', 'import("/assets/clinic_flow/head-app/_app/')

    body_index = html.find("<body")
    if body_index == -1:
        frappe.throw(f"Head-app build for {page_name} is malformed: missing body tag.", frappe.ValidationError)
    body_open_end = html.find(">", body_index)
    if body_open_end == -1:
        frappe.throw(f"Head-app build for {page_name} is malformed: incomplete body tag.", frappe.ValidationError)

    boot_script = f"\n<script>window.clinicFlowBoot = {boot_json};</script>\n"
    return html[: body_open_end + 1] + boot_script + html[body_open_end + 1 :]


def build_shell_context(
    *,
    title: str,
    no_cache: int = 1,
    no_header: int = 1,
    no_breadcrumbs: int = 1,
    no_sidebar: int = 1,
    sitemap: int = 0,
    boot: dict | None = None,
) -> dict:
    """Build a standard context dict for head-app shell pages."""
    context = frappe._dict()
    context.no_cache = no_cache
    context.no_header = no_header
    context.no_breadcrumbs = no_breadcrumbs
    context.no_sidebar = no_sidebar
    context.sitemap = sitemap
    context.title = title
    if boot is not None:
        context.boot = boot
        context.boot_json = json_for_script(boot)
    return context
```

### 1.2 Refactor `arrival_counter.py` to use shared helper

**Modify:** `clinic_flow/www/clinic/arrival_counter.py`

Replace the duplicated `_json_for_script`, `_load_head_app_shell`, and `_build_boot` functions with calls to the shared module. Logic stays identical; only the extraction moves.

```python
from __future__ import annotations

import frappe
from frappe import _

from clinic_flow.api.arrival_permissions import (
    ARRIVAL_COUNTER_ROLES,
    enforce_arrival_counter_access,
    get_arrival_counter_permissions,
)
from clinic_flow.www.clinic.head_app_shell import build_shell_context, json_for_script, load_head_app_shell


def get_context(context):
    # Auth and role check happen before any rendering.
    # Guest users are redirected by the login route.
    # Wrong-role users are redirected to /clinic/login with mode=access-denied.
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/clinic/login?redirect-to=/clinic/arrival-counter"
        raise frappe.Redirect

    user_roles = set(frappe.get_roles(frappe.session.user))
    if not user_roles.intersection(ARRIVAL_COUNTER_ROLES):
        frappe.local.flags.redirect_location = "/clinic/login?redirect-to=/clinic/arrival-counter&mode=access-denied"
        raise frappe.Redirect

    enforce_arrival_counter_access()

    boot = {
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

    ctx = build_shell_context(title="Arrival Counter", boot=boot)
    ctx.allowed_roles = ARRIVAL_COUNTER_ROLES
    ctx.shell_html = load_head_app_shell("arrival-counter", ctx.boot_json)
    context.update(ctx)
```

Key change: `enforce_arrival_counter_access()` is still called as a safety net, but now **after** the redirect logic. Guest and wrong-role users never reach it.

### 1.3 Create login page permissions module

**New file:** `clinic_flow/api/login_permissions.py`

```python
from __future__ import annotations

import frappe


CLINIC_FLOW_ROLES: tuple[str, ...] = (
    "Healthcare Administrator",
    "Queue Manager",
    "System Manager",
)


def get_clinic_flow_roles() -> tuple[str, ...]:
    """Return the union of all Clinic Flow staff roles.

    For v1, all slices share the same role set.
    When new slices with different roles are added, this should
    become a per-slice lookup, or each slice should register its roles.
    """
    return CLINIC_FLOW_ROLES


def resolve_login_required_roles(redirect_to: str | None) -> tuple[str, ...]:
    """Resolve which roles to display for the login page.

    If redirect_to points to a known slice, use that slice's roles.
    Otherwise, fall back to the full Clinic Flow roles set.
    """
    if redirect_to and "/arrival-counter" in redirect_to:
        from clinic_flow.api.arrival_permissions import ARRIVAL_COUNTER_ROLES
        return ARRIVAL_COUNTER_ROLES
    return get_clinic_flow_roles()
```

### 1.4 Create login page www route

**New file:** `clinic_flow/www/clinic/login.py`

```python
from __future__ import annotations

import frappe
from frappe import _

from clinic_flow.api.login_permissions import get_clinic_flow_roles, resolve_login_required_roles
from clinic_flow.www.clinic.head_app_shell import build_shell_context, load_head_app_shell


def _sanitize_redirect(redirect_to: str | None) -> str:
    """Sanitize redirect URL to stay on the same domain.

    Returns the redirect URL if safe, or the default slice URL if unsafe or missing.
    """
    default = "/clinic/arrival-counter"
    if not redirect_to:
        return default

    from urllib.parse import urlparse

    parsed = urlparse(redirect_to)
    if parsed.scheme or parsed.netloc:
        parsed_request = urlparse(frappe.local.request.url)
        if parsed.netloc and parsed.netloc != parsed_request.netloc:
            return default
    return redirect_to


def get_context(context):
    from frappe.www.login import sanitize_redirect

    redirect_to_raw = frappe.local.request.args.get("redirect-to") if frappe.local.request else None
    redirect_to = _sanitize_redirect(redirect_to_raw)
    mode_raw = frappe.local.request.args.get("mode") if frappe.local.request else None

    # Already authenticated with a clinic role → redirect to target
    if frappe.session.user != "Guest":
        user_roles = set(frappe.get_roles(frappe.session.user))
        if user_roles.intersection(get_clinic_flow_roles()):
            frappe.local.flags.redirect_location = redirect_to
            raise frappe.Redirect
        # Authenticated but wrong role → show access-denied
        mode = "access-denied"
    else:
        # Guest → show login form
        mode = "login"

    # Override mode from query if explicitly set and valid
    if mode_raw == "access-denied" and frappe.session.user != "Guest":
        mode = "access-denied"

    required_roles = resolve_login_required_roles(redirect_to)

    boot = {
        "app": "clinic_flow",
        "slice": "login",
        "route": "/clinic/login",
        "siteName": frappe.local.site,
        "csrfToken": frappe.sessions.get_csrf_token(),
        "redirectUrl": redirect_to,
        "mode": mode,
        "requiredRoles": list(required_roles),
        "currentUser": frappe.session.user if frappe.session.user != "Guest" else None,
    }

    ctx = build_shell_context(title="Clinic Flow", boot=boot)
    ctx.shell_html = load_head_app_shell("login", ctx.boot_json)
    context.update(ctx)
```

**New file:** `clinic_flow/www/clinic/login.html`

```html
{{ shell_html | safe }}
```

### 1.5 Add route rule to hooks.py

**Modify:** `clinic_flow/hooks.py`

Add the `/clinic/login` route rule:

```python
website_route_rules = [
    {"from_route": "/queue-dashboard", "to_route": "queue-dashboard"},
    {"from_route": "/clinic/arrival-counter", "to_route": "clinic/arrival_counter"},
    {"from_route": "/clinic/login", "to_route": "clinic/login"},
]
```

### 1.6 Refactor `arrival_counter.py` test expectations

**Modify:** `clinic_flow/tests/test_arrival_counter_shell.py`

The `test_shell_rejects_non_staff_user` test currently expects `PermissionError` from `enforce_arrival_counter_access()`. After slice 1, wrong-role users will be redirected instead. Update the test:

```python
def test_shell_redirects_non_staff_user(self):
    from clinic_flow.www.clinic.arrival_counter import get_context

    user = self.make_queue_viewer_user()
    try:
        frappe.set_user(user.name)
        context = frappe._dict()
        with self.assertRaises(frappe.Redirect):
            get_context(context)
        redirect_location = frappe.local.flags.redirect_location
        self.assertIn("/clinic/login", redirect_location)
        self.assertIn("access-denied", redirect_location)
    finally:
        frappe.set_user("Administrator")

def test_shell_redirects_guest_user(self):
    from clinic_flow.www.clinic.arrival_counter import get_context

    frappe.set_user("Guest")
    try:
        context = frappe._dict()
        with self.assertRaises(frappe.Redirect):
            get_context(context)
        redirect_location = frappe.local.flags.redirect_location
        self.assertIn("/clinic/login", redirect_location)
        self.assertIn("redirect-to=/clinic/arrival-counter", redirect_location)
    finally:
        frappe.set_user("Administrator")
```

### 1.7 Add login shell backend tests

**New file:** `clinic_flow/tests/test_login_shell.py`

```python
import frappe
from frappe.tests import IntegrationTestCase


class TestLoginShell(IntegrationTestCase):
    def test_guest_sees_login_mode(self):
        frappe.set_user("Guest")
        try:
            from clinic_flow.www.clinic.login import get_context

            context = frappe._dict()
            get_context(context)

            self.assertEqual(context.boot["mode"], "login")
            self.assertEqual(context.boot["slice"], "login")
            self.assertEqual(context.boot["route"], "/clinic/login")
            self.assertTrue(context.boot["csrfToken"])
            self.assertIsNone(context.boot["currentUser"])
            self.assertIn("Healthcare Administrator", context.boot["requiredRoles"])
            self.assertNotIn("iframe", context.shell_html.lower())
        finally:
            frappe.set_user("Administrator")

    def test_authorized_user_redirected_to_target(self):
        from clinic_flow.www.clinic.login import get_context

        # Administrator has System Manager role which is in CLINIC_FLOW_ROLES
        frappe.local.request = type("Request", (), {"args": {"redirect-to": "/clinic/arrival-counter"}})()
        context = frappe._dict()
        with self.assertRaises(frappe.Redirect):
            get_context(context)
        self.assertEqual(
            frappe.local.flags.redirect_location,
            "/clinic/arrival-counter",
        )

    def test_wrong_role_user_sees_access_denied(self):
        user = self._make_non_clinic_user()
        try:
            frappe.set_user(user.name)
            frappe.local.request = type("Request", (), {"args": {"redirect-to": "/clinic/arrival-counter"}})()
            context = frappe._dict()
            get_context(context)

            self.assertEqual(context.boot["mode"], "access-denied")
            self.assertEqual(context.boot["currentUser"], user.name)
            self.assertIn("Healthcare Administrator", context.boot["requiredRoles"])
        finally:
            frappe.set_user("Administrator")

    def test_sanitize_redirect_cross_domain(self):
        from clinic_flow.www.clinic.login import _sanitize_redirect

        frappe.local.request = type("Request", (), {"url": "http://site1.localhost:8000/clinic/login"})()

        # Cross-domain redirect should return default
        result = _sanitize_redirect("https://evil.com/clinic/arrival-counter")
        self.assertEqual(result, "/clinic/arrival-counter")

        # Same-domain relative path should pass through
        result = _sanitize_redirect("/clinic/arrival-counter")
        self.assertEqual(result, "/clinic/arrival-counter")

        # None should return default
        result = _sanitize_redirect(None)
        self.assertEqual(result, "/clinic/arrival-counter")

    def test_shell_html_contains_boot_script(self):
        from clinic_flow.www.clinic.login import get_context

        frappe.local.request = type("Request", (), {"args": {"redirect-to": "/clinic/arrival-counter"}})()
        frappe.set_user("Guest")
        try:
            context = frappe._dict()
            get_context(context)
            self.assertIn("window.clinicFlowBoot", context.shell_html)
            self.assertIn('"slice": "login"', context.shell_html)
        finally:
            frappe.set_user("Administrator")

    def _make_non_clinic_user(self):
        email = f"login-shell-{frappe.generate_hash(length=8)}@example.com"
        return frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Login",
            "last_name": "TestNonClinic",
            "user_type": "System User",
            "enabled": 1,
            "send_welcome_email": 0,
            "roles": [{"role": "Queue Viewer"}],
        }).insert(ignore_permissions=True)
```

### 1.8 Run existing arrival counter shell tests

```bash
cd /home/raghu/frappe-bench && bench --site site1.localhost run-tests --app clinic_flow --test test_arrival_counter_shell
```

---

## Slice 2: SvelteKit Login Page

### 2.1 Add login-specific types

**New file:** `frontend/head-app/src/lib/login/types.ts`

```typescript
export type LoginMode = "login" | "access-denied";

export interface LoginBoot {
  app: "clinic_flow";
  slice: "login";
  route: "/clinic/login";
  siteName: string;
  csrfToken: string;
  redirectUrl: string;
  mode: LoginMode;
  requiredRoles: string[];
  currentUser: string | null;
}

export type LoginErrorType =
  | "invalid_credentials"
  | "account_disabled"
  | "rate_limited"
  | "network"
  | "unknown";

export interface LoginError {
  type: LoginErrorType;
  message: string;
}
```

### 2.2 Create login boot adapter

**New file:** `frontend/head-app/src/lib/boot/login-boot.ts`

```typescript
import type { LoginBoot, LoginMode } from "$login/types";

declare global {
  interface Window {
    clinicFlowBoot?: unknown;
  }
}

let cachedBoot: LoginBoot | null = null;

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLoginMode(value: unknown): value is LoginMode {
  return value === "login" || value === "access-denied";
}

export function parseLoginBoot(raw: unknown): LoginBoot {
  if (!raw || typeof raw !== "object") {
    throw new Error("Login boot data is missing");
  }

  const r = raw as Record<string, unknown>;

  const realtime = r.realtime;

  const valid =
    r.app === "clinic_flow" &&
    r.slice === "login" &&
    r.route === "/clinic/login" &&
    isString(r.siteName) &&
    isString(r.csrfToken) &&
    isString(r.redirectUrl) &&
    isLoginMode(r.mode) &&
    isStringArray(r.requiredRoles);

  if (!valid) {
    throw new Error("Login boot data is invalid");
  }

  return {
    app: "clinic_flow",
    slice: "login",
    route: "/clinic/login",
    siteName: r.siteName as string,
    csrfToken: r.csrfToken as string,
    redirectUrl: r.redirectUrl as string,
    mode: r.mode as LoginMode,
    requiredRoles: r.requiredRoles as string[],
    currentUser: typeof r.currentUser === "string" ? r.currentUser : null,
  };
}

export function getLoginBoot(): LoginBoot {
  if (!cachedBoot) {
    cachedBoot = parseLoginBoot(window.clinicFlowBoot);
  }
  return cachedBoot;
}

export function resetLoginBootForTests(): void {
  cachedBoot = null;
}
```

### 2.3 Create login API client

**New file:** `frontend/head-app/src/lib/api/login-client.ts`

```typescript
import { getLoginBoot } from "$lib/boot/login-boot";
import type { LoginError, LoginErrorType } from "$login/types";

export interface LoginResult {
  success: boolean;
  redirectUrl?: string;
  error?: LoginError;
}

function categorizeError(status: number, message: string): LoginError {
  if (status === 401) {
    return { type: "invalid_credentials", message: "Invalid email or password." };
  }
  if (status === 403 && message.toLowerCase().includes("disabled")) {
    return { type: "account_disabled", message: "This account has been disabled." };
  }
  if (status === 429) {
    return { type: "rate_limited", message: "Too many login attempts. Please try again in a few minutes." };
  }
  return { type: "unknown", message: message || "Login failed. Please try again." };
}

export async function clinicLogin(usr: string, pwd: string): Promise<LoginResult> {
  const boot = getLoginBoot();

  try {
    const response = await fetch("/api/method/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Frappe-CSRF-Token": boot.csrfToken,
      },
      credentials: "same-origin",
      body: new URLSearchParams({ usr, pwd }).toString(),
    });

    const data = await response.json();

    if (response.ok && data.message === "Logged In") {
      return { success: true, redirectUrl: boot.redirectUrl };
    }

    if (data.message === "Password Reset") {
      return { success: true, redirectUrl: data.redirect_to || "/update-password" };
    }

    const serverMessage = typeof data.message === "string" ? data.message : "";
    const error = categorizeError(
      response.status,
      serverMessage || data.exc_type || ""
    );
    return { success: false, error };
  } catch {
    return {
      success: false,
      error: { type: "network", message: "Network connection failed. Retry when the connection is stable." },
    };
  }
}

export async function clinicLogout(): Promise<void> {
  try {
    await fetch("/api/method/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Best-effort logout; redirect regardless
  }
}
```

### 2.4 Create login page Svelte route

**New file:** `frontend/head-app/src/routes/login/+page.svelte`

Design per the spec: Lexend headings, Source Sans 3 body, mineral teal (`#0d6f69`) primary, off-white (`#f6f5f1`) background, `1.5rem` border radius matching Arrival Counter.

The component has two modes:
- **login**: email/username + password form, "Sign In" button, "Forgot password?" link, slice nav buttons
- **access-denied**: current user display, required roles, "Sign out" button, slice nav buttons

Keyboard: Enter submits login form. Tab moves between fields. Focus-on-mount on email field (login) or sign-out button (access-denied).

### 2.5 Add login alias to svelte.config.js

**Modify:** `frontend/head-app/svelte.config.js`

Add `/login` to prerender entries and `$login` alias:

```javascript
prerender: {
  entries: ["/", "/arrival-counter", "/login"],
},
alias: {
  "$arrival": "src/lib/arrival-counter",
  "$login": "src/lib/login",
  "$api": "src/lib/api",
  "$realtime": "src/lib/realtime",
},
```

### 2.6 Update copy-build-to-frappe.js

**Modify:** `frontend/head-app/copy-build-to-frappe.js`

Add validation for `login.html` alongside `arrival-counter.html`:

```javascript
const arrivalHtml = join(buildDir, "arrival-counter.html");
const loginHtml = join(buildDir, "login.html");

if (!existsSync(arrivalHtml)) {
  console.error("Arrival Counter build output missing: build/arrival-counter.html");
  process.exit(1);
}

if (!existsSync(loginHtml)) {
  console.error("Login page build output missing: build/login.html");
  process.exit(1);
}
```

### 2.7 Add login boot tests

**New file:** `frontend/head-app/src/lib/boot/login-boot.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { parseLoginBoot, resetLoginBootForTests } from "./login-boot";

const validBoot = {
  app: "clinic_flow",
  slice: "login",
  route: "/clinic/login",
  siteName: "site1.localhost",
  csrfToken: "csrf-123",
  redirectUrl: "/clinic/arrival-counter",
  mode: "login" as const,
  requiredRoles: ["Healthcare Administrator", "Queue Manager", "System Manager"],
  currentUser: null,
};

beforeEach(() => {
  resetLoginBootForTests();
  delete (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot;
});

describe("parseLoginBoot", () => {
  it("returns a valid boot object", () => {
    const boot = parseLoginBoot(validBoot);
    expect(boot.csrfToken).toBe("csrf-123");
    expect(boot.mode).toBe("login");
    expect(boot.redirectUrl).toBe("/clinic/arrival-counter");
  });

  it("rejects a missing boot object", () => {
    expect(() => parseLoginBoot(undefined)).toThrow("missing");
  });

  it("rejects an invalid slice", () => {
    expect(() => parseLoginBoot({ ...validBoot, slice: "other" })).toThrow("invalid");
  });

  it("rejects an empty csrfToken", () => {
    expect(() => parseLoginBoot({ ...validBoot, csrfToken: "" })).toThrow("invalid");
  });

  it("accepts access-denied mode with currentUser", () => {
    const boot = parseLoginBoot({
      ...validBoot,
      mode: "access-denied",
      currentUser: "user@example.com",
    });
    expect(boot.mode).toBe("access-denied");
    expect(boot.currentUser).toBe("user@example.com");
  });
});
```

### 2.8 Add login client tests

**New file:** `frontend/head-app/src/lib/api/login-client.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { clinicLogin } from "./login-client";
import { resetLoginBootForTests } from "$lib/boot/login-boot";

const validBoot = {
  app: "clinic_flow",
  slice: "login",
  route: "/clinic/login",
  siteName: "site1.localhost",
  csrfToken: "login-csrf-token",
  redirectUrl: "/clinic/arrival-counter",
  mode: "login" as const,
  requiredRoles: ["Healthcare Administrator", "Queue Manager", "System Manager"],
  currentUser: null,
};

beforeEach(() => {
  resetLoginBootForTests();
  (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = validBoot;
});

describe("clinicLogin", () => {
  it("sends credentials to /api/method/login", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: "Logged In" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await clinicLogin("user@example.com", "password123");

    expect(result.success).toBe(true);
    expect(result.redirectUrl).toBe("/clinic/arrival-counter");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/method/login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      })
    );

    vi.restoreAllMocks();
  });

  it("returns error on invalid credentials", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: "Invalid login credentials" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await clinicLogin("wrong@example.com", "wrong");

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe("invalid_credentials");

    vi.restoreAllMocks();
  });

  it("returns network error on fetch failure", async () => {
    vi.stubGlobal("fetch", () => { throw new Error("Network error"); });

    const result = await clinicLogin("user@example.com", "password123");

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe("network");

    vi.restoreAllMocks();
  });
});
```

### 2.9 Build and verify

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow/frontend/head-app
npm run build
node copy-build-to-frappe.js
```

Verify `clinic_flow/public/head-app/login.html` exists and contains the boot script injection point.

---

## Slice 3: Frontend e2e and Integration Tests

### 3.1 Playwright Frappe shell smoke test

**New file:** `frontend/head-app/tests/login-frappe-shell.spec.ts`

```typescript
// @ts-nocheck
import { expect, test } from "@playwright/test";

test.skip(!process.env.FRAPPE_BASE_URL, "Set FRAPPE_BASE_URL=http://site1.localhost:8000 and provide an authenticated storage state before running this smoke test.");

test.describe("Clinic Flow login shell", () => {
  test.use({ baseURL: process.env.FRAPPE_BASE_URL });

  test("guest user sees login form at /clinic/login", async ({ page }) => {
    // Clear auth cookies to simulate guest
    await page.context().clearCookies();
    await page.goto("/clinic/login");
    await expect(page.locator("text=Sign in")).toBeVisible();
    await expect(page.locator("text=Forgot password")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("login page boot context has correct structure", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/clinic/login");
    const boot = await page.evaluate(() => window.clinicFlowBoot);
    expect(boot.slice).toBe("login");
    expect(boot.route).toBe("/clinic/login");
    expect(boot.csrfToken.length).toBeGreaterThan(0);
    expect(boot.mode).toBe("login");
  });

  test("guest redirect from /clinic/arrival-counter goes to /clinic/login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/clinic/arrival-counter");
    await page.waitForURL(/\/clinic\/login/);
    expect(page.url()).toContain("/clinic/login");
    expect(page.url()).toContain("redirect-to=/clinic/arrival-counter");
  });
});
```

### 3.2 Run all tests

```bash
# Backend
bench --site site1.localhost run-tests --app clinic_flow --test test_arrival_counter_shell
bench --site site1.localhost run-tests --app clinic_flow --test test_login_shell

# Frontend unit
cd frontend/head-app && npx vitest run src/lib/boot/login-boot.test.ts src/lib/api/login-client.test.ts

# Frontend e2e (requires running Frappe)
FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts
```

---

## Rollout Order

After code review:

1. Deploy backend changes (shared shell helper, arrival_counter.py refactor, login.py, hooks.py, login_permissions.py)
2. Build and deploy frontend (SvelteKit login page, copy-build-to-frappe.js)
3. Run `bench migrate` (no schema changes needed, but clears route cache)
4. Run `bench build` (if any asset changes are needed)
5. Verify: visit `/clinic/arrival-counter` in incognito → should redirect directly to `/clinic/login`
6. Verify: log in with correct credentials → should reach Arrival Counter
7. Verify: log in with wrong-role user → should see access-denied mode
8. Verify: existing `/clinic/arrival-counter` for authorized users → unchanged behavior
9. Run backend tests
10. Run frontend unit tests

## Documentation Updates

After implementation:

- `docs/notes/clinic-login-page.md` — implementation summary
- `ARCHITECTURE.md` — add `/clinic/login` route and login boot contract
- `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md` — note the login page as a shared platform surface if the architecture spec needs updating