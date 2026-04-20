# PLAN_ADMISSION_V2.md — Historical Planning Note

This file is no longer the active implementation plan for the codebase.

It survives because it explains the origin of several concepts that are now partly implemented in the repository, but it should not be treated as the source of truth for current behavior.

---

## Status

The branch has moved beyond this original plan.

What is now real in the codebase:

- `receptionist_dashboard`
- `arrival_counter`
- guardian/child doctypes
- `api/admission.py`
- `api/family.py`
- `api/eta.py`
- `api/emergency.py`
- `Service Point`
- display-token migration work
- `doctor_workspace_v2`

What this means:

- some ideas from the original admission-v2 plan were implemented
- some were changed during implementation
- some remain transitional
- some assumptions in the original plan are now stale

---

## How To Use This File

Use this file only for:

- historical product intent
- understanding why the branch introduced new receptionist-direction concepts
- tracing the origin of guardian, admission, ETA, and dashboard ideas

Do not use this file as:

- current architecture reference
- implementation checklist
- migration guide
- authoritative product specification

For current truth, read instead:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
4. `CONTEXT_INDEX.md`
5. `docs/receptionist-backend-policy.md`
6. `docs/healthcare-compatibility-audit.md`
7. `docs/service-point-policy.md`
8. `docs/token-display-policy.md`

---

## Current Product Direction Summary

The repository is now moving in this direction:

- `receptionist_dashboard` is the active receptionist surface
- `doctor_workspace_v2` is the active doctor surface
- `arrival_counter` is an active operational flow
- legacy receptionist and doctor pages remain compatibility paths only
- queue identity is moving toward `Service Point`
- queue semantics are moving toward `channel` + `load_class` + `priority`
- legacy appointment-path compatibility is still required

---

## If A Fresh Plan Is Needed

Write a new task-specific plan from the current codebase and current docs.

Do not continue extending this file as though it were still the live implementation plan.
