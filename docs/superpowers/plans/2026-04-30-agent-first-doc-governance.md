# Agent-First Documentation Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the documentation set into a lean, agent-first authority model without losing useful setup, rationale, or handoff context.

**Architecture:** Keep the canonical authority path small: `CONTEXT_INDEX.md` routes agent context, `AGENTS.md` defines guardrails, `ARCHITECTURE.md` defines runtime behavior, and focused policy docs own domain-specific rules. Demote `ONBOARDING.md` into a non-authoritative runbook pointer, consolidate Arrival Counter notes, and archive execution-only planning artifacts after durable facts are represented in canonical docs.

**Tech Stack:** Markdown documentation only; no Frappe runtime code, DocTypes, patches, fixtures, or frontend code changes.

---

## File Structure

**Create:**

- `docs/runbooks/local-setup-and-verification.md` — human/operator setup and verification commands extracted from `ONBOARDING.md`; explicitly non-authoritative.
- `docs/runbooks/README.md` — states that runbooks are operational help, not source-of-truth docs.
- `docs/notes/arrival-counter.md` — canonical current Arrival Counter handoff note.
- `docs/archive/README.md` — states archived docs are historical and non-authoritative.
- `docs/archive/notes/README.md` — explains archived notes are superseded handoff records.
- `docs/archive/plans/README.md` — explains archived plans are execution records, not current instructions.

**Modify:**

- `CONTEXT_INDEX.md` — make the agent-first authority path the single read-order source.
- `AGENTS.md` — align general read guidance with `CONTEXT_INDEX.md`; remove `ONBOARDING.md` from agent read path if present.
- `ARCHITECTURE.md` — only touch if stale current-runtime wording is discovered while reconciling `ONBOARDING.md` or Arrival Counter notes.
- `ONBOARDING.md` — replace with a short compatibility pointer to `CONTEXT_INDEX.md` and the setup runbook.
- `README.md` — point humans to the setup runbook instead of `ONBOARDING.md`.
- `docs/service-point-policy.md` — replace transitional language with current canonical Service Point language.
- `docs/healthcare-compatibility-audit.md` — clarify patch-managed fields vs compatibility-debt fields.
- `docs/notes/README.md` — mention the canonical-note pattern and archive policy for superseded notes.

**Move or archive after extraction:**

- `docs/notes/arrival-counter-v1-frontend.md`
- `docs/notes/arrival-frontend-contract-enrichment.md`
- `docs/notes/2026-04-28-arrival-counter-drift-fixes.md`
- `docs/superpowers/plans/2026-04-21-claude-code-handoff-prompt.md`
- `docs/superpowers/plans/2026-04-21-claude-code-handoff-prompt-slice-2.md`
- `docs/superpowers/plans/2026-04-21-claude-code-handoff-prompt-slice-3.md`
- `docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md`

**Verify:**

- `git status --short`
- `grep -R "ONBOARDING.md" -n CLAUDE.md AGENTS.md ARCHITECTURE.md CONTEXT_INDEX.md README.md docs --include='*.md'`
- `grep -R "site1.localhost:8000/arrival-counter\|/arrival-counter" -n ONBOARDING.md README.md ARCHITECTURE.md CONTEXT_INDEX.md AGENTS.md docs --include='*.md'`
- `grep -R "will become preferre[d]\|v[N]ext" -n docs/service-point-policy.md ARCHITECTURE.md AGENTS.md CONTEXT_INDEX.md --include='*.md'`
- `grep -R "Checked In.*Queue Entry\|queue-entry creation" -n ONBOARDING.md README.md ARCHITECTURE.md docs --include='*.md'`

---

### Task 1: Align Authority Stack

**Files:**

- Modify: `CONTEXT_INDEX.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md` only if it contradicts the final authority path

- [ ] **Step 1: Read current authority docs**

Run:

```bash
sed -n '1,140p' CONTEXT_INDEX.md
sed -n '1,190p' AGENTS.md
sed -n '1,110p' CLAUDE.md
```

Expected: identify the current read-order wording and any mismatch between `CONTEXT_INDEX.md`, `AGENTS.md`, and `CLAUDE.md`.

- [ ] **Step 2: Update `CONTEXT_INDEX.md` authority model**

