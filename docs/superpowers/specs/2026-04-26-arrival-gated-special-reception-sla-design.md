# Arrival-Gated Special Reception SLA Backend Design

Date: 2026-04-26
App: `clinic_flow`
Status: Draft

## Goal

Add backend support for a reception-stage special handling policy that extends the existing special overflow admission model without changing token assignment, emergency behavior, doctor dequeue behavior, or the unified queue lifecycle.

The feature should ensure that once any special patient has physically arrived, reception gets clear backend-owned recommendations and SLA alerts for when to call that patient to reception.

## Context

The existing special overflow backend slice solved admission authority:

- Special patients can be booked within normal capacity.
- Special overflow patients can be admitted beyond capacity with explicit authorization and audit data.
- Phone special overflow keeps `channel = phone`.
- Live walk-in special overflow may be created as `Arrived`.
- Special patients are not doctor-callable until they reach `Ready Near Doctor`.
- Token assignment remains numeric and sequential.
- No fixed special token holding exists.
- Emergency remains separate.

This design extends that model at the reception stage.

It does not replace the overflow model. It starts after the patient is already in the queue and becomes relevant only when:

- `Queue Entry.status = "Arrived"`
- `Queue Entry.priority = "special"`

## Core Policy

Special is not a separate queue.

Special handling has three separate boundaries:

1. Admission boundary
- Determines whether the patient can be booked.
- Already handled by normal booking and special overflow authorization.

2. Reception boundary
- Starts only after physical arrival.
- Backend recommends when an arrived special should be called to reception.
- Receptionist remains the actor who calls the patient.

3. Doctor boundary
- Starts only after reception completion.
- Existing `Call Next Special` remains an explicit doctor-side override.
- Reception expedition does not automatically imply doctor expedition.

The lifecycle remains:

`Booked -> Arrived -> Called -> Ready Near Doctor -> With Doctor`

No special patient should skip this lifecycle unless they use the existing emergency path.

## Configurable SLA Defaults

Add configurable fields, preferably to `Slot Partition Config` under the existing live queue section.

Suggested defaults:

- `special_reception_warning_minutes = 10`
- `special_reception_escalation_minutes = 12`
- `special_reception_target_minutes = 15`
- `special_gap_lookahead_tokens = 3`
- `max_consecutive_special_reception_calls = 2`

These values must be backend-owned and returned in live session payloads so the frontend can render policy state without duplicating configuration.

## Eligibility

A patient is eligible for special reception SLA only when:

- `status = "Arrived"`
- `priority = "special"`

Excluded:

- `Booked` specials
- `Called` specials
- `Ready Near Doctor` specials
- `With Doctor` specials
- emergency patients, because emergency has a separate path

All special origins collapse into the same arrived-special bucket:

- normal-capacity special
- overflow special
- phone special after arrival
- prior special
- unannounced approved special
- live walk-in special

The backend should not create subtypes such as "more special" or "VIP level".

## Recommendation Logic

The backend should compute a reception recommendation, not perform automatic state transitions.

### Gap Opportunity

Look ahead at the next configured number of logical normal tokens, default `3`.

If any expected normal token in that window is not arrived/callable, and an arrived special exists, the backend may recommend calling the oldest arrived special into that gap.

Important interpretation:

- The next 3-token window is a lookahead boundary.
- It is not a requirement that all 3 tokens are absent.
- A single non-arrival gap is enough to recommend a special call.

Example:

- Token `66` has not arrived.
- Tokens `67` and `68` have arrived.
- Special token `89` arrived 5 minutes ago.
- The backend can recommend calling `89` because `66` created a gap.

### SLA Warning

For each arrived special, compute elapsed minutes from `arrived_at`.

States:

- below warning: normal
- warning: elapsed >= `special_reception_warning_minutes`
- escalation: elapsed >= `special_reception_escalation_minutes`
- target breach: elapsed >= `special_reception_target_minutes`

At target breach, the recommendation should become prominent but still not automatic.

### Consecutive Special Guardrail

The backend should prevent special calls from starving normal patients.

Default rule:

- no more than `max_consecutive_special_reception_calls` specials may be called consecutively when normal arrived patients are available.

If no normal arrived patient is available, additional special calls may be recommended because normal flow is not being blocked.

This guardrail is based on reception calls, not doctor calls.

## Call To Reception

Extend or wrap the existing reception call backend behavior so reception can call a patient in two modes:

1. Public Call
- Patient is called normally.
- Public display/announcement may show the token.

2. Private Call
- Patient is operationally called to reception.
- Public display/announcement should be suppressed.
- Receptionist is expected to contact the patient/parent by phone, direct communication, or in-person handling.

Private call must not hide operational state.

Both modes must:

