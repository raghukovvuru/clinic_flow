# Historical Note

This backend policy note captures design intent from an earlier transition phase.

Some of its guidance is now implemented, some remains aspirational, and some conflicts with the current display-token policy. Do not treat it as active source of truth without checking the live code and current policy docs.

# Backend Policy Note v1

## 1. Canonical Model
All booking and queue logic should converge on:

- `channel`: `phone` / `walkin`
- `patient_type`: `new` / `review`
- `priority`: `normal` / `special` / `emergency`

Token model:
- token is session-scoped
- displayed token is a simple numeric token
- doctor / department / session context is shown separately
- token label should not encode queue type or patient type

## 2. Terminology Decisions
Settled:
- `review` replaces `follow_up`
- `special` replaces `VIP`

Legacy concepts like:
- `FOLLOW_UP`
- `PRE_BOOKED`
- `WALK_IN`
- `EMERGENCY`
should stop being the primary product language.

Transitional note:
- old fields may remain temporarily as compatibility shims where Healthcare integration requires them
- but the canonical model is `channel + patient_type + priority`

## 3. Recommendation Ownership
Backend owns:
- session ordering
- recommended session
- recommended token

Frontend only:
- renders
- displays recommendation
- allows override

Frontend must not independently rank sessions or invent best-token rules.

## 4. Session Recommendation Policy
Session ranking should eventually consider:

- `channel`
- `patient_type`
- `priority`
- available slots
- weighted load
- likely consultation hour
- session status: `Scheduled` / `Active`
- time until start
- time until end
- late-start risk
- near-closing risk

Channel intent:
- `phone`: optimize for stable, explainable offers
- `walkin`: optimize for immediate throughput
- `emergency`: optimize for immediate clinical availability

## 5. Token Recommendation Policy
Backend returns explicit token recommendation.

`normal`
- recommend first suitable normal token

`special`
- do not use hard reserved token buffers as the long-term model
- special is a priority behavior, not a token-position trick

`emergency`
- handled through emergency fast path, not normal token recommendation flow

## 6. Special Policy
`special` is a simple priority flag, not emergency.

Settled rules:
- special does not alter booking-time token order
- special does not alter stored queue order
- special does not use hard reserved token slots
- special must not disturb patients already:
  - `Called to Reception`
  - `Ready Near Doctor`
  - `With Doctor`

Operational behavior:
- receptionist can mark a patient as `special`
- patient receives normal token / normal queue placement
- special remains a back-office flag only
- patient-facing displays must not expose special status

Reception behavior:
- no formal queue override
- no visible jumping ahead
- receptionist may treat special as an attentiveness flag operationally, but not reorder the queue

Doctor behavior:
- doctor gets explicit `Call Next Special`
- this is a one-time dequeue override
- it selects the oldest eligible special patient in `Ready Near Doctor`
- it does not rewrite queue order permanently
- after that, queue returns to normal `Call Next`

Audit:
- track:
  - `marked_special_by`
  - `marked_special_at`
  - optional `special_reason`
  - whether doctor used special override

Visibility:
- doctor workspace: special badges and special counts
- receptionist live session view: special visible in back-office lists
- TV / patient-facing surfaces: no special visibility

## 7. Emergency Policy
Emergency exists in both:
- `phone`
- `walkin`

Core principle:
- emergency bypasses normal formalities
- patient goes to doctor immediately
- details are completed later

### Walk-in emergency
Receptionist flow:
- always-visible `Issue Emergency Token` button
- single click if one active session
- at most one lightweight session pick if multiple active sessions
- no mandatory manual data fields before issuance

Minimum data at issuance:
- zero mandatory receptionist-entered fields
- system auto-captures:
  - issuing user
  - issued timestamp
  - session / practitioner
  - `priority = emergency`
- optional if available:
  - display label
  - mobile
  - one-line complaint

Initial object model:
- create a real emergency queue entry immediately
- create a stub patient immediately for linkage
- do not create Patient Appointment at issuance
- patient encounter is created lazily as current doctor flow already does

Stub patient requirements:
- clearly marked as emergency stub / incomplete
- excluded from normal search/reporting by default
- later either:
  - merged into an existing patient
  - or completed into a real patient