Edit `CONTEXT_INDEX.md` so the top read order is agent-first:

```markdown
## Active Authority Order

Read these first, in order:

1. [CONTEXT_INDEX.md](/home/raghu/frappe-bench/apps/clinic_flow/CONTEXT_INDEX.md:1)
2. [AGENTS.md](/home/raghu/frappe-bench/apps/clinic_flow/AGENTS.md:1)
3. [ARCHITECTURE.md](/home/raghu/frappe-bench/apps/clinic_flow/ARCHITECTURE.md:1)

`CONTEXT_INDEX.md` is the context router. `AGENTS.md` is the agent guardrail source. `ARCHITECTURE.md` is the current runtime architecture source.
```

Preserve the existing focused-policy list, but add this sentence:

```markdown
Focused policy docs refine the authority stack for a task-specific area; they do not replace it.
```

- [ ] **Step 3: Update historical-doc rule**

In `CONTEXT_INDEX.md`, ensure the historical-doc section includes:

```markdown
Plans, specs, archived notes, and branch handoff prompts are historical unless a current authority doc explicitly promotes them.
```

- [ ] **Step 4: Align `AGENTS.md` general read list**

In `AGENTS.md`, update the general-work read list so it references:

```markdown
1. `CONTEXT_INDEX.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
```

Keep task-specific docs such as `docs/healthcare-compatibility-audit.md` in the relevant task sections, not as a universal first-read doc.

- [ ] **Step 5: Verify authority references**

Run:

```bash
grep -R "Read these first\|For general work\|ONBOARDING.md" -n CLAUDE.md AGENTS.md ARCHITECTURE.md CONTEXT_INDEX.md README.md docs --include='*.md'
```

Expected: `CONTEXT_INDEX.md` is the only doc defining the canonical read order. `ONBOARDING.md` is not presented as required agent context.

- [ ] **Step 6: Checkpoint**

Run:

```bash
git diff -- CONTEXT_INDEX.md AGENTS.md CLAUDE.md
```

Expected: diff only changes authority/read-order wording. No runtime or product semantics changed.

---

### Task 2: Demote `ONBOARDING.md` Into A Runbook Pointer

**Files:**

- Create: `docs/runbooks/README.md`
- Create: `docs/runbooks/local-setup-and-verification.md`
- Modify: `ONBOARDING.md`
- Modify: `README.md`

- [ ] **Step 1: Create runbook folder docs**

Create `docs/runbooks/README.md` with:

```markdown
# Runbooks

Runbooks are human/operator guides for setup, verification, and repeatable maintenance procedures.

They are not source-of-truth architecture documents. If a runbook conflicts with `CONTEXT_INDEX.md`, `AGENTS.md`, `ARCHITECTURE.md`, or a focused policy doc, the authority stack wins.
```

- [ ] **Step 2: Extract setup and verification content**

Create `docs/runbooks/local-setup-and-verification.md` with this structure:

```markdown
# Local Setup And Verification

This is a human/operator runbook for local Clinic Flow setup and verification.

It is not an agent authority document. For agent context, start with `CONTEXT_INDEX.md`.

## Bench Context

- App: `clinic_flow`
- Framework: Frappe v16
- Base app: `healthcare`
- Default local site: `site1.localhost`

## Install Into An Existing Bench

```bash
cd /home/raghu/frappe-bench
bench --site site1.localhost install-app clinic_flow
bench --site site1.localhost migrate
```

## Common Verification Commands

```bash
cd /home/raghu/frappe-bench
bench --site site1.localhost run-tests --app clinic_flow
```

## Active Local Routes

- `/clinic/arrival-counter` — canonical Arrival Counter head-app route
- Desk pages such as `arrival_counter`, `receptionist_dashboard`, and `doctor_workspace_v2` remain available according to current architecture and compatibility rules.

## Authority Reminder

This runbook may contain operational shortcuts. Runtime behavior and agent rules are governed by `CONTEXT_INDEX.md`, `AGENTS.md`, `ARCHITECTURE.md`, and focused policy docs.
```

If `ONBOARDING.md` contains useful commands not represented above, copy them into the correct section only after checking they are still current.

- [ ] **Step 3: Replace `ONBOARDING.md` with compatibility pointer**

Replace `ONBOARDING.md` content with:

```markdown
# ONBOARDING.md

