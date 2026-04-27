# Head-App Frontend Architecture Design

Date: 2026-04-27
App: `clinic_flow`
Status: Draft

## Goal

Define the long-term frontend architecture for `clinic_flow` as the product moves away from large Frappe Desk page scripts and toward a dedicated head app with Frappe/Healthcare/Clinic Flow acting as the backend authority.

This document is intentionally not page-specific. It establishes the architectural rules that all current and future frontend slices must inherit.

## Problem Statement

The active frontend surfaces in this repo are constrained by the current Desk-page model:

- large single-file page scripts with mixed behavior, HTML, and CSS
- operational UI tightly coupled to `frappe.pages`, `frappe.ui.make_app_page`, `frappe.call`, and Desk runtime assumptions
- mixed polling and realtime behavior that is hard to reason about under load
- layout and styling decisions that drift toward Frappe-esque admin ergonomics instead of purpose-built operational tools

The current active pages most affected by this are:

- `receptionist_dashboard`
- `arrival_counter`
- `doctor_workspace_v2`

The backend is in better shape than the frontend surface. Core operational authority already lives in app-owned API modules such as:

- `clinic_flow.api.admission`
- `clinic_flow.api.queue`
- `clinic_flow.api.arrival`
- `clinic_flow.api.workspace`
- `clinic_flow.api.emergency`
- `clinic_flow.api.family`

So the migration is primarily a frontend architecture extraction, not a rewrite of queue logic authority.

## Scope

This design governs frontend architecture going forward for all new head-app work.

In scope:

- stack decisions
- hosting approach
- auth approach
- realtime model
- frontend/backend contract rules
- state management rules
- migration slice order and coexistence rules
- design-system and page-spec governance

Out of scope:

- exact UI design for any one page
- slice-specific interaction details
- backend semantic changes unrelated to supporting the new frontend contract

## Product Direction

The preferred direction is:

- frontend lives in a dedicated head app
- Frappe remains the backend authority
- backend rules continue to own queue identity, token allocation, ETA semantics, priority semantics, permissions, and operational transitions
- frontend becomes a purpose-built operational UI layer rather than a Desk page assembly layer

The architecture must preserve mixed-era backend realities while improving frontend clarity.

## Architecture Summary

### Chosen model

- dedicated frontend head app
- Frappe-hosted under the same domain in the early phases
- Frappe backend remains authoritative
- current Frappe realtime transport reused first
- frontend progressively migrates in vertical slices

### Chosen stack

- `Svelte 5`
- `SvelteKit`
- `Tailwind CSS`
- `Bits UI`
- `shadcn-svelte` selectively, not as the product visual language

This stack is chosen because it supports a fast, focused, low-boilerplate operational UI while allowing more deliberate product-specific layout and interaction design than the current Desk page model.

## Hosting Strategy

### Phase 1 hosting rule

The new frontend should be hosted under the same domain as Frappe.

Reasoning:

- avoids premature auth and infrastructure complexity
- keeps rollout and coexistence simpler
- preserves compatibility with current session behavior
- lets the migration focus on frontend extraction first

This is not the same as remaining a Desk page. The frontend should be a separate application surface hosted by or behind Frappe, not another large page script.

### Future flexibility

The architecture should not block a later move to independently hosted deployment, but that is not the phase-1 optimization target.

## Authentication And Access

### Chosen phase-1 model

- same-domain session/cookie auth
- staff-only access
- backend permission enforcement remains in Frappe

### Rejected default for phase 1

- browser token auth as the primary access model

Reasoning:

- token auth in a staff browser app increases operational and security burden
- same-domain session reuse is the simpler and safer first migration path
- token auth is more appropriate for server-to-server or fully separate deployment scenarios

### Access rule

The frontend must never become the authority for role checks. The backend remains the permission gate.

## Backend Authority Rules

The backend remains the source of truth for:

- queue identity
- token allocation
- queue entry creation
- ETA calculation
- session recommendation logic
- arrival transitions
- special and emergency operational rules
- encounter and doctor workflow semantics
- permission checks

The frontend may present, group, and sequence this information, but it must not invent operational logic that belongs on the backend.

Examples of frontend behavior that must not become client-owned logic:

- token assignment or availability decisions
- session ranking rules
- queue-priority derivation
- special/emergency eligibility rules
- doctor dequeue rules

## API Contract Rules

### Preferred contract shape

The head app should call app-owned `clinic_flow.api.*` endpoints through a thin frontend API client.

The default API boundary should be:

- app-owned whitelisted methods for business actions and composite payloads
- backend-returned authoritative payloads after mutations when useful
- minimal reliance on generic `frappe.client.*` from the new frontend

### Rejected default

- widespread direct use of generic `frappe.client.get_list`, Desk search endpoints, or upstream app endpoints from page code

Reasoning:

- creates fragile frontend/backend coupling
- leaks backend implementation details into the UI layer
- makes long-term API cleanup harder

### BFF decision

Do not introduce a separate frontend BFF layer in phase 1.

Reasoning:

- the current backend already exposes a usable app-owned API surface
- a BFF would add architecture before it is proven necessary
- a thin frontend API adapter is sufficient for the first migration slices

The BFF option can be revisited later if the frontend starts needing heavy orchestration across multiple backends or contract aggregation that does not belong in `clinic_flow.api.*`.

## Realtime Model

### Chosen phase-1 transport

- reuse Frappe’s current realtime channel first

Reasoning:

- fastest path to preserve live operational behavior
- avoids solving transport replacement and UI migration at the same time
- keeps the first slices focused on user experience and state quality

