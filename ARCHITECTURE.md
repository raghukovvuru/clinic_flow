# ARCHITECTURE.md — Clinic Flow

Current system-design reference for the `clinic_flow` Frappe v16 app.

This document describes the codebase as it exists on the active branch, not the earlier transition phase where legacy workspaces were the only product surface.

---

## 1. System Shape

`clinic_flow` is a queue-management and consultation workflow layer on top of Marley Healthcare.

Today the app is not purely legacy and not purely greenfield. It has:

- active v2 receptionist flows
- active v2 doctor flows
- active arrival and emergency operational flows
- legacy appointment-driven compatibility paths that still matter

The current product direction is:

- `receptionist_dashboard` for receptionist operations
- `arrival_counter` for front-desk/self-arrival workflows
- `doctor_workspace_v2` for doctor-facing queue and encounter work

Legacy pages remain in the repo as compatibility and fallback paths:

- `receptionist_workspace`
- `doctor_workspace`

---

## 2. Core Domain Model

### Queue identity

The preferred queue identity is `Service Point`.

`Service Point` gives the app a durable queue code and display identity that is no longer tied only to `Medical Department.custom_dept_abbr`.

Healthcare custom-field mapping is split across doctypes:

- `Appointment Type`: `custom_queue_code` and historically `custom_queue_type`
- `Medical Department`: `custom_dept_abbr`
- `Patient Appointment`: `custom_queue_type`, `custom_queue_token`, `custom_dept_abbr`

Resolution order for queue code reads:

1. `Queue Session.service_point -> Service Point.queue_code`
2. `Queue Session.dept_abbr`
3. `Medical Department.custom_dept_abbr`
4. fallback value such as `GEN`

`dept_abbr` still exists as a compatibility/cache field and is intentionally not gone yet.

### Queue session

`Queue Session` represents one operational session for a practitioner on a date.

It still carries legacy slot fields such as:

- `prebooked_total`
- `walkin_total`
- `followup_total`
- `prebooked_used`
- `walkin_used`
- `followup_used`
- `rr_state`

It also carries newer fields and migration-era compatibility fields such as:

- `service_point`
- special-buffer compatibility fields
- data used by the newer admission and display flows

### Queue entry

`Queue Entry` is now a mixed-era model.

Legacy compatibility still exists:

- `queue_type`
- `token`
- `queue_position`

Newer operational fields exist and are active:

- `token_number`
- `channel`
- `load_class`
- `priority`
- special-audit fields
- arrival and timing fields used by the newer flows

The important rule is that new behavior increasingly keys off `channel`, `load_class`, and `priority`, while old behavior still reads `queue_type`.

### Appointment compatibility layer

`Patient Appointment` remains a load-bearing integration boundary.

Still-active custom fields include:

- `custom_queue_type`
- `custom_queue_token`
- `custom_dept_abbr`

Queue entries are created by Clinic Flow admission and receptionist flows. Appointment save/check-in behavior is only a compatibility path and must not be treated as the source of queue authority.

---

## 3. Active Runtime Modules

### Legacy appointment path

- `clinic_flow/api/appointments.py`
- `clinic_flow/queue/scheduler.py`

This path still handles:

- patient search
- quick patient creation
- appointment booking
- consultation charge lookup
- payment + check-in
- slot release

This is compatibility-critical and must not be casually rewritten, but it no longer owns queue-entry creation or queue identity.

### Queue/session runtime

- `clinic_flow/api/queue.py`
- `clinic_flow/queue/engine.py`
- `clinic_flow/queue/service_point.py`

This layer now combines:

- session lifecycle
- doctor dequeue and special override behavior
- queue-state payloads
- display-token behavior
- service-point-based queue identity

### Receptionist/admission runtime

- `clinic_flow/api/admission.py`
- `clinic_flow/api/family.py`
- `clinic_flow/api/eta.py`
- `clinic_flow/api/emergency.py`
- `clinic_flow/api/arrival.py`

This is the newer receptionist stack.

It owns:

- guardian/child lookup and registration support
- session suggestion and ranking
- token-board state
- queue-entry booking in the newer model
- ETA calculations
- emergency issuance and reconciliation flows
- arrival-counter lookups and status transitions

### Doctor runtime

- `clinic_flow/api/workspace.py`
- `clinic_flow/api/patient_data.py`
- `clinic_flow/clinic_flow/page/doctor_workspace_v2/`

The doctor runtime is also mixed:

- the encounter APIs in `workspace.py` remain central
- `doctor_workspace_v2` is the active UI direction
- legacy `doctor_workspace` still exists, but should be treated as compatibility only

---

## 4. User-Facing Surfaces

### Active-direction pages

- `receptionist-dashboard`
- `arrival-counter`
- `doctor-workspace-v2`
- `/queue-dashboard`

### Legacy compatibility pages

- `receptionist-workspace`
- `doctor-workspace`

These legacy pages still matter for references and compatibility, but they are not the place to build the next product direction by default.

### Workspace shortcuts

The workspace metadata already includes shortcuts beyond the original legacy pair. That is one of the clearest signs that the branch moved beyond the old transition docs.

---

## 5. Token and Priority Model

### Display tokens

The newer direction is:

- internal identity: `token_number`
- visible label: queue-code-prefixed display token

This is supported by:

- `clinic_flow.queue.engine.build_display_token`
- migration patches that backfill display-token values
- receptionist and emergency flows that build visible tokens from queue code + number

### Canonical priority

The newer operational model distinguishes:

- `normal`
- `special`
- `emergency`

This is separate from legacy `queue_type`.

Current behavior is transitional:

