# Arrival Counter V1 Frontend

Date: 2026-04-27
Spec: `docs/superpowers/specs/2026-04-27-head-app-frontend-architecture-design.md`
Spec: `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md`
Plan: `docs/superpowers/plans/2026-04-27-arrival-counter-v1-frontend.md`

## Goal

Ship the first head-app frontend slice for Arrival Counter while preserving backend arrival authority and coexistence with the legacy Desk page.

## Implemented in This Slice

- Added `frontend/head-app` with SvelteKit, Tailwind, TypeScript, Vitest, and Playwright.
- Added `arrival_counter_v1` thin Frappe host page using iframe to mount the SvelteKit-built static app.
- Extended `clinic_flow.api.arrival` with richer session context, result-card data, and recent arrivals.
- Built the canonical Arrival Counter v1 layout and 7-state flow (idle, loading, no-match, multiple, pre-confirm, already-arrived, success).
- Added frontend unit tests (13), e2e tests (3), and backend contract tests (3).

## Verification Completed

- `npm run check`: 0 errors, 0 warnings
- `npm run test`: 13/13 unit tests passed
- `npm run test:e2e`: 3/3 e2e tests passed
- `npm run build`: static build succeeds, copied to clinic_flow/public/head-app/
- Backend contract tests: 3/3 passed
- Existing slice 3 checkin boundary tests: 5/5 passed (no regression)
- `graphify update .`: completed

## Out of Scope

- No receptionist shell or token board head-app slice.
- No queue-authority rewrite.
- No removal of the legacy `arrival_counter` page.
- No Frappe realtime bridge for the iframe (polling fallback used).

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

## UI Stabilization Follow-Up - 2026-04-28

- Aligned the standalone shell UI with the stabilized Arrival Counter UI/product spec.
- Kept architecture, permissions, and backend authority unchanged.
- Verified the scan-first layout, shared result-card shell, and quiet support surfaces through frontend tests.
- Spec: `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md`
- Implementation: `docs/superpowers/plans/2026-04-28-arrival-counter-ui-stabilization.md`
