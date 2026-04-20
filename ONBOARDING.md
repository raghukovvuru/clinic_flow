# ONBOARDING.md — Clinic Flow

Quick-start guide for developers working on the current `clinic_flow` branch.

---

## What This App Is

`clinic_flow` is a Frappe v16 app that extends Marley Healthcare with:

- queue sessions and queue entries
- receptionist admission and booking workflows
- arrival-counter flows
- doctor queue and encounter workflows
- waiting-room dashboard display

It does not replace Healthcare source code. It extends Healthcare from this app.

Current active direction:

- `receptionist_dashboard`
- `arrival_counter`
- `doctor_workspace_v2`

Legacy compatibility paths still exist and still matter:

- legacy appointment booking/check-in flow
- `receptionist_workspace`
- `doctor_workspace`

---

## Read Before Coding

Start here:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
4. `CONTEXT_INDEX.md`

Then read the task-specific policy doc and runtime path.

---

## Prerequisites

- a working Frappe bench
- `healthcare` installed
- Python 3.11+
- dev services available via `bench start`
- site: `http://site1.localhost:8000`

---

## First-Time Setup

### 1. Install the app

```bash
cd ~/frappe-bench
bench get-app clinic_flow /path/to/repo
bench --site site1.localhost install-app clinic_flow
bench --site site1.localhost migrate
```

### 2. Verify installation

```bash
bench --site site1.localhost list-apps
```

Expected app list includes:

- `frappe`
- `healthcare`
- `clinic_flow`

### 3. Understand setup ownership

This codebase uses both fixtures and patches.

Important:

- not every required Healthcare-facing customization is safely fixture-owned
- some Healthcare compatibility work is patch-managed
- do not assume “export fixtures” is enough to reproduce a working site

Read:

- `clinic_flow/hooks.py`
- `clinic_flow/patches.txt`
- `docs/healthcare-compatibility-audit.md`

### 4. Core desk configuration to verify

These still matter even on the newer branch direction:

| Where | What to verify |
|---|---|
| `Healthcare Practitioner` | `user_id` linkage for doctor login |
| `Practitioner Schedule` | time slots and `maximum_appointments` |
| `Medical Department` | `custom_dept_abbr` fallback values still present where needed |
| `Appointment Type` | `custom_queue_code` values still present for compatibility paths |
| `Slot Partition Config` | queue percentages and newer operational defaults |

### 5. Roles

Typical role mapping:

| Role | Assign to |
|---|---|
| `Physician` | Doctors |
| `Queue Manager` | Reception / operations users |
| `Queue Viewer` | Display-only users |
| `System Manager` | Admin / configuration owners |

---

## Running The App

```bash
cd ~/frappe-bench
bench start
```

Current important URLs:

| URL | Purpose |
|---|---|
| `http://site1.localhost:8000/doctor-workspace-v2` | active doctor UI direction |
| `http://site1.localhost:8000/receptionist-dashboard` | active receptionist UI direction |
| `http://site1.localhost:8000/arrival-counter` | arrival-counter flow |
| `http://site1.localhost:8000/queue-dashboard` | waiting-room display |
| `http://site1.localhost:8000/doctor-workspace` | legacy compatibility page |
| `http://site1.localhost:8000/receptionist-workspace` | legacy compatibility page |

Note:

- `boot_session` still redirects doctors to `doctor-workspace`, not `doctor-workspace-v2`
- do not assume boot routing and product direction are identical

---

## Practical Verification Paths

Use one of these depending on the area you are touching.

### A. Legacy appointment/check-in path

Use this when changing:

- `api/appointments.py`
- `queue/appointment_mixin.py`
- scheduler logic
- compatibility token issuance

Basic flow:

1. doctor starts a queue session
2. receptionist books or checks in through the appointment path
3. `Patient Appointment.status = "Checked In"` triggers queue-entry creation
4. doctor calls next patient

### B. Receptionist dashboard path

Use this when changing:

- `api/admission.py`
- `api/family.py`
- `api/eta.py`
- `api/emergency.py`
- `api/arrival.py`
- `receptionist_dashboard`

Basic flow:

1. choose patient / guardian context
2. get suggested sessions
3. inspect token board
4. confirm booking or issue emergency path
5. verify queue entry, token, and ETA behavior

### C. Doctor workspace v2 path

Use this when changing:

- `api/queue.py`
- `api/workspace.py`
- `doctor_workspace_v2`

Basic flow:

1. start or resume session
2. call next or call next special
3. inspect encounter payload
4. save or submit encounter
5. verify queue-entry state transitions and downstream updates

---

## Codebase Tour

Core runtime:

```text
clinic_flow/hooks.py
clinic_flow/api/appointments.py
clinic_flow/api/queue.py
clinic_flow/api/workspace.py
clinic_flow/api/admission.py
clinic_flow/api/arrival.py
clinic_flow/api/emergency.py
clinic_flow/api/eta.py
clinic_flow/api/family.py
clinic_flow/queue/appointment_mixin.py
clinic_flow/queue/engine.py
clinic_flow/queue/service_point.py
clinic_flow/queue/scheduler.py
```

Pages:

```text
clinic_flow/clinic_flow/page/receptionist_dashboard/
clinic_flow/clinic_flow/page/arrival_counter/
clinic_flow/clinic_flow/page/doctor_workspace_v2/
clinic_flow/clinic_flow/page/receptionist_workspace/   # legacy compatibility
clinic_flow/clinic_flow/page/doctor_workspace/         # legacy compatibility
```

DocTypes:

```text
clinic_flow/clinic_flow/doctype/queue_session/
clinic_flow/clinic_flow/doctype/queue_entry/
clinic_flow/clinic_flow/doctype/slot_partition_config/
clinic_flow/clinic_flow/doctype/service_point/
clinic_flow/clinic_flow/doctype/patient_guardian/
clinic_flow/clinic_flow/doctype/guardian_child/
clinic_flow/clinic_flow/doctype/emergency_intake/
```

Migrations and fixtures:

```text
clinic_flow/patches.txt
clinic_flow/patches/v16_0/
clinic_flow/fixtures/
```

---

## Common Development Tasks

### Add a whitelisted API

1. add the function to the appropriate `api/` module
2. decorate with `@frappe.whitelist()`
3. include full type annotations

```python
@frappe.whitelist()
def my_new_fn(patient: str, amount: float = 0.0) -> dict:
    ...
```

### Add a migration patch

1. add a patch file under the appropriate patch package
2. write an idempotent `execute()`
3. register it in `patches.txt`
4. run:

```bash
bench --site site1.localhost migrate
```

### Inspect live data

```bash
bench --site site1.localhost console
```

Examples:

```python
frappe.get_single("Slot Partition Config").as_dict()
frappe.get_all("Queue Session", filters={"session_date": frappe.utils.today()}, fields=["*"])
frappe.get_all("Queue Entry", fields=["name", "token", "token_number", "status"], limit=20)
```

---

## Key Rules To Remember

- do not edit `apps/healthcare/`
- do not omit type annotations on whitelisted methods
- do not replace `record_payment_and_checkin()` with `frappe.db.set_value`
- do not use `frappe.get_all` with `ORDER BY FIELD()`
- do not use global DOM selectors on desk pages
- do not assume the newer canonical model has fully replaced the legacy appointment path

---

## Reference

| Document | Purpose |
|---|---|
| `CLAUDE.md` | short session-memory and routing doc |
| `AGENTS.md` | coding rules and guardrails |
| `ARCHITECTURE.md` | current branch architecture truth |
| `CONTEXT_INDEX.md` | read order and historical boundaries |
