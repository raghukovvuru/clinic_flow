# Special Overflow Admission Backend Slice

Date: 2026-04-25
Branch: `backend/special-overflow-admission`
Spec: `docs/superpowers/specs/2026-04-24-special-overflow-admission-design.md`
Plan: `docs/superpowers/plans/2026-04-25-special-overflow-admission-backend.md`

## Goal

Implement backend-only special overflow admission behavior so special patients can be booked beyond normal/stretched capacity only with explicit authorization and audit data, while preserving normal admission and dequeue semantics.

## Implemented in This Slice

- Added overflow audit fields on `Queue Entry`:
  - `is_overflow`
  - `overflow_reason`
  - `overflow_authorized_by`
  - `overflow_authorized_at`
  - `overflow_source`
- Extended `confirm_booking()` in `clinic_flow/api/admission.py` with:
  - `special_reason`
  - `authorize_overflow`
  - `overflow_reason`
  - `overflow_source`
  - `mark_arrived`
- Added helper-driven capacity + overflow policy in admission flow:
  - `_get_booking_capacity_state(...)`
  - `_validate_booking_capacity(...)`
  - `_set_overflow_queue_entry_fields(...)`
- Enforced overflow authorization gate:
  - role check: `Queue Manager` or `System Manager`
  - required `overflow_reason` and `overflow_source` when overflow is used
- Preserved channel and token behavior:
  - phone overflow keeps `channel = phone`
  - token allocation remains numeric and sequential
  - no separate special queue persisted
- Added live walk-in arrival support in booking path:
  - `mark_arrived=True` allowed only for walk-in
  - sets `status = "Arrived"` and `arrived_at`
  - does not auto-move to `Ready Near Doctor`
- Hardened boolean input parsing with `sbool(...)` for string request payloads (`"0"`, `"1"`, etc.).

## Tests Added

New module: `clinic_flow/tests/test_special_overflow_admission.py`

Coverage includes:

- schema presence for overflow fields
- normal full-capacity rejection (walk-in and phone)
- overflow requires authorization when capacity is full
- overflow requires reason and source
- overflow audit data persistence
- role-gated overflow authorization
- phone overflow channel preservation
- in-capacity special booking is not overflow
- live walk-in arrival path behavior
- phone arrival guard during booking
- doctor eligibility boundary for `call_next_special`
- string boolean coercion regression tests

## Core Docs Updated

- `ARCHITECTURE.md`: updated in this docs slice
- `docs/receptionist-backend-policy.md`: updated in this docs slice
- `AGENTS.md`: updated in this docs slice
- `docs/notes/README.md`: updated in this docs slice

## Verification Completed

- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission` (16 tests, pass)
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice2_admission_semantics` (pass)
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice2_receptionist_paths` (pass)
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary` (pass)
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_healthcare_compatibility` (pass)
- `bench --site site1.localhost migrate` (pass)
- `graphify update .` (completed)

Note: in this worktree setup, test/migrate commands were run with a `PYTHONPATH` prefix pointing at this worktree app path so bench resolved the in-worktree code.

## Out of Scope

- no frontend changes (`receptionist_dashboard`, arrival UI, doctor UI)
- no doctor dequeue algorithm changes
- no emergency-path behavior changes
- no base app edits (`apps/healthcare`)

## Next Integration Step

Commit these backend slice changes in `backend/special-overflow-admission`, then review integration via diff against `backend/receptionist-queue-refactor`.
