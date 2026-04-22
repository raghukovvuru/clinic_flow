# Scoped Branch Handling Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop adding mixed-scope work directly to `backend/receptionist-queue-refactor` and move all future implementation into narrow, dedicated worktree branches.

**Architecture:** Keep `backend/receptionist-queue-refactor` as the planning, review, and integration branch in the main repo path. Create one dedicated worktree per new task, make small scoped commits there, then cherry-pick or merge verified commits back into the integration branch without switching the main worktree away from it.

**Tech Stack:** git, git worktree, Frappe bench, pytest/bench test runner, repo docs in `docs/`

---

### Task 1: Lock the Current Integration Branch Role

**Files:**
- Read: `docs/git-workflow-guide.md`
- Read: `docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md`
- Verify: `apps/clinic_flow` main repo path only

- [ ] **Step 1: Verify the current branch and worktree state**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git status --short --branch
git worktree list
git branch -vv
```

Expected:
- current branch is `backend/receptionist-queue-refactor`
- main repo path is the only active worktree
- working tree is clean

- [ ] **Step 2: Freeze the role of `backend/receptionist-queue-refactor`**

Rule:
- This branch is now the integration/review branch only.
- Do not start new implementation directly here.
- Do not switch the main repo path to another branch to “peek.”

- [ ] **Step 3: Record a safety checkpoint tag before any future workflow changes**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git tag backup-backend-receptionist-queue-refactor-post-workflow-plan
git show-ref --tags backup-backend-receptionist-queue-refactor-post-workflow-plan
```

Expected:
- tag points at the current verified tip of `backend/receptionist-queue-refactor`

- [ ] **Step 4: Commit nothing else in this task**

Rule:
- This task is complete once the branch role is explicit and the safety tag exists.
- Do not mix feature code or docs cleanup into this checkpoint task.

### Task 2: Create the Standard Scoped-Branch Intake Checklist

**Files:**
- Read: `docs/git-workflow-guide.md`
- Read: `AGENTS.md`
- Read: `CONTEXT_INDEX.md`

- [ ] **Step 1: Define the branch-scope test before starting work**

Use this checklist before every new branch:

```text
1. Can I describe the work in one sentence?
2. Does it fit one scope bucket? (backend / receptionist-dashboard / doctor-v2 / docs / ops)
3. If I need the word "also", should this be two branches?
4. Would I want to revert all of it together?
```

Decision:
- if any answer is "no", split the work further before creating a branch

- [ ] **Step 2: Use repo-approved naming only**

Allowed patterns:

```text
backend/<purpose>
receptionist-dashboard/<purpose>
doctor-v2/<purpose>
docs/<purpose>
ops/<purpose>
fix/<purpose>
```

Examples:

```text
backend/queue-position-bug
receptionist-dashboard/ready-alert-polish
doctor-v2/open-orders-panel
docs/branch-workflow-note
ops/emergency-reconciliation-audit
```

- [ ] **Step 3: Reject vague names**

Do not create names like:

```text
misc-fixes
new-work
v2-updates
cleanup-round-2
```

### Task 3: Create One Dedicated Worktree Per New Task

**Files:**
- Verify: `.worktrees/`
- Modify only if needed: `.gitignore`

- [ ] **Step 1: Verify `.worktrees/` is safe**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
ls -d .worktrees 2>/dev/null
git check-ignore -q .worktrees
```

Expected:
- `.worktrees/` exists
- `.worktrees/` is ignored

- [ ] **Step 2: Create the new scoped branch in its own worktree**

Example for a backend task:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git worktree add .worktrees/backend-queue-position-bug -b backend/queue-position-bug
git worktree list
git branch -vv
```

Expected:
- main repo path remains on `backend/receptionist-queue-refactor`
- new worktree path exists
- new branch exists

- [ ] **Step 3: Work only inside the dedicated worktree**

Rule:
- open the worktree path directly
- do not edit feature code in `/home/raghu/frappe-bench/apps/clinic_flow`
- do not `git switch` the main repo path

### Task 4: Keep Commits Small and Single-Purpose Inside the Worktree

**Files:**
- Modify: only the files required by the scoped task
- Test: only the targeted tests relevant to that task

