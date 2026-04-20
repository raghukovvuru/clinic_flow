# ONBOARDING.md — Clinic Flow

Practical setup and verification guide for developers working in `apps/clinic_flow`.

## What This App Is

`clinic_flow` is a Frappe v16 app layered on top of Marley Healthcare. It does not replace upstream clinical records; it adds queue operations, receptionist flows, doctor queue handling, and waiting-room display.

Current reality:

- the app is mixed-mode
- legacy appointment/check-in queue paths still exist
- newer dashboard/session/load/ETA/emergency paths also exist

## Read This First

Before changing code, read these in order:

1. [CLAUDE.md](/home/raghu/frappe-bench/apps/clinic_flow/CLAUDE.md:1)
2. [AGENTS.md](/home/raghu/frappe-bench/apps/clinic_flow/AGENTS.md:1)
3. [ARCHITECTURE.md](/home/raghu/frappe-bench/apps/clinic_flow/ARCHITECTURE.md:1)
4. [CONTEXT_INDEX.md](/home/raghu/frappe-bench/apps/clinic_flow/CONTEXT_INDEX.md:1)
5. [docs/git-workflow-guide.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/git-workflow-guide.md:1)

## Prerequisites

- Frappe bench already set up with `healthcare` installed
- Python 3.11+
- site available at `site1.localhost`
- `bench start` or equivalent services running

## Install / Update

```bash
cd ~/frappe-bench
bench get-app clinic_flow /path/to/repo
bench --site site1.localhost install-app clinic_flow
bench --site site1.localhost migrate
```

Verify installed apps:

```bash
bench --site site1.localhost list-apps
```

Expected relevant apps:

- `frappe`
- `erpnext`
- `healthcare`
- `clinic_flow`

## Current Runtime Surfaces

Primary pages:

- `/doctor-workspace-v2`
- `/doctor-workspace`
- `/receptionist-dashboard`
- `/receptionist-workspace`
- `/arrival-counter`
- `/queue-dashboard`

Important note:

- `doctor-workspace-v2` is the active doctor UI direction
- `/doctor-workspace` is a legacy fallback/reference path
- do not assume the legacy receptionist page is the only live path

## One-Time Data Expectations

These upstream linkages/configs must exist:

- `Healthcare Practitioner.user_id`
- `Medical Department.custom_dept_abbr`
- `Appointment Type.custom_queue_code`
- practitioner schedules and schedule time slots

These app-owned/patched structures should exist after migrate:

- required Healthcare custom fields managed by patches
- `Service Point` doctype
- `Patient Guardian` doctype
- `Emergency Intake` doctype

## Codebase Tour

Core backend:

- `clinic_flow/hooks.py`
- `clinic_flow/api/admission.py`
- `clinic_flow/api/appointments.py`
- `clinic_flow/api/queue.py`
- `clinic_flow/api/emergency.py`
- `clinic_flow/api/eta.py`
- `clinic_flow/api/workspace.py`
- `clinic_flow/queue/appointment_mixin.py`
- `clinic_flow/queue/engine.py`
- `clinic_flow/queue/service_point.py`

Schema:

- `clinic_flow/clinic_flow/doctype/queue_session/`
- `clinic_flow/clinic_flow/doctype/queue_entry/`
- `clinic_flow/clinic_flow/doctype/service_point/`
- `clinic_flow/clinic_flow/doctype/patient_guardian/`
- `clinic_flow/clinic_flow/doctype/emergency_intake/`

UI:

- `clinic_flow/clinic_flow/page/doctor_workspace/`
- `clinic_flow/clinic_flow/page/doctor_workspace_v2/`
- `clinic_flow/clinic_flow/page/receptionist_workspace/`
- `clinic_flow/clinic_flow/page/receptionist_dashboard/`
- `clinic_flow/clinic_flow/page/arrival_counter/`
- `clinic_flow/www/queue-dashboard.html`

## Key Concepts

### Legacy appointment path still matters

`Patient Appointment.status = "Checked In"` can still be a queue-entry creation trigger via `QueueMixin.on_update()`.

Do not replace that path casually.

### Newer admission path is also live

The receptionist dashboard uses session recommendation and newer queue/session semantics through `api/admission.py`.

### Queue identity is no longer just `dept_abbr`

Prefer the active queue identity model:

- `Queue Session.service_point`
- `Queue Session.dept_abbr` as cache/fallback
- display token composed from queue code + token number

### Healthcare custom fields are patch-managed

Do not assume they are safely owned through fixtures alone.

See:

- [ensure_required_healthcare_custom_fields.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py:1)

## Fast Verification Flows

### Legacy appointment compatibility check

Verify:

1. create or use a `Patient Appointment`
2. run the normal payment/check-in flow
3. confirm a `Queue Entry` is created
4. confirm `custom_queue_token` is written back

### Newer receptionist dashboard check

Verify:

1. open `/receptionist-dashboard`
2. search/select patient
3. confirm visit/load classification appears
4. confirm suggested sessions load
5. confirm token/session recommendation works

### Doctor dequeue check

Verify:

1. start or reuse a session
2. call next patient
3. confirm `current_token`, encounter linkage, and queue-entry status move correctly

### Queue identity check

Verify:

1. session resolves queue code via `Service Point` when present
2. older sessions still fall back through `dept_abbr`

## Useful Commands

```bash
bench --site site1.localhost migrate
bench --site site1.localhost console
bench --site site1.localhost execute clinic_flow.queue.scheduler.release_prebooked_slots
```

Inspect queue state quickly:

```python
frappe.get_all("Queue Session", filters={"session_date": frappe.utils.today()}, fields=["name", "status", "dept_abbr", "service_point"])
frappe.get_all("Queue Entry", fields=["name", "token", "token_number", "status", "queue_position"], limit=20)
```

## What Not To Assume

- old handoff/spec/plan docs are current
- `queue_type` is gone
- `Service Point` is optional design-only work
- `receptionist-workspace` is the only receptionist flow
- fixture export alone captures all Healthcare-bound field ownership
