# Arrival Counter V1 Frontend Design

Date: 2026-04-27
App: `clinic_flow`
Status: Hardened Draft

## Goal

Design the standalone head-app frontend slice for `Arrival Counter` as a desktop-first, staff-only, focused check-in console.

The page must optimize for one repeated loop:

- identify patient fast
- confirm arrival
- optionally reprint token slip when appropriate
- return immediately to a ready state for the next patient

The page should feel like a calm clinical station with a slight operational edge. It must not become a dense receptionist console, a queue-control surface, or a generic product-template dashboard.

## Scope

This design covers only `Arrival Counter v1`.

In scope:

- desktop-first page layout
- visual hierarchy
- interaction states
- session context content
- recent arrivals content
- typography and palette direction
- state consistency rules for implementation
- visual acceptance criteria for implementation quality

Out of scope:

- receptionist shell
- live queue rail
- phone admission
- walk-in admission
- token board
- backend data model changes unrelated to arrival flow
- shell/auth/CSRF/build/API architecture decisions

## Related Context And Authority

This document is the Arrival Counter UI/product spec.

Canonical related documents:

- `PRODUCT.md` — product purpose, operator environment, and overall frontend direction
- `DESIGN.md` — shared head-app design system, tokens, typography rules, spacing rhythm, focus behavior, and visual governance
- `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md` — canonical platform architecture for head-app slices
- `docs/superpowers/specs/2026-04-28-arrival-counter-standalone-shell-design.md` — Arrival Counter slice technical application of the platform

Authority order for this slice:

1. The canonical head-app architecture spec owns platform decisions:
   - shell model
   - route model
   - auth/session/CSRF strategy
   - build and asset delivery direction
   - API boundary rules
   - transport and refresh architecture
2. The Arrival Counter standalone-shell technical spec owns slice mechanics:
   - boot contract
   - allowed roles
   - backend API usage
   - permission enforcement expectations
   - mutation authority
   - refresh behavior
   - coexistence and migration mechanics
3. This document owns Arrival Counter UI/product intent:
   - operator workflow feel
   - information hierarchy
   - visual structure
   - state presentation
   - copy tone
   - action emphasis
   - visual acceptance criteria
4. `DESIGN.md` provides the canonical shared design-system context for implementation:
   - semantic tokens
   - typography system
   - spacing rhythm
   - focus behavior
   - component styling principles
5. Stitch references are supporting visual calibration only:
   - they are state references, not separate page layouts
   - they do not override the canonical layout rules in this spec
   - they do not override `DESIGN.md` token and typography decisions

## Product Intent

`Arrival Counter` is a focused staff check-in console, not a queue-control surface and not a mini operational dashboard.

This UI/product spec owns the operator workflow, visual hierarchy, state presentation, tone, layout, and interaction intent. It does not own hosting, shell, CSRF, backend permission, build, or API architecture decisions.

Primary usage:

- QR scan for patients carrying printed slips

Fallback usage:

- patient name lookup
- child name lookup
- mobile number lookup

Required product boundary:

- the page may show compact operational context
- the page must not require queue triage or receptionist-style reasoning before confirming an arrival
- the page must not expose queue-control actions
- the page must not read like a receptionist dashboard with a smaller check-in widget embedded inside it

## Concrete Design Vocabulary

Interpret the direction language concretely:

- `Calm clinical`: off-white canvas, low visual noise, no celebratory motion, no saturated background fields, and no decorative patient imagery.
- `Modern`: clear type scale, intentional whitespace, responsive structure, precise focus states, and no Frappe Desk visual inheritance.
- `Sleek`: crisp borders, restrained elevation, aligned content edges, and no nested card clutter.
- `Premium`: high-quality spacing rhythm, strong token hierarchy, polished input surface, and clear primary action styling.
- `Slight operational edge`: decisive mineral-teal primary actions, compact state labels, visible keyboard focus, and token-first decision cards.

These terms must not be implemented as glassmorphism, generic SaaS dashboard patterns, gradient text, neon accents, decorative illustrations, or playful kiosk styling.

## Users And Access

- staff-only page
- primary environment: desktop monitor at the counter
- role boundary remains aligned with the technical slice spec:
  - `Healthcare Administrator`
  - `Queue Manager`
  - `System Manager`

## Core Workflow

### Primary path

1. Staff scans QR code.
2. The page resolves the patient.
3. Staff sees a single pre-confirm card.
4. Staff confirms arrival.
5. The page shows success.
6. The page returns to a ready state after a short delay.

