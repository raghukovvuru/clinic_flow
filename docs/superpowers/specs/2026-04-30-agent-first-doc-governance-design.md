# Agent-First Documentation Governance Design

**Status:** Approved direction for implementation planning  
**Date:** 2026-04-30  
**Primary audience:** AI agents working safely in `clinic_flow`

---

## Goal

Make the documentation set leaner, tighter, and safer for AI agents by defining one canonical authority path, demoting transition-era onboarding material, consolidating overlapping notes, and treating plans/specs as historical unless explicitly promoted.

## Problem

The current documentation set contains useful context, but the authority boundaries are not tight enough for safe agent work.

Observed issues from the read-only audit:

- `ONBOARDING.md` was created during a Claude-to-Codex transition and now acts like a fifth start-here document.
- Some setup/onboarding details have drifted from current architecture, including arrival-counter route wording and legacy appointment check-in semantics.
- `docs/superpowers/plans/` contains many large execution artifacts that are useful historically but too noisy for agent context.
- Arrival Counter has several overlapping notes and plans from the v1 frontend, standalone shell, drift-fix, and stabilization phases.
- Focused policy docs are mostly useful, but some transitional language remains, especially around Service Point becoming preferred even though it is now canonical.

The desired outcome is not fewer docs for its own sake. The desired outcome is fewer docs that can claim authority.

## Design Principles

1. One question should have one authoritative answer.
2. Agent safety is more important than human onboarding convenience.
3. Historical plans and specs are useful as rationale, but not as current instructions.
4. Runbooks can explain commands and procedures, but they must not define runtime architecture.
5. Notes are short handoff summaries, not a second documentation system.
6. Path churn should be minimized in the first implementation slice.

## Target Authority Model

For agent work, the canonical read path becomes:

1. `CONTEXT_INDEX.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
4. task-specific focused policy docs
5. recent implementation notes only when continuing an active work track

`CLAUDE.md` remains only as a compatibility shim if needed by Claude-based tools. It must not become a competing rulebook.

`ONBOARDING.md` is removed from the agent authority path.

## Documentation Tiers

| Tier | Purpose | Files |
|---|---|---|
| Tier 0 | Entry/router | `CONTEXT_INDEX.md` |
| Tier 1 | Agent guardrails | `AGENTS.md` |
| Tier 2 | Runtime architecture | `ARCHITECTURE.md` |
| Tier 3 | Focused policy | `docs/service-point-policy.md`, `docs/token-display-policy.md`, `docs/receptionist-backend-policy.md`, `docs/healthcare-compatibility-audit.md` |
| Tier 4 | Recent handoff context | `docs/notes/*.md` |
| Tier 5 | Human operations | `docs/runbooks/*.md`, `docs/git-workflow-guide.md` |
| Tier 6 | Historical rationale | `docs/superpowers/specs/*.md`, archived plans/specs/notes |

## ONBOARDING.md Disposition

`ONBOARDING.md` should no longer be agent-facing authority.

The preferred implementation is to demote it into a human/operator runbook:

- Extract durable setup and verification commands into `docs/runbooks/local-setup-and-verification.md`.
- Add a runbook authority disclaimer: if the runbook conflicts with the authority stack, the authority stack wins.
- Replace `ONBOARDING.md` with a short compatibility pointer, instead of deleting it immediately.

The temporary compatibility pointer should direct agents to `CONTEXT_INDEX.md` and humans to the runbook.

## Active Conflict Fixes

The first cleanup slice should fix known current conflicts before archiving large amounts of material:

- Align `AGENTS.md` general read guidance with `CONTEXT_INDEX.md`.
- Make `CONTEXT_INDEX.md` the single source for read order.
- Remove `ONBOARDING.md` from agent read paths.
- Update stale arrival-counter route references to `/clinic/arrival-counter` where the text is current guidance.
- Update legacy appointment check-in wording so it is compatibility-only, not queue authority.
- Update Service Point policy language from transitional wording to current canonical wording.
- Refresh Healthcare compatibility wording to distinguish patch-managed fields from compatibility debt.

## Notes Consolidation

Arrival Counter notes should be consolidated into one current handoff note.

Preferred canonical note:

- `docs/notes/arrival-counter.md`

It should preserve only durable decision-quality context:

- current canonical route
- active shell model
- backend authority boundary
- coexistence with legacy Desk pages
- important verification commands
- out-of-scope historical details

Superseded notes should either be archived or reduced to short pointers after the canonical note exists.

## Plans And Specs Policy

Plans are execution artifacts. Specs are rationale artifacts.

Rules:

- Plans are not current implementation instructions after the slice is complete.
- Specs are historical rationale unless a current authority doc links to them as active policy.
- Handoff prompts and branch-specific execution plans should be archived first.
- Large monolithic plans superseded by split plans and implementation notes should be archived or marked superseded.

## Non-Goals

- Do not rewrite the entire documentation set in one pass.
- Do not move policy docs into a new directory in the first slice unless necessary.
- Do not delete historical plans/specs before their durable decisions are represented in canonical docs.
- Do not change runtime code.
- Do not modify the Healthcare base app.

## Acceptance Criteria

The implementation is successful when:

- A new agent can determine the correct read path from `CONTEXT_INDEX.md` without reading `ONBOARDING.md`.
- `AGENTS.md` and `CONTEXT_INDEX.md` agree on the authority model.
- `ONBOARDING.md` no longer contains active architecture guidance.
- Setup and verification guidance lives in a clearly non-authoritative runbook.
- Arrival Counter has one canonical current note.
- Archived or superseded plans are explicitly historical.
- No active docs describe legacy appointment check-in as the source of queue authority.
