# Arrival Frontend Contract Enrichment

## What Changed

- Added `_session_summary(row)` and `_candidate_summary(row)` helpers in `clinic_flow/api/arrival.py`
- Extended `get_arrival_session_context()` return with `stats`, `current_session`, `next_session`, `recent_arrivals` (kept legacy keys)
- Extended `lookup_arrival_candidate()` to return enriched candidates via `_candidate_summary` (adds `display_token`, `state_label`, `visit_label`, `print_context`)
- Extended `mark_arrived()` return to include `result_card` payload via `_candidate_summary`
- Created `clinic_flow/tests/test_arrival_frontend_contract.py` with 3 contract tests

## What Was Verified

- All 3 frontend contract tests pass
- All 5 existing slice 3 checkin boundary tests pass (no regression)
- Legacy keys preserved: `sessions`, `has_active`, `arrived_count`, `waiting_count` still in `get_arrival_session_context` response

## What Stayed Out of Scope

- No changes to doctor workspace, receptionist dashboard, or other pages
- No changes to Healthcare base app
- No changes to queue engine or service point resolution
- No changes to the arrival_counter desk page JS (that's a separate task)
- No core doc updates needed (runtime behavior change only, no schema/authority boundary change)

## Next Integration Step

Connect the arrival_counter desk page to consume the enriched API response.
