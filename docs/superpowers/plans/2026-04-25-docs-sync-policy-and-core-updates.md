# Documentation Sync Policy and Core Docs Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standing documentation policy that makes post-implementation summaries and core-doc updates the default after every behavior-changing implementation, with exceptions only when explicitly justified in the summary note.

**Architecture:** Implement this as a docs-only slice with one source-of-process truth (`AGENTS.md`) plus synchronized architecture/behavior docs (`ARCHITECTURE.md`, `docs/receptionist-backend-policy.md`, `docs/notes/README.md`). The policy should be strong by default: after implementation, docs updates are expected unless the implementation summary explicitly explains why no core-doc change was needed.

**Tech Stack:** Markdown docs, git worktree workflow, targeted grep/read verification, no runtime code changes

---

## Scope

In scope:

- Add repo policy text requiring post-implementation docs updates by default.
- Update core docs for the new special-overflow backend behavior.
- Update notes policy so each implementation has a summary note.
- Validate consistency across process docs and runtime docs.

Out of scope:

- No Python/JS/DocType behavior changes.
- No test logic changes.
- No bench migrations.
- No base app edits (`apps/healthcare/`).

## File Structure

- Modify: `AGENTS.md`
  - Add authoritative policy: every implementation must produce summary note + relevant core-doc updates.
- Modify: `ARCHITECTURE.md`
  - Reflect special-overflow runtime truth in queue-entry and admission sections.
- Modify: `docs/receptionist-backend-policy.md`
  - Add special-overflow authorization subsection under special policy.
- Modify: `docs/notes/README.md`
    - Add required-after-implementation note workflow.
- Modify (if needed): `docs/notes/special-overflow-admission-backend-slice.md`
  - Ensure summary aligns with merged implementation and new policy wording.

---

### Task 1: Create a Docs-Only Worktree and Baseline

**Files:**

- Verify: `/home/raghu/frappe-bench/apps/clinic_flow`
- Create worktree: `.worktrees/docs-implementation-sync-policy`

- [ ] **Step 1: Verify base branch is clean**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git status --short --branch
git worktree list
```

Expected:

```text
## backend/receptionist-queue-refactor
```

- [ ] **Step 2: Create docs-only worktree**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git worktree add .worktrees/docs-implementation-sync-policy -b docs/implementation-sync-policy
```

Expected:

```text
Preparing worktree (new branch 'docs/implementation-sync-policy')
```

- [ ] **Step 3: Move into worktree for all edits**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow/.worktrees/docs-implementation-sync-policy
git status --short --branch
```

Expected:

```text
## docs/implementation-sync-policy
```

---

### Task 2: Add the Repository-Level Documentation Sync Policy

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Write failing policy-presence check command**

Run:

```bash
grep -n "Documentation Update Policy" AGENTS.md
```

Expected: no matches.

- [ ] **Step 2: Add policy block to `AGENTS.md`**

Insert this block after `## Safe Defaults` heading and before the existing bullet list:

```md
## Documentation Update Policy

After every implementation slice that changes behavior, schema, API contract, workflow, operational semantics, or integration boundaries:

- write an implementation summary note in `docs/notes/<scope>.md`
- update relevant core docs so they reflect live code behavior
- do not treat specs/plans/commit messages as substitutes for core-doc updates

Minimum completion criteria after implementation:

- `docs/notes/<scope>.md` includes:
  - what changed
  - what was verified
  - what stayed out of scope
  - next integration step
- `ARCHITECTURE.md` is updated when runtime behavior, schema meaning, or authority boundaries changed
- relevant policy docs in `docs/` are updated when operational rules changed
- `AGENTS.md` is updated only when repo guardrails or workflow rules changed

If no core-doc update is needed, state that explicitly in the implementation summary note with a short reason.
```

- [ ] **Step 3: Verify inserted policy text exists**

Run:

```bash
grep -n "Documentation Update Policy\|Minimum completion criteria after implementation\|no core-doc update is needed" AGENTS.md
```

Expected: matching lines for all three phrases.

- [ ] **Step 4: Commit AGENTS policy change**

