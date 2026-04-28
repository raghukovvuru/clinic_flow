# Head-App Standalone Shell Architecture Design

Date: 2026-04-28
App: `clinic_flow`
Status: Locked Draft

## Goal

Define the canonical frontend architecture for `clinic_flow` operational surfaces as the product moves from Frappe Desk pages toward a dedicated SvelteKit head app, while keeping Frappe as the backend authority.

This spec supersedes the hosting, auth, shell, frontend-stack, and realtime portions of `docs/superpowers/specs/2026-04-27-head-app-frontend-architecture-design.md` for new head-app work.

## Decision Summary

Use a **Frappe-served standalone SvelteKit shell** as the default architecture for operational frontend slices.

The frontend should not run inside Frappe Desk by default. It should be served from a same-origin Frappe route under the canonical namespace `/clinic/<slice>`, with a minimal authenticated shell that injects boot context and loads the SvelteKit app.

Frappe remains the source of truth for authentication, permissions, queue state, operational transitions, token allocation, scheduling rules, business rules, and persistence. SvelteKit owns operational UI composition, local interaction state, fast visual updates, keyboard workflows, and frontend routing.

## Scope

In scope:

- canonical hosting model for head-app frontend slices
- route namespace and shell contract
- session, CSRF, and boot-context strategy
- TypeScript and runtime-contract policy
- SvelteKit, Svelte 5, Tailwind CSS, and UI primitive strategy
- frontend/backend API boundary rules
- keyboard-first operational interaction rules
- state, query, realtime, and high-frequency update model
- design-token and visual ownership policy
- build and asset delivery direction
- testing and diagnostic expectations
- dependency governance
- migration path toward full headless later

Out of scope:

- exact UI design for any specific slice
- exact shortcut mapping for any specific slice
- exact API payload for any specific slice
- OAuth implementation for a fully separate frontend
- replacing Frappe realtime with a custom realtime service at this architecture stage
- rewriting queue authority or Healthcare integration semantics

## Architectural Principles

1. Backend authority stays in Frappe.
2. Operational frontend UX is separated from Desk views.
3. The browser must not receive long-lived API secrets.
4. Same-origin session auth is the phase-1 default.
5. CSRF stays enabled.
6. TypeScript is required for frontend contracts and application code.
7. Runtime JSON from Frappe must be treated as untrusted until parsed or validated at key boundaries.
8. Frontend state is fast and local where appropriate, but server state is resynced from Frappe.
9. Realtime events notify; they do not become truth.
10. Keyboard operation is a first-class product requirement.
11. Frontend module boundaries should support later full-headless migration.

## Chosen Hosting Model

### Default: Frappe-Served Standalone Shell

Each operational slice should be served by a Frappe web route outside Desk. The route renders a small authenticated HTML shell and loads the SvelteKit bundle.

The shell is responsible for:

- checking the current Frappe session
- enforcing route-level access before rendering the frontend
- injecting a typed boot object
- including built frontend assets
- setting no-cache behavior where live operational state is involved
- preserving same-origin cookie and CSRF behavior

The shell may be implemented with Frappe website routing, a `www/` route, or an equivalent app-owned route renderer. The chosen mechanism is less important than the contract: the page is outside Desk, same-origin, session-aware, and able to inject a fresh CSRF token.

The shell is not responsible for operational UI logic. It should remain a stable bridge between Frappe and the head app.

### Rejected Default: Desk Same-DOM Mount

Desk same-DOM mounting is allowed only as a temporary repair or compatibility bridge. It provides easy access to `frappe.session`, `frappe.csrf_token`, and `frappe.realtime`, but keeps the product inside Desk lifecycle, Desk chrome, Desk routing, and Desk CSS/global JS constraints.

Because clinic operations should feel like dedicated staff tools rather than admin views, Desk mount is not the long-term default.

### Rejected Default: Static Iframe Asset

Do not host operational slices as static `/assets/.../*.html` pages inside iframes.

This pattern visually separates the app, but breaks Frappe runtime assumptions unless a custom bridge is built. In particular, it does not naturally provide the iframe with the active CSRF token, session boot data, or realtime client.

### Future: Fully Headless Deployment

Fully separate frontend hosting remains a future option. That phase should use OAuth/OIDC or a backend-for-frontend pattern, not browser-exposed API key/secret pairs.

