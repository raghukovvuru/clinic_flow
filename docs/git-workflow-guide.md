# Git Workflow Guide

Plain-language guide for working safely in the `clinic_flow` repo.

This is written for someone with limited engineering experience.

## 1. What Git Is Doing Here

The Frappe bench is your working environment.

The git repository you are actively working in is:

- `apps/clinic_flow`

That means:

- app code is version-controlled
- bench runtime state is not fully version-controlled
- site data is not version-controlled
- local experiments can affect your bench, but only tracked app files belong in commits

## 2. What "Scope" Means

A **scope** is one clear area of work.

In this repo, the main scopes are:

- `doctor-workspace-v2`
- `doctor-workspace` legacy fallback
- `receptionist-dashboard`
- `receptionist-workspace` legacy path
- backend queue/admission/session logic
- emergency / arrival flows
- docs / context / onboarding
- fixtures / metadata / print formats

Good rule:

- one branch should usually serve one scope
- one commit should usually express one meaningful change inside that scope

## 3. The Current Product Direction

Treat these as the current truth:

- `doctor-workspace-v2` is the active doctor UI direction
- `doctor-workspace` is legacy fallback/reference during development
- `receptionist-dashboard` is the newer receptionist direction
- `receptionist-workspace` is legacy compatibility

This means:

- new doctor UI work should go to `doctor-workspace-v2`
- do not improve both doctor UIs in parallel unless there is a very specific reason
- legacy pages should only get fixes that are necessary for safety, compatibility, or fallback use

## 4. When To Stay On The Same Branch

Stay on the same branch if the new work is a continuation of the same idea.

Examples:

- you are already improving the operations rail in `receptionist-dashboard` and now want to refine the card layout
- you are already fixing one queue bug and now need a second small fix caused by the same root issue
- you are updating docs for the exact feature you just changed

Simple test:

- if you would describe both changes with one sentence, they probably belong on the same branch

Example:

- "Improve receptionist dashboard operations flow"

That can include:

- JS adjustments
- matching print-format changes
- small supporting docs for that same feature

## 5. When To Start A New Branch

Start a new branch when the work changes direction, audience, or risk.

Create a new branch if:

- you move from receptionist work to doctor UI work
- you move from UI polish to backend queue logic
- you move from bug fixing to a redesign
- you want to try a bigger idea that may be thrown away
- you want a clean checkpoint before a risky rewrite
- the old branch already feels crowded or confusing

Simple test:

- if you need the word "also" to explain the work, it probably wants a new branch

Example:

- "I was improving receptionist dashboard cards, and also I want to redesign doctor workspace navigation"

That should be a new branch.

## 6. Branch Naming Guide

Use names that tell you the area and purpose.

Good patterns:

- `backend/<purpose>`
- `doctor-v2/<purpose>`
- `doctor-legacy/<purpose>`
- `receptionist-dashboard/<purpose>`
- `receptionist-legacy/<purpose>`
- `ops/<purpose>`
- `docs/<purpose>`
- `fix/<purpose>`

Examples:

- `doctor-v2/session-header-redesign`
- `doctor-v2/right-panel-rewrite`
- `receptionist-dashboard/ops-rail-cleanup`
- `backend/queue-priority-fix`
- `ops/emergency-arrival-flow`
- `docs/context-tightening`

Avoid vague names like:

- `misc-fixes`
- `new-work`
- `v2-updates`
- `changes`

## 7. A Special Rule For Doctor Workspace

Because there are two doctor workspace codepaths, use this rule:

### Use `doctor-workspace-v2` branches for:

- new UI direction
- layout changes
- workflow redesign
- information architecture changes
- state model changes inside the doctor UI

### Touch legacy `doctor-workspace` only for:

- fallback safety
- temporary compatibility
- urgent bug fixes

Do not build new product ideas in the legacy workspace just because it feels safer.

If the future direction is unclear and experimental, still branch under the v2 track.

Example:

- `doctor-v2/encounter-shell-rethink`

not:

- `fix/doctor-workspace-layout`

## 8. Commits: What A Good Commit Looks Like

A commit is a saved checkpoint with a message.

A good commit should answer:

- what changed
- why it changed

Good commit message style:

- `feat: add emergency pending section to ops rail`
- `fix: preserve queue token when legacy check-in re-saves appointment`
- `refactor: separate service-point resolution from queue session creation`
- `docs: clarify v2 as active doctor workspace path`

## 9. When To Commit

Commit when you reach a meaningful checkpoint.

Good commit moments:

- one bug is fixed
- one UI section works end-to-end
- one backend rule is implemented and verified
- one doc cleanup is complete
- one migration/fixture change is reviewed and intentional

Do not wait too long.

If you have done 3-5 different things without a commit, you probably waited too long.

## 10. What Should Not Be Mixed In One Commit

Avoid combining these unless they are tightly connected:

- doctor UI redesign + receptionist UI changes
- backend queue rules + unrelated docs cleanup
- emergency flow work + print-style tweaks
- fixture exports + unrelated frontend polish

Allowed together when truly connected:

- a receptionist dashboard UI change + its required print-format update
- a backend schema change + the fixture or patch file that supports it
- a code change + the doc update that explains that same code change

## 11. Checkpoints Before You Continue Working

Before continuing a branch, ask:

1. Am I still solving the same problem?
2. Am I still in the same scope?
3. Would I want to review all these changes as one unit?
4. If I had to revert this branch, would all of it belong together?

If the answer to any of these is "no", start a new branch.

## 12. Checkpoints Before You Commit

Before committing:

1. Look at `git status`
2. Check whether unrelated files slipped in
3. Check whether generated fixture files are intentional
4. Check whether legacy and v2 files were both changed by accident
5. Make sure the commit message matches what is actually inside

Practical command:

```bash
git status --short
```

## 13. How To Think About Fixtures And Metadata

In Frappe, some changes appear as metadata files.

Examples:

- `fixtures/*.json`
- doctype JSON changes
- print format changes
- patch files

These are important. Do not treat them as clutter automatically.

Ask:

- did I intentionally change app metadata?
- did a fixture export appear because of a real change?
- is this file needed to reproduce the feature on another setup?

Commit fixture/metadata changes when they are part of the same real feature.

Do not commit them just because they showed up.

## 14. Recommended Workflow For Non-Engineering Use

When starting work:

1. Decide the scope in plain words
2. Pick or create a branch that matches that scope
3. Do only that kind of work on the branch
4. Commit at meaningful checkpoints
5. Stop and branch again if the topic changes

Example:

1. "I want to improve doctor v2 encounter layout"
2. Create branch: `doctor-v2/encounter-layout-pass`
3. Only change doctor v2 files and directly related docs
4. Commit after the header works, then after the side panel works
5. If you later want to change backend queue timing, do that on a new branch

## 15. Current Repo Hygiene Advice

Based on the current repo shape, be especially careful about mixing:

- docs/context cleanup
- receptionist dashboard JS work
- print-format changes
- fixture exports

Those should usually be split into separate commits, and sometimes separate branches.

## 16. If You Are Unsure

When unsure, prefer this:

- start a new branch
- keep the branch smaller
- commit sooner

Small, clear branches are easier to understand, test, review, and undo.
