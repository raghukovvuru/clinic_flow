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

Primary source (vNext):

- `Service Point.queue_code`

Transitional / fallback sources (retained during migration):

- `Queue Session.dept_abbr` — cached mirror of the linked Service Point's queue_code
- `Medical Department.custom_dept_abbr` — legacy config source; still seeded onto new sessions when no Service Point is linked

See `service-point-policy.md` for the full rationale and migration plan.

Resolution order (hot path, read-only):

1. `Queue Session.service_point` → `Service Point.queue_code`
2. `Queue Session.dept_abbr`
3. Practitioner's `Medical Department.custom_dept_abbr`
4. `"GEN"` (final fallback)

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
2. Prefer `Service Point.queue_code` as the queue code source; fall back to `dept_abbr` for sessions that predate the migration.
3. Keep the display-token helper (`build_display_token`) unchanged.
4. Front-facing surfaces continue to use the displayed token:
   - receptionist dashboard
   - TV / queue board
   - token slip / print
   - doctor workspace where useful
5. Leave backend ordering and queue semantics untouched.

## Emergency Prefix Policy

Emergency tokens use the **same queue prefix as their session**, not a separate `EMR` prefix.

- `PD-112` (emergency in pediatrics) — correct
- `EMR-112` — retired; no longer a fallback either

Urgency is conveyed via status and UX, not by the token prefix. When no queue code can be resolved at all, the final fallback is `GEN`, not `EMR`.

## Reception Call Display Policy

Special status is not part of public token display.

For reception calls:

- `reception_call_mode = "Public"` may display or announce the token normally.
- `reception_call_mode = "Private"` is operational state only and should be suppressed on public displays.

Private calls do not hide the patient from operational dashboards. They only prevent public display/announcement of that reception call.

## Future Cleanup

- Drop the `dept_abbr` cache once enough time has passed that all live sessions carry `service_point`
- Stop reading `Medical Department.custom_dept_abbr` for queue code purposes (keep the field — it is still a Healthcare integration concern)
- Consider making `Queue Session.service_point` required in a later phase