### Fallback path

1. Staff types patient name, child name, or mobile number.
2. The page resolves zero, one, or multiple matches.
3. Staff chooses the intended patient if needed.
4. Staff confirms arrival.
5. The success state includes `Print Token Slip`.

### Already-arrived path

1. Staff looks up a patient already checked in.
2. The page shows an `Already Arrived` state.
3. The page offers `Print Token Slip`.

## Keyboard-First UX

Arrival Counter must be faster with scanner and keyboard than with mouse-only operation.

Primary keyboard loop:

1. Input receives focus when the page loads.
2. Scanner input or typed search fills the unified input.
3. `Enter` submits lookup.
4. If one candidate resolves, the decision card becomes the active context.
5. In pre-confirm state, `Enter` confirms arrival only when the primary action or result-card decision context is active.
6. In multiple-match state, `ArrowUp` and `ArrowDown` move candidate focus.
7. In multiple-match state, `Enter` selects the focused candidate.
8. `Escape` resets to idle from no-match, multiple, pre-confirm, already-arrived, or success states.
9. After success auto-reset, focus returns to the scan/search input.

Focus rules:

- background refresh must not steal focus
- visible focus state is required on input, candidate rows, and actions
- shortcuts must be disabled while lookup or confirm mutation is pending
- print shortcut, if implemented, is available only in already-arrived and success states

## Information Hierarchy

The hierarchy must remain stable across all states.

Visual priority order:

1. unified scan/search input
2. result-state card
3. compact context: current session, next session, arrival stats
4. quiet support: recent arrivals

The page must visually communicate that the input and result card are the reason the page exists, while the surrounding context is only there to orient the staff member.

Header context must stay informational. Recent arrivals must stay reassuring. Neither may visually compete with the working surface.

## Canonical Layout

The implementation must use one canonical page layout.

### Top bar

- page title: `Arrival Counter`
- current active session summary
- immediate next scheduled session summary
- two compact stats:
  - `Arrived`
  - `Awaiting Arrival`

The top bar is informational only in v1. It must not include generic utility buttons, queue controls, or secondary workflow actions.

### Main working column

- dominant unified input surface
- single result-state card beneath it
- quiet recent-arrivals section below the card

### Layout rules

- single-page composition only
- no sidebar
- no app-shell navigation
- no footer links
- no chrome that suggests this page is part of a broader product marketing surface
- no permanent second operational column
- no visually equal supporting panels competing with the input and result card

### Responsive rules

- primary target: desktop counter screens from 1024px wide upward
- supported minimum width: 768px for tablet or narrow desktop fallback
- below 1024px, header stats may wrap below session chips, but input remains before result card
- below 768px, the page may stack vertically, but no state may require horizontal scrolling
- recent arrivals must remain below the result card, never above the input or decision surface

## State Consistency Rules

This is a hard implementation rule.

Arrival Counter v1 uses one canonical page structure and one canonical result-card shell across all visible states.

The purpose of this rule is to keep the page mentally stable under repeated staff use. Operators should feel that the page is changing state inside one familiar working surface, not jumping between different mini-designs.

### Locked Page Structure

The following structural elements must remain in the same order and role across all states:

1. top bar with compact session context and arrival stats
2. unified scan/search input surface
3. single result-card area
4. quiet recent-arrivals section

This order must not change by state.

### Locked Result-Card Shell

The result area must keep one stable shell across:

- idle
- loading
- no-match
- multiple
- pre-confirm
- already-arrived
- success

The shell should preserve:

- the same overall footprint
- the same border radius family
- the same padding logic
- the same visual anchoring zone for token-first content
- the same lower action zone
- the same relationship to the input above and recent arrivals below

A state may feel lighter or more resolved, but it must still read as the same decision surface.

### Allowed State Variation

The following may change by state:

- state label text
- state-supporting copy
- state iconography
- metadata content
- button set
- subtle surface tint or resolved-state emphasis
- loading indicator treatment
- candidate-list content inside the result-card footprint

### Forbidden State Variation

The following must not change by state:

- page layout
- top-bar placement
- input placement
- result-card footprint category
- token anchor position in resolved states
- recent-arrivals placement
- typography system
- overall visual language
- action-row location within the card
- introduction of extra competing cards above or beside the result card

### Multiple-Match Rule

Multiple-match state must remain inside the shared result-card shell or an equivalent result-card footprint.

