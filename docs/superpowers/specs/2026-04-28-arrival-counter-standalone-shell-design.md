# Arrival Counter Standalone Shell Technical Design

Date: 2026-04-28
App: `clinic_flow`
Status: Draft

## Goal

Correct Arrival Counter v1 so it runs as a Frappe-served standalone SvelteKit head-app slice at `/clinic/arrival-counter`, preserving the approved Arrival Counter product/UI intent while fixing the current iframe/static-asset drift.

The correction must keep Frappe as the backend authority for arrival lookup, physical arrival transitions, token slip data, permissions, and session context.

## Spec Relationship And Precedence

This is a slice technical spec. It inherits the canonical head-app architecture and applies it to Arrival Counter.

Precedence:

1. `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md` owns platform decisions.
2. This spec owns Arrival Counter technical application of that platform.
3. `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md` owns Arrival Counter UI/product intent.

This spec does not redesign the Arrival Counter UI. It changes hosting, auth, boot, API, permission, keyboard, refresh, testing, and migration mechanics so the existing UI intent can work reliably against Frappe.

## Product Intent Preserved

Keep these approved UI/product decisions from the existing Arrival Counter design spec:

- desktop-first staff-only check-in console
- scan-first workflow
- fallback phone/name lookup
- no receptionist-dashboard controls
- no queue-control actions
- one canonical page layout
- stable result-card shell across states
- strong token emphasis
- compact current/next session context
- quiet recent arrivals
- calm clinical visual tone
- Lexend for headings/token/stat emphasis
- Source Sans 3 for body, metadata, helper text, and buttons
- 7 visible states: idle, loading, no-match, multiple, pre-confirm, already-arrived, success

## Current Drift Being Corrected

The current implementation used a Frappe Desk page with an iframe pointing at `/assets/clinic_flow/head-app/arrival-counter.html`. That visually separated the frontend, but it broke the intended same-origin Frappe shell contract.

Problems this spec corrects:

- static asset HTML is not an authenticated operational shell
- iframe content does not naturally receive the active Frappe CSRF token
- iframe content does not naturally receive Frappe session/user/role boot context
- iframe content cannot rely on `window.frappe.realtime`
- frontend tests against the Vite route did not prove real Frappe-hosted behavior
- arrival whitelisted methods do not currently enforce the staff-only role boundary themselves
- print-slip rendering must not interpolate patient data unsafely
- multiple-match rendering must be reconciled with the approved single result-card shell rule

## Route

Canonical operator URL:

```text
/clinic/arrival-counter
```

This route is outside Desk. It is the operator-facing URL for Arrival Counter after correction.

Legacy coexistence:

- keep the legacy `arrival_counter` Desk page available until the replacement is accepted
- keep `arrival_counter_v1` only as a compatibility or redirect bridge if needed
- do not make `/app/arrival-counter-v1` the canonical operator route
- do not use an iframe/static asset page as the operational shell

## Shell Contract

The Frappe route renders a minimal authenticated shell and loads the SvelteKit bundle.

Required boot object:

```ts
interface ArrivalCounterBoot {
  app: "clinic_flow";
  slice: "arrival-counter";
  route: "/clinic/arrival-counter";
  siteName: string;
  user: string;
  roles: string[];
  csrfToken: string;
  realtime: {
    enabled: boolean;
    mode: "frappe" | "polling" | "disabled";
  };
  permissions: {
    canUseArrivalCounter: boolean;
    canConfirmArrival: boolean;
    canPrintTokenSlip: boolean;
  };
}
```

Rules:

- shell must redirect unauthenticated users to login or show a clear access failure
- shell must deny users outside the allowed staff roles
- shell must inject a fresh CSRF token from the active Frappe session
- shell must set no-cache behavior
- frontend must read boot data through `shared/boot`
- Arrival Counter page code must not directly read `window.frappe`
- boot payload must be runtime-validated before use

Allowed staff roles:

- `Healthcare Administrator`
- `Queue Manager`
- `System Manager`

## Frontend Entrypoint

The SvelteKit Arrival Counter route remains the frontend page implementation, but it is loaded by the Frappe shell instead of as a static authenticated page.

Required frontend changes:

- add a typed `shared/boot` adapter for `window.clinicFlowBoot`
- update API client to use `boot.csrfToken`
- normalize Frappe API errors into typed frontend errors
- validate critical API responses at runtime
- isolate server state in query-like modules instead of embedding all behavior in the page route
- isolate transport behavior in `shared/realtime`
- keep local scanner/input/result state fast and Svelte-native

SvelteKit remains the frontend build/routing/component framework. Frappe remains the server for this phase.

## Backend API Contract

Arrival Counter uses these app-owned APIs:

- `clinic_flow.api.arrival.get_arrival_session_context`
- `clinic_flow.api.arrival.lookup_arrival_candidate`
- `clinic_flow.api.arrival.mark_arrived`
- `clinic_flow.api.arrival.get_token_qr`

Backend authority:

- backend resolves eligible arrival sessions
- backend resolves lookup candidates
- backend determines whether a queue entry can be marked arrived
- backend performs the `Arrived` transition
- backend returns token slip data
- backend returns authoritative result-card payloads after mutations
- backend enforces staff permissions

Frontend must not derive queue eligibility, token identity, arrival permission, or session acceptance rules.

## Backend Permission Requirements

All operational Arrival Counter whitelisted methods must enforce staff role permissions independently of route access.

Required checks:

- `get_arrival_session_context`: allow only Arrival Counter staff roles
- `lookup_arrival_candidate`: allow only Arrival Counter staff roles
- `mark_arrived`: allow only Arrival Counter staff roles and require mutation permission
- `get_token_qr`: allow only Arrival Counter staff roles and require print-slip permission
- `resolve_arrival_sessions`: if it remains whitelisted, enforce the same read permission or make it internal-only if no external caller needs it

Recommended role helper:

```python
ARRIVAL_COUNTER_ROLES = ["Healthcare Administrator", "Queue Manager", "System Manager"]
```

Use `frappe.only_for(ARRIVAL_COUNTER_ROLES)` or an equivalent helper that produces a proper Frappe permission error.

## API Response Shape

The existing enriched contract is retained, with runtime validation added on the frontend.

`get_arrival_session_context` must provide:

- `has_active`
- `stats.arrived`
- `stats.awaiting_arrival`
- `current_session`
- `next_session`
- `recent_arrivals`
- legacy keys needed by existing compatibility callers

`lookup_arrival_candidate` must provide:

- `candidates`
- each candidate's queue entry identity
- display token
- patient name
- queue session
- status
- state label
- visit label
- print context only when safe and needed
- structured `error` where no active session or invalid search applies

`mark_arrived` must provide:

- `status`
- `already_arrived`
- `queue_entry`
- `patient_name`
- `result_card`

Mutation responses are authoritative. The frontend must replace local selected/result card state with `result_card` after `mark_arrived` succeeds.

## State Model

### Local UI State

Local high-frequency state:

- scanner/search input value
- focused result or candidate index
- selected candidate
- current visible result state
- pending lookup flag
- pending confirm flag
- transient message/banner state
- success auto-reset timer
- keyboard help overlay state if implemented

This state updates immediately in Svelte and must not wait for background context refresh.

### Server State

Server-owned state:

- arrival session context
- lookup results
- recent arrivals
- result-card payloads
- print-slip payload

Server state is fetched through typed query modules and refreshed after mutation or transport invalidation.

### Transport State

Transport state:

- polling/realtime mode
- last successful refresh timestamp
- stale indicator
- refresh failure count

Transport state must not disrupt scanner focus.

## Keyboard Loop And Shortcuts

Arrival Counter is keyboard-first because staff can process patients faster from scanner and keyboard than with mouse-only workflows.

Primary keyboard loop:

1. Input is focused on load.
2. Staff scans QR code or types search text.
3. `Enter` submits lookup.
4. If one candidate resolves, result card receives decision focus without losing scanner flow.
5. In pre-confirm state, `Enter` confirms arrival when the primary action is focused or when the result card is the active decision context.
6. In multiple-match state, `ArrowUp` and `ArrowDown` move through candidates.
7. In multiple-match state, `Enter` selects the focused candidate.
8. `Escape` returns to idle/reset from no-match, multiple, pre-confirm, already-arrived, or success states.
9. After success auto-reset, input focus returns to the scan/search input.

Optional shortcuts:

- `Ctrl+P` or `Cmd+P` may print token slip only in already-arrived or success states
- `?` may open a shortcut help overlay if a shared keyboard helper exists

Guardrails:

- no global shortcut may confirm arrival unless the Arrival Counter route is active and a valid pre-confirm candidate is selected
- background refresh must not steal focus
- print shortcut must not be active in pre-confirm state
- shortcuts must be disabled while a mutation is pending
- visible focus styles are required on input, candidate rows, and action buttons

## Result States

The visible states remain the approved 7-state model:

- idle
- loading
- no-match
- multiple
- pre-confirm
- already-arrived
- success

Technical correction:

- error conditions such as forbidden, CSRF failure, network failure, or stale state may use a shared degraded/error banner
- generic operational errors should not become a separate page layout
- multiple-match state must preserve the canonical page structure and result-card shell intent from the UI spec
- `Print Token Slip` must not appear in pre-confirm state
- success auto-reset must leave enough time to print before reset

## Realtime And Refresh