The current architecture should keep adapters isolated so a later full-headless migration can replace the boot, auth, API, and realtime adapters without rewriting page components.

## Route Namespace

The canonical route namespace for operational head-app slices is:

```text
/clinic/<slice>
```

Examples may include `/clinic/reception`, `/clinic/token-board`, or `/clinic/<future-slice>`. Slice specs own their final route names, but they should use this namespace unless a specific product or deployment reason requires otherwise.

Desk pages may link or redirect to `/clinic/<slice>` routes during coexistence, but `/app/<page>` should not be the canonical operator URL for new head-app surfaces.

## Route And Shell Contract

A head-app route should render a minimal shell with a boot object similar to:

```html
<script>
  window.clinicFlowBoot = {
    app: "clinic_flow",
    slice: "slice-id",
    route: "/clinic/slice-id",
    siteName: "site1.localhost",
    user: "user@example.com",
    roles: ["Queue Manager"],
    csrfToken: "...",
    realtime: {
      enabled: true,
      mode: "frappe-or-polling"
    }
  };
</script>
<div id="clinic-flow-head-app"></div>
```

The exact values may vary by route, but the contract must be typed in the frontend and documented by each slice spec.

The frontend must read this through a small boot adapter. Page components must not directly read `window.frappe`.

## Authentication And Authorization

Phase 1 uses Frappe same-origin session/cookie auth.

Rules:

- unauthenticated users should be redirected to login or shown an explicit access failure
- route shell access must be staff-only for operational pages
- backend whitelisted methods must enforce permissions independently
- frontend role checks are only presentation aids, never security boundaries
- CSRF tokens must be injected by the shell and sent on unsafe requests
- `ignore_csrf` must not be used for production behavior
- browser API keys or API secrets must not be used

Operational whitelisted methods should use `frappe.only_for(...)`, `frappe.has_permission(...)`, or equivalent checks matching the page purpose.

## TypeScript And Runtime Contracts

TypeScript is the default and required language for head-app frontend code.

Required typed surfaces:

- boot object
- API request and response payloads
- mutation result payloads
- frontend state machines
- component props
- transport adapter events
- normalized error objects

Rules:

- avoid `any` except at external parsing boundaries
- prefer discriminated unions for visible UI states
- define shared types near their domain modules
- do not trust backend JSON because TypeScript types exist
- validate boot payloads and critical API responses at runtime
- validation failures should produce normalized frontend errors

Runtime validation may use a lightweight schema library such as `zod` or `valibot`, or small hand-written validators. Full validation is not required for every low-risk payload, but boot, auth, and mutation response boundaries must be validated.

## API Boundary

The head app should call app-owned whitelisted methods under `clinic_flow.api.*` through a thin typed API client.

Preferred API shape:

- composite read payloads for operational screens
- explicit mutation methods for business actions
- mutation responses that return authoritative UI-ready state
- structured error codes/messages for expected operational failures
- limited, intentional payload size

Avoid:

- generic `frappe.client.*` calls from page code
- direct DocType CRUD for business transitions
- frontend-derived queue eligibility or token assignment
- scattered `fetch` calls outside the API adapter
- raw Frappe exception parsing in UI components

The API adapter owns CSRF headers, credentials, response unwrapping, runtime validation, session-expiry detection, and error normalization.

## Frontend Stack Defaults

The frontend stack for head-app slices is:

- SvelteKit for routing, app composition, and build output
- Svelte 5 for reactive components and local UI state
- TypeScript for application code and contracts
- Tailwind CSS for design tokens, layout, and density control
- Bits UI as the default accessible interaction primitive layer
- shadcn-svelte as an optional source-owned component accelerator
- Vitest for frontend unit tests
- Playwright for browser-level flow tests

SvelteKit should be treated as the frontend app framework and build system. Frappe remains the server in this phase. Do not depend on SvelteKit server-side rendering unless a later architecture revision introduces a separate Node runtime.

## UI Component Library Decision

Clinic Flow needs maximum visual flexibility with tight accessibility compatibility. Component choices must support a custom healthcare operations design language rather than forcing a generic admin template.

### Default Visual Layer: Custom Tailwind Components

Use custom Tailwind components and semantic design tokens for simple layout, display, cards, banners, buttons, badges, and page-specific visual treatments.

This keeps Clinic Flow's operational visual identity under project control.