This file is deprecated for agent context.

For AI agents, start with `CONTEXT_INDEX.md`.

For local setup and verification, use `docs/runbooks/local-setup-and-verification.md`.

This file remains as a compatibility pointer for older references created during the Claude-to-Codex transition.
```

- [ ] **Step 4: Update `README.md` setup pointer**

Change the setup sentence in `README.md` from pointing to `ONBOARDING.md` to:

```markdown
For project-specific setup and verification, read `docs/runbooks/local-setup-and-verification.md`.
```

- [ ] **Step 5: Verify stale onboarding claims are gone**

Run:

```bash
grep -R "site1.localhost:8000/arrival-counter\|Checked In.*Queue Entry\|queue-entry creation" -n ONBOARDING.md README.md docs/runbooks --include='*.md'
```

Expected: no stale `/arrival-counter` route as current guidance; no wording that makes legacy appointment check-in the source of queue authority.

- [ ] **Step 6: Checkpoint**

Run:

```bash
git diff -- ONBOARDING.md README.md docs/runbooks/README.md docs/runbooks/local-setup-and-verification.md
```

Expected: `ONBOARDING.md` is a pointer, setup content moved to a non-authoritative runbook, and `README.md` points to the runbook.

---

### Task 3: Refresh Focused Policy Drift

**Files:**

- Modify: `docs/service-point-policy.md`
- Modify: `docs/healthcare-compatibility-audit.md`
- Modify: `ARCHITECTURE.md` only if a direct contradiction is discovered

- [ ] **Step 1: Find transitional Service Point wording**

Run:

```bash
grep -n "v[N]ext\|will become preferre[d]\|preferred source\|canonical" docs/service-point-policy.md ARCHITECTURE.md
```

Expected: identify any wording that describes Service Point as future/preferred-later rather than current canonical identity.

- [ ] **Step 2: Update Service Point policy language**

In `docs/service-point-policy.md`, replace future-tense wording with current-tense wording. Use this canonical phrasing where appropriate:

```markdown
`Service Point` is the canonical queue identity for new queue-code reads. It provides the durable queue code and display-token prefix independently of legacy `Medical Department.custom_dept_abbr` fallback behavior.
```

Do not remove documented legacy fallback behavior unless code has also been changed and verified.

- [ ] **Step 3: Clarify Healthcare custom-field ownership**

Read:

```bash
sed -n '1,180p' docs/healthcare-compatibility-audit.md
sed -n '270,360p' ARCHITECTURE.md
sed -n '1,220p' clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py
```

Then update `docs/healthcare-compatibility-audit.md` to distinguish:

```markdown
- actively patch-managed Healthcare-facing fields required by current runtime behavior
- legacy queue-identity custom fields that may remain on existing sites as compatibility debt
- fields that should not be reintroduced as active queue authority
```

- [ ] **Step 4: Verify focused policy wording**

Run:

```bash
grep -R "will become preferre[d]\|v[N]ext" -n docs/service-point-policy.md docs/healthcare-compatibility-audit.md ARCHITECTURE.md AGENTS.md CONTEXT_INDEX.md --include='*.md'
```

Expected: no stale future-tense Service Point authority wording remains in active docs.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- docs/service-point-policy.md docs/healthcare-compatibility-audit.md ARCHITECTURE.md
```

Expected: only documentation wording changes; no behavior claims that exceed live code.

---

### Task 4: Consolidate Arrival Counter Notes

**Files:**

- Create: `docs/notes/arrival-counter.md`
- Modify: `docs/notes/README.md`
- Move after extraction: selected superseded Arrival Counter notes

- [ ] **Step 1: Read existing Arrival Counter notes**

Run:

```bash
sed -n '1,180p' docs/notes/arrival-counter-v1-frontend.md
sed -n '1,180p' docs/notes/arrival-counter-standalone-shell.md
sed -n '1,180p' docs/notes/arrival-counter-ui-stabilization.md
sed -n '1,140p' docs/notes/arrival-frontend-contract-enrichment.md
sed -n '1,170p' docs/notes/2026-04-28-arrival-counter-drift-fixes.md
```

