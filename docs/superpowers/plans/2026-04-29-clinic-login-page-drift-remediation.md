# Clinic Login Page Drift Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch all implementation drift between the clinic login branch and the approved login plan/spec so `/clinic/login` behaves as a single operational surface for login and access-denied flows with secure redirects and complete test coverage.

**Architecture:** Keep the existing Frappe shell + SvelteKit architecture, but tighten redirect sanitization at the backend contract boundary and align frontend behavior/copy/interactions with spec-owned UX rules. Apply TDD per drift item (backend unit/integration, frontend unit, e2e smoke), then update implementation notes and architecture docs to reflect live behavior.

**Tech Stack:** Frappe v16 (Python), SvelteKit + TypeScript, Vitest, Playwright, bench test runner.

---

## File Structure and Responsibility Map

- `clinic_flow/www/clinic/login.py`
  - Owns `/clinic/login` shell contract, redirect sanitization, mode resolution, and boot payload construction.
- `clinic_flow/api/login_permissions.py`
  - Owns role-resolution helpers used by login shell for required-role messaging.
- `clinic_flow/tests/test_login_shell.py`
  - Owns backend behavioral contract tests for login shell and sanitization edge cases.
- `frontend/head-app/src/routes/login/+page.svelte`
  - Owns single-page login/access-denied UI, keyboard flow, forgot-password inline mode, slice navigation, and sign-out redirect preservation.
- `frontend/head-app/src/lib/login/types.ts`
  - Owns typed shape for login boot/UI state/errors.
- `frontend/head-app/src/lib/boot/login-boot.ts`
  - Owns runtime validation/parsing of backend boot contract.
- `frontend/head-app/src/lib/api/login-client.ts`
  - Owns login/logout HTTP calls and transport-level error categorization.
- `frontend/head-app/src/lib/boot/login-boot.test.ts`
  - Owns boot parsing contract tests.
- `frontend/head-app/src/lib/api/login-client.test.ts`
  - Owns login client network/response behavior tests.
- `frontend/head-app/tests/login-frappe-shell.spec.ts`
  - Owns browser-level smoke tests for shell behavior and key user journeys.
- `ARCHITECTURE.md`
  - Owns canonical runtime architecture and shell contract docs.
- `docs/notes/clinic-login-page.md`
  - Owns implementation summary and verification status for this feature.

---

### Task 1: Harden backend redirect sanitization contract

**Files:**
- Modify: `clinic_flow/www/clinic/login.py`
- Test: `clinic_flow/tests/test_login_shell.py`

- [ ] **Step 1: Write failing backend tests for unsafe redirect forms**

```python
def test_sanitize_redirect_rejects_javascript_scheme(self):
    from clinic_flow.www.clinic.login import _sanitize_redirect

    frappe.local.request = type("Request", (), {"url": "http://site1.localhost:8000/clinic/login"})()
    self.assertEqual(
        _sanitize_redirect("javascript:alert(1)"),
        "/clinic/arrival-counter",
    )


def test_sanitize_redirect_rejects_protocol_relative_cross_domain(self):
    from clinic_flow.www.clinic.login import _sanitize_redirect

    frappe.local.request = type("Request", (), {"url": "http://site1.localhost:8000/clinic/login"})()
    self.assertEqual(
        _sanitize_redirect("//evil.com/clinic/arrival-counter"),
        "/clinic/arrival-counter",
    )


def test_sanitize_redirect_rejects_non_clinic_relative_path(self):
    from clinic_flow.www.clinic.login import _sanitize_redirect

    self.assertEqual(_sanitize_redirect("/app"), "/clinic/arrival-counter")
```

- [ ] **Step 2: Run test to verify failure**

Run: `bench --site site1.localhost run-tests --app clinic_flow --test test_login_shell --module clinic_flow.tests.test_login_shell`
Expected: FAIL on new sanitize cases (currently accepted by `_sanitize_redirect`).

