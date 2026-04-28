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

## What Stayed Out Of Scope

- No architecture changes
- No backend contract changes
- No new receptionist or doctor surfaces
- No queue authority changes
- No Healthcare base app edits

## Next Integration Step

- Run staff acceptance at `/clinic/arrival-counter` and collect any final polish feedback before broader head-app slice rollout.