Expected: identify durable current facts and historical details that should not remain active guidance.

- [ ] **Step 2: Create canonical Arrival Counter note**

Create `docs/notes/arrival-counter.md` with this structure:

```markdown
# Arrival Counter

## Current State

- Canonical operator route: `/clinic/arrival-counter`.
- The Arrival Counter uses the standalone head-app shell for the current product direction.
- Backend queue authority remains in Clinic Flow APIs and Queue Entry behavior, not in frontend state.
- Legacy Desk pages remain compatibility/coexistence surfaces unless a later authority doc says otherwise.

## Durable Decisions

- Arrival scanning and marking-arrived behavior must not allocate new queue authority in the frontend.
- Display-token formatting remains a presentation concern governed by `docs/token-display-policy.md`.
- Service Point remains the preferred queue identity model governed by `docs/service-point-policy.md`.

## Verification

```bash
cd /home/raghu/frappe-bench
bench --site site1.localhost run-tests --module clinic_flow.tests.test_arrival_counter_shell
```

## Historical Notes

- Earlier v1 iframe/static-hosting work was superseded by the standalone shell direction.
- Drift-fix notes are historical incident records after their durable decisions are captured here and in core docs.

## Out Of Scope

- This note does not define queue authority.
- This note does not replace `ARCHITECTURE.md` or focused policy docs.
```

- [ ] **Step 3: Update notes README**

In `docs/notes/README.md`, add:

```markdown
When several notes exist for the same feature track, keep one canonical current note and archive superseded notes after durable facts are extracted.
```

- [ ] **Step 4: Archive superseded Arrival Counter notes**

Create `docs/archive/notes/` if it does not exist, then move these files there after verifying their durable facts are represented in `docs/notes/arrival-counter.md`:

```bash
git mv docs/notes/arrival-counter-v1-frontend.md docs/archive/notes/arrival-counter-v1-frontend.md
git mv docs/notes/arrival-frontend-contract-enrichment.md docs/archive/notes/arrival-frontend-contract-enrichment.md
git mv docs/notes/2026-04-28-arrival-counter-drift-fixes.md docs/archive/notes/2026-04-28-arrival-counter-drift-fixes.md
```

Keep `docs/notes/arrival-counter-standalone-shell.md` and `docs/notes/arrival-counter-ui-stabilization.md` only if they are still actively useful. If their durable content is fully represented in `docs/notes/arrival-counter.md`, move them too in a separate reviewed step.

- [ ] **Step 5: Verify active Arrival Counter note set**

Run:

```bash
find docs/notes docs/archive/notes -maxdepth 1 -type f -name '*arrival*' -print | sort
grep -R "/clinic/arrival-counter\|/arrival-counter" -n docs/notes docs/archive/notes --include='*.md'
```

Expected: active notes point to `/clinic/arrival-counter` as canonical route; archived notes may contain historical route references only if clearly archived.

---

### Task 5: Archive Execution-Only Planning Artifacts

**Files:**

- Create: `docs/archive/README.md`
- Create: `docs/archive/plans/README.md`
- Move selected stale plans from `docs/superpowers/plans/` to `docs/archive/plans/`

- [ ] **Step 1: Create archive README**

Create `docs/archive/README.md` with:

```markdown
# Archive

Archived documents are historical records. They are not current source-of-truth docs unless a current authority document explicitly links to and promotes a specific archived document.

For current agent context, start with `CONTEXT_INDEX.md`.
```

- [ ] **Step 2: Create archived plans README**

Create `docs/archive/plans/README.md` with:

```markdown
# Archived Plans

These plans are execution records from previous slices, branches, or handoffs.

They may explain historical intent, but they are not current implementation instructions. If an archived plan conflicts with `CONTEXT_INDEX.md`, `AGENTS.md`, `ARCHITECTURE.md`, or a focused policy doc, the current authority docs win.
```

- [ ] **Step 3: Move handoff and branch-specific plans**

Run:

