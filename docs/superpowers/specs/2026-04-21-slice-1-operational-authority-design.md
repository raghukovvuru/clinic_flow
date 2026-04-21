# Slice 1 Design Note: Operational Authority and Service Point Identity

Date: 2026-04-21
Audience: Claude Code / Codex / agentic implementers
Scope: Slice 1 only

## Goal

Establish the target operational authority model for Clinic Flow without redesigning live doctor movement yet.

Slice 1 is the architectural reset that makes later slices safe:

- Clinic Flow operational records become authoritative.
- Healthcare `Patient Appointment` is reduced to an integration anchor.
- `Service Point` becomes the explicit canonical queue identity.
- legacy `queue_type`, `dept_abbr`, and appointment-driven queue creation stop shaping the active receptionist flow.

This slice does not redesign dequeue sequencing, arrival-based movement policy, or midnight quota release. Those belong to later slices.

---

## Decisions Locked for Slice 1

### 1. Operational authority

The source of truth for receptionist and queue operations is:

- `Queue Session`
- `Queue Entry`

The source of truth is not:

- `Patient Appointment.status`
- Healthcare custom fields
- legacy `queue_type`
- `dept_abbr`

### 2. Healthcare boundary

`Patient Appointment` remains present, but only as an integration anchor.

It exists so Clinic Flow can:

- create a standard Healthcare appointment at admission
- later sync receptionist check-in and payment into Healthcare
- let Healthcare handle fee-validity side effects at the narrow check-in boundary

It must not:

- create queue entries
- define queue identity
- decide queue readiness
- decide token identity

### 3. Service Point identity

`Service Point` is the canonical queue identity for Clinic Flow.

The target identity chain is:

`Queue Entry -> Queue Session -> Service Point`

The canonical display token source is:

`Service Point.queue_code + Queue Entry.token_number`

`dept_abbr` becomes compatibility debt only. No new runtime path should depend on it as queue identity.

### 4. Patient Appointment creation timing

Patient creation and appointment creation remain at admission time.

That is an intentional operational choice because receptionist check-in must stay as fast as possible in a high-volume environment.

### 5. Active receptionist flow patterns to preserve

Slice 1 must preserve these UX patterns:

1. Phone, availability-first
2. Phone, direct lookup-assisted booking
3. Walk-in, token-first intake

The slice changes backend authority and identity, not those user-facing intake patterns.

---

## Non-Goals for Slice 1

Do not solve these in this slice:

- doctor dequeue redesign
- arrival-based live movement redesign
- same-day flow beyond removing legacy authority dependencies
- midnight quota release implementation
- channel quota redesign
- final removal of every legacy field from the schema

Slice 1 is about authority boundaries and canonical identity only.

---

## Current Misalignments in the Codebase

The current codebase still contains mixed authority.

### A. Appointment-driven queue creation still exists

Current behavior:

- `QueueMixin` is injected into `Patient Appointment`
- `on_update()` can create a `Queue Entry` on `Checked In`

This violates the target model because queue creation must belong to Clinic Flow admission logic, not Healthcare appointment lifecycle hooks.

### B. Service Point is present but not yet fully authoritative

Current behavior:

- queue code resolution prefers `Service Point`, but still falls back through `dept_abbr` and department custom fields
- some session and realtime payloads still expose `dept_abbr` as if it were the primary identity

This weakens the intended abstraction.

### C. Legacy queue semantics still leak into the active path

Current behavior:

- `queue_type` still exists in active booking/check-in code
- legacy mappings still shape admission logic and compatibility writes

This blocks the clean separation needed for later slices.

### D. Healthcare custom fields are still repo-managed

Current behavior:

- patches still create Healthcare custom fields such as `custom_queue_type`, `custom_queue_token`, and `custom_dept_abbr`

That is directly opposed to the target design principle of keeping Healthcare as clean as possible.

---

## Target Shape After Slice 1

## 1. Entity responsibilities

### Queue Session

Owns:

- operational session identity
- the link to `Service Point`
- channel quota counters
- schedule-projected session metadata

Must become:

- authoritative for queue identity via `service_point`
- the parent context for all queue entries

### Queue Entry

Owns:

