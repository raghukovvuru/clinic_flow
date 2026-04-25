# Receptionist Backend Policy

Current backend-policy note for receptionist-direction flows.

This document describes the intended current model on the active codebase, while explicitly acknowledging that legacy compatibility still exists.

---

## 1. Canonical Operational Model

For newer receptionist and admission flows, reason in terms of:

- `channel`: `phone` / `walkin`
- `load_class`: `review_load` / `non_review_load`
- `priority`: `normal` / `special` / `emergency`

This is the preferred product model for new work.

Legacy `queue_type` still exists because:

- the appointment-driven path still uses it
- some slot-accounting and compatibility logic still depend on it
- some old UI and reporting paths still read it

Rule:

- new backend behavior should prefer canonical fields
- compatibility shims may still derive legacy `queue_type` where required

---

## 2. Ownership Boundaries

Backend owns:

- session suggestion and ranking
- token recommendation and validation
- queue-entry creation
- ETA calculations
- special and emergency operational rules
- queue identity resolution

Frontend owns:

- presenting backend recommendations
- allowing operator override where explicitly supported
- rendering token boards and operational surfaces

Frontend must not invent its own ranking, token-allocation, or queue-priority rules.

---

## 3. Queue Identity

The preferred queue identity is `Service Point`, not ad hoc department logic.

Backend queue-code resolution should go through:

- `resolve_service_point(...)`
- `resolve_queue_code(...)`
- `resolve_department_name(...)`

`Medical Department.custom_dept_abbr` remains a fallback and compatibility concern, not the long-term primary queue identity.

---

## 4. Token Policy

Backend ordering should remain conceptually numeric.

Current preferred shape:

- internal identity: `token_number`
- visible label: queue-code-prefixed display token

Do not mix display concerns into ordering semantics.

Use display-token helpers for patient-facing surfaces, slips, and dashboards.

---

## 5. Session Recommendation Policy

Backend should decide which sessions are recommended.

Recommendation inputs may include:

- `channel`
- `load_class`
- `priority`
- session status
- available capacity
- weighted load
- time until start
- time until end
- lateness / near-closing risk

Current policy direction:

- `phone` favors stable, explainable offers
- `walkin` favors immediate throughput
- `emergency` favors immediate clinical availability

---

## 6. Special Policy

`special` is a priority flag, not emergency.

Current design direction:

- special does not require a separate patient-facing token language
- special does not permanently rewrite queue order at booking time
- special remains mostly a back-office operational signal
- doctor-side override behavior is allowed

Desired behavior:

- receptionist may mark an entry as special
- entry keeps normal booking semantics
- doctor can explicitly call the next eligible special patient when appropriate
- audit metadata should be captured where fields exist

Patient-facing surfaces should not expose special status.

Legacy compatibility note:

- some special-buffer fields still exist on the schema
- they should be treated as migration-era compatibility, not proof that hard reserved buffers remain the preferred model

### Special overflow authorization

When capacity is available, special bookings follow normal special booking behavior.

When capacity is exhausted:

- special booking may continue only through explicit overflow authorization
- overflow authorization is backend-owned, not a frontend-only convention
- overflow requires:
  - authorized role
  - reason
  - source
- overflow is recorded explicitly on `Queue Entry` instead of silently changing capacity

Backend shape:

- `priority = special`
- `is_overflow = 1` only when capacity was bypassed
- overflow audit fields are persisted on `Queue Entry`
- phone overflow keeps `channel = phone`
- live walk-in overflow can mark entry `Arrived` at booking time
- special entries are doctor-callable only after becoming `Ready Near Doctor`

Lifecycle boundary remains: `booking/arrival -> reception completion -> Ready Near Doctor -> doctor consultation`.

---

## 7. Emergency Policy

Emergency remains a distinct operational fast path.

Principles:

- emergency bypasses ordinary receptionist formalities when necessary
- emergency should enter the queue/doctor flow immediately
- reconciliation and administrative completion may happen later
- emergency should visibly disrupt normal ETA expectations

Current system shape includes:

- emergency issuance logic
- emergency alert / arrival handling
- emergency follow-up and reconciliation surfaces

Emergency should not be forced to look like an ordinary booking just to fit older data models.

---

## 8. Legacy Compatibility Boundary

These older fields and concepts still matter and must not be removed casually:

- `Patient Appointment.custom_queue_type`
- `Patient Appointment.custom_queue_token`
- `Appointment Type.custom_queue_code`
- `Medical Department.custom_dept_abbr`

The receptionist backend currently bridges between:

- canonical admission semantics
- legacy appointment and queue semantics

That bridge is intentional. Do not collapse it without a migration plan.

---

## 9. Practical Development Rules

When changing receptionist-direction backend code:

- prefer active APIs over legacy page-specific hacks
- keep compatibility behavior explicit
- document when a function is canonical versus legacy-compatibility only
- update supporting docs when behavior changes

Read before editing:

1. `ARCHITECTURE.md`
2. `docs/healthcare-compatibility-audit.md`
3. `docs/service-point-policy.md`
4. `docs/token-display-policy.md`
5. the relevant API module