- [ ] **Step 3: Implement strict same-origin + clinic-path sanitization**

```python
from urllib.parse import urlparse


def _sanitize_redirect(redirect_to: str | None) -> str:
    default = "/clinic/arrival-counter"
    if not redirect_to:
        return default

    redirect_to = redirect_to.strip()
    if not redirect_to:
        return default

    parsed = urlparse(redirect_to)

    # Allow only http/https absolute URLs and same-host; reject javascript:, data:, etc.
    if parsed.scheme:
        if parsed.scheme not in {"http", "https"}:
            return default
        request_url = getattr(frappe.local.request, "url", "") if frappe.local.request else ""
        request_host = urlparse(request_url).netloc
        if parsed.netloc != request_host:
            return default
        normalized_path = parsed.path or "/"
        if not normalized_path.startswith("/clinic/"):
            return default
        normalized = normalized_path
        if parsed.query:
            normalized = f"{normalized}?{parsed.query}"
        if parsed.fragment:
            normalized = f"{normalized}#{parsed.fragment}"
        return normalized

    # Relative or protocol-relative URLs
    if parsed.netloc:
        return default
    if not redirect_to.startswith("/clinic/"):
        return default
    return redirect_to
```

- [ ] **Step 4: Run test to verify pass**

Run: `bench --site site1.localhost run-tests --app clinic_flow --test test_login_shell --module clinic_flow.tests.test_login_shell`
Expected: PASS for sanitize tests and existing login-shell tests.

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/www/clinic/login.py clinic_flow/tests/test_login_shell.py
git commit -m "fix: harden clinic login redirect sanitization"
```

---

### Task 2: Preserve target redirect through access-denied sign-out flow

**Files:**
- Modify: `frontend/head-app/src/routes/login/+page.svelte`
- Test: `frontend/head-app/tests/login-frappe-shell.spec.ts`

- [ ] **Step 1: Add failing e2e smoke for sign-out redirect preservation**

```typescript
test("access-denied sign-out returns to login with redirect target", async ({ page }) => {
  test.skip(true, "Enable with dedicated wrong-role auth state fixture");
  await page.goto("/clinic/login?redirect-to=/clinic/arrival-counter&mode=access-denied");
  await page.getByRole("button", { name: "Sign out and use a different account" }).click();
  await page.waitForURL(/\/clinic\/login\?redirect-to=%2Fclinic%2Farrival-counter/);
});
```

- [ ] **Step 2: Run test to verify failure (or skipped placeholder with TODO marker)**

Run: `FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts`
Expected: New test remains skipped until fixture is wired; add explicit TODO comment to prevent silent omission.

- [ ] **Step 3: Implement redirect-preserving sign-out behavior in page logic**

```svelte
async function handleSignOut() {
  await clinicLogout();
  const target = boot?.redirectUrl || "/clinic/arrival-counter";
  const q = encodeURIComponent(target);
  window.location.href = `/clinic/login?redirect-to=${q}`;
}
```

- [ ] **Step 4: Run frontend checks**

Run: `cd frontend/head-app && npx vitest run src/lib/boot/login-boot.test.ts src/lib/api/login-client.test.ts`
Expected: PASS (regression safety for boot/client code).

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/routes/login/+page.svelte frontend/head-app/tests/login-frappe-shell.spec.ts
git commit -m "fix: preserve redirect target after access-denied sign-out"
```

---

### Task 3: Implement true single-surface forgot-password mode on `/clinic/login`

**Files:**
- Modify: `frontend/head-app/src/routes/login/+page.svelte`
- Modify: `frontend/head-app/src/lib/login/types.ts`
- Modify: `frontend/head-app/src/lib/api/login-client.ts`
- Test: `frontend/head-app/src/lib/api/login-client.test.ts`

- [ ] **Step 1: Write failing frontend unit tests for forgot-password handling**

