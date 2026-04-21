# Git Execution Plan for Claude Code

Date: 2026-04-21
Repo: `apps/clinic_flow`
Audience: you + Claude Code
Purpose: prevent branch/workflow mix-ups while executing Slice 1 in Claude Code

## Current Repo State

As of writing:

- Current branch: `backend/receptionist-queue-refactor`
- Current worktree: only the main repo path is attached
- Current worktree is dirty:
  - modified: `AGENTS.md`
  - modified: `CLAUDE.md`
  - untracked: `.claude/`
  - untracked: `docs/superpowers/`
  - untracked: `graphify-out/`

This means the repo is **not** in a safe state for ad hoc branch switching inside the current working tree.

If Claude Code starts creating branches or switching branches in this same directory, it can easily mix:

- your existing documentation/context changes
- new Slice 1 implementation work
- generated or local-only files

That is the exact class of mess this plan is designed to avoid.

---

## Core Rule

Do **not** implement Slice 1 in the current worktree.

Use the current worktree only for:

- preparing docs/spec/plan
- checking status
- creating the isolated execution worktree
- merging or cherry-picking back later

All Slice 1 code changes should happen in a separate git worktree on a dedicated branch.

---

## Branch / Worktree Strategy

## 1. Keep the current branch as the design-and-planning branch

Treat the current branch, `backend/receptionist-queue-refactor`, as the branch that contains:

- architecture notes
- implementation plans
- any current documentation analysis work

Do not let Claude Code implement Slice 1 directly here.

## 2. Create a dedicated implementation branch in a dedicated worktree

Recommended branch name:

- `backend/slice1-operational-authority`

Recommended worktree path:

- `.worktrees/backend-slice1-operational-authority`

Reason:

- branch purpose is explicit
- no branch switching is needed in the main repo
- Claude Code gets an isolated workspace with a single job

## 3. Never switch the main worktree to the implementation branch

This rule is non-negotiable.

The main worktree remains on:

- `backend/receptionist-queue-refactor`

The implementation worktree remains on:

- `backend/slice1-operational-authority`

Do not use `git checkout` or `git switch` in the main worktree to “peek” at implementation progress.

Use:

- `git worktree list`
- `git log`
- `git diff`
- or open the implementation worktree directly

---

## Safe Execution Sequence

## Phase 1: Stabilize the current worktree

Before doing anything else:

1. Inspect exactly what is dirty.
2. Decide what must be preserved in this worktree.
3. Make the worktree safe enough that creating a new worktree does not inherit confusion.

Commands:

```bash
git status --short --branch
git diff -- AGENTS.md CLAUDE.md
git ls-files --others --exclude-standard
```

Decision rule:

- `docs/superpowers/` should be kept and committed when you are ready
- `.claude/` is likely local tooling state and should usually stay untracked unless intentionally repo-owned
- `graphify-out/` should usually stay untracked unless you explicitly want it versioned
- `AGENTS.md` and `CLAUDE.md` should not be mixed casually with Slice 1 code implementation

### Recommended action

Commit the planning artifacts first, separately from any unrelated local files.

Recommended commit scope:

- `docs/superpowers/specs/2026-04-21-slice-1-operational-authority-design.md`
- `docs/superpowers/plans/2026-04-21-slice-1-operational-authority.md`
- `docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md`

If `AGENTS.md` and `CLAUDE.md` changes are intentional and complete, commit them separately in their own docs commit.

If they are incomplete or experimental, leave them uncommitted and do **not** bring them into Slice 1 implementation.

---

## Phase 2: Create the execution worktree

### Step A: verify `.worktrees/` is safe

Commands:

```bash
ls -d .worktrees 2>/dev/null
git check-ignore -q .worktrees
```

If `.worktrees/` does not exist, create it and make sure it is ignored in `.gitignore` before continuing.

If `.worktrees/` is not ignored, fix that first in a separate commit.

### Step B: create the dedicated worktree

Run from the main repo path:

```bash
git worktree add .worktrees/backend-slice1-operational-authority -b backend/slice1-operational-authority
```

Expected result:

- new worktree path exists
- new branch exists
- main worktree branch remains unchanged

Verify:

```bash
git worktree list
git branch --all --verbose
```

---

## Phase 3: Prepare Claude Code handoff

