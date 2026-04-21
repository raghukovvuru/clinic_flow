# AGENTS.md — Clinic Flow
Rules for AI coding agents working in this repository.

---

## Identity

- App: `clinic_flow`
- Framework: Frappe v16
- Base app: `healthcare` (Marley Healthcare)
- Site: `http://site1.localhost:8000`
- Python: 3.11+

Do not assume an older branch narrative such as `version-16` or a pure legacy queue model. Read the current code and the active docs before making changes.

---

## Active Product Direction

Treat these as the active direction on the current codebase:

- `receptionist_dashboard` is the primary receptionist UI direction
- `doctor_workspace_v2` is the primary doctor UI direction
- `arrival_counter` is an active operational flow
- `Service Point` is the preferred queue identity model
- `token_number` + display-token composition is the preferred token model
- `channel` / `load_class` / `priority` are the preferred operational concepts for new queue logic

Treat these as compatibility paths, not the default place for new product work:

- `receptionist_workspace`
- `doctor_workspace`
- legacy queue semantics centered on only `custom_queue_type`
- direct dependence on `Medical Department.custom_dept_abbr` as the sole queue identity
- legacy appointment-hook behavior is compatibility only; do not treat it as queue authority

Legacy code is still load-bearing in parts of the app. Do not delete or bypass it casually.

---

## Absolute Rules

### Never modify the base app

- Zero edits inside `apps/healthcare/`
- Extend Healthcare behavior from `clinic_flow`
- Treat `Patient Appointment` as an integration anchor only; do not route queue authority through its lifecycle hooks

### Treat the core doc set as locked

The active core doc set is:

- `CLAUDE.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `CONTEXT_INDEX.md`

These files are stable project infrastructure.

Do not rename, move, delete, or rewrite them as part of ordinary feature work, branch work, worktree setup, or cleanup work.

Only change them when the task is explicitly about documentation architecture, documentation maintenance, or documentation accuracy.

### Always use type annotations on whitelisted functions

`require_type_annotated_api_methods = 1` is enabled in `hooks.py`.

```python
@frappe.whitelist()
def my_fn(patient: str, amount: float) -> dict:
    ...