Arrival Counter live awareness is useful but secondary to the check-in task.

Phase-1 mode:

- polling-first is acceptable for this slice if Frappe realtime is not available outside Desk through the standalone shell
- polling interval should be conservative enough not to disrupt input or overload Frappe
- mutation responses refresh context immediately after successful `mark_arrived`
- transport invalidation refreshes session context and recent arrivals only
- lookup and selected decision state must not be overwritten by background refresh

Future mode:

- a Frappe realtime adapter may replace or supplement polling if the shell can provide a supported client
- realtime events remain invalidation hints, not truth
- reconnect or repeated polling failures should trigger a full context refetch and visible stale indicator

## Print Slip Security

Print slip rendering must not use unsafe raw interpolation of patient data.

Rules:

- escape patient name and display token before rendering into a print document
- render QR SVG only if generated by app-owned trusted code
- do not write untrusted HTML into `document.write`
- prefer DOM construction or a sanitized print template over string concatenation
- print behavior must be available only in already-arrived and success states

## Error And Degraded-State Behavior

Required normalized error categories:

- unauthenticated: redirect to login or show session expired
- forbidden: show access denied and stop operational actions
- CSRF failure: show session/security refresh message
- no active session: show no-match/degraded operational guidance without panic
- validation failure: show actionable backend message
- network failure: keep current context and show retry affordance
- stale state/conflict: refetch and require operator to retry the action
- unknown failure: show safe generic error and record privacy-safe diagnostic detail

Do not show raw Frappe tracebacks or exception payloads in the operator UI.

## Visual And Layout Constraints

The technical correction must preserve the approved visual direction unless implementation proves a direct conflict with the canonical shell.

Hard constraints:

- no Desk chrome in canonical route
- no app-shell navigation in v1
- no sidebar
- no footer links
- no queue-control actions
- one canonical page layout
- input and result card remain the primary work surface
- recent arrivals remain visually quiet

If the current implementation violates the single result-card shell rule, correct the structure rather than changing the product intent.

## Build And Asset Delivery

The SvelteKit build may continue to copy assets into `clinic_flow/public/head-app`, but static HTML output is not the authenticated route shell.

Required build behavior:

- Frappe shell includes built JS/CSS assets through manifest-resolved or hashed paths; any temporary hard-coded asset path must be documented in the implementation plan with a cleanup step
- the canonical route is served by Frappe, not by opening a static asset HTML file directly
- bundle loading should be slice-specific and not globally injected into Desk
- `npm run build` or equivalent must produce assets consumed by the Frappe shell
- stale asset paths must fail visibly during development rather than silently rendering an old bundle

## Testing And Verification

Required verification layers:

1. Frontend unit tests for classifier, state transitions, keyboard loop, API error normalization, and boot validation.
2. Backend contract tests for session context, lookup candidates, `mark_arrived`, and permission enforcement.
3. Frontend e2e tests for visible states through the Svelte route.
4. Real Frappe-route integration test for `/clinic/arrival-counter` loading the shell and bundle.
5. CSRF verification for `mark_arrived` through the shell-injected token.
6. Forbidden-role verification for shell and API access.
7. Keyboard-only workflow verification for scan/search, candidate selection, confirm, reset, and print availability.
8. Regression test or manual verification that the legacy `arrival_counter` Desk page remains available during coexistence.

The slice is not complete if only the Vite route passes.

## Documentation Requirements

Implementation must update:

- `docs/notes/arrival-counter-v1-frontend.md` or a new follow-up note describing the correction
- `ARCHITECTURE.md` to replace the iframe-host statement with the standalone shell route
- any relevant head-app frontend README or build instructions if asset delivery changes

The implementation note must state what changed, what was verified, what stayed out of scope, and the next integration step.

## Out Of Scope

- changing Arrival Counter visual direction
- adding receptionist shell or live queue rail
- changing queue authority or token assignment semantics
- replacing Frappe with a separate auth provider
- implementing full headless OAuth deployment
- replacing Frappe realtime with a custom SSE/websocket service
- removing the legacy `arrival_counter` page

## Success Criteria

Arrival Counter correction succeeds when:

- staff use `/clinic/arrival-counter` as the canonical operator route
- the page renders outside Desk chrome
- boot context is injected by Frappe and runtime-validated by the frontend
- CSRF-protected POSTs succeed through the typed API client
- arrival APIs enforce backend staff permissions directly
- scanner/search input remains focused through background refresh
- keyboard-only operation covers the primary workflow
- result states preserve the approved UI/product intent
- polling or realtime refresh updates context without overwriting active decisions
- print slip rendering escapes patient-controlled text
- real Frappe-route integration tests prove the shell and built assets work together
- legacy Desk arrival page remains available during coexistence
