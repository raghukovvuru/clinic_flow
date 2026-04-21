# Slice 2 Design Note: Admission Flow Cleanup

Date: 2026-04-21
Audience: Claude Code / Codex / agentic implementers
Scope: Slice 2 only

## Goal

Clean up the admission model now that Slice 1 has made Clinic Flow operationally authoritative.

Slice 2 keeps the current receptionist UX patterns intact while simplifying the backend admission path so it reflects the actual target model:

- channel-based protected quotas remain
- token reservation remains admission-time behavior
- patient and appointment creation remain at admission time
- active admission logic stops depending on legacy `queue_type` as a business concept

This slice is about admission semantics only. It does not redesign live queue movement or midnight quota rollover.

---

## Baseline from Slice 1

The following are already decided and must not be re-opened in Slice 2:

- `Queue Session` and `Queue Entry` are the operational source of truth
- `Patient Appointment` is an integration anchor
- `Service Point` is the canonical queue identity
- active receptionist flow no longer depends on appointment update hooks for queue-entry creation

Slice 2 builds on that baseline.

---

## Decisions Locked for Slice 2

### 1. Preserve the 3 admission UX paths

The current intake interaction model is correct and must be preserved:

1. Phone, availability-first
2. Phone, direct / lookup-assisted booking
3. Walk-in, token-first intake

The dashboard controller already implements these correctly. Slice 2 must not collapse them into one generic intake path.

### 2. Channel is the only protected-capacity partition

Protected quota remains only by:

- `phone`
- `walkin`

The admission model must not continue to carry old booking categories as if they were capacity partitions.

### 3. `load_class` remains operationally important, but not as a quota partition

`load_class` continues to matter for:

- session suggestion and ranking
- ETA estimation
- descriptive context in the UI

It does not define protected capacity buckets in Slice 2.

### 4. `queue_type` is no longer an admission business concept

`queue_type` may still exist temporarily as compatibility storage if required by neighboring code, but it is no longer part of the active admission design.

Admission behavior must be expressed in terms of:

- `channel`
- `load_class`
- token reservation
- `Service Point`

not `PRE_BOOKED`, `WALK_IN`, `FOLLOW_UP`, or similar queue-type categories.

### 5. Patient and appointment creation stay at admission time

Admission confirmation still creates:

- `Patient`
- `Patient Appointment`
- `Queue Entry`

This remains the right operational tradeoff because receptionist check-in must stay lightweight under high patient volume.

### 6. Healthcare appointment creation should stop depending on legacy queue-type mapping

The active admission path should not need:

- `Appointment Type.custom_queue_code`
- `Patient Appointment.custom_queue_type`
- any Healthcare-side queue taxonomy

The Healthcare appointment should be created using standard core fields wherever possible, with Clinic Flow-specific queue meaning remaining local to Clinic Flow.

---

## Non-Goals for Slice 2

Do not solve these in this slice:

- midnight release implementation
- same-day phone booking policy changes beyond current target assumption
- live doctor movement / dequeue redesign
- arrival semantics redesign
- receptionist check-in redesign
- final deletion of every legacy queue-type field from the schema

---

## Current Misalignments in the Codebase

### A. Admission still computes legacy queue semantics

`clinic_flow/api/admission.py` still:

- derives `patient_type`
- derives `priority`
- maps them into `_legacy_queue_type()`
- writes `entry.queue_type`
- passes legacy queue type into appointment creation

That keeps old semantics alive in the core admission path.

### B. Appointment creation still depends on legacy queue-code mapping

`_create_patient_appointment()` still resolves an `Appointment Type` by legacy queue code.

That is stronger Healthcare coupling than the target design wants.

### C. Session suggestion logic is already mostly aligned

`get_suggested_sessions()` already reasons in:

- `channel`
- `load_class`
- session capacity

This is good. Slice 2 should preserve and sharpen that path rather than rewrite it from scratch.

