# Arrival Counter Edge Hardening (P1/P2) Design

Date: 2026-04-29
App: `clinic_flow`
Status: Draft for Implementation Planning

## Goal

Define the remaining non-P0 edge-case hardening for Arrival Counter after P0 safety closure, focusing on flow reliability (P1) and operational polish (P2) without changing queue authority or standalone-shell architecture.

This design intentionally preserves:

- Service Point and Queue Entry authority boundaries
- Existing `arrival_counter` standalone shell route and head-app structure
- Current P0 guarantees around confirm safety and reconciliation

## Scope

In scope:

- P1 reliability hardening for scanner/input/focus/permissions/no-active-session behavior
- P2 clarity and polish improvements for state copy, distinctions, stale cues, and long-text handling
- Test expectations for unit/e2e/backend contract where relevant

Out of scope:

- New backend queue semantics
- Any Healthcare base-app modifications
- Role model redesign
- New admission workflow features
- UI theme redesign beyond targeted state clarity improvements

## Current Baseline (After P0)

Already implemented in P0:

- Enter-confirm guarded by decision context
- Duplicate lookup guard while lookup is pending
- Duplicate confirm suppression
- Session drift blocking before confirm
- Confirm timeout reconciliation via `queue_entry` backend lookup
- Multiple-match disambiguation improvements

This document covers the next tier.

---

## P1: Reliability Hardening

### P1-1 Input normalization for phone searches

Problem:

- Staff may enter mobile in mixed formats (`+91`, spaces, brackets, dashes), creating inconsistent backend matching expectations.

Design:

- Normalize mobile input at client classification boundary before API call.
- Preserve current minimum threshold (`6+` digits) and avoid widening lookup semantics.
- Pass canonical phone string expected by backend trailing-digit matcher.

Acceptance:

- `+91 98765-43210`, `98765 43210`, `(98765)43210` resolve equivalently.
- Invalid short digit sequences still return current guidance message.

### P1-2 Scanner payload tolerance

Problem:

- Scanner devices may include wrappers/prefixes/suffixes or duplicate terminators.

Design:

- Add conservative QR sanitation before classify:
  - trim whitespace/newlines
  - strip known harmless scanner wrappers if present
- Keep strict docname-style QR matching (`QE-YYYY-N`) and do not introduce fuzzy QR matching.

Acceptance:

- Valid wrapped/whitespace QR payloads still resolve.
- Non-docname payloads do not silently map to a wrong patient.

### P1-3 Focus resilience and keyboard continuity

Problem:

- Focus drift slows counter workflow and can hide actionable context during rapid scanning.

Design:

- Enforce focus target transitions:
  - Idle/reset: input focused
  - Multiple state: focused candidate row is keyboard-visible
  - Pre-confirm (single match): keep input active unless explicit action focus change
- Ensure background context refresh never steals focus.

Acceptance:

- Keyboard loop remains uninterrupted across lookup, multiple selection, confirm, and reset.
- No regression in current Enter/Escape behavior.

### P1-4 Permission clarity messaging

Problem:

- Hidden action buttons without explanatory context can look broken.

Design:

- Add low-disruption explanatory text in result-card action zone when permission blocks action:
  - confirm disabled by role
  - print disabled by role
- Keep controls hidden/blocked as now; only improve operator feedback.

Acceptance:

- Receptionist sees a clear non-technical reason when action is unavailable.

### P1-5 No-active-session operator guidance

Problem:

- In no-active-session contexts, operators need immediate next-step instructions.

Design:

- Add explicit operational guidance in result/status area when lookup returns `no_active_session`.
- Message should be action-oriented: who to contact / what to refresh.
- Preserve existing API authority (no client-side bypass behavior).

Acceptance:

- No-active-session state is unmistakable and operationally actionable.

---

## P2: Clarity and Polish

### P2-1 Action copy refinement

Problem:

- `Not this patient` and `Next patient` can blur intent in repetitive use.

Design:

- Tighten labels to explicitly reflect state intent, while preserving flow:
  - pre-confirm dismissal
  - post-success continuation

Acceptance:

- First-time operator can infer action result without training.

### P2-2 Already-arrived vs success distinction

Problem:

- Both states can feel visually similar during busy counter operation.

Design:

- Keep shared shell but sharpen semantic distinction:
  - explicit state label wording
  - subtle but distinct supporting copy
- Do not introduce new competing visual structures.

Acceptance:

- Operator can distinguish “just confirmed now” vs “was already checked in” in under 1 second.

### P2-3 Stale-context low-emphasis indicator

Problem:

- Silent context staleness can reduce confidence.

Design:

- Add compact, low-emphasis stale/retry indicator near support surfaces (not in dominant action zone).
- Avoid alert fatigue; reserve alert tone for blocked actions.

Acceptance:

- Staff can see when context is stale without distraction from main loop.

### P2-4 Long-text identity handling

Problem:

- Long names/tokens can truncate critical disambiguation details.

Design:

- Standardize truncation and tooltip/title behavior across result and multiple-match rows.
- Prioritize token visibility, then name readability.

Acceptance:

- Critical identity markers remain visible in constrained widths.

### P2-5 Repeated no-match recovery affordance

Problem:

- Repeated no-match loops increase friction.

Design:

- Add a lightweight reset-and-retry affordance that clears field and restores focus predictably.
- Keep it secondary to main scan/search action.

Acceptance:

- Operators recover from repeated no-match in one action.

---

## Error Model And Messaging Rules

Message hierarchy:

1. **Action-blocking** (permission/session authority) — explicit and instructive
2. **Flow-recoverable** (no match/invalid input) — concise and operational
3. **Background/stale** — low-emphasis status, not intrusive alerts

Rules:

- No technical jargon in operator-facing messages
- No contradictory state/action pairings (e.g., showing confirm affordance when blocked)
- Any retry guidance must state the immediate next action

## Testing Strategy

Frontend unit:

- input normalization behavior
- scanner sanitation logic
- focus-state transition invariants
- permission guidance state derivation

Frontend e2e:

- mixed mobile format equivalence
- noisy QR payload handling
- no-active-session guidance rendering
- action-zone clarity under restricted permissions
- already-arrived vs success distinction assertions

Backend contract:

- preserve existing arrival API response contracts
- no regression on `lookup_arrival_candidate` branch behavior

## Rollout Order

Recommended order:

1. P1-1, P1-2 (normalization and scanner tolerance)
2. P1-3 (focus resilience)
3. P1-4, P1-5 (permission and no-active-session clarity)
4. P2 polish slices in small test-backed increments

This order prioritizes throughput reliability before copy/polish refinements.

## Documentation Impact

When implemented, update:

- `docs/notes/arrival-counter-ui-stabilization.md` (new implementation note section)
- `docs/superpowers/plans/` with a dedicated P1/P2 execution plan
- `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md` only if any user-visible rules are redefined (not just clarified)

## Non-Goals And Guardrails

- Do not add new queue authority pathways in frontend
- Do not bypass backend permission/session checks
- Do not introduce alternate layout modes that violate stable single-column + stable result-card structure
- Do not mutate Healthcare app code