Run:

```bash
git status --short
git add AGENTS.md
git commit -m "docs: add implementation-to-docs sync policy"
```

---

### Task 3: Update Architecture Truth for Special Overflow

**Files:**

- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Add overflow fields under Queue Entry model section**

In `ARCHITECTURE.md`, under `### Queue entry` after the bullet list that includes `priority` and special-audit fields, add:

```md
Overflow-audit fields are now active for authorized special-capacity exceptions:

- `is_overflow`
- `overflow_reason`
- `overflow_authorized_by`
- `overflow_authorized_at`
- `overflow_source`
```

- [ ] **Step 2: Add admission overflow behavior under receptionist runtime section**

In `ARCHITECTURE.md`, under `### Receptionist/admission runtime` after the existing ownership bullets, add:

```md
The admission runtime also owns special-overflow authorization behavior.

Current rules:

- special remains `priority = special`, not emergency
- when capacity is exhausted, special booking can proceed only through explicit overflow authorization
- overflow authorization records audit metadata on `Queue Entry`
- phone special overflow keeps `channel = phone`
- live walk-in special overflow may be created directly in `Arrived` state
- booked/arrived special entries are not doctor-callable until they become `Ready Near Doctor`
```

- [ ] **Step 3: Add canonical model clarification in token/priority section**

In `ARCHITECTURE.md`, inside `## 5. Token and Priority Model` near canonical priority text, add:

```md
Special behavior now has two distinct concerns:

- admission-side overflow authorization at capacity boundary
- doctor-side explicit pull (`Call Next Special`) for eligible ready patients

This does not create a separate persisted special queue and does not reuse emergency semantics.
```

- [ ] **Step 4: Verify architecture updates**

Run:

```bash
grep -n "is_overflow\|special-overflow authorization\|separate persisted special queue" ARCHITECTURE.md
```

Expected: all three phrases present.

- [ ] **Step 5: Commit architecture update**

Run:

```bash
git status --short
git add ARCHITECTURE.md
git commit -m "docs: sync architecture with special overflow backend behavior"
```

---

### Task 4: Update Receptionist Backend Policy for Overflow Authorization

**Files:**

- Modify: `docs/receptionist-backend-policy.md`

- [ ] **Step 1: Add explicit subsection under Special Policy**

In `docs/receptionist-backend-policy.md`, under `## 6. Special Policy` after existing bullets, insert:

```md
### Special overflow authorization

When capacity is available, special bookings follow normal special booking behavior.

When capacity is exhausted:

- special booking may continue only through explicit overflow authorization
- overflow authorization is backend-owned, not a frontend-only convention
- overflow requires:
  - authorized role
  - reason
  - source
- overflow is recorded explicitly on `Queue Entry` instead of silently changing capacity

Backend shape:

- `priority = special`
- `is_overflow = 1` only when capacity was bypassed
- overflow audit fields are persisted on `Queue Entry`
- phone overflow keeps `channel = phone`
- live walk-in overflow can mark entry `Arrived` at booking time
- special entries are doctor-callable only after becoming `Ready Near Doctor`
```

- [ ] **Step 2: Add lifecycle boundary statement**

In the same section, add this line after the subsection:

```md
Lifecycle boundary remains: `booking/arrival -> reception completion -> Ready Near Doctor -> doctor consultation`.
```

- [ ] **Step 3: Verify policy text exists**

Run:

```bash
grep -n "Special overflow authorization\|is_overflow\|booking/arrival -> reception completion" docs/receptionist-backend-policy.md
```

Expected: all three phrase matches exist.

- [ ] **Step 4: Commit receptionist policy update**

Run:

```bash
git status --short
git add docs/receptionist-backend-policy.md
git commit -m "docs: add receptionist special overflow authorization policy"
```

---

### Task 5: Enforce Implementation Summary Requirement in Notes Guide

**Files:**

- Modify: `docs/notes/README.md`

- [ ] **Step 1: Add mandatory post-implementation section**

In `docs/notes/README.md`, after `## Working Rule`, add:

