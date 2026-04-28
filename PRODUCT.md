# PRODUCT.md

Product: Clinic Flow
Register: product
Framework: Frappe v16 with a SvelteKit head app for operational frontend surfaces

## Product Purpose

Clinic Flow is an operational clinic workflow system for front-desk, arrival, queue, and doctor-facing work. It coordinates patient arrival, booking, queue movement, token display, and practitioner workflow while keeping Frappe and Healthcare as the backend authority.

The frontend direction is moving away from Frappe Desk page scripts and toward dedicated operational head-app surfaces served by Frappe under `/clinic/<slice>`.

## Primary Users

- Reception and counter staff processing patients quickly at a clinic desk.
- Queue managers monitoring and coordinating operational flow.
- Healthcare administrators supervising clinic operations.
- Practitioners and physicians in doctor-facing slices.

## Operating Environment

- Desktop-first clinic counters and staff workstations.
- Frequent keyboard and scanner input.
- Short repeated workflows under real patient pressure.
- Shared clinical environment with bright ambient light and interruptions.
- Staff need clear state, fast confirmation, and low cognitive load.

## Product Principles

1. Backend authority stays in Frappe.
2. Operational screens should feel like purpose-built clinic tools, not generic admin pages.
3. Keyboard and scanner flows are first-class productivity paths.
4. UI should make the next safe action obvious.
5. Patient-facing and operational data must be handled with privacy and care.
6. Realtime updates are awareness signals, not client-side truth.
7. Visual design should be calm, legible, and precise rather than decorative.

## Tone

Use concise operational language.

Preferred tone:

- calm
- direct
- clinical
- fast
- reassuring
- specific

Avoid:

- playful marketing language
- generic SaaS dashboard language
- decorative copy
- dense admin terminology
- ambiguous status labels

## Anti-References

Do not make operational surfaces look or behave like:

- Frappe Desk admin pages
- public kiosk apps
- generic analytics dashboards
- dense receptionist command centers where the slice only needs one action loop
- decorative pediatric waiting-room illustrations
- AI-product purple/pink gradient interfaces

## Frontend Product Direction

New frontend slices should inherit `docs/superpowers/specs/2026-04-28-head-app-standalone-shell-architecture-design.md`.

The canonical operator route pattern is `/clinic/<slice>`. Desk pages may remain during coexistence, but operational head-app surfaces should run outside Desk chrome.

## Current Active Slice Direction

Arrival Counter is a focused staff check-in console. It should help staff identify a patient, confirm physical arrival, optionally print a token slip, and return to ready state quickly.
