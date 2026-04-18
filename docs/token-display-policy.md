# Token Display Policy

Date: 2026-04-18

## Decision

Keep `token_number` as the internal numeric token identity.

Use a short front-facing queue code for displayed tokens:

- internal: `112`
- displayed: `PD-112`

## Why

Plain numeric tokens are not distinct enough in a shared waiting area when:

- a single reception serves multiple doctors
- patients wait in one combined area
- a common TV display is used
- more doctors and service queues are expected later

In that setup, `112` and `114` are too easy to confuse across active queues.

Using patient-type prefixes like `N-112` or `R-056` does **not** solve the real problem.

The ambiguity is:

- which queue is calling me?

not:

- am I new or review?

## Format

Displayed token format:

- `QUEUE_CODE-TOKEN_NUMBER`

Examples:

- `PD-112`
- `CD-114`
- `PH-021`

Guidelines:

- queue code should be short: 2 letters preferred
- readable on TV and slips
- easy to call aloud
- stable over time

## Queue Code Source

Queue code should come from an explicit short code field, not from ad hoc string slicing.

Current practical source:

- department abbreviation / short queue code

Existing field that can serve this role for now:

- `Medical Department.custom_dept_abbr`

This field is therefore **not debt in concept**.

It remains useful if its role is clarified as:

- front-facing queue code

rather than:

- legacy token-format fragment

## Scope Separation

### Internal identity

Keep:

- `token_number`

Properties:

- numeric
- session-scoped
- stable
- used for ordering and backend logic

### Front-facing identity

Add/use:

- `display_token`

Properties:

- includes queue code
- used on TV, slips, receptionist UI, and patient-facing displays
- does not affect queue ordering semantics

## Architectural Rule

Do **not** overload backend ordering with display concerns.

Meaning:

- queue engine still uses numeric token/order semantics
- display layer composes the visible token from:
  - queue code
  - token number

This keeps:

- ordering clean
- future refactors safer
- display formatting flexible

## Recommended Near-Term Plan

1. Keep `token_number` unchanged.
2. Treat `custom_dept_abbr` as the current queue code source.
3. Introduce a display-token helper in backend.
4. Update front-facing surfaces to use displayed token:
   - receptionist dashboard
   - TV / queue board
   - token slip / print
   - doctor workspace where useful
5. Leave backend ordering and queue semantics untouched.

## Future Cleanup

Later, consider renaming or formalizing the queue-code field so it is no longer framed as a legacy abbreviation field.

Possible future direction:

- dedicated `queue_code` / `display_queue_code`

But that is a follow-up cleanup, not a blocker for adopting prefixed displayed tokens now.