### Important constraint

Realtime transport is not the same thing as realtime truth.

The frontend must not treat websocket events as the sole authoritative state source.

### Required realtime model

Use this pattern:

- backend is the source of truth
- realtime events notify the frontend that something changed
- frontend patches or invalidates/refetches the affected state
- mutation responses remain authoritative for immediate user actions
- reconnect and missed-update scenarios must resync cleanly

### Product goal translation

`Zero lag` should be interpreted as:

- sub-second perceived updates where practical
- minimal stale UI after mutations
- no silent drift after reconnect or dropped events
- graceful behavior during concurrent activity bursts

### Future transport flexibility

The frontend architecture should keep the transport adapter isolated so a dedicated websocket or SSE contract can be introduced later without rewriting page logic.

## State Management Model

### Chosen model

- `Svelte 5` runes for local view state
- shared stores or equivalent reactive modules for cross-component UI state where needed
- query-style server-state management for backend data lifecycle
- realtime events trigger targeted refresh or invalidation

### Frontend state categories

1. Local UI state
- panel open/closed
- selected mode
- focused input
- local transient status

2. Server state
- session payloads
- token board payloads
- live queue payloads
- arrival context
- patient lookup results

3. Transport state
- connection status
- reconnect state
- event freshness markers if needed

### Rule

Do not collapse all of this into one global mutable store or one giant route component. That would recreate the current monolith in a different framework.

## Frontend Module Boundaries

Frontend code should be split by product domain and operational purpose, not by one giant route file and not by technical layer alone.

Recommended domain modules include:

- `arrival-counter`
- `reception-shell`
- `live-queue-rail`
- `phone-admission`
- `walkin-admission`
- `token-board`
- `shared/session-context`
- `shared/patient-lookup`
- `shared/realtime`
- `shared/api`

Each module should be understandable without needing the entire app in context.

## Design System Rules

The new frontend must not copy Frappe Desk styling by inertia.

Rules:

- each screen should feel purpose-built for its operation
- design language should remain consistent across the head app
- component primitives may come from `Bits UI` or `shadcn-svelte`, but the final product should not look like a prefab component demo
- typography, density, spacing, and color semantics should be consciously chosen for operational clarity

### Shared design intent

The overall product should feel:

- modern
- calm
- professional
- operationally intentional

It should not feel:

- generic admin template
- default Frappe desk clone
- novelty-heavy or decorative

## Migration Strategy

### Delivery model

Use vertical-slice strangler migration.

That means:

- migrate one operational slice at a time
- keep existing pages running until each replacement is accepted
- avoid big-bang replacement of all pages at once

### Initial slice order

1. `Arrival Counter`
2. `Reception Shell + Live Queue Rail`
3. `Phone Admission`
4. `Walk-in Admission`
5. `Token Board`

`Doctor Workspace` remains out of the first migration wave unless explicitly re-scoped later.

### Why this order

- `Arrival Counter` is isolated and lower risk
- receptionist shell decisions should be informed by a successful first frontend slice
- live queue should be established before deeper receptionist workflows depend on it

## Coexistence Rules With Existing Pages

During migration:

- do not break legacy compatibility flows casually
- do not rewrite backend authority to suit frontend convenience
- old Desk pages may remain active until a slice replacement is accepted
- routing and rollout can be gradual

Important distinction:

- old frontend pages can be replaced incrementally
- backend semantics must remain stable unless an explicit backend slice says otherwise

## Page-Spec Governance

This document is the parent architecture spec.

All future page or slice specs must inherit from it.

That means page specs should not re-open or contradict these decisions unless a deliberate architecture revision is approved.

Page specs should reference this document for:

- hosting model
- auth model
- realtime model
- frontend/backend contract rules
- module-boundary rules
- migration method

## Required Slice-Spec Pattern

Each page or slice spec should define:

- page purpose
- primary user action loop
- information hierarchy
- state model for that slice
- allowed backend contracts
- explicit non-goals

This prevents future slices from drifting back toward feature sprawl.

## Testing And Verification Expectations

Frontend migration work should be verified at three levels:

1. State and contract behavior
- query/mutation flows
- action outcomes
- stale-state handling

2. Realtime behavior
- update propagation
- reconnect behavior
- no disruptive focus loss during live updates where avoidable

3. Visual and operational behavior
- desktop-first layout quality
- state consistency
- keyboard focus visibility
- production-like operator flow

Claims that a slice is done must be based on observed behavior, not only on visual correctness.

## Risks And Guardrails

### Main risks

- recreating the current monolith inside Svelte
- over-trusting realtime events as truth
- coupling the frontend to generic Frappe client endpoints
- introducing too much architecture too early
- drifting into generic dashboard design instead of operation-specific UI

### Guardrails

- split by operational slice
- keep backend authority explicit
- isolate transport concerns
- prefer thin API client over raw scattered calls
- require page-specific specs before implementation

## Open Future Decisions

These are intentionally deferred:

- whether a dedicated websocket/SSE backend contract replaces Frappe realtime later
- whether a separate deployment model replaces same-domain hosting later
- whether a BFF becomes necessary later
- whether doctor-facing migration uses the same sequencing or a separate architecture track

## Architecture Decision Summary

`clinic_flow` frontend should move to a dedicated SvelteKit head app hosted with Frappe under the same domain in phase 1, using session auth, app-owned backend endpoints, and Frappe realtime as the initial transport. Backend authority remains in Frappe. Frontend slices migrate incrementally under one parent architecture, with page-specific specs inheriting these rules instead of re-deciding them every time.