### Default Interaction Primitive Layer: Bits UI

Use Bits UI for complex interactive primitives where accessibility and keyboard behavior are difficult to implement correctly.

Default Bits UI use cases:

- dialogs
- popovers
- menus
- selects
- comboboxes
- tabs
- accordions
- tooltips
- command-style overlays

Bits UI is preferred because it is headless, accessible, Svelte-native, and does not impose a visual design system.

### Optional Accelerator: shadcn-svelte

Use shadcn-svelte selectively when copied source components accelerate delivery without compromising Clinic Flow's visual identity.

Rules for shadcn-svelte:

- copied components become Clinic Flow-owned code
- restyle copied components to Clinic Flow tokens
- do not accept the default shadcn visual language as product identity
- do not add components that duplicate simpler local components without a reason

### Escape Hatch: Melt UI

Use Melt UI only when lower-level primitive control is needed and Bits UI cannot express the interaction cleanly.

### Not Default: Full Visual Kits

Skeleton, Flowbite Svelte, and Svelte Material UI are not default dependencies.

Rationale:

- Skeleton is a strong full design system, but can compete with Clinic Flow's own visual language.
- Flowbite Svelte is broad and fast, but risks generic SaaS/admin UI drift.
- Svelte Material UI locks the product into Material Design, which is not the intended clinical operations identity.

These libraries may be reassessed only through an explicit dependency decision note.

## Design Tokens And Visual Ownership

Tailwind configuration and shared CSS should own the visual system.

Required token categories:

- color semantics
- typography
- spacing
- radius
- elevation/shadow
- z-index layers
- density scale
- focus rings
- state colors

Use semantic tokens such as `canvas`, `surface`, `line`, `muted`, `primary`, `success`, `warning`, and `danger` rather than scattering raw one-off colors.

Avoid raw arbitrary values in application components except for isolated, documented visual treatments. Slice specs may define page-specific visual direction, but they must inherit the shared token system.

## Keyboard-First Operations

Operational screens must be designed for fast keyboard use. Keyboard interaction is not only an accessibility requirement; it is a primary productivity path in real clinic settings.

Canonical rules:

- every slice spec must define its primary keyboard loop
- primary workflows must be usable efficiently without a mouse
- shortcuts must be discoverable, documented, and conflict-checked
- background refreshes must not steal focus
- scanner/input-first workflows must preserve focus during realtime or polling updates
- Enter should confirm the focused primary action only within a safe context
- Escape should cancel, close, or move back predictably
- arrow-key navigation should work for lists, menus, candidate results, and command surfaces
- destructive or irreversible shortcuts require guardrails, confirmation, or constrained focus context
- focus states must be visible
- color must not be the only state indicator
- reduced-motion preferences should be respected

Shared keyboard helpers may live under `shared/keyboard` once more than one slice needs them.

## State Model

Frontend state is split into three categories.

### Local High-Frequency State

Examples:

- scanner input buffer
- focused field
- selected row or candidate
- pending action flag
- local animation/transition state
- transient success/error banners
- keyboard shortcut overlay state

This state should update immediately in Svelte without waiting for Frappe round trips.

### Server State

Examples:

- session context
- queue snapshots
- recent activity
- lookup results
- token and print-slip payloads

This state is owned by Frappe. It should be fetched through typed API modules and refreshed after mutations or realtime invalidation.

### Transport State

Examples:

- realtime connected/disconnected
- last refresh timestamp
- reconnect or stale-state indicators
- polling fallback status

Transport state should be isolated from page components through a transport adapter.

## Server-State And Query Layer

Use Svelte 5 runes or stores for local UI state. Use query-like modules for server state.

Query modules own:

- loading state
- error state
- stale state
- refresh behavior
- invalidation behavior
- mutation reconciliation
- last successful payload

Do not collapse the app into one global mutable store. Domain-specific query modules are preferred.

TanStack Query for Svelte may be considered later if custom query modules become too complex, but it is not required by default.

## Realtime And Fast Updates

The product goal is fast perceived updates under high-frequency operational changes, not client-side authority.

Required model:

- local UI responds immediately for operator actions
- mutations wait for authoritative Frappe responses before final state is accepted
- realtime events invalidate or selectively refresh server state
- missed events or reconnects trigger full refetch
- polling can be used as a fallback or safety net
- focused input should not be disrupted by background refreshes
- stale or degraded transport state should be visible when relevant

