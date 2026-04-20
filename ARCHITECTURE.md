# ARCHITECTURE.md — Clinic Flow

System design reference for the `clinic_flow` Frappe v16 app.

This app is in mixed-mode operation. Legacy appointment-driven queue behavior still exists, while newer dashboard/session/ETA/emergency patterns are also live. When this document and the code diverge, prefer the code.

## 1. System Overview

Clinic Flow is a queue-management layer on top of Marley Healthcare. It does not replace upstream clinical records; it adds operational queueing, doctor/receptionist workflows, and patient-facing queue display.

Current live concerns:

1. Queue sessions and queue entries
2. Legacy appointment check-in compatibility
3. Newer receptionist dashboard booking flow
4. Doctor dequeue / encounter flow
5. Queue identity via `Service Point`
6. Display tokens, ETA, and emergency workflows

## 2. Integration Boundary

Clinic Flow reads from and extends upstream doctypes. It does not patch `apps/healthcare/`.

Primary upstream dependencies:

- `Patient Appointment`
- `Patient Encounter`
- `Patient`
- `Healthcare Practitioner`
- `Practitioner Service Unit Schedule`
- `Healthcare Schedule Time Slot`
- `Medical Department`
- `Appointment Type`
- `Fee Validity`

Healthcare-bound custom fields that remain load-bearing are patch-managed in [ensure_required_healthcare_custom_fields.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py:4).

## 3. Hook Architecture

Key registrations in [hooks.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/hooks.py:1):

- `extend_doctype_class` on `Patient Appointment` → `QueueMixin`
- scheduler cron → `release_prebooked_slots`
- `boot_session` → doctor boot redirect
- patch-managed fixtures for app-owned metadata
- whitelisted API type annotation enforcement

Important caveat:

- upstream Healthcare custom fields are not treated as ordinary fixtures; they are maintained through patches

## 4. Data Model

### 4.1 Queue Session

`Queue Session` is the operational session record for a practitioner on a date.

Important fields:

- legacy allocation fields:
- `session_capacity`
- `prebooked_total`, `prebooked_used`
- `walkin_total`, `walkin_used`
- `followup_total`, `followup_used`
- `rr_state`
- newer load/session fields:
- `service_point`
- `planned_capacity`
- `stretch_capacity`
- `review_load_count`
- `non_review_load_count`
- `weighted_load_total`
- `phone_booked_count`
- `walkin_count`
- compatibility / display fields:
- `dept_abbr`
- `current_token`
- `total_called`

Schema reference: [queue_session.json](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/clinic_flow/doctype/queue_session/queue_session.json:7)

### 4.2 Queue Entry

`Queue Entry` is the central operational record.

Important fields:

- legacy compatibility:
- `token`
- `queue_type`
- newer canonical semantics:
- `token_number`
- `channel`
- `load_class`
- `patient_type`
- `priority`
- newer operational statuses:
- `Booked`, `Arrived`, `Called`, `No Response`, `Ready Near Doctor`, `With Doctor`, `Completed`, `Pushed to End`
- legacy statuses still remain in schema for compatibility:
- `Waiting`, `Done`, `Skipped`, `No Show`

Schema reference: [queue_entry.json](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json:7)

### 4.3 Service Point

`Service Point` is now the preferred queue-identity layer.

Purpose:

- stable queue code source
- decouples queue identity from raw department abbreviations
- keeps `dept_abbr` as fallback/cache during migration

Schema reference: [service_point.json](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/clinic_flow/doctype/service_point/service_point.json:1)

Policy reference: [docs/service-point-policy.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/service-point-policy.md:1)

### 4.4 Newer supporting doctypes

- `Patient Guardian` supports guardian/child booking flows
- `Emergency Intake` supports emergency alert, arrival, and reconciliation workflows

## 5. Runtime Paths

### 5.1 Legacy appointment compatibility path

Used when appointment check-in drives queue-entry creation.

Flow:

1. receptionist books / updates `Patient Appointment`
2. `record_payment_and_checkin()` saves appointment
3. `QueueMixin.on_update()` creates `Queue Entry` if needed
4. token is written back to `Patient Appointment.custom_queue_token`

Code:

- [appointments.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/appointments.py:1)
- [appointment_mixin.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/queue/appointment_mixin.py:12)

### 5.2 Newer receptionist dashboard path

The newer receptionist flow works through admission/session recommendation logic rather than relying only on the old appointment lifecycle.

Responsibilities:

- determine visit/load class
- suggest sessions
- recommend tokens
- update session load metrics
- drive dashboard/token-board UX

Code:

- [admission.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/admission.py:24)
- [receptionist-dashboard page](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/clinic_flow/page/receptionist_dashboard/receptionist_dashboard.json:1)

### 5.3 Doctor dequeue path

Doctor dequeue behavior is centered in:

- [queue.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/queue.py:286)
- [engine.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/queue/engine.py:53)

Current logic:

- emergency priority bypass uses canonical `priority='emergency'`
- special override exists via `call_next_special`
- round-robin compatibility remains for legacy queue types
- fallback to older `Waiting` status still exists during transition

### 5.4 Queue identity and display token path

Queue-code resolution lives in [service_point.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/queue/service_point.py:12).

Display token composition lives in [engine.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/queue/engine.py:9).

Resolution order:

1. `Queue Session.service_point`
2. `Queue Session.dept_abbr`
3. practitioner's department abbreviation
4. fallback

### 5.5 Emergency path

Emergency flow is no longer just a legacy queue-type concern.

Current live pieces:

- emergency priority in dequeue logic
- emergency intake records
- emergency arrival confirmation / reconciliation APIs

Relevant code:

- `api/emergency.py`
- `api/queue.py`
- `doctype/emergency_intake`

## 6. UI Surfaces

Live pages include:

- `doctor-workspace-v2`
- `doctor-workspace`
- `receptionist-workspace`
- `receptionist-dashboard`
- `arrival-counter`
- `queue-dashboard`

Important note:

- `doctor-workspace-v2` is the active doctor UI direction
- `doctor-workspace` remains a legacy fallback/reference path during development

## 7. Mixed-Mode Constraints

The main architectural constraint is coexistence:

- old appointment semantics still exist
- new session/load/priority semantics are partially canonical
- docs that describe only one side are incomplete

Practical rules:

- do not assume `queue_type` is dead
- do not assume `channel/load_class/priority` are optional
- do not assume `dept_abbr` is the only queue identity anymore
- do not assume old plan docs reflect current implementation state

## 8. Documentation Status

Active references:

- [CLAUDE.md](/home/raghu/frappe-bench/apps/clinic_flow/CLAUDE.md:1)
- [AGENTS.md](/home/raghu/frappe-bench/apps/clinic_flow/AGENTS.md:1)
- [docs/service-point-policy.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/service-point-policy.md:1)
- [docs/token-display-policy.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/token-display-policy.md:1)
- [docs/healthcare-compatibility-audit.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/healthcare-compatibility-audit.md:1)

Historical/planning docs should not be used as active source of truth without checking the code.
