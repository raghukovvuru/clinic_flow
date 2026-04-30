# Arrival Counter

## Current State

- Canonical operator route: `/clinic/arrival-counter`.
- The Arrival Counter uses the standalone head-app shell for the current product direction.
- The shell injects typed boot context and does not use Desk chrome or an iframe.
- Backend Arrival Counter APIs enforce staff permissions directly.
- Backend queue authority remains in Clinic Flow APIs and Queue Entry behavior, not in frontend state.
- Legacy Desk pages remain compatibility/coexistence surfaces unless a later authority doc says otherwise.

## Durable Decisions

- Arrival scanning and marking-arrived behavior must not allocate new queue authority in the frontend.
- `mark_arrived` records physical presence only; it does not make a patient doctor-eligible.
- Receptionist check-in remains the active gate to `Ready Near Doctor`.
- `has_active` reflects only Active/Paused sessions, not Scheduled-only arrival-eligible sessions.
- `print_context` is conditional: Booked/Waiting lookup candidates omit it; Arrived result cards include it for slip printing.
- Display-token formatting remains a presentation concern governed by `docs/token-display-policy.md`.
- Service Point remains the preferred queue identity model governed by `docs/service-point-policy.md`.

## Verification

```bash
cd /home/raghu/frappe-bench
bench --site site1.localhost run-tests --module clinic_flow.tests.test_arrival_counter_shell
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract
```

Frontend verification for head-app changes:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow/frontend/head-app
npm run check
npm run test
npm run build
```

Optional real shell smoke:

```bash
FRAPPE_BASE_URL=http://site1.localhost:8000 FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json npm run test:e2e -- tests/arrival-counter-frappe-shell.spec.ts
```

## Historical Notes

- Earlier v1 iframe/static-hosting work was superseded by the standalone shell direction.
- Drift-fix notes are historical incident records after their durable decisions are captured here and in core docs.
- UI stabilization and P0/P1/P2 hardening preserved standalone-shell architecture, backend authority, and keyboard-first workflow.

## Out Of Scope

- This note does not define queue authority.
- This note does not replace `ARCHITECTURE.md` or focused policy docs.
- This note does not remove legacy Desk compatibility pages.