```typescript
it("maps password reset response to forgot mode signal", async () => {
  const fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ message: "Password Reset" }),
  });
  vi.stubGlobal("fetch", fetchSpy);

  const result = await clinicLogin("user@example.com", "password123");
  expect(result.success).toBe(false);
  expect(result.error?.type).toBe("password_reset_required");
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd frontend/head-app && npx vitest run src/lib/api/login-client.test.ts`
Expected: FAIL because `password_reset_required` type and behavior do not exist.

- [ ] **Step 3: Extend types and client contract for in-page forgot mode**

```typescript
// types.ts
export type LoginErrorType =
  | "invalid_credentials"
  | "account_disabled"
  | "rate_limited"
  | "network"
  | "password_reset_required"
  | "unknown";
```

```typescript
// login-client.ts
if (data.message === "Password Reset") {
  return {
    success: false,
    error: {
      type: "password_reset_required",
      message: "Password reset is required. Use the Forgot password flow below.",
    },
  };
}
```

- [ ] **Step 4: Replace external forgot link with same-page forgot panel behavior**

```svelte
let showForgot = false;

function openForgot() {
  showForgot = true;
}

function closeForgot() {
  showForgot = false;
}
```

```svelte
{#if showForgot}
  <section class="forgot-panel" aria-live="polite">
    <h2>Reset your password</h2>
    <p>Use Frappe password reset in a new tab, then return here to sign in.</p>
    <a href="/login#forgot" target="_blank" rel="noopener noreferrer">Open password reset</a>
    <button type="button" on:click={closeForgot}>Back to sign in</button>
  </section>
{:else}
  <button type="button" class="forgot-link" on:click={openForgot}>Forgot password?</button>
{/if}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd frontend/head-app && npx vitest run src/lib/api/login-client.test.ts src/lib/boot/login-boot.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/head-app/src/lib/login/types.ts frontend/head-app/src/lib/api/login-client.ts frontend/head-app/src/lib/api/login-client.test.ts frontend/head-app/src/routes/login/+page.svelte
git commit -m "feat: keep forgot password flow on clinic login surface"
```

---

### Task 4: Align access-denied/login UX copy and structure with spec

**Files:**
- Modify: `frontend/head-app/src/routes/login/+page.svelte`

- [ ] **Step 1: Add failing UI assertions in e2e smoke**

```typescript
test("login page shows spec copy anchors", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/clinic/login");
  await expect(page.getByText("Sign in to continue")).toBeVisible();
  await expect(page.getByText("or go to")).toBeVisible();
});
```

- [ ] **Step 2: Run e2e smoke to verify current failure on missing anchors**

Run: `FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts`
Expected: FAIL if copy anchors differ.

- [ ] **Step 3: Patch component copy/structure**

```svelte
<!-- access denied mode -->
<p class="subtitle">You are signed in as {boot?.currentUser}</p>
<p class="required-roles">
  This application requires one of the following roles: {boot?.requiredRoles.join(", ")}
</p>
<button class="btn btn-signout" ...>Sign out and use a different account</button>

<!-- shared divider -->
<div class="slice-divider" role="separator" aria-label="or go to">or go to</div>
```

- [ ] **Step 4: Re-run e2e smoke**

Run: `FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts`
Expected: PASS for copy-anchor assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/routes/login/+page.svelte frontend/head-app/tests/login-frappe-shell.spec.ts
git commit -m "fix: align clinic login copy and access-denied messaging"
```

---

### Task 5: Add password visibility toggle and keyboard-first behavior

**Files:**
- Modify: `frontend/head-app/src/routes/login/+page.svelte`

- [ ] **Step 1: Write failing component-level behavior tests (if no component runner, cover via Playwright)**

```typescript
test("password visibility toggle is keyboard accessible", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/clinic/login");
  const pwd = page.locator("#pwd");
  await expect(pwd).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: /show password/i }).press("Enter");
  await expect(pwd).toHaveAttribute("type", "text");
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts`
Expected: FAIL because toggle does not exist.

- [ ] **Step 3: Implement toggle and accessible controls**

```svelte
let showPassword = false;