It must not introduce:

- a second competing card above the result area
- a table-like dashboard block
- a separate page mode with different composition
- a visually stronger candidate surface than the normal decision card family

Candidate rows may replace the resolved patient body content, but they must still feel like the same working surface.

### Resolved-State Rule

Pre-confirm, already-arrived, and success are all resolved patient states and must share the same core composition:

- token as primary anchor
- patient name as secondary anchor
- compact metadata band
- action row in a stable position

These states may differ in action set and emotional tone, but not in structural identity.

### Degraded-State Rule

Error and degraded conditions must not create a separate page design.

Examples:

- forbidden
- session expired
- CSRF refresh needed
- stale context
- temporary network failure

These should appear through low-disruption banners, inline state copy, or other restrained feedback within the same page structure.

### Acceptance Checks

The implementation passes this rule only when:

- staff can move from idle to lookup to confirm to success without perceiving a page redesign
- multiple matches feel like a variant of the same result surface, not a new module
- recent arrivals never jump above the result area
- no state introduces a second dominant card competing with the result card
- resolved states share the same token-first visual logic
- degraded states do not break the canonical page structure

## Input Surface

The unified scan/search input is the visual and operational anchor of the page.

In the idle state, it must be the strongest element on the screen. It should communicate immediate readiness for the next patient without relying on motion, gimmicks, or heavy decoration.

### Purpose

The input exists to support one repeated action loop:

1. scan QR code
2. resolve patient
3. confirm arrival
4. return to ready state

The input must therefore feel:

- scan-first
- immediately available
- calm but decisive
- more important than header context
- more important than recent arrivals

It should not feel like a generic form field or a search bar borrowed from a dashboard.

### Structural Rules

The page uses one unified input only.

The input must:

- support QR scan, patient name, child name, and mobile number through the same field
- visually read as a scan-first control even though fallback text entry is supported
- remain above the result card in every state
- remain visible in loading, no-match, multiple, pre-confirm, already-arrived, and success states
- keep its footprint stable enough that state changes below it do not feel like layout churn

The input must not split into visible tabs, chips, or mode selectors for QR, name, child name, and mobile lookup in v1.

### Visual Priority

Idle-state priority must read in this order:

1. input surface
2. page title and compact session context
3. recent arrivals

When a patient is resolved, the result card may become the strongest decision surface, but the input must still remain visually ready for the next loop.

### Visual Character

The input should feel premium and purpose-built.

Required qualities:

- generous horizontal space
- strong legibility from a counter-working distance
- crisp border definition
- restrained surface warmth or tinting
- visible focus readiness
- enough scale to feel like the main tool on the page

Avoid:

- thin low-contrast borders
- small generic form proportions
- decorative icon clutter
- exaggerated gradients
- glassy transparency effects
- dashboard-search styling
- multi-control filter bar aesthetics

### Copy

Default field label should clearly support the scan-first workflow.

Preferred placeholder copy:

`Scan QR code or enter patient name, child name, or mobile number`

Implementation may add concise supporting helper text if needed, but the field must still read first as a scan/search control, not as a form workflow.

Helper copy must stay short, low-drama, and non-repetitive.

### Focus And Readiness

The input must visibly communicate readiness.

Rules:

- the field must receive focus on page load
- the field must regain focus after success auto-reset
- background refresh must not steal focus
- focus treatment must be clearly visible without overpowering the page
- disabled or pending states must remain readable and structured, not washed out or collapsed

### Action Relationship

A supporting submit action may exist beside the field, but it must remain secondary to the field itself.

If a button is present:

- it should support the scan/search action clearly
- it must not visually compete with `Confirm Arrival`
- it must feel like part of the input surface, not a separate workflow action

### Acceptance Checks

The implementation passes this section only when:

- in idle state, the input is the strongest element on the page without animation
- the input feels scan-first even though patient name, child name, and mobile lookup are supported
- the field remains visible and stable across all page states
- the input does not visually degrade into a generic dashboard search bar
- the field regains focus after reset and remains reliable during background refresh
- the supporting action, if present, does not compete with resolved-state actions

## Result Card

The result card is the operational decision surface.

It must feel deliberate, calm, and token-first. It must not look like a generic content card, a dashboard widget, or an alert box with buttons attached below it.

### Shared Structure

The shared result-card shell should preserve:

- token as the strongest visual anchor in resolved states
- patient name as the second anchor
- compact metadata band
- stable action row zone
- one clear body area for state-specific content