- [ ] **Step 1: Start with the smallest failing test or smallest isolated edit**

Examples:

```text
backend fix -> write/adjust one backend test first
frontend polish -> change one UI section and build it
docs note -> update only the doc file that explains that exact change
```

- [ ] **Step 2: Verify before every commit**

Run:

```bash
git status --short
git diff --stat
```

Then run only the proof command for that task, for example:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_service_point
```

or:

```bash
bench build --app clinic_flow
```

- [ ] **Step 3: Commit only the task bucket**

Examples:

```bash
git add clinic_flow/api/boot.py clinic_flow/tests/test_post_slice_legacy_cleanup.py
git commit -m "fix: route boot redirect to doctor workspace v2"
```

```bash
git add clinic_flow/clinic_flow/page/receptionist_dashboard/receptionist_dashboard.js
git commit -m "fix: restore receptionist dashboard ops rail refinements"
```

- [ ] **Step 4: Stop immediately if scope drifts**

Trigger conditions:
- backend work now needs frontend redesign
- receptionist work now needs doctor-v2 changes
- docs cleanup is no longer directly tied to the code change

Action:
- commit what is already coherent
- create a new scoped branch for the next concern

### Task 5: Bring Changes Back to the Integration Branch Safely

**Files:**
- Main repo path only: `/home/raghu/frappe-bench/apps/clinic_flow`

- [ ] **Step 1: Review the worktree branch from the main repo path**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git log --oneline backend/receptionist-queue-refactor..backend/queue-position-bug
git diff --stat backend/receptionist-queue-refactor..backend/queue-position-bug
```

- [ ] **Step 2: Prefer cherry-pick when the branch contains any experimentation**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git cherry-pick <commit1> <commit2>
```

Use this when:
- only some commits are ready
- the branch was exploratory
- you want tighter integration control

- [ ] **Step 3: Use merge only when the branch stayed fully coherent**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git merge --no-ff backend/queue-position-bug
```

Use this only when:
- every commit on the branch belongs together
- the branch stayed narrow
- verification is already complete

- [ ] **Step 4: Re-run verification on the integration branch**

Run the exact proof command for the merged scope, for example:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_service_point
```

or broader when needed:

```bash
bench --site site1.localhost run-tests --app clinic_flow
```

### Task 6: Clean Up the Completed Worktree Branch

**Files:**
- Worktree path only for the completed task

- [ ] **Step 1: Verify the worktree branch is fully integrated**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git branch --merged backend/receptionist-queue-refactor
```

Expected:
- the completed scoped branch appears in the merged list

- [ ] **Step 2: Remove the worktree first**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git worktree remove .worktrees/backend-queue-position-bug
```

- [ ] **Step 3: Delete the merged local branch**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git branch -d backend/queue-position-bug
```

- [ ] **Step 4: Leave quarantined branches alone**

Rule:
- do not touch `doctor-v2/encounter-slice1` casually
- do not delete stashes or backup tags during ordinary cleanup

### Task 7: Rules for `main`

**Files:**
- Main repo path only

- [ ] **Step 1: Do not treat `main` as a stale feature branch**

Rule:
- `main` is an anchor branch, not ordinary cleanup debris

- [ ] **Step 2: Defer `main` realignment until after the workflow stabilizes**

Do this only after:
- several scoped branches have been handled cleanly
- `backend/receptionist-queue-refactor` is acting as a disciplined integration branch
- you are ready to choose whether `main` should fast-forward or be replaced by this integration line

### Task 8: Operating Rule Going Forward

**Files:**
- No file changes required for this task

- [ ] **Step 1: Use the main repo path only for these actions**

Allowed:
- planning
- status checks
- branch review
- worktree creation
- cherry-pick / merge back
- verification after integration

- [ ] **Step 2: Do not do feature implementation in the main repo path**

Forbidden:
- direct frontend feature edits
- direct backend feature edits
- branch switching to inspect other work

- [ ] **Step 3: Repeat the same loop for every task**

Loop:

```text
scope sentence -> branch name -> dedicated worktree -> small commits -> verify -> cherry-pick/merge -> clean up worktree
```

---

Plan complete and saved to `docs/superpowers/plans/2026-04-22-scoped-branch-handling-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
