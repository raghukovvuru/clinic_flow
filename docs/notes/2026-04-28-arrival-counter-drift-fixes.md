# Arrival Counter Drift Fixes — 2026-04-28

Branch: `fix/arrival-counter-spec-drift` (from `backend/receptionist-queue-refactor`)
Plan: `docs/superpowers/plans/2026-04-28-arrival-counter-drift-fixes.md`
Specs: `docs/superpowers/specs/2026-04-28-arrival-counter-standalone-shell-design.md`
       `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md`

## What Changed

### Drift 1 — `has_active` Semantics (Backend)

`get_arrival_session_context` previously set `has_active: True` whenever any
arrival-eligible sessions existed, including Scheduled-only sessions within the
30-minute pre-arrival window. This inflated the semantic meaning — the field
now reflects only Active/Paused sessions.

**File:** `clinic_flow/api/arrival.py`
- `has_active` is now computed via `any(s["status"] in ("Active", "Paused") for s in sessions)`
- Scheduled-only sessions still appear in `sessions`, `current_session`, `next_session`, and `stats` — only `has_active` changes

**Test:** `clinic_flow/tests/test_arrival_frontend_contract.py`
- Added `test_has_active_false_when_only_scheduled_sessions_exist` — creates a Scheduled session with current time (within 30-min window) and asserts `has_active` is `False`, `current_session` is `None`, `next_session` is populated

### Drift 2 — Conditional `print_context` (Backend + Frontend)

`_candidate_summary` previously generated a QR SVG and included `print_context`
for every candidate regardless of status. The spec requires "print context only
when safe and needed" — meaning only for `Arrived` candidates.

**Backend — `clinic_flow/api/arrival.py`**
- `_candidate_summary` now includes `print_context` only when `status == "Arrived"`
- `mark_arrived` result cards always carry `print_context` (status is always "Arrived")
- `lookup_arrival_candidate` returns `print_context` only for already-arrived candidates (reprint support); Booked/Waiting candidates omit it
- QR SVG generation is now conditional — no unnecessary QR generation for non-arrived candidates

**Backend tests:**
- `test_print_context_absent_for_non_arrived_candidates` — Booked candidate lookup returns no `print_context`
- `test_print_context_present_for_arrived_candidates` — Arrived candidate lookup returns `print_context` with `qr_svg`
- Existing `test_lookup_arrival_candidate_keeps_legacy_candidates_and_adds_ui_fields` updated to remove stale `print_context` assertion (Booked entry no longer carries it)

**Frontend type — `frontend/head-app/src/lib/arrival-counter/types.ts`**
- `ArrivalCardRecord.print_context` changed from required to optional (`print_context?:`)

**Frontend runtime validator — `frontend/head-app/src/lib/api/arrival.ts`**
- `isCardRecord` now treats `print_context` as optional: `value.print_context === undefined || (isRecord(value.print_context) && ...)`
- This was the runtime gate that caused the "Arrival candidate response is invalid" error during testing — the TypeScript type was optional but the validator still required it

**Frontend guards — `frontend/head-app/src/lib/arrival-counter/print-slip.ts`**
- `buildTokenSlipDocument`: early return `if (!record.print_context) return`
- `printTokenSlip`: early return `if (!record.print_context) return { ok: false, reason: "popup-blocked" }`

**Frontend test mocks — `frontend/head-app/src/lib/arrival-counter/state.test.ts`**
- Removed `print_context` from `mockCard` (status: "Waiting")
- Removed `print_context` from inline mock cards in keyboard and refresh tests (status: "Booked")

### Drift 3 — Shell Smoke Test Documentation

The spec requires "at least one integration path must load through the real
Frappe shell." The existing test at `arrival-counter-frappe-shell.spec.ts`
skips unless `FRAPPE_BASE_URL` is set. This is a practical constraint (CI
cannot run a live Frappe instance), but the gap must be explicit.

**File:** `frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts`
- JSDoc comment documents the required manual verification command and explains the CI skip

## Status Lifecycle (Documented During Drift Verification)

```
Booked ──→ Arrived        (arrival counter: physical presence confirmed)
   │  └──→ Called ──→ Ready Near Doctor  (receptionist: responded to call)
   └──→ Waiting  (legacy Healthcare status)
```

| Status | Set By | Meaning |
|--------|--------|---------|
| **Booked** | Token issuance (receptionist dashboard) | Token exists, patient not yet at clinic |
| **Arrived** | `arrival.mark_arrived` (arrival counter) | Patient physically present; no doctor-eligibility |
| **Waiting** | Legacy Healthcare (not set by clinic_flow) | Treated as doctor-eligible in queue ordering alongside `Ready Near Doctor` (`engine.py:75`, `queue.py:818-823`) |
| **Called** | `queue.call_to_reception` (receptionist) | Patient is being summoned to reception desk. Valid from Booked, Waiting, Arrived, Pushed to End |
| **No Response** | Auto-transition from Called after timeout | Patient did not respond to call |
| **Ready Near Doctor** | `queue.complete_reception` (receptionist) | Patient has completed reception check-in. Doctor-eligible. Valid from Called or No Response only |

Key rules:
- `mark_arrived` accepts Booked or Waiting entries (`arrival.py:225`)
- Arrival alone never makes a patient doctor-eligible (Slice 3 locked)
- `complete_reception` is the only gate to `Ready Near Doctor` — requires Called or No Response status
- `Waiting` is a legacy status that carries doctor-readiness in some contexts but is not the canonical Clinic Flow path

## Files Changed

| File | Change |
|------|--------|
| `clinic_flow/api/arrival.py` | `has_active` computation + conditional `print_context` |
| `clinic_flow/tests/test_arrival_frontend_contract.py` | 3 new tests + 1 stale assertion removed |
| `frontend/head-app/src/lib/arrival-counter/types.ts` | `print_context?` optional |
| `frontend/head-app/src/lib/api/arrival.ts` | `isCardRecord` optional `print_context` |
| `frontend/head-app/src/lib/arrival-counter/print-slip.ts` | Null guards |
| `frontend/head-app/src/lib/arrival-counter/state.test.ts` | Removed `print_context` from Booked/Waiting mocks |
| `frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts` | JSDoc documentation |
| `docs/notes/arrival-counter-standalone-shell.md` | Drift fixes section appended |
| `docs/superpowers/plans/2026-04-28-arrival-counter-drift-fixes.md` | Implementation plan |

## What Was Verified

```bash
# Backend — all OK
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract  # 8/8
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_counter_shell     # 2/2
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary  # 5/5
bench --site site1.localhost migrate  # clean

# Frontend — all OK
npm run check   # 0 errors, 0 warnings
npm run test    # 33/33
npm run build   # success
bench build --app clinic_flow  # success

# Manual
Arrival counter page at /clinic/arrival-counter — working end-to-end:
  token lookup (3-letter search), mark arrived, print slip, awaiting count refresh
```

## What Stayed Out Of Scope

- No changes inside `apps/healthcare/`
- No queue authority or token allocation changes
- No `Patient Appointment` lifecycle routing for arrival authority
- No removal of legacy `Waiting` status or legacy Desk pages
- No CI changes to auto-run the Frappe shell smoke test (documented as manual gate)

## Plan Deviation: Frontend Validator Hotfix

The original drift fix plan changed the TypeScript type and print-slip guards
but missed the runtime validator `isCardRecord` in `arrival.ts`. This caused a
live "Arrival candidate response is invalid" error when testing the arrival
counter with a Booked entry. The fix was applied as an immediate hotfix:
`isCardRecord` now accepts `print_context` as optional, matching the TypeScript
type.