The card footprint must remain stable enough that transitions between no-match, multiple, pre-confirm, already-arrived, and success feel like state changes, not layout swaps.

### Token Hierarchy

Token presentation rules:

- token is the largest and boldest text in resolved states
- token should visually outrank page title and stat numerals
- token should remain clean, uncluttered, and easy to read from a working distance
- token must not compete with decorative icons or oversized labels

### Patient And Metadata Hierarchy

Patient and metadata rules:

- patient name is the second anchor below the token
- metadata must stay compact, readable, and low-drama
- metadata may include practitioner, visit context, expected time, or other operationally useful details when available
- metadata must never push the card toward a table or dashboard feel

### Content Rules

Do not include:

- patient photo
- generic patient avatar
- decorative illustration
- queue-control tools
- chart-like summary blocks
- noisy icon clusters

### Action Hierarchy

Primary action in pre-confirm state:

- `Confirm Arrival`

Secondary action in pre-confirm state:

- `Not this patient`

Conditional secondary action:

- `Print Token Slip`

Rules:

- `Confirm Arrival` must be the only high-emphasis action in pre-confirm state
- `Not this patient` must remain visibly secondary
- `Print Token Slip` must never appear in pre-confirm state
- when present in already-arrived or success, `Print Token Slip` must remain lower emphasis than the primary confirm action would have been in pre-confirm

### Required States

#### 1. Idle ready state

- input focused or visually ready
- no resolved patient card yet
- compact context visible
- recent arrivals visible

The result-card shell remains present and calm, signaling readiness without feeling empty or broken.

#### 2. Loading state

- input remains visible
- a small loading treatment appears in the result area
- no layout jump

Loading should feel lightweight and operational, not dramatic.

#### 3. No-match state

- clear but low-drama message
- no dense troubleshooting copy
- keep staff moving

This state should occupy the same shell without becoming an error page.

#### 4. Multiple-matches state

- compact candidate list
- not table-like
- each candidate row remains quick to scan
- candidate list must live inside the shared result-card shell or an equivalent result-card footprint
- multiple-match state must not introduce a separate competing card above the result card

#### 5. Pre-confirm state

- token dominant
- patient name second
- metadata compact
- `Confirm Arrival` primary
- `Not this patient` secondary
- no `Print Token Slip`

#### 6. Already-arrived state

- same card shell as pre-confirm
- calm resolved treatment
- `Print Token Slip` available
- no `Confirm Arrival`

#### 7. Success state

- same card shell as pre-confirm
- reassuring success treatment
- `Print Token Slip` available
- return-to-ready behavior after a short delay

### Candidate Rows

Candidate rows in multiple-match state must:

- feel like options inside the same decision surface
- remain compact and quick to scan
- support visible keyboard focus
- expose accessible names including token and patient name
- avoid table-heavy or admin-list styling

### Acceptance Checks

The implementation passes this section only when:

- resolved token number is the largest text on the page
- patient name clearly reads as the second anchor
- `Confirm Arrival` is the only visually dominant action in pre-confirm state
- multiple matches appear inside the same result-card footprint as other states
- no state turns the result area into a table, dashboard panel, or alert stack
- already-arrived and success states feel calm and resolved, not celebratory or warning-heavy

## Session Context

The header must provide useful context without becoming dense.

### Required Content

- active current session
- immediate next scheduled session
- `Arrived` count
- `Awaiting Arrival` count

### Content Intent

`Arrived` represents patients already physically checked in.

`Awaiting Arrival` represents patients expected but not yet physically arrived.

The session copy should be operationally informative, for example:

- `Active: Morning Clinic`
- `Next: Afternoon Surgery`

The implementation may map exact copy to available backend payloads, but the design intent must remain current-session plus immediate-next-session clarity.

### Quietness Rules

The top bar must be visually quieter than the input and result card.

That means:

- lower contrast than the primary decision surface
- compact chip-like summaries rather than big dashboard tiles
- restrained stat styling even when numbers are large
- no dominant action buttons in the header
- no visual treatment that makes the header feel like a second main module

### Formatting Rules

- show at most two session chips in the top bar: current and next
- use `No active session` and `No next session` when absent
- stat labels must be exactly `Arrived` and `Awaiting Arrival`
- stat numerals must be visually secondary to resolved token numbers

## Recent Arrivals

`Recent Arrivals` should remain visible but visually quiet.

### Purpose