The first implementation may reuse Frappe realtime if the standalone shell can provide a supported client. If not, a documented polling-first adapter is acceptable for low-risk slices, but the adapter boundary must allow a later realtime replacement.

## Forms And Validation

Client-side form validation exists for speed and clarity, not authority.

Rules:

- simple forms may use local Svelte state and explicit validation functions
- complex admission or reception forms should use a standard shared validation pattern
- server validation from Frappe remains authoritative
- server validation errors must map back to fields when the backend response identifies fields; otherwise they must become actionable banners
- form state should not be reset by background refresh unless the user explicitly abandons the form

## Date And Time Formatting

Operational screens must not leak raw database datetime strings into the UI.

Rules:

- normalize Frappe date/time payloads before display
- format times consistently for clinic operators
- document timezone assumptions in slice API contracts
- avoid mixing browser-local and server-local assumptions without explicit conversion

## Build And Asset Delivery

The head app may continue to use its own SvelteKit/Vite build pipeline while being copied into `clinic_flow/public/` for Frappe delivery.

Rules:

- production routes must include hashed or manifest-resolved assets unless a slice spec documents a temporary exception
- build output should not require global Desk asset injection
- slice bundles should be loaded only by the relevant shell route
- static assets must not be treated as authenticated app shells by themselves
- static HTML files under assets are not operational route shells
- deployment must include frontend build verification
- route-level verification must load the real Frappe shell and built assets

If Frappe v16 esbuild bundle integration becomes preferable for a slice, the decision should be documented before mixing build systems.

## Module Boundaries

Head-app code should be organized by operational domains, not by one global page file.

Recommended shared modules:

- `shared/boot`
- `shared/api`
- `shared/realtime`
- `shared/query`
- `shared/session-state`
- `shared/errors`
- `shared/keyboard`
- `shared/ui`
- `shared/formatting`

Feature modules should live under a feature or route-specific namespace such as `features/<slice-name>` or an equivalent convention selected by the frontend workspace.

Each module should expose a small public surface and hide implementation details.

## Error Handling And Diagnostics

The API adapter should normalize Frappe errors into frontend-safe error objects.

Minimum categories:

- unauthenticated session
- forbidden or missing role
- CSRF failure
- validation failure from `frappe.throw`
- network failure
- stale or conflicting server state
- unknown failure

Operational pages should favor clear recovery actions over generic errors.

Diagnostics should be useful but privacy-safe. Do not log patient names, tokens, phone numbers, clinical notes, or other sensitive details unless a future policy explicitly allows it.

## Security Rules

Frontend security rules:

- never use browser API keys or API secrets
- never disable CSRF in production
- escape patient-controlled and user-controlled strings
- avoid raw `document.write` with patient data
- treat backend-provided HTML or SVG as trusted only when generated by app-owned code and documented
- avoid storing operational patient data in `localStorage` unless explicitly approved
- prepare for tighter CSP rules by minimizing inline scripts beyond the controlled boot object

## Development And Mocking

The frontend dev workflow must support either proxying to Frappe or using typed mock adapters.

Rules:

- mock data must match runtime schemas
- boot adapter fixtures must exist for tests
- tests must not only verify mock behavior
- at least one integration path must load through the real Frappe shell
- dev-only shortcuts or debug panels must not leak into production unless intentionally enabled

## Dependency Governance

New frontend dependencies require an explicit decision note when they affect UI primitives, state management, build behavior, transport, or validation.

Dependency selection rules:

- prefer headless or source-owned components over visually opinionated kits
- require Svelte 5, SvelteKit, and TypeScript compatibility
- avoid global CSS that conflicts with Clinic Flow tokens
- avoid duplicate primitive libraries unless there is a documented reason
- avoid libraries that force a product visual identity
- prefer small, replaceable adapters over deep framework lock-in

## Spec Governance And Slice Design Pattern

Frontend head-app work should use a three-layer spec model.

### 1. Canonical Platform Spec

This document is the canonical platform spec for head-app architecture.

It owns:

- hosting model
- route namespace
- auth, session, and CSRF strategy
- TypeScript and runtime-contract policy
- UI primitive and dependency policy
- keyboard-first operational rules
- API, state, query, and realtime patterns
- build and asset delivery expectations
- testing and diagnostic requirements

