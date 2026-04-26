# Special Reception SLA Backend

Date: 2026-04-26

## What Changed

- Added `Slot Partition Config` fields for special reception warning, escalation, target, gap lookahead, and max consecutive special reception calls.
- Added `Queue Entry` reception-call audit fields for caller, public/private mode, private reason, and recommendation reason snapshot.
- Extended `get_live_session_state(queue_session)` with backend-computed `special_reception_policy`, `special_reception_alerts`, and `recommended_reception_call`.
- Extended `call_to_reception()` to persist public/private call mode while keeping the existing `Called` state transition.

## What Was Verified

- Special reception eligibility includes only `Arrived + special` Queue Entries.
- Booked, called, ready, with-doctor, normal, and emergency entries are excluded from special reception alerts.
- SLA states are computed from `arrived_at`.
- One missing normal token in the lookahead window creates a gap recommendation.
- Max consecutive special reception calls block recommendations only when normal arrived patients are available.
- Private calls require a reason and still set operational status to `Called`.
- Doctor `Call Next Special` remains limited to `Ready Near Doctor` special entries.
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla` passed with 17 tests.
- Adjacent check-in, special-overflow, and targeted doctor special override tests passed.
- `bench --site site1.localhost migrate` passed.

## Verification Limitation

- `pre-commit run --all-files` could not be run because `pre-commit` is not installed in this environment, and `python -m pre_commit` is also unavailable.

## Out Of Scope

- No receptionist dashboard UI alert rail.
- No public display implementation change.
- No ETA rewrite.
- No emergency behavior change.
- No doctor workspace behavior change.
- No token renumbering or reserved token bands.

## Next Integration Step

- Build the receptionist dashboard frontend slice that consumes the backend payload, renders arrived-special alerts, and sends public/private call mode to `call_to_reception()`.
