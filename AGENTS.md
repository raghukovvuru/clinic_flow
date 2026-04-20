# AGENTS.md — Clinic Flow
Rules for AI coding agents working on this codebase.

## Identity

- App: `clinic_flow`
- Framework: Frappe v16
- Base app: `healthcare`
- Python: 3.11+
- Site default: `http://site1.localhost:8000`

## Ground Truth

- Live code beats docs when they disagree.
- This app is mixed-mode:
- old appointment/check-in queue paths still run
- newer dashboard/admission/session logic also runs
- `Service Point` and display-token policy are live, not speculative.

## Absolute Rules

### Never modify the base app

- Zero edits to any file inside `apps/healthcare/`
- Extend upstream behavior through `extend_doctype_class`
- Treat Healthcare as an integration boundary, not an edit target

### Always annotate whitelisted functions

```python
@frappe.whitelist()
def my_fn(patient: str, amount: float) -> dict:
    ...
```

`require_type_annotated_api_methods = 1` is enabled in [hooks.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/hooks.py:70).

### Never bypass the appointment save path for legacy check-in

- `record_payment_and_checkin()` must keep using `doc.save()`
- `QueueMixin.on_update()` still creates queue entries for the legacy appointment path
- `frappe.db.set_value(... status='Checked In' ...)` is a regression

### Never create Service Points from hot runtime code

- Runtime code may resolve Service Points
- Runtime code must not materialize missing Service Points
- Creation belongs in the migration patch or an explicit admin path

### Never use global DOM lookups in desk pages

- Use wrapper-scoped selectors
- Avoid `document.getElementById(...)` in Frappe desk pages

## Current Model Boundaries

### Legacy compatibility fields still matter

- `Patient Appointment.custom_queue_type`
- `Patient Appointment.custom_queue_token`
- `Appointment Type.custom_queue_code`
- `Medical Department.custom_dept_abbr`
- `Queue Entry.queue_type`

### Canonical newer fields are also live

- `Queue Session.service_point`
- `Queue Entry.token_number`
- `Queue Entry.channel`
- `Queue Entry.load_class`
- `Queue Entry.patient_type`
- `Queue Entry.priority`
- `Queue Session.planned_capacity`
- `Queue Session.stretch_capacity`
- `Queue Session.weighted_load_total`

## File Map

- `clinic_flow/api/admission.py` — receptionist dashboard booking/session recommendation
- `clinic_flow/api/appointments.py` — legacy appointment booking and check-in
- `clinic_flow/api/queue.py` — session lifecycle, dequeue, session operations
- `clinic_flow/api/emergency.py` — emergency alert/arrival/reconciliation
- `clinic_flow/api/eta.py` — ETA logic
- `clinic_flow/api/workspace.py` — doctor workspace encounter save/submit
- `clinic_flow/queue/appointment_mixin.py` — legacy appointment compatibility path
- `clinic_flow/queue/engine.py` — display token and dequeue helpers
- `clinic_flow/queue/service_point.py` — queue identity resolution

## UI Direction Rules

- `doctor-workspace-v2` is the active doctor UI direction.
- `doctor-workspace` is legacy fallback/reference.
- New doctor workflow, layout, or UX work should go to `doctor-workspace-v2`.
- Touch legacy `doctor-workspace` only for fallback safety, compatibility, or urgent fixes.
- Do not try to maintain feature parity across both doctor pages by default.

## What To Check Before Making Changes

| Change type | Check |
|---|---|
| Queue recommendation / booking behavior | `api/admission.py` |
| Legacy appointment booking / payment / check-in | `api/appointments.py` and `queue/appointment_mixin.py` |
| Doctor dequeue behavior | `api/queue.py` and `queue/engine.py` |
| Queue identity / prefix behavior | `queue/service_point.py`, `docs/service-point-policy.md`, `docs/token-display-policy.md` |
| Healthcare field ownership | `patches/v16_0/ensure_required_healthcare_custom_fields.py` |
| Removing old Healthcare fields | `patches/v16_0/remove_deprecated_healthcare_custom_fields.py` |
| Session schema / capacities | `doctype/queue_session/queue_session.json` |
| Queue-entry state model | `doctype/queue_entry/queue_entry.json` |

## Session Read Discipline

- Do not re-read the entire codebase at the start of a normal implementation session.
- Read the active context first:
- `CLAUDE.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `CONTEXT_INDEX.md`
- Then read only the files for the current task and its nearest compatibility seam.
- Widen the read scope only if:
- the task changes shared queue semantics
- the task touches both legacy and newer flows
- the source of truth is unclear
- the docs and code disagree
- For architecture-analysis sessions, broader reading is appropriate. For scoped fixes or features, keep reading scoped.

## Safe Operations

- Reading existing runtime paths before editing
- Adding new whitelisted APIs with full type annotations
- Updating docs to reflect mixed-mode or migration reality
- Adjusting Service Point read-only resolution
- Writing idempotent patches for schema/data cleanup

## Risky Operations — Confirm Before Proceeding

- Changing `QueueMixin.on_update()`
- Changing `record_payment_and_checkin()`
- Changing dequeue priority or `rr_state`
- Changing token numbering / queue-position semantics
- Changing session boot defaults or default page routing
- Removing legacy Healthcare fields without verifying remaining callers
- Making assumptions based only on old handoff/plan docs

## Completion Rule

- Do not stop at "probably fixed" for code changes.
- Before closing work, re-read the changed path and verify the specific flow you changed when practical.
- If you could not run verification, say so plainly and name what remains unverified.