- token identity inside a session
- admission-time reservation record
- receptionist operational state
- linkage to patient and optional Healthcare appointment anchor

Must become:

- the only operational record that receptionist and live queue surfaces depend on

### Patient Appointment

Owns:

- Healthcare-standard appointment persistence
- standard Healthcare status lifecycle
- later billing / fee-validity synchronization point

Must become:

- a downstream companion record
- never a queue-control object

### Service Point

Owns:

- canonical queue code
- queue display label
- queue identity independent of Healthcare custom fields

Must become:

- required in operational logic even if schema hardening is deferred by one slice

---

## 2. Read/write authority rules

### Receptionist dashboard

May read:

- `Queue Session`
- `Queue Entry`
- `Service Point`
- patient/guardian records

May not depend on:

- Healthcare custom queue fields
- `Patient Appointment.status` for queue flow decisions

### Admission path

Must:

- create `Queue Entry`
- assign token number
- resolve display token from `Service Point`
- create `Patient Appointment` as anchor only

Must not:

- require `QueueMixin` or appointment `on_update()` to finish queue creation

### Check-in path

Must:

- mutate `Queue Entry` operational state
- later invoke a narrow Healthcare sync helper

Must not:

- let Healthcare appointment save hooks create queue records

---

## 3. Service Point rules

The following rules are explicit for Slice 1:

1. A `Queue Session` belongs to exactly one `Service Point`.
2. `Service Point.queue_code` is the canonical token prefix.
3. `dept_abbr` is not canonical identity.
4. `resolve_queue_code()` may temporarily keep fallback behavior, but all active admission and display paths should treat `Service Point` as the required intended source.
5. No new Healthcare customization may be added to carry queue identity.

---

## 4. File-level implications

### Files that should become more central

- `clinic_flow/api/admission.py`
- `clinic_flow/api/queue.py`
- `clinic_flow/queue/service_point.py`
- `clinic_flow/clinic_flow/doctype/service_point/`
- `clinic_flow/clinic_flow/doctype/queue_session/`
- `clinic_flow/clinic_flow/doctype/queue_entry/`

### Files that should be demoted or removed from active authority

- `clinic_flow/queue/appointment_mixin.py`
- `clinic_flow/api/appointments.py` for active receptionist flow
- `clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py`
- legacy queue-type and department-abbreviation dependencies in active runtime paths

### Hooks implications

`hooks.py` currently injects `QueueMixin` into `Patient Appointment`.

The target direction is to remove that injection once the replacement path is fully verified.

Slice 1 may either:

- stop relying on the mixin while keeping the hook temporarily, or
- remove the hook in the same slice if tests prove no active path depends on it

The implementation plan should prefer the safer path: stop active dependence first, then remove the hook once tests pass.

---

## 5. Acceptance criteria for Slice 1

Slice 1 is complete when all of the following are true:

1. Active receptionist admission flow creates queue entries without any dependency on Healthcare appointment update hooks.
2. The active receptionist flow no longer depends on Healthcare custom fields for queue identity.
3. `Service Point` is explicit and primary in active queue identity reads.
4. Runtime tests prove that `Patient Appointment` state changes no longer create queue entries for the active flow.
5. The 3 receptionist intake paths still work:
   - phone availability-first
   - phone direct lookup-assisted booking
   - walk-in token-first

---

## 6. Risks and guardrails

### Main risk

Removing appointment-driven queue creation can silently break legacy assumptions in places that still expect appointment check-in to materialize queue state.

### Guardrail

Treat this slice as an authority migration, not a schema purge.

That means:

- runtime dependencies must be removed first
- deletion of legacy fields can be deferred
- tests must confirm active flow correctness before field/patch cleanup becomes aggressive

### Secondary risk

Partial Service Point migration can leave mixed identity behavior in UI payloads.

### Guardrail

Admission and token-building paths should be hardened first. Read-only legacy payload aliases can remain temporarily if clearly marked as compatibility output.

---

## 7. Handoff to Slice 2

Once Slice 1 lands, Slice 2 can safely simplify admission logic because:

- the operational source of truth is stable
- queue identity is stabilized around `Service Point`
- Healthcare no longer participates in queue creation

That is the prerequisite for cleaning channel-quota logic and stripping the last active `queue_type` influence out of admission.