Queue behavior:
- emergency enters urgent operational path immediately
- emergency is not treated like a normal booking
- emergency should preempt ordinary queue flow as clinically necessary

### Phone emergency
Do not create a real queue entry at call time.

Instead:
- create a lightweight emergency alert
- advisory only
- visible on receptionist and doctor dashboards
- no queue insertion yet
- no ETA queue distortion yet
- auto-expire / dismiss if patient never arrives

On arrival:
- one-click `Confirm Arrival`
- converts alert into real walk-in emergency flow
- prefill any captured information

## 8. Emergency Deferred Completion
Emergency must create operational debt that is visible and hard to ignore.

Receptionist side needs:
- persistent `Emergency Intakes Pending Reconciliation` surface
- each item should support:
  - identify/merge patient
  - complete guardian/child details if needed
  - add complaint if missing
  - create Patient Appointment
  - payment / waiver handling
  - mark reconciliation complete

Recommended emergency progression:
- issued
- with doctor
- consult done
- awaiting reconciliation
- completed

Governance:
- aging warnings for unreconciled emergency cases
- strong reminders before session close / end of day
- do not hard-block blindly; allow supervisor-style defer/override with reason if needed

## 9. ETA Policy
Normal ETA remains guidance, not promise.

For `special`:
- no major ETA disruption model required by default

For `emergency`:
- emergency is an explicit ETA disruption event
- back-office ETA recalculates immediately
- patient-facing surfaces should show a simple disruption message such as:
  - `Emergency in progress. Waiting time may be longer than usual.`
- avoid pretending emergency fits calmly into normal ETA precision

## 10. Session Lifecycle Policy
These operational states require explicit support:
- doctor starts late
- doctor cancels session
- doctor ends early
- doctor extends session

Current position:
- some primitives exist
- full product policy still needs implementation

Target behavior should support:
- reroute / reschedule / cancel visibility
- receptionist follow-up on affected patients
- ETA recalculation after meaningful timing changes
- explicit session-change notifications where needed

## 11. Release-Window / Same-Day Phone
Not settled.

Current decision:
- keep release-window logic configurable
- do not treat the current 1-hour rule as final product truth
- same-day phone booking remains on hold for now

Implementation guidance:
- do not make the new recommendation engine depend on this unresolved policy yet

## 12. Data Model Guidance
Likely long-term direction:
- `token_number` = stable session identity
- live service order should not be ambiguously encoded in the same way as token identity
- legacy overlap between queue type, token formatting, queue position, slot counters, and new priority model should be reduced carefully

Compatibility note:
- old Healthcare-linked queue fields may need temporary shim behavior during migration

## 13. Settled Decisions
These are now settled enough to implement:

- canonical model is `channel`, `patient_type`, `priority`
- `review` replaces `follow_up`
- `special` replaces `VIP`
- tokens are session-scoped numeric tokens
- backend owns recommendation
- special is a back-office priority flag, not booking-time queue manipulation
- doctor gets `Call Next Special`
- special does not disturb `Called` / `Ready` / `With Doctor`
- emergency exists in both phone and walk-in
- walk-in emergency is immediate operational issuance
- phone emergency is advisory alert first, real queue object only on arrival
- emergency bypasses formalities
- emergency reconciliation happens later through a dedicated pending flow
- release-window remains configurable and unresolved
- same-day phone remains on hold

## 14. Remaining Deferred Questions
These can be deferred until after initial backend refactor:
- exact recommendation scoring weights
- exact late-start / cancellation / extension workflows
- exact emergency minimum optional fields UX
- whether receptionist needs any stronger non-queue attentiveness affordances for special
- how aggressively ETA confidence should widen during emergency

## 15. Recommended Implementation Order
1. create new backend refactor branch
2. add canonical fields / compatibility shims
3. centralize session ranking in backend
4. centralize token recommendation in backend
5. implement special flag + doctor override semantics
6. implement emergency alert + walk-in emergency issuance
7. implement emergency reconciliation flow
8. adjust ETA behavior for emergency disruption
9. handle session lifecycle edge cases
10. retire legacy vocabulary and token formatting incrementally
