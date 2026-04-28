# Arrival Counter V1 Frontend Design

Date: 2026-04-27
App: `clinic_flow`
Status: Hardened Draft

Related context:

- Canonical product context: `PRODUCT.md`
- Canonical design system context: `DESIGN.md`
- Canonical head-app architecture: `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md`
- Slice technical application: `docs/superpowers/specs/2026-04-28-arrival-counter-standalone-shell-design.md`

## Goal

Design the first standalone head-app frontend slice for `Arrival Counter` as a desktop-first, staff-only, focused check-in console.

The page must optimize for one repeated loop:

- identify patient fast
- confirm arrival
- optionally reprint token slip when appropriate
- return immediately to a ready state for the next patient

The page should feel like a calm clinical station with a slight operational edge. It must not become another dense receptionist console or a generic product-template dashboard.

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

Out of scope:

- receptionist shell
- live queue rail
- phone admission
- walk-in admission
- token board
- backend data model changes unrelated to arrival flow

## Product Intent

`Arrival Counter` is a focused staff check-in console, not a queue-control surface.

This UI/product spec owns the operator workflow, visual hierarchy, state presentation, tone, layout, and interaction intent. It does not own hosting, shell, CSRF, backend permission, build, or API architecture decisions.

Primary usage:

- QR scan for walk-in patients carrying printed slips

Fallback usage:

- phone lookup for phone bookings without slips
- name lookup when the slip is lost or damaged

Required product boundary:

- the page may show compact operational context
- the page must not require queue triage or receptionist-style operational reasoning before confirming an arrival
- the page must not expose queue-control actions

## Concrete Design Vocabulary

Earlier direction used terms like `calm clinical`, `modern`, `sleek`, `premium`, and `slight operational edge`. For implementation, interpret them concretely:

- `Calm clinical`: off-white canvas, low visual noise, no celebratory motion, no saturated background fields, and no decorative patient imagery.
- `Modern`: clear type scale, intentional whitespace, responsive structure, precise focus states, and no Frappe Desk visual inheritance.
- `Sleek`: crisp borders, restrained elevation, aligned content edges, and no nested card clutter.
- `Premium`: high-quality spacing rhythm, strong token hierarchy, polished input surface, and clear primary action styling.
- `Slight operational edge`: decisive mineral-teal primary actions, compact state labels, visible keyboard focus, and token-first decision cards.

These terms must not be implemented as glassmorphism, generic SaaS dashboard patterns, gradient text, neon accents, or decorative illustrations.

## Users And Access

- staff-only page
- primary environment: desktop monitor at the counter
- current role boundary remains aligned with the existing page permissions:
  - `Healthcare Administrator`
  - `Queue Manager`
  - `System Manager`

## Core Workflow

### Primary path

1. Staff scans QR code.
2. The page resolves the patient.
3. Staff sees a single pre-confirm card.
4. Staff clicks `Confirm Arrival`.
5. The page shows success.
6. The page returns to a ready state after a short delay.

### Fallback path

1. Staff types phone number or patient name.
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

1. Primary: unified scan/search input
2. Immediate response: result state card
3. Compact context: current session, next session, arrival stats
4. Quiet support: recent arrivals

The page should visually communicate that the input and result card are the reason the page exists, while the surrounding context is only there to orient the staff member.

## Canonical Layout

The implementation must use one canonical page layout.

### Top bar

- page title: `Arrival Counter`
- current active session summary
- immediate next scheduled session summary
- two compact stats:
  - `Arrived`
  - `Awaiting Arrival`

The top bar is informational only in v1. It must not include generic utility buttons like `Session Info` or `Check-in Status` unless a later approved requirement adds them.

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
- no permanent second column unless later required by implementation constraints

### Responsive rules

- Primary target: desktop counter screens from 1024px wide upward.
- Supported minimum width: 768px for tablet or narrow desktop fallback.
- Below 1024px, header stats may wrap below session chips, but input remains before result card.
- Below 768px, the page may stack vertically, but no state may require horizontal scrolling.
- Recent arrivals must remain below the result card, never above the input or decision surface.

## State Consistency Rules

This is a critical implementation rule.

All user-visible states must share the same page structure and the same result-card shell.

Allowed to change by state:

- card accent or resolved-state tint
- state label
- state icon
- button set
- supporting copy

Not allowed to change by state:

- page layout
- header layout
- input layout
- result card footprint
- token placement
- recent arrivals section position
- typography system

The Stitch-generated screens should be treated as state references, not separate page designs.

## Input Surface

The input is the visual center of the page.

Requirements:

- one unified input for QR, phone, and name
- QR-first by behavior, not by creating separate visible modes
- polished and scan-focused appearance
- high readability at a glance from a standing or seated counter posture

Suggested input copy:

`Scan barcode or enter patient ID`

Alternative copy can mention phone/name during implementation, but the input should still read as a scan-first control.

The input should feel premium and intentional, not like a plain form field.

## Result Card

The result card is the operational decision surface.

### Shared structure

- token number as the strongest visual anchor
- patient name as the second anchor
- metadata row:
  - expected time when available
  - practitioner when available
  - visit/appointment context when available
