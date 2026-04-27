# Arrival Counter V1 Frontend Design

Date: 2026-04-27
App: `clinic_flow`
Status: Draft

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

Primary usage:

- QR scan for walk-in patients carrying printed slips

Fallback usage:

- phone lookup for phone bookings without slips
- name lookup when the slip is lost or damaged

Required product boundary:

- the page may show compact operational context
- the page must not require queue triage or receptionist-style operational reasoning before confirming an arrival
- the page must not expose queue-control actions

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

Suggested placeholder:

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
- no patient avatar placeholder
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

## Realtime And Refresh Expectations

For v1, the page should support live context updates, but live awareness remains secondary to the check-in task.

The UI should:

- update session context without disrupting active input unnecessarily
- preserve focus and operator flow during live refreshes whenever possible
- avoid turning recent arrivals or session context into a noisy live dashboard

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

## Open Implementation Notes

- exact idle-state helper copy can be finalized during implementation
- exact auto-reset timing after success can be finalized during implementation, but it must leave enough time to notice and use `Print Token Slip`
- exact icon set can be chosen during implementation, but it should remain consistent and professional

## Design Decision Summary

`Arrival Counter v1` should ship as a desktop-first, scan-first, staff-only check-in console with one canonical layout, strong token emphasis, compact session context, quiet recent arrivals, and professional healthcare typography. It should feel purpose-built and calm, not decorative, not dashboard-heavy, and not like a generic app template.