<div class="password-row">
  <input id="pwd" type={showPassword ? "text" : "password"} ... />
  <button
    type="button"
    class="pwd-toggle"
    aria-label={showPassword ? "Hide password" : "Show password"}
    on:click={() => (showPassword = !showPassword)}
  >
    {showPassword ? "Hide" : "Show"}
  </button>
</div>
```

- [ ] **Step 4: Run test to verify pass**

Run: `FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts`
Expected: PASS on toggle behavior.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/routes/login/+page.svelte frontend/head-app/tests/login-frappe-shell.spec.ts
git commit -m "feat: add keyboard-accessible password visibility toggle"
```

---

### Task 6: Upgrade slice navigation to spec-compliant secondary cards

**Files:**
- Modify: `frontend/head-app/src/routes/login/+page.svelte`

- [ ] **Step 1: Add failing e2e assertion for secondary nav card semantics**

```typescript
test("slice navigation is present as secondary action", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/clinic/login");
  const arrivalNav = page.getByRole("link", { name: "Arrival Counter" });
  await expect(arrivalNav).toBeVisible();
  await expect(arrivalNav).toHaveClass(/slice-card/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts`
Expected: FAIL if nav uses plain text link style.

- [ ] **Step 3: Implement secondary compact card layout**

```svelte
<nav class="slice-nav" aria-label="Clinic slice navigation">
  <a href="/clinic/arrival-counter" class="slice-card">
    <span class="slice-card-title">Arrival Counter</span>
    <span class="slice-card-subtitle">Go to check-in and queue intake</span>
  </a>
</nav>
```

```css
.slice-card {
  display: block;
  width: 100%;
  border: 1px solid #d9ddd8;
  border-radius: 1rem;
  background: #f8faf9;
  padding: 0.75rem 0.9rem;
  text-decoration: none;
  color: #10211f;
}
```

- [ ] **Step 4: Re-run e2e smoke**

Run: `FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts`
Expected: PASS for nav assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/head-app/src/routes/login/+page.svelte frontend/head-app/tests/login-frappe-shell.spec.ts
git commit -m "fix: render clinic slice navigation as secondary cards"
```

---

### Task 7: Expand backend and frontend drift tests to spec parity

**Files:**
- Modify: `clinic_flow/tests/test_login_shell.py`
- Modify: `frontend/head-app/src/lib/api/login-client.test.ts`
- Modify: `frontend/head-app/tests/login-frappe-shell.spec.ts`

- [ ] **Step 1: Add backend contract tests for direct-visit and role-resolution defaults**

```python
def test_direct_login_guest_defaults_redirect_to_arrival(self):
    frappe.set_user("Guest")
    from clinic_flow.www.clinic.login import get_context
    ctx = frappe._dict()
    get_context(ctx)
    self.assertEqual(ctx.boot["redirectUrl"], "/clinic/arrival-counter")


def test_direct_login_wrong_role_shows_access_denied(self):
    user = self._make_non_clinic_user()
    try:
        frappe.set_user(user.name)
        from clinic_flow.www.clinic.login import get_context
        ctx = frappe._dict()
        get_context(ctx)
        self.assertEqual(ctx.boot["mode"], "access-denied")
    finally:
        frappe.set_user("Administrator")
```

- [ ] **Step 2: Add frontend unit coverage for rate-limited and disabled-account categorization**

```typescript
it("categorizes rate-limited login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    json: () => Promise.resolve({ message: "Too many requests" }),
  }));
  const result = await clinicLogin("user@example.com", "pass");
  expect(result.error?.type).toBe("rate_limited");
});
```

- [ ] **Step 3: Add e2e checks for failed login form persistence and inline error**

```typescript
test("failed login keeps form values and shows inline message", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/clinic/login");
  await page.fill("#usr", "wrong@example.com");
  await page.fill("#pwd", "wrongpass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("[role='alert']")).toBeVisible();
  await expect(page.locator("#usr")).toHaveValue("wrong@example.com");
});
```

- [ ] **Step 4: Run full targeted suite**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --test test_login_shell
cd frontend/head-app && npx vitest run src/lib/boot/login-boot.test.ts src/lib/api/login-client.test.ts
FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts
```

