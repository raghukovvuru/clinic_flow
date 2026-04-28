# DESIGN.md

Design system: Clinic Flow Head App
Source context: Stitch project `Clinic Flow Arrival Counter V1`, canonical head-app architecture spec, Arrival Counter UI/product spec
Register: product

## Design Intent

Clinic Flow operational surfaces should feel like calm clinical instruments: fast, clear, legible, and purpose-built for staff workflows.

Concrete interpretation:

- Calm means low visual noise, restrained color, stable layouts, and no surprise motion.
- Clinical means crisp typography, clear state labels, high contrast, and privacy-aware presentation.
- Operational means primary actions are visually obvious, keyboard focus is visible, and repeated workflows stay fast.
- Modern means clean hierarchy, strong spacing rhythm, and current frontend interaction quality without template-like SaaS styling.
- Slight edge means decisive primary actions, clear token emphasis, and compact status feedback.

## Color Strategy

Use a restrained light theme by default. The interface runs on a tinted off-white canvas with mineral teal as the primary action color and soft green/sand support tones.

Use semantic tokens rather than raw colors in application components.

```css
:root {
  --cf-canvas: #f7f5f1;
  --cf-surface: #fffdf8;
  --cf-surface-muted: #f1ece5;
  --cf-mint: #ddebe7;
  --cf-primary: #0d6f69;
  --cf-primary-soft: #9ecfc6;
  --cf-line: #d9ddd8;
  --cf-ink: #10211f;
  --cf-muted: #5f6f6b;
  --cf-success-bg: #e4f1eb;
  --cf-success-ink: #205844;
  --cf-warning-bg: #f5ead9;
  --cf-warning-ink: #7a5322;
  --cf-danger-bg: #f8e5e0;
  --cf-danger-ink: #8a352b;
  --cf-focus: #0d6f69;
}
```

## Typography

Canonical Arrival Counter type system:

- Display, headings, token emphasis, stat numerals: `Lexend`
- Body, metadata, helper text, form text, buttons: `Source Sans 3`

The Stitch project metadata currently lists Plus Jakarta Sans and Inter. The repo-level canonical direction resolves that mismatch in favor of Lexend and Source Sans 3 because the Arrival Counter UI/product spec and current implementation use that pair.

Rules:

- Body text minimum: 16px.
- Metadata minimum: 14px when contrast is strong.
- Token text should be the largest element in resolved states.
- Body line length should stay below 75 characters.
- Use weight and scale, not color alone, for hierarchy.

## Spacing And Layout

Use generous but not wasteful spacing. Operational rhythm should make the primary action loop obvious.

Recommended scale:

- 4px base unit.
- 12px tight inline gaps.
- 16px compact groups.
- 24px section padding.
- 32px major vertical separation.
- 40px to 48px page padding on desktop when available.

Arrival Counter desktop max width should remain around `72rem` unless a slice spec changes it.

## Shape And Elevation

- Primary surfaces: 24px radius.
- Inputs and buttons: 12px to 18px radius depending on size.
- Use soft elevation only for primary operational surfaces.
- Avoid nested cards.
- Avoid colored side-stripe accents.

## Keyboard And Focus

Every operational slice must have a keyboard-first interaction model.

Focus rules:

- Visible focus ring on every focusable control.
- Focus ring color: `--cf-focus`.
- Focus ring should be at least 2px plus offset, or an equivalent high-visibility treatment.
- Background updates must not steal focus.
- Scanner/input-first screens should restore input focus after successful reset.

## Motion

Use short, functional transitions only.

- Duration: 120ms to 220ms for most UI feedback.
- Prefer opacity and transform transitions.
- Do not animate layout properties.
- Respect `prefers-reduced-motion`.
- Avoid bounce, elastic, or celebratory motion in clinic operations.

## UI Component Policy

- Use custom Tailwind components for visual surfaces.
- Use Bits UI for complex accessible primitives.
- Use shadcn-svelte only as source-owned acceleration, then restyle to Clinic Flow tokens.
- Do not let Skeleton, Flowbite, Material, or default shadcn styling define the product identity.

## Copy Rules

- Use short action labels.
- Use concrete operational status labels.
- Avoid restating headings in helper text.
- Do not use em dashes.
- Error messages should tell staff what to do next.

## Accessibility Baseline

- Text contrast should meet WCAG AA minimums.
- Color must not be the only state indicator.
- Inputs require labels or accessible names.
- Candidate lists must support keyboard navigation.
- Touch targets should be at least 44px where touch is plausible.
- Reduced-motion preferences must be respected.

## Stitch Context

Stitch project:

- Title: `Clinic Flow Arrival Counter V1`
- Project ID: `18381510696937672232`
- Final reference screens: pre-confirm, already-arrived, success

Use Stitch screens as state references and visual calibration, not as separate page layouts.
