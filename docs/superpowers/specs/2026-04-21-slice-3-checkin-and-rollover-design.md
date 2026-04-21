# Slice 3 Design Note: Check-In Boundary and Midnight Rollover

Date: 2026-04-21
Audience: Claude Code / Codex / agentic implementers
Scope: Slice 3 only
Baseline: post-Slice-2 merge on `backend/receptionist-queue-refactor` through merge commit `619e475`

## Goal

Finalize the receptionist operational boundary so that:

- receptionist check-in is the only path to doctor eligibility
- fee-validity sync happens through a narrow Healthcare adapter
- protected `phone` quota releases to `walkin` at midnight of the session date
- obsolete legacy appointment/check-in behavior stops competing with the active flow

Slice 3 still does not redesign doctor dequeue movement. It only stabilizes the receptionist-to-doctor handoff boundary and the channel rollover rule.

---

## Baseline from Slices 1 and 2

Already locked:

- `Queue Session` and `Queue Entry` are the operational source of truth
- `Patient Appointment` is an integration anchor
- `Service Point` is the canonical queue identity
- active admission logic is expressed in `channel`, `load_class`, token reservation, and `Service Point`
- the three receptionist intake paths are preserved

Slice 3 builds on those decisions and must not reopen them.

---

## Decisions Locked for Slice 3

### 1. Doctor eligibility boundary

Only receptionist check-in can move a patient into:

- `Ready Near Doctor`

Arrival alone must never make a patient doctor-eligible.

### 2. Arrival remains operational-only

Arrival continues to mean:

- physical presence at the clinic
- live queue visibility improvement
- receptionist flow assistance

It does not mean:

- payment complete
- fee-validity applied
- ready for doctor

### 3. Fee-validity integration model

Use the hybrid boundary:

- Clinic Flow decides receptionist progression
- a narrow Healthcare sync helper updates the linked `Patient Appointment`
- Healthcare performs its standard fee-validity side effects

Clinic Flow must not reimplement fee-validity rules.

### 4. Midnight release rule

Unused protected `phone` quota for a session date is released at:

- `00:00:00` local time on that session date

After that rollover:

- same-day session capacity is effectively walk-in capacity
- same-day phone quota protection no longer applies

### 5. Legacy appointment/check-in path

The old appointment-centric payment/check-in path becomes legacy-only and must stop competing with the active receptionist runtime.

Any remaining code for:

- `record_payment_and_checkin()`
- appointment-driven queue/token assumptions
- near-session release semantics

must either be removed from active flow or clearly marked compatibility-only.

---

## Non-Goals for Slice 3

Do not solve these in this slice:

- doctor dequeue sequencing redesign
- arrival-based queue movement redesign
- broad schema cleanup of all legacy fields
- future reporting redesign
- non-consult service-point workflow expansion

---

## Current Misalignments in the Codebase

### A. Check-in and appointment sync are still too close

Even after Slices 1 and 2, the receptionist path still needs a clearer rule:

- `Queue Entry` state must advance first as Clinic Flow truth
- Healthcare sync must remain downstream, narrow, and side-effect-bounded

### B. Midnight release is not yet the active scheduler model

Earlier logic used near-session release semantics. That no longer matches the locked policy.

### C. Legacy appointment payment/check-in APIs still exist

They are now structurally behind the active design and should not remain ambiguous as alternative active paths.

---

## Target Shape After Slice 3

## 1. Receptionist progression

The active receptionist flow becomes:

1. admission creates reservation and anchor records
2. arrival marks physical presence
3. receptionist check-in:
   - records payment
   - triggers Healthcare appointment sync
   - moves patient to `Ready Near Doctor`

This is the only active gate into doctor-ready state.

## 2. Healthcare sync adapter

The Healthcare boundary should be represented by one narrow helper that:

- takes a linked `Patient Appointment`
- writes payment fields if applicable
- sets appointment status to `Checked In`
- lets Healthcare run fee-validity side effects

It must not:

- create queue entries
- decide queue progression
- determine doctor eligibility

## 3. Midnight channel rollover

For sessions dated today, once the day begins:

- unused `phone` protection is gone
- effective booking protection is `walkin`

Implementation should update Clinic Flow session counters/state, not rely on old appointment-type slot release semantics.

---

## File-Level Implications

Primary files:

- `clinic_flow/api/queue.py`
- `clinic_flow/api/arrival.py`
- `clinic_flow/api/appointments.py`
- `clinic_flow/queue/scheduler.py`
- `ARCHITECTURE.md`

Supporting docs:

- `docs/receptionist-backend-policy.md`
- `docs/notes/bench-verification-checklist.md`

---

## Acceptance Criteria for Slice 3

Slice 3 is complete when:

1. only receptionist check-in moves a patient to `Ready Near Doctor`
2. arrival never causes doctor eligibility
3. fee-validity sync is performed only by the narrow Healthcare adapter
4. midnight phone-to-walkin rollover is the active release rule
5. legacy appointment payment/check-in behavior is no longer an active competing path
6. targeted tests prove all of the above

---

## Risks and Guardrails

### Main risk

Changing check-in boundaries can break fee-validity or receptionist throughput if Healthcare sync and queue-state transitions become tangled.

### Guardrail

Keep queue-state transition and Healthcare sync as separate steps in the code, even if they happen in one API call.

### Secondary risk

Midnight release can create silent counter drift if session counters and effective availability are not recalculated consistently.

### Guardrail

Make the rollover explicit, idempotent, and test-driven against actual session fields rather than inferred behavior.

---

## Handoff to Later Work

Once Slice 3 lands:

- receptionist flow boundaries will be stable
- admission semantics will already be clean
- quota protection policy will match product rules

That creates the correct base for a future dedicated brainstorming and implementation cycle on doctor/live queue movement.