This section exists to reassure staff that recent activity is being captured.

It does not exist to become a second dashboard, reporting module, or queue review surface.

### Required Behavior

- lower emphasis than the result card
- lighter than a dense activity table
- sufficient information to reassure staff that recent activity is being captured
- visually calm in both empty and populated states

### Recommended Row Content

- token
- patient name
- arrival time
- optional lightweight status chip such as `Arrived`

### Presentation Rules

- show up to 8 recent rows
- use local-readable time, not raw database datetime strings
- truncate long patient names on one line with a full value available to assistive tech
- empty state copy: `No arrivals captured yet for the current session.`
- stale state should be shown as a small low-emphasis status, not as an alert unless actions are blocked

### Quietness Rules

Recent arrivals must not:

- become a table-heavy panel
- visually outrank the header
- visually approach the emphasis of the result card
- move above the result area
- introduce a second dashboard rhythm on the page

## Visual Tone

The page should feel:

- light and airy
- modern and sleek
- calm clinical
- professional
- slightly operationally sharp

It should not feel:

- playful
- decorative
- public-kiosk-like
- receptionist-dashboard-dense
- generic admin template

## Background And Surfaces

Background direction:

- soft off-white canvas
- subtle curved architectural forms
- very low contrast
- barely hinted pediatric softness only

Foreground surfaces:

- crisp
- readable
- restrained depth
- lightly warmed neutrals allowed

Avoid:

- literal waiting-room scene recreation
- strong illustration motifs
- heavy glassmorphism
- visually noisy gradients

## Typography

Lock this type system for v1:

- headings, token emphasis, key stats: `Lexend`
- body text, metadata, helper text, buttons: `Source Sans 3`

This supersedes earlier Stitch project metadata that listed Plus Jakarta Sans and Inter. Stitch screens remain visual references, but `Lexend` and `Source Sans 3` are the implementation fonts for Arrival Counter v1.

### Rationale

- more healthcare-trustworthy than decorative or fashion-forward pairs
- more professional than earlier generic drafts
- readable at operational distances and sizes
- modern without feeling trendy

### Usage Rules

- token number: largest and boldest text on the page
- page title: strong but secondary to token in resolved states
- stat numerals: strong but quieter than token
- metadata: compact, calm, and low drama
- helper text: small but still accessible
- button text: short, crisp, and operational

## Color Direction

Primary direction:

- deep mineral teal for the primary action
- refined off-white background
- cool-soft green and neutral support tones
- slight warmth in supporting surfaces is acceptable

Recommended semantic intent:

- primary action: decisive mineral teal
- resolved success: restrained success tint, not bright celebratory green
- already arrived: calm resolved tone, not warning-heavy
- errors and no-match: clear but not visually aggressive

Avoid:

- neon accents
- AI-product purple/pink gradients
- over-pastel softness that weakens action clarity

### Token Mapping

Use `DESIGN.md` semantic tokens for implementation:

- canvas: `--cf-canvas`
- primary surface: `--cf-surface`
- quiet support surface: `--cf-surface-muted`
- mint context surface: `--cf-mint`
- primary action: `--cf-primary`
- text: `--cf-ink`
- muted text: `--cf-muted`
- borders: `--cf-line`
- focus: `--cf-focus`
- success, warning, and danger states: corresponding semantic state tokens

Avoid raw one-off color values in components unless the implementation note documents why.

## Buttons

### Confirm Arrival

- deep mineral teal fill
- premium, crisp, staff-tool feel
- clearly primary

### Not this patient

- ghost or text treatment
- understated secondary emphasis

### Print Token Slip

- refined low-emphasis secondary button
- available only in `Already Arrived` and `Success`

Buttons must feel purpose-built, not generic SaaS defaults.

## Accessibility And Interaction Rules

- visible focus state on input and buttons
- high-contrast readable text in light mode
- clear non-color cues for state changes
- no hover effects that shift layout
- reduced-motion friendly transitions
- desktop-first, but still structurally responsive
- keyboard-only workflow must cover lookup, candidate choice, confirm, reset, and print availability
- scanner input must remain reliable during background refresh
- candidate rows require accessible names that include token and patient name

## Realtime And Refresh Expectations

For v1, the page should support live context updates, but live awareness remains secondary to the check-in task.

The UI should:

- update session context without disrupting active input unnecessarily
- preserve focus and operator flow during live refreshes whenever possible
- avoid turning recent arrivals or session context into a noisy live dashboard