```md
## Required After Implementation

After every implementation slice that changes system behavior:

1. write or update a scope note in this folder
2. update relevant core docs so repo documentation matches live code behavior
3. treat docs updates as the default expectation
4. do not rely on specs/plans alone as the lasting implementation record

Implementation notes are mandatory handoff summaries, not optional extras.

If a slice truly does not need a core-doc update, the note must say why.
```

- [ ] **Step 2: Verify readme policy language exists**

Run:

```bash
grep -n "Required After Implementation\|mandatory handoff summaries" docs/notes/README.md
```

Expected: both phrase matches present.

- [ ] **Step 3: Commit notes policy update**

Run:

```bash
git status --short
git add docs/notes/README.md
git commit -m "docs: require implementation summary notes after behavior changes"
```

---

### Task 6: Align Existing Special-Overflow Summary Note with New Policy

**Files:**

- Modify: `docs/notes/special-overflow-admission-backend-slice.md`

- [ ] **Step 1: Ensure required sections are present**

Update the note to include these section headings exactly:

```md
## Goal
## Implemented in This Slice
## Verification Completed
## Core Docs Updated
## Out of Scope
## Next Integration Step
```

- [ ] **Step 2: Add explicit core-doc update status**

Under `## Core Docs Updated`, include checklist values:

```md
- `ARCHITECTURE.md`: <updated in this docs slice>
- `docs/receptionist-backend-policy.md`: <updated in this docs slice>
- `AGENTS.md`: <updated in this docs slice>
- `docs/notes/README.md`: <updated in this docs slice>
```

- [ ] **Step 3: Verify summary note completeness**

Run:

```bash
grep -n "Core Docs Updated\|AGENTS.md\|docs/notes/README.md" docs/notes/special-overflow-admission-backend-slice.md
```

Expected: all three phrase matches present.

- [ ] **Step 4: Commit summary note alignment**

Run:

```bash
git status --short
git add docs/notes/special-overflow-admission-backend-slice.md
git commit -m "docs: align special overflow summary note with new docs policy"
```

---

### Task 7: Final Docs Consistency Verification

**Files:**

- Verify: `AGENTS.md`
- Verify: `ARCHITECTURE.md`
- Verify: `docs/receptionist-backend-policy.md`
- Verify: `docs/notes/README.md`
- Verify: `docs/notes/special-overflow-admission-backend-slice.md`

- [ ] **Step 1: Run cross-doc keyword consistency checks**

Run:

```bash
grep -n "Documentation Update Policy\|implementation summary" AGENTS.md
grep -n "is_overflow\|special-overflow authorization" ARCHITECTURE.md
grep -n "Special overflow authorization\|is_overflow" docs/receptionist-backend-policy.md
grep -n "Required After Implementation" docs/notes/README.md
grep -n "Core Docs Updated" docs/notes/special-overflow-admission-backend-slice.md
```

Expected: each command returns at least one match.

- [ ] **Step 2: Verify changed-files scope**

Run:

```bash
git status --short
git diff --name-only backend/receptionist-queue-refactor..HEAD
```

Expected file scope only in:

```text
AGENTS.md
ARCHITECTURE.md
docs/receptionist-backend-policy.md
docs/notes/README.md
docs/notes/special-overflow-admission-backend-slice.md
```

- [ ] **Step 3: Final docs-only verification**

Run:

```bash
git log --oneline -n 8
```

Expected: latest commits are docs-only and match this policy slice.

- [ ] **Step 4: Confirm clean branch state**

Run:

```bash
git status --short --branch
```

Expected: no unstaged or uncommitted changes remain.

---

## Self-Review Notes

- Spec coverage: plan includes both required outcomes from approval — implementation summary policy and core-doc updates.
- Placeholder scan: no `TBD`/`TODO` placeholders left; each task has explicit file paths and command-level verification.
- Type/name consistency: “Documentation Update Policy”, “Required After Implementation”, and “Core Docs Updated” are reused consistently across tasks.
- Scope check: docs-only slice; no runtime code/test behavior changes proposed.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-25-docs-sync-policy-and-core-updates.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
