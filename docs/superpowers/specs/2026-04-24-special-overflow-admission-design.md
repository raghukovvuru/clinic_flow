# Special Overflow Admission Design

Date: 2026-04-24

## Summary

Replace fixed special-token holding with a controlled special-overflow authorization model.

Special patients remain part of the normal admission lifecycle. They may bypass normal capacity limits when authorized, and they may be pulled by the doctor through `Call Next Special` after they become clinically eligible.

## Core Decision

Special is not a separate queue authority and not an emergency.

Special is modeled as:

- `priority = special`
- optional overflow metadata when booking bypasses normal capacity
- mandatory reason/source for overflow
- normal arrival, reception, check-in, and payment/free eligibility
- doctor-side explicit pull through `Call Next Special`

The system should not reserve fixed token numbers for special patients.

## Canonical Concepts

Keep the existing operational concepts:

- `channel`: `phone` or `walkin`
- `load_class`: `review_load` or `non_review_load`
- `priority`: `normal`, `special`, or `emergency`

Add or formalize overflow metadata on `Queue Entry`:

- `is_overflow`: true when the booking bypasses normal/stretch capacity
- `overflow_reason`: mandatory for special overflow
- `overflow_authorized_by`: user who authorized the overflow
- `overflow_authorized_at`: authorization timestamp
- `overflow_source`: optional structured source such as doctor instruction, management approval, close circle, returning special case, or other

Existing special audit fields such as `special_reason`, `marked_special_by`, and `marked_special_at` remain useful. Overflow-specific fields are still preferred for reporting clarity because not every special patient is an overflow exception.

## Capacity Policy

There are three capacity layers:

- Planned capacity: normal intended session load.
- Stretch capacity: hidden operational cushion already represented by `Queue Session.stretch_capacity`.
- Special overflow: explicit exception beyond normal/stretch capacity.

Rules:

- Normal bookings keep existing capacity behavior.
- Special bookings use normal available capacity when capacity exists.
- If planned capacity is exhausted but stretch capacity remains, a special booking can proceed as a normal special booking.
- If stretch capacity is exhausted, special booking requires overflow authorization.
- Overflow should not silently increase `stretch_capacity`; it should be recorded as an actual exception.
- Emergency remains separate and can bypass capacity only through emergency-specific APIs.

## Admission Paths

### Live Special Walk-In

Patient is physically present during a running session.

Flow:

`Special Overflow Intake -> Registration/Guardian/Child -> Payment or Free -> Ready Near Doctor as Special -> Doctor may Call Next Special`

Behavior:

- Receptionist confirms physical presence immediately.
- System records arrival timestamp during the same flow.
- Reception/check-in is completed at the same desk.
- Payment can be collected or marked `Free`.
- Patient becomes `Ready Near Doctor` only after reception completion.
- Patient appears in the special-ready bucket.
- Doctor can pull them with `Call Next Special`.

Print slip:

- Optional per clinic choice or per booking action.
- Token still exists for tracking even if no slip is printed.

### Reserved Walk-In Special

Patient/token is booked before the patient is physically present.

Flow:

`Special Booking -> Optional Slip/ETA -> Arrival -> Reception + Payment/Free -> Ready Near Doctor as Special -> Doctor may Call Next Special`

Behavior:

- Booking can be made ahead of physical presence.
- If capacity is full, overflow authorization is required.
- Patient is not doctor-callable until arrival and reception are complete.
- Arrival desk and arrival lookup remain meaningful for this case.

### Phone Special Booking

Phone-origin special booking, usually before the session day.

Flow:

`Phone Special Booking -> ETA/Instruction -> Arrival -> Reception + Payment/Free -> Ready Near Doctor as Special -> Doctor may Call Next Special`

Behavior:

- If phone quota is available, booking consumes normal phone quota.
- If phone quota is full, special phone overflow can be authorized.
- Keep `channel = phone`; do not convert it to walk-in.
- Special phone overflow is not released at midnight because it is an actual booked commitment.
- Normal unused phone quota can still release to walk-in as currently designed.

## Lifecycle Policy

Special patients do not bypass eligibility.

They may bypass:

- normal capacity blocking, when authorized
- normal token order, when the doctor explicitly pulls them

They may not bypass:

- patient tracking
- registration/guardian/child linkage
- arrival or physical-presence recording
- payment or `Free` decision
- reception completion
- `Ready Near Doctor` eligibility

This preserves the lifecycle meaning:

`booking reserves/records -> arrival confirms physical presence -> reception/payment grants eligibility -> doctor consultation`

## Queue Policy

Do not create a separate persisted special queue.

