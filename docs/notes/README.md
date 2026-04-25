# Session Notes

Use this folder for short handoff notes between sessions.

This is not a second documentation system.

Use it only when a feature track spans multiple sessions or multiple days.

## Purpose

These notes help a new session start with the right scope without re-reading the whole codebase.

Each note should preserve only decision-quality context:

- goal
- current slice
- in-scope items
- out-of-scope items
- likely files
- risks
- verification status

Do not store:

- full chat transcripts
- long code dumps
- generic brainstorming
- repeated repo context that already lives in `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, or `CONTEXT_INDEX.md`

## Naming

Use simple, scope-based names:

- `doctor-v2-encounter.md`
- `receptionist-dashboard-arrival-flow.md`
- `queue-token-policy-followup.md`

## Working Rule

Before continuing a track in a new session:

1. read the active context docs
2. read the relevant note in this folder if one exists
3. verify the specific runtime files for the current slice

Notes are handoff aids, not ground truth. Live code still wins.

## Required After Implementation

After every implementation slice that changes system behavior:

1. write or update a scope note in this folder
2. update relevant core docs so repo documentation matches live code behavior
3. treat docs updates as the default expectation
4. do not rely on specs/plans alone as the lasting implementation record

Implementation notes are mandatory handoff summaries, not optional extras.

If a slice truly does not need a core-doc update, the note must say why.