- some paths still derive legacy queue type from the newer model for compatibility
- some dequeue and UI behavior already use canonical `priority`

Special handling is now a doctor-side queue behavior, not just a token-position trick.

---

## 6. Integration Boundary With Healthcare

The app still depends materially on upstream Healthcare doctypes.

Most important ones:

- `Patient Appointment`
- `Patient Encounter`
- `Appointment Type`
- `Medical Department`
- `Healthcare Practitioner`
- `Fee Validity`

Important constraints:

- never modify Healthcare source files
- `Patient Appointment` is an integration anchor only — it does not drive queue creation
- only `Patient Encounter.custom_chief_complaint` is actively managed by the patch
- queue-identity custom fields on Appointment Type, Medical Department, and Patient Appointment remain on existing sites from previous patch runs but are not part of the target model

Read `docs/healthcare-compatibility-audit.md` before changing fixtures or upstream-field assumptions.

---

## 7. Migrations and Configuration

This branch is no longer in the "no patches yet" state.

Active migration/config responsibilities include:

- patch-managed Healthcare field hardening
- patch-managed service-point creation and backfill
- display-token backfill
- fixtures for roles, workspace, print format, and tagged customizations

Important files:

- `clinic_flow/hooks.py`
- `clinic_flow/patches.txt`
- `clinic_flow/patches/v16_0/`
- `clinic_flow/fixtures/`

Do not assume that exporting fixtures alone is enough to reproduce working state.

---

## 8. Slice 1 Authority Update

Slice 1 landed on this branch. These are now locked operational facts:

- `Queue Session` and `Queue Entry` are the operational source of truth for all receptionist and queue operations.
- `Patient Appointment` is an integration anchor — it exists so Healthcare billing, fee-validity, and encounter flows work, but it must not create queue entries or define queue identity.
- `Service Point` is the canonical queue identity. `Service Point.queue_code` is the canonical token prefix.
- Healthcare appointment lifecycle hooks do not participate in queue-entry creation.
- Healthcare queue-identity custom fields (`custom_queue_type`, `custom_queue_token`, `custom_dept_abbr` on Appointment Type, Medical Department, Patient Appointment) are no longer managed by the Clinic Flow patch. They remain on existing sites as compatibility debt.

---

## 9. Slice 2 Admission Update

Slice 2 landed on this branch. These are now locked admission facts:

- Active admission behavior is expressed in `channel`, `load_class`, token reservation, and `Service Point` identity. Not `queue_type`.
- The receptionist dashboard preserves three intake paths:
  - phone availability-first
  - phone direct / lookup-assisted booking
  - walk-in token-first
- `Patient` and `Patient Appointment` are still created at admission time.
- `_compat_queue_type()` writes `Queue Entry.queue_type` only as a compatibility field for neighboring runtime paths pending later slices.
- Healthcare appointment creation no longer depends on `Appointment Type.custom_queue_code` or queue-type taxonomy. It uses any available appointment type.
- `custom_queue_type` is no longer written onto new `Patient Appointment` records by the active admission path.

---

## 10. Slice 3 Receptionist Boundary Update

Slice 3 landed on this branch. These are now locked receptionist boundary facts:

- Arrival (`mark_arrived`) is operational-only. It records physical presence and improves live queue visibility. It does not make a patient doctor-eligible.
- Receptionist check-in (`complete_reception`) is the only active path to `Ready Near Doctor`.
- Clinic Flow queue state is the authority. The Queue Entry status advances first. Healthcare appointment sync is downstream, side-effect-bounded, and must not drive queue decisions.
- Fee-validity side effects are triggered by the Healthcare sync adapter (`_checkin_patient_appointment`) via `Patient Appointment.save()`, not by direct Clinic Flow logic.
- Unused phone-protected quota releases to walk-in capacity at midnight of the session date (`release_phone_quota_at_midnight`). After midnight, same-day phone quota protection no longer applies.
- Legacy appointment payment/check-in APIs are compatibility-only. Do not treat them as active receptionist paths or extend them with new business logic.

---

## 11. Architectural Truths To Preserve

These are the current branch truths that docs and code should agree on:

- `receptionist_dashboard` and `doctor_workspace_v2` are the active UI direction
- legacy pages are compatibility paths, not the default destination for new work
- `Service Point` is the canonical queue identity (Slice 1 locked)
- `Queue Session` and `Queue Entry` are the operational source of truth (Slice 1 locked)
- `token_number` plus display-token composition is the preferred token model
- `priority` is distinct from legacy `queue_type`
- `Patient Appointment` is an integration anchor, not a queue-authority object (Slice 1 locked)
- active admission logic is expressed through `channel`, `load_class`, and `Service Point` — not `queue_type` (Slice 2 locked)
- `queue_type` on `Queue Entry` is a compatibility field only — not the active admission model (Slice 2 locked)
- Healthcare appointment creation at admission time does not depend on queue-code custom field mapping (Slice 2 locked)
- receptionist check-in is the only gate to `Ready Near Doctor`; arrival alone never makes a patient doctor-eligible (Slice 3 locked)
- Healthcare sync is downstream of Clinic Flow queue-state transitions, not the other way around (Slice 3 locked)
- unused phone quota releases to walk-in at midnight of the session date (Slice 3 locked)
- patch-managed compatibility with Healthcare matters as much as code changes

---

## 12. Supporting Docs

Use these as focused companion docs:

- `docs/receptionist-backend-policy.md`
- `docs/healthcare-compatibility-audit.md`
- `docs/service-point-policy.md`
- `docs/token-display-policy.md`
- `CONTEXT_INDEX.md`

If any of them drift from the code, update the docs rather than preserving stale narratives.
