# CONTEXT_INDEX.md

Read order for project context in `clinic_flow`.

## Active Context

Read these first, in order:

1. [CLAUDE.md](/home/raghu/frappe-bench/apps/clinic_flow/CLAUDE.md:1)
2. [AGENTS.md](/home/raghu/frappe-bench/apps/clinic_flow/AGENTS.md:1)
3. [ARCHITECTURE.md](/home/raghu/frappe-bench/apps/clinic_flow/ARCHITECTURE.md:1)

Then read the focused policy docs only if the task touches those areas:

- [docs/service-point-policy.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/service-point-policy.md:1)
- [docs/token-display-policy.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/token-display-policy.md:1)
- [docs/healthcare-compatibility-audit.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/healthcare-compatibility-audit.md:1)
- [docs/git-workflow-guide.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/git-workflow-guide.md:1) for branch and commit hygiene

## Working Rule

- If a historical/planning doc conflicts with the active context or the live code, prefer the live code.
- Historical docs are useful for intent and migration background, not for current runtime truth.

## Minimum Read Set By Task

- Any normal coding session:
- `CLAUDE.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- this file
- Receptionist booking, token board, or arrival-desk work:
- `clinic_flow/api/admission.py`
- the relevant `receptionist_dashboard` page files
- Legacy appointment booking, payment, or check-in work:
- `clinic_flow/api/appointments.py`
- `clinic_flow/queue/appointment_mixin.py`
- Doctor dequeue or queue-state work:
- `clinic_flow/api/queue.py`
- `clinic_flow/queue/engine.py`
- the relevant doctor workspace page files
- Queue identity or token-format work:
- `clinic_flow/queue/service_point.py`
- `docs/service-point-policy.md`
- `docs/token-display-policy.md`
- Healthcare-field ownership work:
- `clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py`
- `docs/healthcare-compatibility-audit.md`
- Architecture or policy analysis:
- broaden from the above as needed
- Whole-codebase rereads are for architecture review, broad refactors, or conflicting evidence, not for ordinary scoped changes.

## Historical Docs

Archived planning and handoff material lives under:

- `docs/archive/`

Current archived set:

- `build/clinic_flow_spec.md`
- `project/HANDOFF.md`
- `project/PLAN_ADMISSION_V2.md`
- `project/receptionist-backend-policy.md`

## Operator Docs

- [ONBOARDING.md](/home/raghu/frappe-bench/apps/clinic_flow/ONBOARDING.md:1) is the practical setup and verification guide.
- [README.md](/home/raghu/frappe-bench/apps/clinic_flow/README.md:1) is the lightweight repo landing page.
- [docs/git-workflow-guide.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/git-workflow-guide.md:1) explains how to work with scopes, branches, and commits.
- [docs/notes/README.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/notes/README.md:1) explains short session handoff notes for multi-session work.