Expected: PASS/skip only for explicitly fixture-gated tests.

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/tests/test_login_shell.py frontend/head-app/src/lib/api/login-client.test.ts frontend/head-app/tests/login-frappe-shell.spec.ts
git commit -m "test: close clinic login drift coverage gaps"
```

---

### Task 8: Align architecture and implementation notes with final behavior

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/notes/clinic-login-page.md`

- [ ] **Step 1: Add architecture updates for login shell contract**

```markdown
- Add `/clinic/login` as canonical auth entry surface for `/clinic/*` head-app routes.
- Document `LoginBoot` contract (`app`, `slice`, `route`, `csrfToken`, `redirectUrl`, `mode`, `requiredRoles`, `currentUser`).
- Document redirect sanitization rule: only same-origin `/clinic/*` targets survive.
```

- [ ] **Step 2: Update implementation note with drift-fix verification**

```markdown
## Drift Remediation Follow-up
- Fixed redirect sanitization for unsafe schemes/protocol-relative/cross-domain URLs.
- Kept forgot-password flow on `/clinic/login` surface.
- Preserved `redirect-to` through access-denied sign-out.
- Added/updated backend, frontend unit, and e2e tests.
```

- [ ] **Step 3: Run lightweight docs sanity check**

Run: `git diff -- ARCHITECTURE.md docs/notes/clinic-login-page.md`
Expected: Clear, accurate behavior narrative matching code.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md docs/notes/clinic-login-page.md
git commit -m "docs: sync clinic login architecture and drift remediation notes"
```

---

### Task 9: Final build + verification checkpoint

**Files:**
- Modify (generated): `clinic_flow/public/head-app/**`
- Modify (generated): `clinic_flow/public/head-app/login.html`
- Modify (generated): `clinic_flow/public/head-app/arrival-counter.html` (if hash changes)

- [ ] **Step 1: Rebuild and copy frontend bundle**

Run:

```bash
cd frontend/head-app
npm run build
node copy-build-to-frappe.js
```

Expected: Build succeeds, `clinic_flow/public/head-app/login.html` exists.

- [ ] **Step 2: Run backend + frontend verification set**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --test test_arrival_counter_shell
bench --site site1.localhost run-tests --app clinic_flow --test test_login_shell
cd frontend/head-app && npx vitest run src/lib/boot/login-boot.test.ts src/lib/api/login-client.test.ts
FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts
```

Expected: All pass, with only intentional skips.

- [ ] **Step 3: Manual smoke check for target journeys**

Run manually in browser:

1. Guest → `/clinic/arrival-counter` redirects directly to `/clinic/login?redirect-to=/clinic/arrival-counter`
2. Login page forgot-password flow stays on `/clinic/login` surface while opening Frappe reset path when needed
3. Wrong-role authenticated user sees access-denied mode and sign-out returns with preserved `redirect-to`
4. Authorized login returns to target slice

Expected: Matches spec success criteria.

- [ ] **Step 4: Commit generated assets and final patch set**

```bash
git add clinic_flow/public/head-app
git commit -m "build: refresh head-app artifacts after login drift fixes"
```

---

## Completion Definition

This remediation is complete only when all are true:

1. `/clinic/login` supports login + access-denied + forgot-password guidance in one page surface.
2. Redirect sanitization rejects unsafe/cross-domain/non-clinic targets.
3. Access-denied sign-out preserves original redirect target.
4. Login UX copy/layout/keyboard behavior align with approved spec.
5. Backend, unit, and e2e tests cover the drift cases.
6. `ARCHITECTURE.md` and `docs/notes/clinic-login-page.md` reflect final behavior.
