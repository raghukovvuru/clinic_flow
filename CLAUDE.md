# CLAUDE.md

Project memory for Claude/Codex work inside `apps/clinic_flow`.

This file is intentionally short. It is a routing and session-discipline doc, not the full rulebook or architecture narrative.

---

## Project Identity

- App: `clinic_flow`
- Framework: Frappe v16
- Python: 3.11+
- Site default: `http://site1.localhost:8000`
- Base app: Marley Healthcare in `apps/healthcare/`

---

## Scope

- Default edit scope is this app.
- Read `apps/healthcare/`, `apps/frappe/`, and `apps/erpnext/` only when integration context is needed.
- Do not modify upstream app code unless explicitly asked.

---

## Current Reality

- The app is mixed-mode.
- Active UI direction:
  - `receptionist_dashboard`
  - `arrival_counter`
  - `doctor_workspace_v2`
- Legacy compatibility still matters:
  - appointment-driven queue/check-in path
  - `receptionist_workspace`
  - `doctor_workspace`
- Queue identity is moving toward `Service Point`.
- Queue semantics are moving toward canonical `channel` / `load_class` / `priority`, while legacy `queue_type` still exists for compatibility.
- When docs and code differ, trust live code and then fix the docs.

## Current Branch Reality

This repository currently combines:

- the legacy appointment/check-in queue path
- the newer admission/session/token-board path
- `Service Point` queue identity
- canonical `priority` fields and special/emergency behavior
- patch-managed Healthcare compatibility work

When making changes, classify the task first:

- active v2 flow
- legacy compatibility flow
- migration / bridge logic between the two

---

## Read Order

Start here, in order:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
4. `CONTEXT_INDEX.md`

Then read only the runtime path and focused policy docs for the task at hand.

---

## Primary Runtime Paths

- `clinic_flow/api/admission.py` — newer receptionist booking/session/token-board flow
- `clinic_flow/api/appointments.py` — legacy appointment booking/payment/check-in path
- `clinic_flow/api/queue.py` — session lifecycle, dequeue, doctor queue state
- `clinic_flow/api/workspace.py` — encounter save/submit and doctor payloads
- `clinic_flow/api/emergency.py` — emergency issuance / reconciliation flow
- `clinic_flow/api/arrival.py` — arrival-counter lookup and arrival transitions
- `clinic_flow/api/eta.py` — ETA calculation and downstream recalculation
- `clinic_flow/queue/appointment_mixin.py` — appointment check-in compatibility path
- `clinic_flow/queue/engine.py` — token/display/dequeue logic
- `clinic_flow/queue/service_point.py` — queue identity resolution

---

## Session Discipline

- Do not reread the whole repo by default.
- Read the active authority stack first, then the exact runtime path for the task.
- Expand scope only when the task crosses legacy/v2 boundaries, shared queue semantics, migrations, or conflicting evidence.
- Do not trust prior session memory without re-reading the relevant live code path.

---

## Verification Reminder

- Do not claim a fix is done because the edit looks right.
- Re-read the changed runtime path before closing a task.
- Verify the main user flow or command when practical.
- If a task crosses mixed-mode boundaries, verify the neighboring compatibility path too, or state that it remains unchecked.

---

## References

- `AGENTS.md`
- `ARCHITECTURE.md`
- `CONTEXT_INDEX.md`
- `docs/receptionist-backend-policy.md`
- `docs/service-point-policy.md`
- `docs/token-display-policy.md`
- `docs/healthcare-compatibility-audit.md`

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
