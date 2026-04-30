# Claude Code Handoff Prompt for Slice 2

Use this prompt in Claude Code after creating the dedicated Slice 2 implementation worktree.

---

You are implementing **Slice 2 only** for `clinic_flow`.

## Repository and Git Rules

- Repository: `apps/clinic_flow`
- Planning branch: `backend/receptionist-queue-refactor`
- Latest planning checkpoint for Slice 2 docs: `15a9ccc`
- You must work only in the dedicated Slice 2 implementation worktree, not in the planning worktree.
- Recommended implementation branch: `backend/slice2-admission-cleanup`
- Recommended worktree path: `.worktrees/backend-slice2-admission-cleanup`

Critical git rules:

1. Do not create additional branches.
2. Do not switch branches.
3. Do not modify the main planning worktree.
4. Do not commit `.claude/`, `.worktrees/`, or `graphify-out/`.
5. Keep commits small and task-scoped.
6. Stop and report if unrelated tracked-file changes appear.

## Read These Files First

1. [docs/superpowers/specs/2026-04-21-slice-2-admission-cleanup-design.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/specs/2026-04-21-slice-2-admission-cleanup-design.md)
2. [docs/superpowers/plans/2026-04-21-slice-2-admission-cleanup.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/plans/2026-04-21-slice-2-admission-cleanup.md)
3. [docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md)
4. [docs/notes/bench-verification-checklist.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/notes/bench-verification-checklist.md)
5. [AGENTS.md](/home/raghu/frappe-bench/apps/clinic_flow/AGENTS.md)
6. [CLAUDE.md](/home/raghu/frappe-bench/apps/clinic_flow/CLAUDE.md)
7. [ARCHITECTURE.md](/home/raghu/frappe-bench/apps/clinic_flow/ARCHITECTURE.md)

Also review Slice 1 outcome context if needed, but do not re-open Slice 1 decisions.

## Slice 2 Objective

Implement only the admission-flow cleanup:

- preserve the three receptionist intake UX patterns
- simplify active admission logic around `channel`, `load_class`, token reservation, and `Service Point`
- keep patient + appointment creation at admission time
- remove active admission dependence on legacy `queue_type` as a business concept
- decouple Healthcare appointment creation from legacy queue-code mapping and Healthcare queue custom-field assumptions

Do not redesign:

- live dequeue behavior
- arrival movement semantics
- midnight quota rollover
- receptionist check-in behavior
- later slices

## Must Preserve

The current receptionist intake UX patterns must continue to work:

1. Phone availability-first
2. Phone direct / lookup-assisted booking
3. Walk-in token-first intake

Do not collapse these flows into one generic intake path.

## Expected File Focus

Primary runtime files:

- `clinic_flow/api/admission.py`
- `clinic_flow/clinic_flow/page/receptionist_dashboard/receptionist_dashboard.js`
- `ARCHITECTURE.md`

Possible neighboring review file:

- `clinic_flow/api/appointments.py`

Primary tests:

- `clinic_flow/tests/test_slice2_admission_semantics.py`
- `clinic_flow/tests/test_slice2_receptionist_paths.py`

Regression tests to keep green:

- `clinic_flow/tests/test_healthcare_compatibility.py`
- `clinic_flow/tests/test_service_point.py`

## Implementation Guidance

- Follow the Slice 2 plan task-by-task rather than doing a one-shot refactor.
- Keep the dashboard interaction model stable; focus changes in backend admission logic first.
- `Service Point` remains the canonical queue identity.
- `Patient Appointment` remains created at admission time.
- `queue_type` may remain only as a compatibility field where absolutely necessary, not as active admission semantics.
- Remove active dependence on `Appointment Type.custom_queue_code` and Healthcare queue custom fields from admission-time appointment creation.

## Verification Requirements

Before each commit:

```bash
git status --short
```

Run targeted tests as changes land:

```bash
pytest clinic_flow/tests/test_slice2_admission_semantics.py -v
pytest clinic_flow/tests/test_slice2_receptionist_paths.py -v
```

Before finishing:

```bash
pytest clinic_flow/tests/test_slice2_admission_semantics.py clinic_flow/tests/test_slice2_receptionist_paths.py -v
pytest clinic_flow/tests/test_healthcare_compatibility.py clinic_flow/tests/test_service_point.py -v
git status --short
git log --oneline --decorate -n 10
```

If runtime verification is needed later, remember bench serves `/home/raghu/frappe-bench/apps/clinic_flow`, not this worktree, until changes are merged/cherry-picked back.

## Commit Guidance

Recommended commit sequence:

1. `test: lock slice2 admission semantics`
2. `test: protect receptionist intake paths during slice2`
3. `refactor: remove legacy queue-type semantics from active admission flow`
4. `refactor: decouple admission appointment creation from legacy queue mapping`
5. `docs: align architecture with slice2 admission model`

## Reporting Back

When done, report:

1. files changed
2. tests run and outcome
3. any remaining risks or follow-up items
4. exact commits created on `backend/slice2-admission-cleanup`

---

Start by confirming:

1. current path
2. current branch
3. clean git status

Then begin Task 1 from the Slice 2 implementation plan.