- set `status = "Called"`
- set `called_to_reception_at`
- update live session state
- remain visible on receptionist dashboard

## Suggested Persisted Audit Fields

Add minimal generic reception-call audit fields to `Queue Entry`:

- `called_to_reception_by`
- `reception_call_mode`
  - options: `Public`, `Private`
- `private_reception_call_reason`
  - optional for public calls
  - required for private calls
- `reception_recommendation_reason`
  - optional snapshot, e.g. `gap`, `warning`, `escalation`, `target_breach`, `manual`

Suggested private reasons:

- parent contacted by phone
- patient waiting outside
- privacy-sensitive
- crowd-control decision
- other

These fields are intentionally reception-stage fields, not overflow fields.

## API Shape

### Extend Live Session State

Extend `get_live_session_state(queue_session)` to include backend-computed special reception state.

Suggested payload additions:

```json
{
  "special_reception_policy": {
    "warning_minutes": 10,
    "escalation_minutes": 12,
    "target_minutes": 15,
    "gap_lookahead_tokens": 3,
    "max_consecutive_special_calls": 2
  },
  "special_reception_alerts": [
    {
      "queue_entry": "QE-2026-00001",
      "token": "PD-089",
      "token_number": 89,
      "patient": "PAT-001",
      "patient_name": "Example Patient",
      "arrived_at": "2026-04-26 10:00:00",
      "elapsed_minutes": 12,
      "sla_state": "escalation",
      "recommendation_reason": "gap",
      "can_call_now": true,
      "guardrail_blocked": false
    }
  ],
  "recommended_reception_call": {
    "queue_entry": "QE-2026-00001",
    "kind": "special",
    "reason": "gap",
    "message": "Special patient can fill a non-arrival gap at token 66."
  }
}
```

The frontend should render this; it should not recalculate it.

### Extend Call To Reception

Extend `call_to_reception(...)` with typed parameters:

```python
@frappe.whitelist()
def call_to_reception(
    queue_entry: str,
    call_mode: str = "Public",
    private_reason: str = "",
    recommendation_reason: str = "",
) -> dict:
    ...
```

Rules:

- `call_mode` must be `Public` or `Private`.
- `private_reason` is required when `call_mode = "Private"`.
- Existing valid statuses remain respected.
- The action remains receptionist-authorized.
- No doctor queue state changes occur.

## Frontend Context For Later Slice

The later receptionist dashboard frontend slice should consume the backend payload and implement:

- arrived special alert rail
- warning/escalation/target breach styling
- gap recommendation messaging
- `Call Special` action
- public/private call mode choice
- private reason capture
- clear post-call refresh behavior
- no public `special` label
- no frontend-side SLA or gap calculation

Frontend should not own:

- gap logic
- SLA thresholds
- max consecutive special call logic
- special eligibility rules

The backend must return enough context for the frontend to explain the recommendation to the receptionist.

## Public Display Policy

Public displays must not expose special status.

For `Public Call`:

- public display may show the token normally.

For `Private Call`:

- public display/announcement should be suppressed.
- operational state still becomes `Called`.
- receptionist dashboard continues to show the patient in the called bucket.

This design requires the later frontend/public-display slice to respect `reception_call_mode`.

## Out Of Scope

- No fixed special token bands.
- No reserved token buckets.
- No token renumbering.
- No ETA rewrite.
- No automatic state transition from `Arrived` to `Called`.
- No automatic state transition from `Ready Near Doctor` to `With Doctor`.
- No emergency behavior changes.
- No doctor workspace behavior changes.
- No public special label.
- No new `VIP level` hierarchy.

## Risks And Gaps

1. ETA remains advisory.
Special reception handling can change live flow, but this slice should not rewrite ETA.

2. Public perception can still be sensitive.
A high token may be called earlier. Private calls and bounded special calls reduce but do not eliminate this.

3. Too many specials can still create pressure.
The max-consecutive guardrail reduces starvation, but analytics may be needed later.

4. Receptionist discretion remains important.
The backend recommends; it does not force action.

5. Doctor-side special handling remains separate.
A special expedited at reception may still wait normally in `Ready Near Doctor` unless doctor explicitly uses `Call Next Special`.

## Test Coverage Expectations

Backend tests should cover:

- `Booked + special` is ignored by special reception SLA.
- `Arrived + normal` is not included in special alerts.
- `Arrived + special` appears in alert payload.
- warning, escalation, and target breach are computed from `arrived_at`.
- any one missing token in the next configured lookahead window creates a gap recommendation.
- max consecutive special calls blocks recommendation when normal arrived patients are available.
- max consecutive special calls does not block when no normal arrived patients are available.
- public call persists public mode.
- private call requires reason.
- private call persists mode/reason and still sets status to `Called`.
- doctor `Call Next Special` remains unaffected.