```bash
git mv docs/superpowers/plans/2026-04-21-claude-code-handoff-prompt.md docs/archive/plans/2026-04-21-claude-code-handoff-prompt.md
git mv docs/superpowers/plans/2026-04-21-claude-code-handoff-prompt-slice-2.md docs/archive/plans/2026-04-21-claude-code-handoff-prompt-slice-2.md
git mv docs/superpowers/plans/2026-04-21-claude-code-handoff-prompt-slice-3.md docs/archive/plans/2026-04-21-claude-code-handoff-prompt-slice-3.md
git mv docs/superpowers/plans/2026-04-21-git-execution-plan-for-claude-code.md docs/archive/plans/2026-04-21-git-execution-plan-for-claude-code.md
```

- [ ] **Step 4: Review superseded monolithic Arrival Counter plan**

Compare:

```bash
ls docs/superpowers/plans/*arrival-counter*standalone-shell*.md
```

If `docs/superpowers/plans/2026-04-28-arrival-counter-standalone-shell.md` is fully superseded by backend/frontend split plans and the canonical Arrival Counter note, move it:

```bash
git mv docs/superpowers/plans/2026-04-28-arrival-counter-standalone-shell.md docs/archive/plans/2026-04-28-arrival-counter-standalone-shell.md
```

- [ ] **Step 5: Verify archive state**

Run:

```bash
find docs/archive -maxdepth 3 -type f -name '*.md' | sort
find docs/superpowers/plans -maxdepth 1 -type f -name '*handoff*' -o -name '*git-execution*'
```

Expected: handoff/git-execution plans are archived; no matching one-time handoff artifacts remain in active plans.

---

### Task 6: Final Documentation Verification

**Files:**

- Review all changed docs

- [ ] **Step 1: Check worktree**

Run:

```bash
git status --short
```

Expected: only documentation files changed or moved.

- [ ] **Step 2: Check authority references**

Run:

```bash
grep -R "ONBOARDING.md" -n CLAUDE.md AGENTS.md ARCHITECTURE.md CONTEXT_INDEX.md README.md docs --include='*.md'
```

Expected: references either point to the deprecated compatibility pointer or human runbook context; no agent read path requires `ONBOARDING.md`.

- [ ] **Step 3: Check route drift**

Run:

```bash
grep -R "site1.localhost:8000/arrival-counter\|/arrival-counter" -n ONBOARDING.md README.md ARCHITECTURE.md CONTEXT_INDEX.md AGENTS.md docs --include='*.md'
```

Expected: active docs use `/clinic/arrival-counter` as canonical route. Historical archived docs may contain old references only when archived context is clear.

- [ ] **Step 4: Check Service Point transition drift**

Run:

```bash
grep -R "will become preferre[d]\|v[N]ext" -n AGENTS.md ARCHITECTURE.md CONTEXT_INDEX.md docs --include='*.md'
```

Expected: no active authority or policy doc describes Service Point as future-only.

- [ ] **Step 5: Check legacy queue authority wording**

Run:

```bash
grep -R "Checked In.*Queue Entry\|queue-entry creation\|source of queue authority" -n ONBOARDING.md README.md ARCHITECTURE.md AGENTS.md CONTEXT_INDEX.md docs --include='*.md'
```

Expected: no active doc says legacy appointment check-in is the source of queue authority. Compatibility-only references are acceptable.

- [ ] **Step 6: Optional docs-only graph update**

If code files were not changed, do not run a full code graph update. If graphify is used for docs-only validation, run it on the docs subset rather than the whole repo:

```bash
graphify docs --no-viz
```

Expected: docs-only graph/report can be used for follow-up review without polluting the whole-repo graph with frontend dependency markdown.

- [ ] **Step 7: Final diff review**

Run:

```bash
git diff --stat
git diff -- README.md ONBOARDING.md CONTEXT_INDEX.md AGENTS.md docs
```

Expected: changes match this plan; no runtime code, fixtures, patches, DocTypes, or frontend files were changed.

---

## Self-Review

- Spec coverage: covers authority drift, `ONBOARDING.md` demotion, focused policy refresh, Arrival Counter note consolidation, plan archiving, and final verification.
- Placeholder scan: no `TBD`, `TODO`, or unspecified future implementation steps remain.
- Scope check: this is documentation-only and intentionally avoids runtime code changes.
- Risk control: moves happen only after durable facts are represented in canonical docs; `ONBOARDING.md` is replaced with a compatibility pointer rather than deleted immediately.