Refresh acceptance criteria:

- background refresh must not clear the active input
- background refresh must not change selected candidate during pre-confirm
- recent arrivals may update quietly below the result card
- if context becomes stale, show a low-emphasis stale indicator before blocking workflow

## Error And Degraded UX Tone

Errors must be operational and recovery-oriented.

Required tone:

- no-match: low-drama and brief
- no active session: explain that check-in is unavailable until a session opens
- forbidden/access denied: clear, non-technical, and action-stopping
- session expired or CSRF failure: ask staff to refresh or sign in again
- network failure: keep current visible context and offer retry
- stale state after failed mutation: refetch and ask staff to retry confirmation

Do not show raw Frappe tracebacks, HTTP jargon, or developer-only exception names in the operator UI.

## Print Slip Interaction

`Print Token Slip` is available only in already-arrived and success states.

Rules:

- pre-confirm state must never show print
- success auto-reset must leave enough time for staff to notice and print
- if print is triggered, auto-reset should not interrupt the print action
- if the browser blocks the print window, show a concise recovery message
- print content must use escaped patient-controlled text

## Backend Contract Expectations

The current arrival APIs already provide the right foundation:

- `get_arrival_session_context`
- `lookup_arrival_candidate`
- `mark_arrived`
- `get_token_qr`

The frontend should continue treating backend responses as authoritative.

## Stitch Reference Policy

Stitch references for Arrival Counter are visual examples and calibration material only.

Use Stitch for:

- comparing state mood and visual tone
- checking result-card emphasis
- checking calm clinical styling direction
- validating whether implementation still resembles the intended product posture

Do not use Stitch to:

- redefine the page structure
- introduce different layouts per state
- override canonical typography decisions
- override semantic token choices from `DESIGN.md`
- add UI elements not justified by this spec

If Stitch screens and this spec disagree, this spec wins.
If this spec is visually ambiguous, refine the spec rather than treating Stitch as silent authority.

## Stitch References

Stitch project:

- `Clinic Flow Arrival Counter V1`
- project ID: `18381510696937672232`

Preferred final reference screens:

- `Arrival Counter - Pre-confirm (Final)`
- `Arrival Counter - Already Arrived (Final)`
- `Arrival Counter - Success State (Final)`

These references are state examples only. Implementation must unify them under one canonical layout.

## Non-Goals

- no receptionist-dashboard controls
- no persistent queue operations tools
- no side navigation
- no footer links
- no dense reporting or queue tables
- no token-board behavior inside this page
- no alternate page designs per state

## Implementation Flex Points

These details may vary during implementation without changing the design contract:

- idle-state helper copy may be adjusted if it remains scan-first and concise
- success auto-reset timing may be tuned between 3 and 8 seconds, and must pause or cancel while printing is active
- icon choice may vary, but icons must be consistent, non-decorative, and paired with text for state meaning

## Visual Acceptance Criteria

The v1 implementation is acceptable only when these checks pass:

- the scan/search input is the strongest idle-state element without relying on animation
- the input still reads scan-first while accurately supporting QR code, patient name, child name, and mobile lookup
- resolved token number is the largest text on the page
- `Confirm Arrival` is the only high-emphasis action in pre-confirm state
- `Print Token Slip` is absent before arrival confirmation and present in already-arrived and success states
- multiple matches appear in the same result-card footprint as other states
- top-bar session context remains visually quieter than the input and result card
- recent arrivals never read as a second dashboard or dense table
- keyboard focus is visible on input, candidate rows, primary actions, secondary actions, and print action
- no state introduces side navigation, footer navigation, a permanent second column, patient photos, decorative illustrations, gradient text, glassmorphism, or colored side-stripe accents
- the page still fits the primary workflow on a 1024px-wide desktop viewport without horizontal scrolling
- staff can move through the primary workflow without perceiving a page redesign between states

## Stabilization Note

This revision is a stabilization pass.

It updates the UI/product spec so it stays aligned with the standalone-shell architecture and Arrival Counter technical slice spec while keeping the core workflow, one-page structure, and backend authority assumptions intact.

It is a quality-tightening pass, not a redesign.

## Design Decision Summary

`Arrival Counter v1` should ship as a desktop-first, scan-first, staff-only check-in console with one canonical layout, strong token emphasis, compact session context, quiet recent arrivals, and professional healthcare typography. It should feel purpose-built and calm, not decorative, not dashboard-heavy, and not like a generic app template.
