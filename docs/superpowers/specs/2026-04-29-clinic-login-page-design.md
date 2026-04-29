# Clinic Login Page Design

Date: 2026-04-29
App: `clinic_flow`
Status: Draft for Implementation Planning

## Goal

Define a unified login and access-denied surface for all `/clinic/*` head-app slices, replacing the generic Frappe "Not Permitted" page with a design-consistent, slice-aware authentication entry point.

The login page must eliminate the current two-hop unauthenticated experience (generic "Not Permitted" → click "Login" → Frappe default login) and replace it with a single direct redirect to a calm clinical login form.

## Problem Statement

Current behavior when an unauthenticated or unauthorized user visits `/clinic/arrival-counter`:

1. `frappe.only_for()` raises `PermissionError`
2. Frappe renders a generic white "Not Permitted" page with a "Login" button
3. User clicks "Login" → redirected to `/login?redirect-to=/clinic/arrival-counter`
4. Frappe's default login page renders (not design-consistent with Clinic Flow)
5. After login → redirected to Arrival Counter

This is three visual hops, two of which are unstyled and outside the Clinic Flow design language. For a shared clinic workstation where staff may sign out between shifts, this creates an impersonal and disorienting entry experience.

Additionally, a user who is logged in but lacks the required role sees the same generic "Not Permitted" page with no explanation of which roles are needed.

## Scope

In scope:

- unified login page at `/clinic/login` for all `/clinic/*` head-app slices
- direct redirect from shell routes when user is Guest or lacks required role
- Frappe session/cookie authentication backend (no new auth mechanism)
- access-denied mode for authenticated users who lack required roles
- design language consistent with the Clinic Flow operational surface direction
- slice navigation buttons on the login page
- "Forgot password?" link to Frappe's built-in reset flow
- boot context for the login page
- backend route and redirect logic
- tests for auth detection, redirect, and shell rendering

Out of scope:

- replacing or modifying Frappe's default `/login` page
- password reset form in SvelteKit (links to Frappe's existing `/login#forgot`)
- "Remember me" checkbox (Frappe sessions are already persistent by default)
- OAuth or social login integration
- sign-out or switch-account action on the Arrival Counter header bar
- new backend queue semantics or Healthcare base-app modifications
- changes to Arrival Counter product intent or visual direction
- inactivity timeout or session lock screen
- BFF layer or separate auth provider

## Related Context and Authority

This document is a slice technical spec combined with a slice UI/product spec because the login page is a new shared platform surface rather than a modification of an existing slice.

Canonical related documents:

- `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md` — canonical platform architecture for head-app slices
- `docs/superpowers/specs/2026-04-28-arrival-counter-standalone-shell-design.md` — Arrival Counter slice technical spec
- `docs/superpowers/specs/2026-04-27-arrival-counter-v1-frontend-design.md` — Arrival Counter UI/product spec for visual direction reference

Authority order:

1. The canonical head-app architecture spec owns platform decisions: shell model, auth model, CSRF strategy, API boundary rules.
2. This spec owns the Clinic Flow login page product intent and technical application.
3. Individual slice UI/product specs own their slice-specific workflow and visual intent.

This spec does not redesign the Arrival Counter, change queue authority, or modify Frappe's authentication backend.

## Product Intent

The Clinic Flow login page is a shared operational entry point, not a marketing page or a generic admin login.

Primary usage:

- staff open a `/clinic/*` URL (direct link, bookmark, or desk redirect)
- if not authenticated, they are redirected to `/clinic/login` with the target slice preserved
- they sign in with their Frappe credentials
- they are redirected directly to the target slice

The login page must feel like part of the clinic operational surface, not a disconnected admin form dropped in from another product.

## Users and Access

- the login page is accessible to Guest (unauthenticated) users
- the access-denied mode is shown to authenticated users who lack any Clinic Flow staff role
- no special role is required to view the login page itself
- successful authentication grants access based on role, not on the login page

## Auth Mechanism

The login page uses Frappe's existing session/cookie authentication.

Chosen mechanism:

- POST to `/api/method/login` with `usr` and `pwd` form fields
- Frappe handles credential validation, session creation, and cookie setting
- on success, the response indicates `"Logged In"` for System Users
- the login page reads the `redirect-to` query parameter and navigates there after successful login
- Frappe's `sanitize_redirect` logic ensures redirect targets stay on the same domain

Properties:

- same-origin session/cookie auth, consistent with the head-app architecture spec
- CSRF token is included in the login request for good practice, though Frappe bypasses CSRF validation on the login endpoint itself
- the login page's Frappe shell route injects a guest CSRF token via the boot context
- no browser-exposed API keys or secrets
- no OAuth or token auth in v1

Not chosen for v1:

- separate OAuth/OIDC provider — unnecessary complexity for same-origin staff-only auth
- browser API keys — the architecture spec explicitly forbids these
- BFF layer — a thin API client is sufficient for v1

## Auth Detection and Redirect

All `/clinic/*` shell routes must detect authentication state before rendering the slice.

### Guest user (not logged in)

When `frappe.session.user == "Guest"`:

- the shell route sets `frappe.local.flags.redirect_location` to `/clinic/login?redirect-to=<original-url>`
- the shell route raises `frappe.Redirect` to perform a 302 redirect
- the generic Frappe "Not Permitted" page must never appear for `/clinic/*` routes

### Authenticated user with insufficient role

When the user is authenticated but lacks any role required by the target slice:

- the shell route sets `frappe.local.flags.redirect_location` to `/clinic/login?redirect-to=<original-url>&mode=access-denied`
- the shell route raises `frappe.Redirect`
- the login page renders in access-denied mode showing the current user and the required roles

### Authenticated user with correct role

- the shell route proceeds normally, injecting the full slice boot context
- no login page interaction occurs

This redirect logic must be applied consistently across all `/clinic/*` shell routes, not just Arrival Counter.

## Login Page States

The login page has two product states: login mode and access-denied mode.

### Login mode

Seen by Guest (unauthenticated) users.

Content:

- Clinic Flow branding (product name, not the specific slice name)
- "Sign in to continue" subtitle
- email or username field
- password field with toggle visibility
- "Sign In" primary action button
- inline error message area for: invalid credentials, account disabled, rate limited
- "Forgot password?" link pointing to Frappe's `/login#forgot`
- "or go to" divider
- slice navigation buttons (Arrival Counter in v1, more later)
- keyboard-first: Enter submits the form

Behavior:

- on successful login, redirect to the `redirect-to` URL from the boot context
- if no `redirect-to`, redirect to `/clinic/arrival-counter` (default slice)
- on login failure, show inline error message, keep form populated
- on network failure, show inline error message, allow retry
- the form must not clear on error

### Access-denied mode

Seen by authenticated users who lack any Clinic Flow staff role.

Content:

- Clinic Flow branding
- "You are signed in as user@example.com"
- "This application requires one of the following roles: Healthcare Administrator, Queue Manager, or System Manager"
- "Sign out and use a different account" action button
- "or go to" divider
- slice navigation buttons (same as login mode)

Behavior:

- "Sign out" button posts to `/api/method/logout` then redirects back to `/clinic/login?redirect-to=<original-url>`
- after sign-out and re-login with correct role, the user reaches the target slice
- no email/password form is shown in this mode

## Visual Direction

The login page must feel like part of the same calm clinical surface as Arrival Counter, not like a generic admin login form or a consumer marketing page.

### Visual vocabulary

Interpret direction language identically to Arrival Counter's visual vocabulary:

- `Calm clinical`: off-white canvas (`#f6f5f1` or equivalent), low visual noise, no celebratory motion, no decorative illustrations
- `Modern`: clear type scale, intentional whitespace, precise focus states
- `Sleek`: crisp borders, restrained elevation, aligned content edges
- `Premium`: high-quality spacing rhythm, strong primary action styling
- `Slight operational edge`: mineral-teal (`#0d6f69`) primary actions, compact state labels, visible keyboard focus

Not allowed: glassmorphism, gradient text, neon accents, generic SaaS dashboard patterns, playful kiosk styling.

### Typography

Inherit from the head-app design system:

- headings/token emphasis: Lexend
- body/metadata/buttons/helper text: Source Sans 3

### Color direction

Inherit from Arrival Counter:

- background canvas: warm off-white (`#f6f5f1`)
- card surface: white (`#ffffff`) or near-white with subtle transparency
- primary action: mineral teal (`#0d6f69`)
- text: `#10211f`
- metadata/helper text: `slate-600`
- error state: warm-error tone consistent with Arrival Counter's warning palette
- borders: `#d9ddd8`
- border radius: `1.5rem` for card and inputs (matching Arrival Counter surface pattern)

### Layout

- full-viewport centered layout
- single card surface for the form
- no sidebar, no header bar, no footer links beyond the specified content
- no Desk chrome

### Slice navigation buttons

- displayed below the "or go to" divider in both modes
- each button is a compact card linking to a `/clinic/<slice>` route
- v1 includes Arrival Counter only
- buttons must be visually distinct from the primary "Sign In" action (secondary style)
- design must accommodate additional slice buttons in the future without layout changes

## Boot Context

The login page has its own boot context, separate from any slice boot context.

Required boot fields:

```typescript
interface LoginBoot {
  app: "clinic_flow";
  slice: "login";
  route: "/clinic/login";
  siteName: string;
  csrfToken: string;
  redirectUrl: string;
  mode: "login" | "access-denied";
  requiredRoles: string[];
  currentUser: string | null;
}
```

The login boot context does not include:

- `user` or `roles` in the slice-owner sense (the login page is pre-authentication for Guest mode)
- `permissions` (no slice-specific permissions apply)
- `realtime` (the login page does not use realtime updates)

The `csrfToken` is the Guest session CSRF token, injected by the Frappe shell route.

The `redirectUrl` is derived from the `redirect-to` query parameter, sanitized to stay on the same domain.

The `mode` is determined by the shell route based on authentication state.

The `requiredRoles` list is resolved per target slice. Each slice defines its own allowed roles (e.g., `ARRIVAL_COUNTER_ROLES` for Arrival Counter). When the login page is reached via a redirect from a specific slice route, `requiredRoles` reflects that slice's roles. When `/clinic/login` is visited directly without a `redirect-to` parameter, `requiredRoles` defaults to the Arrival Counter roles in v1. Future slices will extend this with their own role requirements.

The `currentUser` is `frappe.session.user` if authenticated, `null` if Guest.

### Direct visit behavior

When `/clinic/login` is visited directly without a `redirect-to` parameter:

- **Guest**: `redirectUrl` defaults to `/clinic/arrival-counter` (the default slice in v1), `mode` is `"login"`
- **Authenticated with clinic role**: redirect immediately to `/clinic/arrival-counter`
- **Authenticated without clinic role**: render access-denied mode

## Shell Contract

The login page is served by a Frappe www route at `/clinic/login`.

Route:

```text
/clinic/login
```

Shell behavior:

- if the user is authenticated and has any Clinic Flow staff role → redirect to `redirect-to` URL (or default slice)
- if the user is authenticated but lacks required roles → render login page with `mode=access-denied`
- if the user is Guest → render login page with `mode=login`

The Frappe route renders a minimal HTML shell that:

- sets `no_cache = 1`, `no_header = 1`, `no_sidebar = 1`, `no_breadcrumbs = 1`
- injects `window.clinicFlowBoot` with the login boot context
- loads the SvelteKit login bundle

The login page must not be served as a static asset or inside an iframe.

## API Boundary

The login page uses exactly one Frappe endpoint for authentication:

- `POST /api/method/login` — Frappe's built-in login endpoint

The login page must not call any `clinic_flow.api.*` methods. It is a platform authentication surface, not a slice-specific business API consumer.

After successful login, the page navigates to the target slice URL. The target slice shell route then injects its own boot context and loads its own bundle.

## Security Rules

- `redirect-to` URL must be sanitized to stay on the same domain (using Frappe's `sanitize_redirect` logic or equivalent)
- the login page must not expose CSRF tokens from authenticated sessions to Guest users
- the login page must not reveal whether a username exists (Frappe's default error handling applies)
- the login page must not bypass Frappe's rate limiting or account lockout
- the login page must not store credentials in `localStorage` or `sessionStorage`
- password fields must use `type="password"` with visibility toggle
- the login page must not render tracebacks or server error details

## Error and Degraded Behavior

Required error categories:

- **invalid credentials**: inline message, form stays populated
- **account disabled**: inline message, form stays populated
- **rate limited**: inline message indicating wait time if available
- **network failure**: inline message, allow retry
- **session expired mid-interaction**: redirect back to login page with `redirect-to` preserved

Error messages must use plain operational language, not technical jargon.

## Keyboard Behavior

The login page is keyboard-first for staff who type credentials regularly.

Primary keyboard loop:

1. email/username field receives focus on page load
2. `Tab` moves between email, password, and "Sign In" button
3. `Enter` submits the form from any field
4. password `Eye` toggle is accessible via keyboard
5. "Forgot password?" link is keyboard-navigable
6. slice navigation buttons are keyboard-navigable
7. on access-denied mode, "Sign out" button receives initial focus

Focus must be visible on all interactive elements.

## Route Namespace

The login page lives under the canonical `/clinic/` namespace:

```text
/clinic/login
```

All `/clinic/*` shell routes must check authentication state and redirect to `/clinic/login` when needed.

The `redirect-to` query parameter preserves the original target URL across the redirect.

## Slice Navigation

The login page includes a slice navigation section below the login form.

v1 slice buttons:

- Arrival Counter → `/clinic/arrival-counter`

Future slice buttons (design must accommodate without layout changes):

- Reception Dashboard → `/clinic/reception`
- Token Board → `/clinic/token-board`

Slice buttons are secondary actions, not primary. They must not visually compete with the "Sign In" button.

Slice buttons do not bypass authentication. Clicking a slice button simply navigates to that slice's URL, which will redirect back to `/clinic/login` if the user is not authenticated.

## Realtime and Refresh

The login page does not use realtime updates or polling. It is a static form that communicates with the backend only through the login POST.

After successful login and redirect, the target slice handles its own context refresh and realtime setup.

## Testing Expectations

### Backend contract tests

- Guest user visiting `/clinic/arrival-counter` → 302 redirect to `/clinic/login?redirect-to=/clinic/arrival-counter`
- Authenticated user with wrong role visiting `/clinic/arrival-counter` → 302 redirect to `/clinic/login?redirect-to=/clinic/arrival-counter&mode=access-denied`
- Authenticated user with correct role → normal Arrival Counter page (no redirect)
- `/clinic/login` for Guest user → renders login mode
- `/clinic/login` for authenticated user with clinic role → redirect to target slice
- `/clinic/login` for authenticated user without clinic role → renders access-denied mode
- Invalid `redirect-to` URLs are sanitized (cross-domain → default slice)
- Login boot context contains correct fields and no authenticated user data in Guest mode

### Frontend unit tests

- Boot validation rejects invalid or missing boot context
- Login form validates empty fields before submission
- Login form handles error responses correctly
- Access-denied mode renders current user and required roles
- "Forgot password?" link points to `/login#forgot`
- Redirect URL is preserved across the login flow

### Frontend e2e tests (Playwright, requires running Frappe)

- Guest visit to `/clinic/arrival-counter` redirects to `/clinic/login`
- Successful login redirects to the original target URL
- Failed login shows inline error, keeps form populated
- Access-denied mode shows user email and required roles
- "Sign out" button logs out and returns to login mode

### Real Frappe-route integration test

- `/clinic/login` loads the shell and SvelteKit bundle correctly
- Boot context is injected and runtime-validated by the frontend
- No iframe is present in the rendered page

## Migration and Coexistence

- the legacy Frappe `/login` page remains unchanged and available
- the legacy `arrival_counter` Desk page remains available as a compatibility path
- `/clinic/login` is the new canonical login entry point for all `/clinic/*` routes
- existing `/clinic/arrival-counter` behavior for authenticated + authorized users does not change

## Non-Goals and Guardrails

- do not replace or modify Frappe's default `/login` page
- do not create a separate OAuth or token auth system
- do not add a "Remember me" checkbox
- do not implement password reset in SvelteKit (link to Frappe's existing flow)
- do not add sign-out or switch-account to the Arrival Counter header bar in v1
- do not change queue authority or Healthcare base-app code
- do not introduce inactivity timeout or session lock screen
- do not bypass or weaken Frappe's authentication, rate limiting, or account lockout
- do not render server error tracebacks in the login UI
- do not store credentials in browser storage

## Success Criteria

The Clinic Flow login page succeeds when:

1. Guest users visiting any `/clinic/*` route are redirected directly to `/clinic/login` with the target preserved — no generic "Not Permitted" page appears
2. Authenticated users without required roles see a clear access-denied message with their username and the required roles
3. Successful login redirects directly to the target slice
4. The login page visual language is consistent with the Arrival Counter calm clinical direction
5. Keyboard-first operation covers the primary login flow
6. "Forgot password?" links to Frappe's existing reset flow
7. Slice navigation buttons allow direct navigation without bypassing auth
8. The login page does not expose authenticated session data to Guest users
9. `redirect-to` URLs are sanitized against cross-domain redirects
10. The Frappe default `/login` page remains unchanged

## Design Decision Summary

| Decision | Choice | Rationale |
|---|---|---|
| Login page URL | `/clinic/login` | Matches canonical `/clinic/<slice>` namespace |
| Branding | "Clinic Flow" | Platform-level, serves all slices |
| Auth mechanism | Frappe `/api/method/login` | Same-origin session/cookie auth, no new mechanism |
| Remember me | Excluded | Frappe sessions are persistent by default |
| Forgot password | Link to `/login#forgot` | Uses Frappe's existing reset flow |
| Access-denied UX | Message on login page with sign-out link | Per product decision |
| Slice buttons | Yes, at bottom of form | Users select destination before or after login |
| Separate boot type | Yes, `LoginBoot` | Login page needs different fields than slice boots |
| Scope | `/clinic/login` only | Frappe's `/login` remains unchanged |