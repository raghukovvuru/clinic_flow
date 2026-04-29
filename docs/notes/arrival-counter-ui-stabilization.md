# Arrival Counter UI Stabilization

Date: 2026-04-28
Spec: `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md`
Plan: `docs/superpowers/plans/2026-04-28-arrival-counter-ui-stabilization.md`

## What Changed

- Tightened the standalone Arrival Counter head-app layout to a single dominant working column with max-width 72rem and consistent gap/rhythm.
- Reworked the header from dashboard-like tiles to quieter bordered session chips and restrained stat tiles.
- Updated the input surface placeholder text to reflect the actual lookup modes: "Scan QR code or enter patient name, child name, or mobile number".
- Rebuilt the result card as one stable decision surface across all 7 states with proper action hierarchy (Confirm Arrival primary in pre-confirm, Print Token Slip absent before confirmation).
- Quieted recent arrivals with lower-emphasis borders, truncation, and subdued backgrounds.
- Replaced the error-red StatusBanner with warm degraded-tone styling.
- Preserved the existing standalone-shell architecture, backend authority, and keyboard-first workflow.

## What Was Verified

- `npm run check`: 0 errors, 0 warnings
- `npm run test`: 34/34 unit tests passed
- `npm run test:e2e`: 8/8 e2e tests passed
- `npm run build`: static build succeeds, copied to clinic_flow/public/head-app/

### P0 Edge Hardening Verification

- `npm run test -- src/lib/arrival-counter/state.test.ts src/lib/api/arrival.test.ts`: 19/19 tests passed
- `npm run test:e2e -- tests/arrival-counter.spec.ts`: 13/13 e2e tests passed
- `npm run check`: svelte-check found 0 errors and 0 warnings

## What Stayed Out Of Scope

- No architecture changes
- No backend contract changes
- No new receptionist or doctor surfaces
- No queue authority changes
- No Healthcare base app edits

## P0 Edge Case Hardening

- Blocked duplicate lookup submissions while lookup is pending.
- Guarded Enter-confirm so keyboard confirm from the route handler only fires from decision context and avoids native button double-triggering.
- Blocked confirm when session context refresh reports there is no active arrival session.
- Added confirm-failure reconciliation to re-fetch selected queue entry and settle into `already-arrived` when backend already processed arrival.
- Expanded multiple-match rows with session, visit label, and status for safer disambiguation.
- Added e2e coverage for keyboard confirm boundaries, duplicate submit handling, disambiguation visibility, and already-arrived race outcomes.

## P1/P2 Edge Hardening

Date: 2026-04-29
Spec: `docs/superpowers/specs/2026-04-29-arrival-counter-edge-hardening-p1-p2-design.md`
Plan: `docs/superpowers/plans/2026-04-29-arrival-counter-edge-hardening-p1-p2.md`

- Normalized phone and scanner payload input before lookup.
- Preserved keyboard focus visibility in multiple-match selection.
- Added permission and no-active-session guidance copy.
- Clarified success vs already-arrived states.
- Improved long-name/title handling and no-match recovery copy.
- Added low-emphasis stale-context status handling.

## Next Integration Step

- Run staff acceptance at `/clinic/arrival-counter` and collect any final polish feedback before broader head-app slice rollout.
