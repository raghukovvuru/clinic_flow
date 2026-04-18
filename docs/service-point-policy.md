# Service Point Policy

Date: 2026-04-18

## What a Service Point is

A **Service Point** is the durable identity of a queue. It is the thing that calls tokens. One Service Point = one front-facing queue line = one prefix source.

Examples:

- `PD` — Pediatrics consult queue
- `PD1`, `PD2` — two pediatric doctors in different rooms, shared waiting area
- `PH` — pharmacy counter
- `LAB` — lab collection counter
- `NUR` — nursing / procedure room

## What it is **not**

- It is not a room. Rooms can change; the queue code must not.
- It is not a person. A doctor can reassign; the queue identity persists.
- It is not a department. Departments are too broad (e.g. "Medicine" can host multiple queues).
- It is not `Healthcare Service Unit`. Service Unit is location/bed-oriented and re-couples us to Healthcare; Service Point is native to `clinic_flow`.

## Why now

Prior to this change, the queue prefix was sourced from `Medical Department.custom_dept_abbr`. This did not scale because:

- not every queue is a Medical Department (pharmacy, lab, nursing, procedure)
- two doctors in the same department needed two distinct queues
- `Queue Session.practitioner = reqd` meant there was no seat in the schema for non-practitioner queues

Introducing Service Point now establishes the seat, even though lab/pharmacy workflows are deferred.

## Shape

| Field | Type | Purpose |
|---|---|---|
| `queue_code` | Data, unique, reqd | Short front-facing code (`PD`, `PH`, `LAB`). Uppercase. Used as the DocType name. |
| `display_label` | Data, reqd | Human-readable label for dashboards and TV |
| `category` | Select | `consult` / `pharmacy` / `lab` / `nursing` / `procedure` / `other` |
| `is_active` | Check | Flag |
| `sort_order` | Int | Display ordering on dashboards / TV |
| `department` | Link, optional | Medical Department, when applicable |
| `default_practitioner` | Link, optional | Healthcare Practitioner, when a queue is specific to one doctor |
| `service_unit` | Data, optional | Free-form reference to a room/counter. Promote to Link later when actually used. |
| `tv_group` | Data, optional | Tag — Service Points sharing this render on the same TV board |

## Relationships

```
Service Point (config, durable)
   ├── optional → Medical Department
   ├── optional → Healthcare Practitioner (default)
   └── optional → service_unit (free-form)

Queue Session (one day of operation)
   ├── service_point      (new, optional, will become preferred source)
   ├── practitioner       (still required)
   └── dept_abbr          (cached mirror of service_point.queue_code; kept as fallback)

Queue Entry
   └── queue_session      (reaches Service Point via session — no direct link for now)
```

## Resolution order (hot path)

All queue-code reads go through `clinic_flow.queue.service_point.resolve_queue_code(...)`:

1. `Queue Session.service_point` → `Service Point.queue_code`
2. `Queue Session.dept_abbr`
3. Practitioner's `Medical Department.custom_dept_abbr`
4. Caller-supplied `fallback` (default `"GEN"`)

For reverse resolution (dept name from queue identity), `resolve_department_name(service_point=..., dept_abbr=...)` prefers the Service Point link.

## Creation rules

- Hot paths call `resolve_service_point(...)` — read-only. If no Service Point matches, they fall back to the legacy queue-code path without creating one.
- Creation happens exclusively in the migration patch or via explicit admin action (`ensure_service_point(...)`). This avoids concurrent-creation races across multiple session-entry points.

## Emergency policy

Emergency tokens share the queue identity of their session. No separate `EMR` prefix. See `token-display-policy.md#emergency-prefix-policy`.

## Migration

`clinic_flow.patches.v16_0.create_service_points` is idempotent and safe to re-run. It:

1. pre-scans for collisions (same queue code → multiple departments) and aborts with a remediation message if any are found
2. creates Service Point rows for every distinct queue code currently in use
3. backfills `Queue Session.service_point` where null
4. ensures `Queue Session.dept_abbr` matches `service_point.queue_code` (cache mirror)

The patch does not delete or rename legacy fields. `Medical Department.custom_dept_abbr` and `Queue Session.dept_abbr` remain for fallback and as a Healthcare integration concern.

## What is explicitly deferred

- lab / pharmacy / nursing session workflows (no seat has been promoted to first-class yet)
- making `Queue Session.practitioner` optional
- removing `dept_abbr` from `Queue Session` / `Queue Entry`
- removing `Medical Department.custom_dept_abbr`
- changing TV grouping behavior beyond storing the field
- direct `Service Point` link on `Patient Appointment`
