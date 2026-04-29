# Clinic Login Page — Implementation Summary

Date: 2026-04-29
Branch: `feature/clinic-login-page`
Spec: `docs/superpowers/specs/2026-04-29-clinic-login-page-design.md`

## What Changed

### Slice 1: Backend Redirect and Shell Route

- **New** `clinic_flow/www/clinic/head_app_shell.py` — shared shell helper extracted from `arrival_counter.py`. Provides `json_for_script()`, `load_head_app_shell()`, and `build_shell_context()`.
- **Refactored** `clinic_flow/www/clinic/arrival_counter.py` — replaced duplicated shell functions with shared helper; added guest and wrong-role redirect to `/clinic/login` before the `enforce_arrival_counter_access()` call.
- **New** `clinic_flow/api/login_permissions.py` — `CLINIC_FLOW_ROLES`, `get_clinic_flow_roles()`, `resolve_login_required_roles()`.
- **New** `clinic_flow/www/clinic/login.py` — `/clinic/login` www route. Handles three modes:
  - Guest → shows login form (`mode=login`)
  - Wrong-role authenticated → shows access-denied (`mode=access-denied`)
  - Correct-role → redirects to target
- **New** `clinic_flow/www/clinic/login.html` — thin Jinja template.
- **Modified** `clinic_flow/hooks.py` — added `/clinic/login` route rule.
- **Modified** `clinic_flow/tests/test_arrival_counter_shell.py` — updated non-staff and guest tests to expect `frappe.Redirect` to `/clinic/login` instead of `frappe.PermissionError`.
- **New** `clinic_flow/tests/test_login_shell.py` — 5 integration tests for login shell: guest mode, authorized redirect, wrong-role access-denied, cross-domain redirect sanitization, boot script injection.

### Slice 2: SvelteKit Login Page

- **New** `frontend/head-app/src/lib/login/types.ts` — `LoginBoot`, `LoginMode`, `LoginError`, `LoginErrorType`.
- **New** `frontend/head-app/src/lib/boot/login-boot.ts` — `parseLoginBoot()`, `getLoginBoot()`, `resetLoginBootForTests()`.
- **New** `frontend/head-app/src/lib/api/login-client.ts` — `clinicLogin()`, `clinicLogout()`.
- **New** `frontend/head-app/src/routes/login/+page.svelte` — login form and access-denied page. Lexend headings, Source Sans 3 body, mineral teal primary, off-white background, 1.5rem border radius matching Arrival Counter. Keyboard: Enter submits, Tab moves focus, auto-focus on mount.
- **Modified** `frontend/head-app/svelte.config.js` — added `/login` prerender entry and `$login` alias.
- **Modified** `frontend/head-app/copy-build-to-frappe.js` — added `login.html` validation.
- **New** `frontend/head-app/src/lib/boot/login-boot.test.ts` — 5 unit tests.
- **New** `frontend/head-app/src/lib/api/login-client.test.ts` — 3 unit tests.

### Slice 3: Frontend e2e

- **New** `frontend/head-app/tests/login-frappe-shell.spec.ts` — 3 Playwright smoke tests (skipped unless `FRAPPE_BASE_URL` is set).

## What Was Verified

- `head_app_shell.py` imports load correctly via `bench console`.
- `login_permissions.py` imports load correctly.
- `login.py` imports load correctly.
- Frontend build succeeds (`npm run build + copy-build-to-frappe.js`).
- `login.html` built and copied to `clinic_flow/public/head-app/login.html` (3432 bytes).
- Backend integration tests could not be run through the test runner (appears to be a pre-existing timeout issue with the test infrastructure, not related to these changes).

## What Stayed Out of Scope

- The actual `Appointment` hook changes or queue refactors — this is purely a login/redirect page.
- Schema changes — `bench migrate` not needed.
- The `/password-recovery` page — the link exists but routes to Frappe's built-in handler.
- Frontend e2e smoke tests were not executed (need a running Frappe site with `FRAPPE_BASE_URL`).

## Next Integration Step

1. Deploy backend changes (shared shell, login route, arrival counter redirect logic).
2. Build and deploy frontend (SvelteKit login page, copy-build-to-frappe.js).
3. Run `bench migrate` (no schema changes but clears route cache).
4. Verify `/clinic/arrival-counter` in incognito → redirects to `/clinic/login`.
5. Verify login with credentials → redirects to arrival counter.
6. Verify login with wrong-role user → access-denied mode.
7. Verify existing authorized user flow → unchanged.

## Drift Remediation Follow-up

- Hardened redirect sanitization in `clinic_flow/www/clinic/login.py`:
  - rejects unsafe schemes (`javascript:`), protocol-relative URLs, cross-domain absolute URLs, and non-`/clinic/` targets
  - normalizes safe same-origin absolute URLs back to relative `/clinic/*` paths
- Preserved `redirect-to` after access-denied sign-out in `frontend/head-app/src/routes/login/+page.svelte`.
- Converted forgot-password handling to stay on the `/clinic/login` surface with an in-page panel that points to `/login#forgot`.
- Updated login UI to match spec intent:
  - access-denied copy shows signed-in user and required roles
  - password visibility toggle with keyboard access
  - `or go to` divider and secondary slice-card navigation
- Added/updated drift-focused tests:
  - backend sanitize redirect coverage in `clinic_flow/tests/test_login_shell.py`
  - frontend login client password-reset mapping in `frontend/head-app/src/lib/api/login-client.test.ts`
  - Playwright checks for login shell copy anchors, slice card navigation, and password toggle in `frontend/head-app/tests/login-frappe-shell.spec.ts`

### Verification snapshot

- `bench --site site1.localhost run-tests --module clinic_flow.tests.test_arrival_counter_shell` → PASS (3/3)
- `bench --site site1.localhost run-tests --module clinic_flow.tests.test_login_shell` → PASS (8/8)
- `cd frontend/head-app && npx vitest run src/lib/boot/login-boot.test.ts src/lib/api/login-client.test.ts` → PASS (9/9)
- `FRAPPE_BASE_URL=http://site1.localhost:8000 npx playwright test tests/login-frappe-shell.spec.ts` → PASS (5), SKIP (1 access-denied sign-out test gated by `FRAPPE_WRONG_ROLE_ACCESS_DENIED_URL` fixture)

Access-denied e2e fixture options:

- Option A: set `FRAPPE_WRONG_ROLE_ACCESS_DENIED_URL` to a URL that renders access-denied mode for an authenticated wrong-role session.
- Option B: set `FRAPPE_WRONG_ROLE_USER` and `FRAPPE_WRONG_ROLE_PASSWORD`; test bootstraps session via `/api/method/login` and then verifies sign-out redirect preservation.