```

### Legacy appointment check-in compatibility

Legacy appointment check-in code is compatibility only. Keep any remaining behavior bounded to the historical appointment path; do not use it as the source of queue authority or new queue logic.

### Never use `frappe.get_all(..., order_by="FIELD(...)")`

Frappe v16 sanitizes `order_by`. Use raw SQL when priority ordering needs `FIELD(...)`.

### Never use `document.getElementById()` in desk page JS

Use wrapper-scoped jQuery:

```javascript
$(this.wrapper).find("#my-element");
```

### Do not assume fixtures alone own upstream Healthcare customizations

Some required Healthcare-facing custom fields are patch-managed on this codebase. Read `hooks.py`, `patches.txt`, and `docs/healthcare-compatibility-audit.md` before changing fixture or migration behavior.

---

## Architecture Guardrails

### Appointment path is still load-bearing

The legacy appointment path still matters:

- `Patient Appointment.custom_queue_type`
- `Patient Appointment.custom_queue_token`
- `Appointment Type.custom_queue_code`
- `Medical Department.custom_dept_abbr`

Do not remove or rewrite this path unless you have verified every caller.

### Service Point is the preferred queue identity

For new queue-code reads, prefer the `Service Point` resolution helpers over ad hoc department logic:

- `clinic_flow.queue.service_point.resolve_service_point`
- `clinic_flow.queue.service_point.resolve_queue_code`
- `clinic_flow.queue.service_point.resolve_department_name`

### Canonical priority is separate from legacy queue type

For newer admission and dequeue behavior:

- `channel`: `phone` / `walkin`
- `load_class`: `review_load` / `non_review_load`
- `priority`: `normal` / `special` / `emergency`

Legacy `queue_type` still exists for compatibility and reporting, but should not be treated as the only product model.

### Display token is a presentation concern

- `token_number` is the internal numeric identity
- visible token labels are composed from queue code + token number
- do not overload queue ordering logic with display formatting concerns

### Legacy compatibility fields remain intentionally

Examples:

- `Queue Session.dept_abbr` remains as a cache/fallback during Service Point migration
- special-buffer fields exist as compatibility artifacts even where the operational model has moved on

Do not rename or remove these without checking current patches, data migration risk, and UI callers.

---

## Current High-Risk Areas

Confirm before changing these:

- legacy appointment check-in compatibility paths and any code that still syncs appointment state back to Queue Entry
- `rr_state` structure or round-robin sequencing behavior
- queue-position calculation rules
- `Service Point` resolution order
- token-number assignment semantics
- `priority` / `special` / `emergency` dequeue behavior
- migration patches in `clinic_flow/patches/v16_0/`
- custom-field ownership strategy for upstream Healthcare doctypes

---

## What To Read First

For general work:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
4. `docs/healthcare-compatibility-audit.md`

For queue identity or token behavior:

1. `docs/service-point-policy.md`
2. `docs/token-display-policy.md`
3. `clinic_flow/queue/service_point.py`
4. `clinic_flow/queue/engine.py`

For receptionist and admission work:

1. `docs/receptionist-backend-policy.md`
2. `clinic_flow/api/admission.py`
3. `clinic_flow/api/emergency.py`
4. `clinic_flow/api/arrival.py`
5. `clinic_flow/clinic_flow/page/receptionist_dashboard/`

For doctor work:

1. `clinic_flow/api/queue.py`
2. `clinic_flow/api/workspace.py`
3. `clinic_flow/clinic_flow/page/doctor_workspace_v2/`

---

## File Map

Core runtime:

- `clinic_flow/hooks.py`
- `clinic_flow/api/appointments.py`
- `clinic_flow/api/queue.py`
- `clinic_flow/api/workspace.py`
- `clinic_flow/api/admission.py`
- `clinic_flow/api/arrival.py`
- `clinic_flow/api/emergency.py`
- `clinic_flow/api/eta.py`
- `clinic_flow/api/family.py`
- `clinic_flow/queue/appointment_mixin.py`
- `clinic_flow/queue/engine.py`
- `clinic_flow/queue/service_point.py`
- `clinic_flow/queue/scheduler.py`

Desk pages:

- `clinic_flow/clinic_flow/page/receptionist_dashboard/`
- `clinic_flow/clinic_flow/page/arrival_counter/`
- `clinic_flow/clinic_flow/page/doctor_workspace_v2/`
- `clinic_flow/clinic_flow/page/receptionist_workspace/` legacy compatibility
- `clinic_flow/clinic_flow/page/doctor_workspace/` legacy compatibility

DocTypes:

- `clinic_flow/clinic_flow/doctype/queue_session/`
- `clinic_flow/clinic_flow/doctype/queue_entry/`
- `clinic_flow/clinic_flow/doctype/slot_partition_config/`
- `clinic_flow/clinic_flow/doctype/service_point/`
- `clinic_flow/clinic_flow/doctype/patient_guardian/`
- `clinic_flow/clinic_flow/doctype/guardian_child/`
- `clinic_flow/clinic_flow/doctype/emergency_intake/`

Migrations and fixtures:

- `clinic_flow/patches.txt`
- `clinic_flow/patches/v16_0/`
- `clinic_flow/fixtures/`

Support docs:

- `ARCHITECTURE.md`
- `CONTEXT_INDEX.md`
- `docs/receptionist-backend-policy.md`
- `docs/healthcare-compatibility-audit.md`
- `docs/service-point-policy.md`
- `docs/token-display-policy.md`

---

## Safe Defaults

- Prefer additive changes over broad rewrites
- Preserve backward compatibility unless the migration path is explicit
- Verify whether a page or API is active-direction or legacy-compat before editing
- Update docs when you change behavior
- Use patches for data migrations and patch-managed Healthcare setup

If docs and code disagree, trust the code, then fix the docs.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
