# CLAUDE.md

Project memory for Claude/Codex work inside `apps/clinic_flow`.

## Project Identity

- App: `clinic_flow`
- Framework: Frappe v16
- Python: 3.11+
- Site default: `http://site1.localhost:8000`
- Base app: Marley Healthcare in `apps/healthcare/`

## Scope

- Default edit scope is this app.
- Read `apps/healthcare/`, `apps/frappe/`, and `apps/erpnext/` when integration context is needed.
- Do not modify upstream app code unless explicitly asked.

## Current Architecture Reality

- The app is mixed-mode, not fully legacy and not fully v2.
- Legacy appointment-driven queue paths still matter:
- `Patient Appointment.custom_queue_type`
- `Patient Appointment.custom_queue_token`
- `Appointment Type.custom_queue_code`
- `Medical Department.custom_dept_abbr`
- Newer queue/session semantics are also live:
- `channel`, `load_class`, `patient_type`, `priority`
- `token_number`
- `planned_capacity`, `stretch_capacity`, `weighted_load_total`
- `phone_booked_count`, `walkin_count`
- `Service Point` is now a real queue-identity layer, with `Queue Session.service_point` preferred over raw `dept_abbr`.
- When docs and code differ, trust live code.

## Primary Runtime Paths

- `clinic_flow/api/admission.py` — receptionist dashboard booking, session recommendation, token board
- `clinic_flow/api/appointments.py` — legacy appointment booking/payment/check-in path
- `clinic_flow/api/queue.py` — session lifecycle, dequeue, doctor-facing queue state, session ops
- `clinic_flow/api/emergency.py` — emergency alert / arrival / reconciliation flow
- `clinic_flow/api/eta.py` — ETA calculation and downstream recalculation hooks
- `clinic_flow/queue/appointment_mixin.py` — appointment check-in to queue-entry compatibility path
- `clinic_flow/queue/engine.py` — display token formatting, sequence logic, dequeue priority
- `clinic_flow/queue/service_point.py` — queue identity resolution

## Active UI Surfaces

- `doctor-workspace-v2` is the active doctor UI direction.
- `doctor-workspace` is legacy fallback/reference during development.
- `receptionist-dashboard` exists alongside legacy `receptionist-workspace`.
- Do not treat legacy and v2 doctor pages as co-equal product lines.

## Hard Rules

- Use type annotations on all `@frappe.whitelist()` methods.
- Use `extend_doctype_class`, not `doc_events`, to extend Healthcare behavior.
- Keep `record_payment_and_checkin()` on the `doc.save()` path; do not replace with `frappe.db.set_value`.
- In desk page JS, scope DOM lookups to the page wrapper instead of global selectors.
- Do not create Service Points from hot request paths; use read-only resolution in runtime code.
- Treat queue behavior edits as compatibility-sensitive until the old appointment path is fully retired.

## Healthcare Boundary

- Upstream Healthcare custom fields are patch-managed, not reliably fixture-managed.
- See `clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py` for the required owned fields.
- Deprecated Healthcare custom fields are being removed via patch, not kept as active design truth.

## Working Rules

- Before changing queue behavior, classify the change first:
- booking / recommendation path
- appointment compatibility path
- doctor dequeue path
- emergency path
- service-point / display-token path
- cross-cutting mixed-mode compatibility path
- If a change touches both canonical and legacy fields, update both or document the mismatch explicitly.
- Preserve practitioner-day token sequencing and day-wide queue-position assumptions unless intentionally redesigning them.

## Risky Changes

- Any change to `QueueMixin.on_update()` or `record_payment_and_checkin()`
- Any change to dequeue priority or `rr_state`
- Any change to token sequencing / queue-position calculation
- Any change to Service Point fallback resolution
- Any change that affects both booking-time queue-entry creation and check-in-time queue-entry creation
- Any change to Healthcare-bound custom fields or their patch ownership

## Verification Defaults

- Read the affected runtime path before editing.
- If the work touches queue behavior, verify both the old appointment path and the newer dashboard/session path when practical.
- If the work touches queue identity, verify `Service Point` and legacy `dept_abbr` fallback behavior.
- Update docs when you clarify whether behavior is legacy-only, v2-only, or mixed-mode.

## Session Discipline

- A new session does not need a whole-codebase reread by default.
- Start with `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, and `CONTEXT_INDEX.md`.
- Then read only the runtime path for the active task and the nearest compatibility boundary.
- Expand the read scope only when the change crosses legacy/v2 boundaries, touches shared queue semantics, or reveals conflicting evidence.
- Do not trust prior session memory without re-reading the relevant live code path.

## Verification Contract

- Do not claim a fix is done only because the edit looks correct.
- Before saying fixed, done, or safe to commit:
- re-read the changed runtime path
- verify the primary user flow or command for that scope when practical
- call out explicitly when verification could not be run
- If the task crosses mixed-mode boundaries, verify the neighboring legacy or v2 path too, or state that it remains unchecked.

## References

- @AGENTS.md
- @ARCHITECTURE.md
- @README.md
- @CONTEXT_INDEX.md
- @docs/service-point-policy.md
- @docs/token-display-policy.md
- @docs/healthcare-compatibility-audit.md
- @docs/git-workflow-guide.md