### D. Dashboard flow is already ahead of parts of the backend

The dashboard correctly models:

- phone availability-first
- phone session-offer-first, then patient details
- walk-in token-first

The backend needs to catch up to that model by shedding legacy semantics.

---

## Target Shape After Slice 2

## 1. Admission service responsibilities

### `get_suggested_sessions()`

Continues to own:

- session materialization from schedules
- channel-aware availability
- ranking and recommendation
- load-class-aware guidance

Must not:

- reintroduce queue-type semantics as admission categories

### `confirm_booking()`

Owns:

- final capacity validation
- token assignment
- queue-entry creation
- patient-appointment creation
- session counters
- ETA writes

Must be expressed in:

- `channel`
- `load_class`
- `priority` only if still needed for active booking metadata
- `Service Point` identity

It should not depend on `queue_type` as the admission business model.

### `_create_patient_appointment()`

Should become a narrow Healthcare adapter that:

- creates the appointment at admission time
- uses standard Healthcare-compatible fields
- avoids queue-specific Healthcare custom field dependence

---

## 2. Capacity model in Slice 2

The active admission capacity model is:

- `planned_capacity`
- `stretch_capacity`
- `phone_booked_count`
- `walkin_count`
- channel protection for phone quota

That is enough for Slice 2.

Do not drag legacy slot-total semantics back into active admission behavior.

Legacy capacity fields may still exist on the schema, but active admission should not derive its decisions from them.

---

## 3. Compatibility strategy

Slice 2 should be aggressive about removing runtime dependence, but conservative about schema deletion.

Meaning:

- stop active admission logic from needing legacy queue-type behavior
- keep compatibility fields only where required by neighboring code that will be cleaned in later slices
- document any remaining dual-write clearly as temporary compatibility, not architecture

---

## 4. File-level implications

### Primary files

- `clinic_flow/api/admission.py`
- `clinic_flow/clinic_flow/page/receptionist_dashboard/receptionist_dashboard.js`
- `clinic_flow/api/appointments.py` only where shared helpers still influence active behavior
- `ARCHITECTURE.md`

### Likely cleanup targets inside `admission.py`

- `_legacy_queue_type()`
- queue-type-based appointment creation assumptions
- queue-type dual-write comments that still describe active logic

### UI intent that must stay stable

`receptionist_dashboard.js` should continue to preserve:

- phone availability-first inquiry
- session-offer-first path before patient details for phone
- walk-in token-first context dock

This slice is backend cleanup, not intake UX redesign.

---

## 5. Acceptance criteria for Slice 2

Slice 2 is complete when:

1. active admission behavior is understandable without reading legacy queue-type mapping
2. `confirm_booking()` no longer depends on `queue_type` as an admission concept
3. active Healthcare appointment creation no longer depends on Healthcare queue custom fields or queue-code mapping
4. the 3 receptionist intake paths still work unchanged from an operator point of view
5. tests prove channel-based quotas and token reservation still behave correctly

---

## 6. Risks and guardrails

### Main risk

Removing queue-type dependence from admission can break neighboring code that still reads `Queue Entry.queue_type` casually.

### Guardrail

Treat Slice 2 as a runtime-logic cleanup, not a total field purge.

If dual-write must remain temporarily for compatibility, keep it narrow and explicitly marked as temporary.

### Secondary risk

Healthcare appointment creation may still assume old queue-specific `Appointment Type` setup on a given site.

### Guardrail

Replace queue-code-based appointment-type resolution with a standard or site-default appointment strategy, then cover it with targeted tests so the active admission flow does not regress.

---

## 7. Handoff to Slice 3

Once Slice 2 lands:

- admission semantics will be clean
- channel quota logic will be localized
- receptionist intake flow will be preserved on a simpler backend

That creates the right base for Slice 3:

- receptionist check-in boundary tightening
- fee-validity synchronization cleanup
- midnight quota rollover
