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

## Plan Deviation

### F7.3 — `paths.assets` Not Set In Svelte Config

The frontend plan Step F7.3 specifies:
```js
paths: {
  assets: "/assets/clinic_flow/head-app",
},
```

**Not applied.** Reason: SvelteKit v2.58 validates `paths.assets` must be a full URL
(matching `/^[a-z]+:\/\//`). A root-relative path like `/assets/clinic_flow/head-app`
fails `svelte-kit sync` with "option must be an absolute path, if specified."

**Compensating control:** The Frappe shell controller at
`clinic_flow/www/clinic/arrival_counter.py` — `_load_head_app_shell()` — rewrites
relative `./_app/` paths to `/assets/clinic_flow/head-app/_app/` at serve time.
The asset delivery contract is fulfilled server-side.

**Verification:** `npm run build` output copied to `clinic_flow/public/head-app/`
resolves correctly through `/clinic/arrival-counter` shell route. Local e2e tests
and backend shell tests confirm asset loading.

---

## Next Integration Step

- Validate `/clinic/arrival-counter` with real counter staff and then choose the final legacy Desk bridge behavior.

---

## Drift Fixes — 2026-04-28

### `has_active` Semantics
- `get_arrival_session_context.has_active` now reflects only Active/Paused sessions,
  not Scheduled-only ones. Scheduled-only sessions within the 30-min window still
  appear in `sessions` and `next_session`, but `has_active` is `False`.

### Conditional `print_context`
- `_candidate_summary` now includes `print_context` only when `status === "Arrived"`.
  Booked/Waiting candidates no longer carry a print context. `mark_arrived` responses
  always include it (all results are Arrived).
- Frontend `ArrivalCardRecord.print_context` is now optional; `printTokenSlip` guards
  against missing context.

### Shell Smoke Test Documentation
- `arrival-counter-frappe-shell.spec.ts` now documents the required manual run command
  explicitly in a header JSDoc comment.
