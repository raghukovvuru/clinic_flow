# CONTEXT_INDEX.md

Read order for project context in `clinic_flow`.

This file exists to stop agents from loading stale transition-phase context first.

---

## Active Authority Order

Read these first, in order:

1. [CONTEXT_INDEX.md](/home/raghu/frappe-bench/apps/clinic_flow/CONTEXT_INDEX.md:1)
2. [AGENTS.md](/home/raghu/frappe-bench/apps/clinic_flow/AGENTS.md:1)
3. [ARCHITECTURE.md](/home/raghu/frappe-bench/apps/clinic_flow/ARCHITECTURE.md:1)

`CONTEXT_INDEX.md` is the context router. `AGENTS.md` is the agent guardrail source. `ARCHITECTURE.md` is the current runtime architecture source.

---

## Focused Policy Docs

Read these only if the task touches those areas:

- [docs/receptionist-backend-policy.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/receptionist-backend-policy.md:1)
- [docs/service-point-policy.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/service-point-policy.md:1)
- [docs/token-display-policy.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/token-display-policy.md:1)
- [docs/healthcare-compatibility-audit.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/healthcare-compatibility-audit.md:1)
- [docs/git-workflow-guide.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/git-workflow-guide.md:1)

Focused policy docs refine the authority stack for a task-specific area; they do not replace it.

---

## Working Rule

- If docs and code disagree, trust the live code and then fix the docs.
- If historical/planning docs conflict with the authority stack, treat them as historical.
- Do not assume legacy pages are co-equal product directions with the v2 pages.
- Treat the active authority stack as locked project infrastructure; do not move, rename, delete, or rewrite it unless the task is specifically a doc-set maintenance task.

---

## Minimum Read Set By Task

Any normal coding session:

- `CONTEXT_INDEX.md`
- `AGENTS.md`
- `ARCHITECTURE.md`

Receptionist booking, token board, emergency reconciliation, or arrival-desk work:

- `docs/receptionist-backend-policy.md`
- `clinic_flow/api/admission.py`
- `clinic_flow/api/emergency.py`
- `clinic_flow/api/arrival.py`
- the relevant `receptionist_dashboard` or `arrival_counter` page files

Legacy appointment booking, payment, or check-in work:

- `clinic_flow/api/appointments.py`
- `clinic_flow/queue/appointment_mixin.py`
- `clinic_flow/queue/scheduler.py`

Doctor dequeue or queue-state work:

- `clinic_flow/api/queue.py`
- `clinic_flow/queue/engine.py`
- the relevant `doctor_workspace_v2` files
- if the task touches compatibility boundaries, also read legacy `doctor_workspace`

Queue identity or token-format work:

- `clinic_flow/queue/service_point.py`
- `docs/service-point-policy.md`
- `docs/token-display-policy.md`

Healthcare-field ownership or migration work:

- `clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py`
- `clinic_flow/patches.txt`
- `docs/healthcare-compatibility-audit.md`

Architecture or policy analysis:

- start with the authority stack
- then expand only into the relevant policy doc and runtime path

Whole-codebase rereads are for architecture review, broad refactors, or conflicting evidence, not for ordinary scoped changes.

---

## Historical Docs

These are not active source-of-truth docs:

- [docs/archive/PLAN_ADMISSION_V2.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/archive/PLAN_ADMISSION_V2.md:1)
- anything under `docs/archive/`
- plans, specs, archived notes, and branch handoff prompts unless a current authority doc explicitly promotes them

Use them only for historical intent, migration background, or branch archaeology.

---

## Operator / Process Docs

- [ONBOARDING.md](/home/raghu/frappe-bench/apps/clinic_flow/ONBOARDING.md:1) is a deprecated compatibility pointer
- [README.md](/home/raghu/frappe-bench/apps/clinic_flow/README.md:1) is the lightweight repo landing page
- [docs/runbooks/local-setup-and-verification.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/runbooks/local-setup-and-verification.md:1) is the human setup and verification runbook
- [docs/git-workflow-guide.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/git-workflow-guide.md:1) explains branch and commit hygiene
- [docs/notes/README.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/notes/README.md:1) explains lightweight session notes