Future slice specs must inherit this platform spec. They must not re-open platform decisions unless they explicitly propose a canonical architecture revision.

### 2. Slice UI/Product Spec

A slice UI/product spec owns what operators see and how the workflow should feel.

It owns:

- operator workflow
- information hierarchy
- visual direction
- state presentation
- copy and tone
- layout and interaction intent
- accessibility expectations specific to the workflow

UI/product specs should avoid redefining shell, auth, API, build, or platform dependency decisions that belong to the canonical platform spec.

### 3. Slice Technical Spec

A slice technical spec owns how a specific slice applies this architecture.

It owns:

- route under `/clinic/<slice>`
- Frappe shell behavior and boot payload extensions
- app-owned API methods used by the slice
- backend permission checks
- mutation authority and authoritative response shape
- local state model
- server-state/query model
- realtime or polling invalidation behavior
- primary keyboard loop and shortcuts
- error and degraded-state behavior
- migration and coexistence details
- real Frappe-route integration verification

### When To Split Slice Specs

Use one combined slice spec when the slice is small, low-risk, and visually straightforward.

Use separate UI/product and technical specs when the slice has substantial interaction design, architecture risk, backend contracts, migration complexity, or an existing approved UI/product spec.

When a UI/product spec already exists and the change is architectural, write a technical correction/application spec rather than rewriting the UI/product spec.

### Spec Precedence

When specs overlap, use this precedence:

1. Canonical platform spec wins for platform decisions.
2. Slice technical spec wins for implementation mechanics within the platform.
3. Slice UI/product spec wins for product and visual intent.
4. If a lower-level spec conflicts with this canonical spec, update the lower-level spec or explicitly revise this canonical spec.

## Slice Spec Requirements

Every slice-specific spec must inherit this architecture and define:

- route under `/clinic/<slice>`
- staff roles allowed to access the shell
- boot payload extensions, if any
- app-owned API methods used by the slice
- mutation authority and authoritative response shape
- local state model
- server-state/query model
- realtime or polling invalidation behavior
- primary keyboard loop and shortcuts
- visual direction and design-token usage
- accessibility requirements specific to the workflow
- error and degraded-state behavior
- real Frappe-route integration tests
- coexistence behavior with legacy Desk pages

Slice specs must not re-open the platform decisions in this spec unless they explicitly propose an architecture revision.

## Testing Expectations

Each head-app slice should be verified at these layers:

1. Frontend unit tests for local state, keyboard logic, and classification logic.
2. Frontend component tests or e2e tests for visible state transitions.
3. Backend contract tests for whitelisted method payloads and permissions.
4. Integration test against the actual Frappe-served route, not only the Vite dev route.
5. CSRF/session failure test or manual verification for unsafe requests.
6. Realtime or polling refresh verification for stale-state recovery.
7. Keyboard-only workflow verification for the slice's primary loop.

A slice is not complete if it only passes Vite/Svelte tests but has not loaded through the real Frappe shell.

## Migration Strategy

Use a vertical-slice migration.

Migration order should be decided by operational risk and product value. The first corrected slice should establish the shared boot, API, error, keyboard, query, and transport adapters that later slices inherit.

Legacy Desk pages remain during coexistence. They may link or redirect to standalone head-app routes once accepted.

Full-headless deployment should be revisited only after core operational slices stabilize on the standalone shell model.

## Success Criteria

This architecture is working when:

- operational staff pages run outside Desk chrome
- same-origin session auth works without browser API secrets
- CSRF-protected mutations succeed through the injected boot token
- backend APIs enforce staff permissions directly
- TypeScript contracts and runtime validation catch frontend/backend drift early
- local UI updates feel immediate during high-frequency interaction
- keyboard workflows are faster than mouse-dependent operation for primary tasks
- server state remains authoritative after mutation and refresh
- route-level integration tests cover the real Frappe-served shell
- future full-headless migration remains an adapter swap, not a page rewrite

## Open Decisions For Later

- whether Frappe realtime is sufficient for all high-frequency slices
- whether to introduce a dedicated SSE/websocket contract after the first few slices
- whether to adopt an official frontend SDK pattern or keep a small custom Svelte API adapter
- whether a BFF becomes useful before full-headless deployment
- whether the `/clinic/<slice>` namespace needs deployment-specific aliases
