# Special Handling Client Review Outline

## Purpose

Validate the clinic policy for handling special outpatient pediatric admissions before locking final naming, permissions, queue/ETA behavior, and reporting details.

## Core Policy

Special handling is visit-scoped, not patient-scoped.

- No permanent special flag is attached to Patient, Guardian, Parent, or family records.
- Special source, source details, tier, escalation, and reason are snapshotted on the visit's Queue Entry.
- Past special visits are reportable but never automatically change future handling rules.

## Temporary Review Tiers

These names are temporary policy labels only. Final naming should be handled in a separate naming session.

| Tier | Meaning |
|---|---|
| Tier 1 Special | Admission guaranteed. Patient waits for normal reception call, with existing special reception SLA/gap guardrails. |
| Tier 2 Special | Admission guaranteed. After arrival, staff gets a recommendation/option to complete reception immediately, but can defer. |
| Tier 3 Special | Admission guaranteed. After arrival, patient becomes the mandatory next reception item unless reception completion is impossible. |

## Admission Guarantee

All special tiers get admission guarantee.

- Applies to phone bookings, prior bookings, walk-ins, and live-session requests.
- Special patients are not rejected due to normal capacity limits.
- Special overflow pressure is tracked separately from ordinary capacity.
- Special overflow still affects doctor-time load and ETA.

## Arrival Boundary

Physical arrival is non-negotiable.

- No prior-booked or phone special becomes Ready Near Doctor before arrival.
- Prior-booked special path: Booked -> Arrived -> tier-specific reception handling.
- Live walk-in special path: Admitted + Arrived -> tier-specific reception handling.

## Reception Rule

Reception completion is mandatory for everyone.

- Specials do not skip reception.
- Tier only controls whether they wait for reception call or get expedited reception handling.
- Ready Near Doctor always means normal reception completion is done.

## Reception SLA

Existing special reception SLA applies to arrived specials waiting at reception.

Current configurable defaults:

- Warning: 10 minutes.
- Escalation: 12 minutes.
- Target breach: 15 minutes.
- Gap lookahead: 3 normal tokens.
- Max consecutive special reception calls: 2, when normal arrived patients are available.

These defaults should be presented as configurable policy values, not immutable rules.

## Doctor Queue Rule

All completed specials enter the same doctor-side special pool.

- Every Ready Near Doctor special is eligible for Call Next Special.
- Doctor chooses whether to call normal or special next.
- If doctor chooses special, the system calls the oldest-ready special across all tiers.
- Tier does not sort doctor-side special order after reception completion.

## Source Category Policy

Special source categories are manually maintained policy configuration.

- Receptionist selects/records source category and source detail.
- Source category maps to default review tier.
- Visit stores the resolved tier as a snapshot.
- Past visit reports can inform policy review but never auto-update source rules.

## Escalation

Escalation is upward only, visit-scoped, and audited.

- Can happen during booking/admission or arrival.
- Original source category and original tier remain preserved.
- Escalated effective tier is used for current visit behavior.
- Escalation does not change future category mapping.

## Presentation Structure

Recommended visual presentation flow:

1. Problem: high-volume clinic, doctor bottleneck, review load, social-pressure admissions, emergency first.
2. Principles: admission guarantee, mandatory reception completion, emergency outranks all, visit-scoped special handling, no public exposure of special status.
3. Patient flow: normal flow vs special flow vs emergency flow.
4. Temporary special tiers: Tier 1, Tier 2, Tier 3 with behavior, not final names.
5. Reception handling: what changes after arrival for each tier.
6. Doctor decision point: normal vs special call, oldest-ready special selection.
7. Audit and controls: source category, source detail, tier snapshot, escalation reason, reports.
8. Configurable SLA: 10/12/15 minute thresholds, 3-token lookahead, 2-call guardrail.
9. Client inputs needed.
10. Out of scope.

The most important visual should be a three-lane flow:

| Flow | Path |
|---|---|
| Normal | Arrived -> Wait for Reception Call -> Reception Complete -> Ready Near Doctor -> Doctor Call |
| Special | Arrived -> Tier-Based Reception Handling -> Reception Complete -> Ready Near Doctor Special Pool -> Doctor Chooses |
| Emergency | Emergency Intake -> Ready Near Doctor / Doctor First -> Reconciliation Before Closure |

## Client Input Needed

- Which source categories exist in real clinic operations?
- Which source categories map to Tier 1, Tier 2, or Tier 3?
- Who, in real-world clinic terms, can escalate a special visit upward?
- What source details should staff capture without creating sensitive clutter?
- Should current SLA defaults be accepted or tuned later?
- What staff-facing explanation should be used when patients question special handling?
- What doctor-side visibility is acceptable: count only, special badge, source detail, or tier detail?
- What reports are needed at launch for special pressure and abuse review?

## Out Of Scope For This Review

- Final naming conventions.
- Detailed Frappe roles and permissions.
- Queue fairness model.
- ETA model.
- Public display behavior beyond not exposing special status.
- Detailed reporting specification.