Use a derived special-ready view:

- source of truth: `Queue Entry.status = "Ready Near Doctor"` and `priority = "special"`
- normal ready queue remains ordered by `queue_position`
- special-ready bucket is a filtered view over ready patients
- `Call Next Special` pulls from this filtered view
- stored `queue_position` is not rewritten
- normal `Call Next` behavior remains unchanged

Doctor can pull any eligible special patient at any time. Eligible means:

- physically present
- reception completed
- payment/free handled
- status is `Ready Near Doctor`
- priority is `special`

## Doctor Behavior

Doctor workspace keeps two actions:

- `Call Next`: ordinary queue progression
- `Call Next Special`: explicit special override

`Call Next Special` should:

- only consider `Ready Near Doctor` special patients
- not call booked, arrived, or called-to-reception patients
- not mutate normal ready queue order
- record override audit fields such as `special_override_by` and `special_override_at`

The current implementation already aligns with this direction for doctor-side pulling.

## Receptionist Behavior

After the backend policy is in place, `receptionist_dashboard` should support:

- marking a booking as special
- showing “Special overflow requires authorization” when capacity is full
- requiring reason/source before confirming overflow
- live special walk-in flow where arrival and reception happen immediately
- phone special overflow when phone quota is full
- payment mode `Free`
- optional token-slip printing
- internal special/overflow markers without exposing special status on patient-facing displays by default

## Patient-Facing Token Policy

Special should not create a separate token language.

Use existing display-token policy:

- internal identity: `token_number`
- visible identity: `QUEUE_CODE-TOKEN_NUMBER`

Do not use prefixes like `S-`, `VIP-`, or `EMR-` for special patients.

Special status is operational/back-office, not patient-facing.

## Audit Policy

Special overflow requires audit.

Minimum audit data:

- who authorized the overflow
- when it was authorized
- reason/source
- channel
- session
- patient
- whether capacity was exhausted at booking time

Recommended reason/source examples:

- doctor instructed
- management approval
- close circle
- returning special case
- other

Normal special bookings where capacity exists may optionally require a reason. Overflow must require it.

## Reporting Policy

Reports should distinguish:

- normal bookings
- special bookings within capacity
- stretch-capacity bookings
- special overflow bookings
- emergency cases

This prevents doctor-network exceptions from disappearing into ordinary walk-in counts or emergency counts.

## Backend Implementation Shape

Backend-first slice:

- Add or formalize overflow fields on `Queue Entry`.
- Add special overflow booking behavior to the admission API or a dedicated API wrapper.
- Preserve normal `confirm_booking()` behavior for ordinary cases.
- Enforce role-based authorization for overflow.
- Require reason/source when overflow is used.
- Keep `channel` intact for phone vs walk-in.
- Set `priority = special`.
- Assign the next numeric token normally, even beyond planned/stretch capacity.
- Record arrival immediately only for live walk-in special flow.
- Keep status lifecycle correct; a patient is not doctor-callable until `Ready Near Doctor`.
- Add tests for full-capacity walk-in special overflow and full-quota phone special overflow.

## Frontend Implementation Shape

Frontend slice after backend:

- Add reason prompt and overflow confirmation.
- Add live special walk-in path.
- Add phone special overflow path.
- Add optional print choice.
- Expose special-ready and overflow indicators operationally.

## Alternatives Considered

### Fixed Special Token Holding

Rejected.

It reserves arbitrary token numbers, complicates ETA behavior, and does not match the real operational need: unannounced special patients may appear after the session is already full.

### Configured Special Allowance

Deferred.

A per-session special allowance can provide predictable headroom, but it risks becoming another hidden quota and may recreate token-holding behavior. It can be added later if clinic management wants explicit daily/session limits.

### Doctor Approval Queue

Deferred.

Doctor approval gives stronger control but slows live reception and adds doctor-workspace complexity. Role-based override with mandatory reason is the better first implementation.

### Emergency-Like Fast Path

Rejected.

Special patients are not emergencies. Reusing emergency semantics would pollute emergency metrics and allow non-emergency patients to bypass ordinary eligibility too easily.

## Non-Goals

This design does not:

- revive fixed token holding
- use emergency for non-emergency special patients
- create a second persisted special queue
- silently increase `stretch_capacity`
- allow doctor to call patients who have not completed reception
- expose special status on public token displays by default
- rewrite normal `Ready Near Doctor` order

## Recommendation

Proceed with role-based special overflow authorization.

This directly handles the clinic’s real problem: special patients can be accepted even when the session is full, without corrupting emergency semantics, without holding arbitrary tokens, and without breaking the admission lifecycle.
