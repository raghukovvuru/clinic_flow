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

## Next Integration Step

Validate the mounted page with real staff operators on desktop counters, then use the same `frontend/head-app` workspace to implement `Reception Shell + Live Queue Rail`.
