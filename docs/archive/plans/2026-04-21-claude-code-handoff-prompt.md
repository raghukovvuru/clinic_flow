# Claude Code Handoff Prompt for Slice 1

Use this prompt in Claude Code after creating the dedicated implementation worktree.

---

You are implementing **Slice 1 only** for `clinic_flow`.

## Repository and Git Rules

- Repository: `apps/clinic_flow`
- Planning checkpoint branch: `backend/receptionist-queue-refactor`
- Safety checkpoint commit: `1397129`
- You must work only in the dedicated implementation worktree, not in the planning worktree.
- Implementation branch: `backend/slice1-operational-authority`
- Recommended worktree path: `.worktrees/backend-slice1-operational-authority`

Critical git rules:

1. Do not create additional branches.
2. Do not switch branches.
3. Do not modify the main planning worktree.
4. Do not commit `.claude/` or `graphify-out/`.
5. Use small commits scoped to the Slice 1 tasks.
6. Stop and report if you see unrelated tracked-file changes that are not part of Slice 1.

## Read These Files First

1. [docs/superpowers/specs/2026-04-21-slice-1-operational-authority-design.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/specs/2026-04-21-slice-1-operational-authority-design.md)
2. [docs/superpowers/plans/2026-04-21-slice-1-operational-authority.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/plans/2026-04-21-slice-1-operational-authority.md)
3. [docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md)
4. [AGENTS.md](/home/raghu/frappe-bench/apps/clinic_flow/AGENTS.md)
5. [CLAUDE.md](/home/raghu/frappe-bench/apps/clinic_flow/CLAUDE.md)
6. [ARCHITECTURE.md](/home/raghu/frappe-bench/apps/clinic_flow/ARCHITECTURE.md)

## Slice 1 Objective

Implement only the operational authority and identity reset:

- `Queue Session` and `Queue Entry` become the operational source of truth
- `Patient Appointment` is reduced to an integration anchor
- `Service Point` becomes the canonical queue identity
- active receptionist flow must stop depending on appointment update hooks for queue-entry creation

Do not redesign:

- live dequeue behavior
- arrival-based movement rules
- midnight quota release
- later slices

## Must Preserve

The current receptionist intake UX patterns must continue to work:

1. Phone availability-first
2. Phone direct / lookup-assisted booking
3. Walk-in token-first intake

## Expected File Focus

Primary runtime files:

- `clinic_flow/api/admission.py`
- `clinic_flow/api/queue.py`
- `clinic_flow/queue/service_point.py`
- `clinic_flow/queue/appointment_mixin.py`
- `clinic_flow/hooks.py`
- `clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py`

Primary tests:

- `clinic_flow/tests/test_slice1_operational_authority.py`
- `clinic_flow/tests/test_slice1_service_point_identity.py`

## Implementation Guidance

- Follow the Slice 1 plan task-by-task rather than doing a one-shot refactor.
- Prefer active receptionist runtime paths over legacy appointment path assumptions.
- Remove active runtime dependence on Healthcare custom queue fields.
- Make `Service Point.queue_code` the canonical active token prefix source.
- Do not let `Patient Appointment` updates create queue entries anymore.
- Keep patient and appointment creation at admission time.

## Verification Requirements

Before each commit:

```bash
git status --short
```

Run targeted tests as changes land:

```bash
pytest clinic_flow/tests/test_slice1_operational_authority.py -v
pytest clinic_flow/tests/test_slice1_service_point_identity.py -v
```

Before finishing:

```bash
pytest clinic_flow/tests/test_slice1_operational_authority.py clinic_flow/tests/test_slice1_service_point_identity.py -v
pytest clinic_flow/tests/test_service_point.py clinic_flow/tests/test_healthcare_compatibility.py -v
git status --short
git log --oneline --decorate -n 10
```

## Commit Guidance

Recommended commit sequence:

1. `test: lock slice1 operational authority expectations`
2. `refactor: make service point canonical in active admission flow`
3. `refactor: remove appointment-driven queue creation authority`
4. `docs: align slice1 healthcare boundary`

## Reporting Back

When done, report:

1. files changed
2. tests run and outcome
3. any remaining risks or follow-up items
4. exact commits created on `backend/slice1-operational-authority`

---

Start by confirming you are in the dedicated implementation worktree on branch `backend/slice1-operational-authority`, then begin Slice 1 Task 1 from the implementation plan.
