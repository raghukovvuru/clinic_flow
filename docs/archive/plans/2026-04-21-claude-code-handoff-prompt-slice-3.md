# Claude Code Handoff Prompt for Slice 3

Use this prompt in Claude Code after creating the dedicated Slice 3 implementation worktree.

---

You are implementing **Slice 3 only** for `clinic_flow`.

## Repository and Git Rules

- Repository: `apps/clinic_flow`
- Planning branch: `backend/receptionist-queue-refactor`
- Slice 2 implementation baseline is already merged on this branch through merge commit `619e475`
- Latest planning checkpoint for Slice 3 docs: `d0ad319`
- You must work only in the dedicated Slice 3 implementation worktree, not in the planning worktree.
- Recommended implementation branch: `backend/slice3-checkin-and-rollover`
- Recommended worktree path: `.worktrees/backend-slice3-checkin-and-rollover`

Critical git rules:

1. Do not create additional branches.
2. Do not switch branches.
3. Do not modify the main planning worktree.
4. Do not commit `.claude/`, `.worktrees/`, or `graphify-out/`.
5. Keep commits small and task-scoped.
6. Stop and report if unrelated tracked-file changes appear.

## Read These Files First

1. [docs/superpowers/specs/2026-04-21-slice-3-checkin-and-rollover-design.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/specs/2026-04-21-slice-3-checkin-and-rollover-design.md)
2. [docs/superpowers/plans/2026-04-21-slice-3-checkin-and-rollover.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/plans/2026-04-21-slice-3-checkin-and-rollover.md)
3. [docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md)
4. [docs/notes/bench-verification-checklist.md](/home/raghu/frappe-bench/apps/clinic_flow/docs/notes/bench-verification-checklist.md)
5. [AGENTS.md](/home/raghu/frappe-bench/apps/clinic_flow/AGENTS.md)
6. [CLAUDE.md](/home/raghu/frappe-bench/apps/clinic_flow/CLAUDE.md)
7. [ARCHITECTURE.md](/home/raghu/frappe-bench/apps/clinic_flow/ARCHITECTURE.md)

Review Slice 1 and Slice 2 outcomes if needed, but do not reopen those decisions.

## Slice 3 Objective

Implement only:

- receptionist check-in as the only doctor-eligibility gate
- arrival remaining operational-only
- narrow Healthcare appointment sync for fee-validity side effects
- midnight phone-to-walkin quota rollover
- demotion of the legacy appointment payment/check-in path to compatibility-only

Do not redesign:

- doctor dequeue sequencing
- arrival-based live movement rules
- broader queue-movement architecture
- later slices

## Must Preserve

These facts must remain true after Slice 3:

1. The three receptionist intake UX patterns remain intact:
   - Phone availability-first
   - Phone direct / lookup-assisted booking
   - Walk-in token-first intake
2. Patient + appointment are still created at admission time.
3. `Service Point` remains the canonical queue identity.
4. `Queue Session` and `Queue Entry` remain the operational source of truth.

## Expected File Focus

Primary runtime files:

- `clinic_flow/api/queue.py`
- `clinic_flow/api/arrival.py`
- `clinic_flow/queue/scheduler.py`
- `clinic_flow/api/appointments.py`
- `ARCHITECTURE.md`

Primary tests:

- `clinic_flow/tests/test_slice3_checkin_boundary.py`
- `clinic_flow/tests/test_slice3_midnight_rollover.py`

Regression suites to keep green:

- `clinic_flow/tests/test_healthcare_compatibility.py`
- `clinic_flow/tests/test_service_point.py`

## Implementation Guidance

- Follow the Slice 3 plan task-by-task rather than doing a one-shot refactor.
- Keep Clinic Flow queue-state transitions authoritative.
- Keep Healthcare sync downstream and narrow.
- Arrival must never make a patient `Ready Near Doctor`.
- Only receptionist check-in should make a patient `Ready Near Doctor`.
- Replace old release semantics with explicit midnight rollover behavior.
- Mark legacy appointment payment/check-in helpers as compatibility-only.

## Verification Requirements

Before each commit:

```bash
git status --short
```

Run targeted tests as changes land:

```bash
pytest clinic_flow/tests/test_slice3_checkin_boundary.py -v
pytest clinic_flow/tests/test_slice3_midnight_rollover.py -v
```

Before finishing:

```bash
pytest clinic_flow/tests/test_slice3_checkin_boundary.py clinic_flow/tests/test_slice3_midnight_rollover.py -v
pytest clinic_flow/tests/test_healthcare_compatibility.py clinic_flow/tests/test_service_point.py -v
git status --short
git log --oneline --decorate -n 10
```

If runtime verification is needed later, remember bench serves `/home/raghu/frappe-bench/apps/clinic_flow`, not this worktree, until changes are merged/cherry-picked back.

## Commit Guidance

Recommended commit sequence:

1. `test: lock slice3 receptionist checkin boundary`
2. `refactor: narrow healthcare sync boundary for receptionist checkin`
3. `feat: add midnight phone quota rollover`
4. `docs: mark legacy appointment checkin path as compatibility only`
5. `docs: align architecture with slice3 receptionist boundary`

## Reporting Back

When done, report:

1. files changed
2. tests run and outcome
3. any remaining risks or follow-up items
4. exact commits created on `backend/slice3-checkin-and-rollover`

---

Start by confirming:

1. current path
2. current branch
3. clean git status

Then begin Task 1 from the Slice 3 implementation plan.