Claude Code should work only inside:

- `.worktrees/backend-slice1-operational-authority`

When starting Claude Code there, give it:

1. the Slice 1 design note
2. the Slice 1 implementation plan
3. this git execution plan

Tell Claude Code explicitly:

```text
Work only in this worktree.
Do not create or switch branches.
Do not modify the main worktree.
Commit only on backend/slice1-operational-authority.
Do not touch unrelated untracked files from the parent worktree.
```

This keeps the execution model narrow and prevents branch confusion.

---

## Phase 4: Commit policy inside the implementation worktree

Inside `backend/slice1-operational-authority`, Claude Code should use small commits.

Recommended commit grouping:

1. tests locking operational authority
2. service-point identity hardening
3. removal of appointment-driven queue creation
4. Healthcare-boundary cleanup and docs alignment

Recommended commit message style:

- `test: lock slice1 operational authority expectations`
- `refactor: make service point canonical in active admission flow`
- `refactor: remove appointment-driven queue creation authority`
- `docs: align slice1 healthcare boundary`

Do not squash everything into one huge commit unless you decide to do that manually later.

---

## Phase 5: Verification discipline

Before every commit in the implementation worktree:

```bash
git status --short
pytest <targeted tests>
```

Before closing the implementation session:

```bash
git status --short
git log --oneline --decorate -n 10
pytest clinic_flow/tests/test_slice1_operational_authority.py clinic_flow/tests/test_slice1_service_point_identity.py -v
```

If broader regressions are part of the slice:

```bash
pytest clinic_flow/tests/test_service_point.py clinic_flow/tests/test_healthcare_compatibility.py -v
```

---

## Phase 6: Bring changes back safely

After Claude Code finishes Slice 1, do **not** merge by switching branches in the main worktree.

Use one of these two safe options:

### Option A: merge from the main worktree

From the main repo path:

```bash
git fetch --all
git log --oneline backend/receptionist-queue-refactor..backend/slice1-operational-authority
git merge --no-ff backend/slice1-operational-authority
```

Use this if Slice 1 should remain a coherent branch merge.

### Option B: cherry-pick selected commits

From the main repo path:

```bash
git log --oneline backend/receptionist-queue-refactor..backend/slice1-operational-authority
git cherry-pick <commit1> <commit2> <commit3>
```

Use this if Claude Code produced one good commit and one questionable commit, or if you want tighter control.

### Recommendation

Prefer **cherry-pick** if you expect Claude Code to experiment.
Prefer **merge** only if the implementation branch stays clean and tightly scoped.

---

## Rules Claude Code Should Follow

Pass these as explicit workflow rules:

1. Do not create additional branches.
2. Do not switch branches.
3. Do not run destructive git commands.
4. Do not commit untracked local analysis directories unless explicitly requested.
5. Work only in the dedicated worktree.
6. Keep commits small and slice-scoped.
7. Stop if unexpected unrelated changes appear in tracked files.

---

## What Not To Do Again

Avoid these failure modes:

- creating the implementation branch in the main dirty worktree
- switching the current worktree between planning and implementation branches
- mixing docs/context changes with Slice 1 runtime changes in one commit
- letting Claude Code decide its own branch/worktree strategy without constraints
- merging implementation back by manually copying files

---

## Recommended Immediate Next Commands

From the current repo path:

```bash
git status --short --branch
git diff -- AGENTS.md CLAUDE.md
git ls-files --others --exclude-standard
```

Then, after deciding what to commit from planning work:

```bash
git add docs/superpowers/specs/2026-04-21-slice-1-operational-authority-design.md
git add docs/superpowers/plans/2026-04-21-slice-1-operational-authority.md
git add docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md
git commit -m "docs: add slice1 design, implementation, and git execution plans"
```

Then create the worktree:

```bash
git worktree add .worktrees/backend-slice1-operational-authority -b backend/slice1-operational-authority
```

Then launch Claude Code in:

```bash
.worktrees/backend-slice1-operational-authority
```

---

## Final Recommendation

For this repo, the safe workflow is:

- **main worktree = planning and review only**
- **dedicated worktree = Slice 1 implementation only**
- **no branch switching in the main worktree**
- **merge or cherry-pick back only after verification**

That is the simplest workflow that avoids repeating yesterday’s branch/workflow mess.