- primary and secondary actions aligned clearly

### Content rules

- no patient photo
- no generic patient avatar
- no decorative illustrations inside the card
- metadata must stay compact and readable

### Action hierarchy

Primary action:

- `Confirm Arrival`

Secondary action:

- `Not this patient`

Conditional secondary action:

- `Print Token Slip`

`Print Token Slip` must not appear in the pre-confirm state.

## Required States

### 1. Idle ready state

- input focused or visually ready
- no resolved patient card yet
- compact context visible
- recent arrivals visible

### 2. Loading state

- input remains visible
- a small loading treatment appears in the result area
- no layout jump

### 3. No-match state

- clear but low-drama message
- no dense troubleshooting copy
- keep staff moving

### 4. Multiple-matches state

- compact candidate list
- not table-like
- each candidate row should remain quick to scan
- candidate list must live inside the shared result-card shell or an equivalent result-card footprint
- multiple-match state must not introduce a separate competing card above the result card

### 5. Pre-confirm state

- token dominant
- patient name
- metadata
- `Confirm Arrival` primary
- `Not this patient` secondary
- no `Print Token Slip`

### 6. Already-arrived state

- same card shell as pre-confirm
- calm resolved treatment
- `Print Token Slip` available
- no `Confirm Arrival`

### 7. Success state

- same card shell as pre-confirm
- reassuring success treatment
- `Print Token Slip` available
- return-to-ready behavior after a short delay

## Session Context

The header must provide more useful context than the current page without becoming dense.

### Required content

- active current session
- immediate next scheduled session
- `Arrived` count
- `Awaiting Arrival` count

### Content intent

`Arrived` should represent patients already physically checked in.

`Awaiting Arrival` should represent patients expected but not yet physically arrived. This is a better arrival-operations phrase than generic wording such as `Expected`.

The session copy should be operationally informative, for example:

- `Active: Morning Clinic`
- `Next: Afternoon Surgery`

The implementation may map exact copy to available backend payloads, but the design intent must remain current-session plus immediate-next-session clarity.

Formatting rules:

- show at most two session chips in the top bar: current and next
- use `No active session` and `No next session` when absent
- stat labels must be exactly `Arrived` and `Awaiting Arrival`
- stat numerals must be visually secondary to resolved token numbers

## Recent Arrivals

`Recent Arrivals` should remain visible but visually quiet.

Requirements:

- lower emphasis than the result card
- lighter than a dense activity table
- sufficient information to reassure staff that recent activity is being captured

Recommended row content:

- token
- patient name
- arrival time
- optional lightweight status chip such as `Arrived`

Do not let this section become a secondary dashboard.

Implementation limits:

- show up to 8 recent rows
- use local-readable time, not raw database datetime strings
- truncate long patient names on one line with a full value available to assistive tech
- empty state copy: `No arrivals captured yet for the current session.`
- stale state should be shown as a small low-emphasis status, not as an alert unless actions are blocked

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

This supersedes the earlier Stitch project metadata that listed Plus Jakarta Sans and Inter. Stitch screens remain visual references, but `Lexend` and `Source Sans 3` are the implementation fonts for Arrival Counter v1.

### Rationale

- more healthcare-trustworthy than decorative or fashion-forward pairs
- more professional than the earlier generic drafts
- readable at operational distances and sizes
- modern without feeling trendy

### Usage rules

- token number: largest and boldest text on the page
- page title and stat numerals: strong but secondary to token in resolved states
- metadata: compact, calm, and low drama
- helper text: small but still accessible

## Color Direction

Primary direction:

- deep mineral teal for the primary action
- refined off-white background
- cool-soft green/neutral support tones
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

### Token mapping

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

## Visual Acceptance Criteria

The v1 implementation is acceptable only when these checks pass:

- The scan/search input is the strongest idle-state element without relying on animation.
- Resolved token number is the largest text on the page.
- `Confirm Arrival` is the only high-emphasis action in pre-confirm state.
- `Print Token Slip` is absent before arrival confirmation and present in already-arrived and success states.
- Multiple matches appear in the same result-card footprint as other states.
- Top-bar session context remains visually quieter than the input and result card.
- Recent arrivals never read as a second dashboard or dense table.
- Keyboard focus is visible on input, candidate rows, primary actions, secondary actions, and print action.
- No state introduces side navigation, footer navigation, a permanent second column, patient photos, decorative illustrations, gradient text, glassmorphism, or colored side-stripe accents.
- The page still fits the primary workflow on a 1024px-wide desktop viewport without horizontal scrolling.

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

- Idle-state helper copy may be adjusted if it remains scan-first and concise.
- Success auto-reset timing may be tuned between 3 and 8 seconds, and must pause or cancel while printing is active.
- Icon choice may vary, but icons must be consistent, non-decorative, and paired with text for state meaning.

## Design Decision Summary

`Arrival Counter v1` should ship as a desktop-first, scan-first, staff-only check-in console with one canonical layout, strong token emphasis, compact session context, quiet recent arrivals, and professional healthcare typography. It should feel purpose-built and calm, not decorative, not dashboard-heavy, and not like a generic app template.
