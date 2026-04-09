# Clinic Flow — Engineering Handoff Document

**App:** `clinic_flow` | **Target:** Frappe v16 | **Base app:** `healthcare` (Marley Healthcare)
**Site:** `http://site1.localhost:8000` | **Branch:** `version-16` | **Date:** 2026-04-09

---

## 1. PROJECT OVERVIEW

### Problem

Marley Healthcare's base `healthcare` app handles clinical records (Patient Encounter, Patient Appointment, Vital Signs) but has no real-time patient queue management. Doctors had no structured way to call patients in priority order; receptionists had no guided booking-and-check-in flow; waiting-room TVs showed nothing.

### What Clinic Flow Solves

1. **Queue management** — Partitions each doctor's session into PRE_BOOKED, WALK_IN, FOLLOW_UP, and EMERGENCY lanes with configurable slot quotas.
2. **Receptionist workspace** — Two-column desk page: left column for booking (practitioner, queue type, slot selection, quota visualisation); right column as a smart context panel switching between board / booking-flow / patient-management / emergency modes. No popups.
3. **Doctor workspace** — Three-panel desk page (queue list / encounter editor / patient summary) where doctors call patients, edit encounters, and submit them. Session state persists across page reloads via `localStorage`.
4. **TV dashboard** — A public, fullscreen page (`/queue-dashboard`) with a dark cinematic theme, multi-doctor carousel, realtime token updates, and audio + visual emergency alerts.
5. **Slot release** — A background job that promotes unfilled pre-booked and follow-up slots to walk-in headroom 60 minutes before session start.

### Key Features

- Round-robin dequeue with configurable weights (PRE_BOOKED 3×, WALK_IN 1×, FOLLOW_UP 1×)
- Emergency bypass (always-next, no quota, shifts all Waiting entries forward)
- Between-session check-in: tokens issued while doctor is on break, inherited by next session
- Day-wide token sequence numbering (no recycling across sessions)
- Inline payment collection with Fee Validity (free follow-up) awareness
- Quota visualisation bars in the receptionist workspace
- Active session status pills refreshed on receptionist page load
- Browser-based A5 laser receipt and 80 mm thermal token printing
- TV dashboard multi-doctor carousel (2 per page, auto-rotates every 8 s, sort: most-recently-called first)
- Emergency TV alert: red border flash + Web Audio API beep

---

## 2. ARCHITECTURE

### Actual File Tree

```
apps/clinic_flow/
├── AGENTS.md
├── ARCHITECTURE.md
├── HANDOFF.md
├── ONBOARDING.md
├── clinic_flow/
│   ├── hooks.py                          ← all hook registrations
│   ├── modules.txt                       ← "Clinic Flow"
│   ├── patches.txt                       ← [pre/post_model_sync]; no patches yet
│   ├── api/
│   │   ├── appointments.py               ← booking, patient search, check-in, payment
│   │   ├── queue.py                      ← session lifecycle, call-next, state queries
│   │   ├── workspace.py                  ← doctor workspace payload, encounter save/submit
│   │   ├── patient_data.py               ← patient summary (internal, not whitelisted)
│   │   └── boot.py                       ← boot_session hook
│   ├── config/
│   │   └── __init__.py                   ← empty; no desktop.py
│   ├── patches/
│   │   └── __init__.py                   ← empty; no patches written yet
│   ├── queue/
│   │   ├── engine.py                     ← token builder, sequence, round-robin
│   │   ├── appointment_mixin.py          ← QueueMixin: slot limits + check-in
│   │   └── scheduler.py                  ← cron job: release unfilled slots
│   ├── templates/
│   │   └── pages/__init__.py             ← empty; no Jinja page templates
│   ├── www/
│   │   ├── queue-dashboard.py            ← sets no_cache, no_header, no_sidebar, no_breadcrumbs
│   │   └── queue-dashboard.html          ← self-contained TV dashboard; standalone JS
│   └── clinic_flow/
│       ├── .frappe                       ← module marker
│       ├── doctype/
│       │   ├── queue_session/
│       │   │   ├── queue_session.json    ← schema (autoname QS-.YYYY.-.#####)
│       │   │   └── queue_session.py      ← before_insert (slot calc), validate
│       │   ├── queue_entry/
│       │   │   ├── queue_entry.json      ← schema (autoname QE-.YYYY.-.#####)
│       │   │   └── queue_entry.py        ← before_save (timing fields)
│       │   └── slot_partition_config/
│       │       ├── slot_partition_config.json  ← Single DocType schema
│       │       └── slot_partition_config.py    ← pass (no custom logic)
│       ├── page/
│       │   ├── doctor_workspace/
│       │   │   ├── doctor_workspace.json ← roles: HC Practitioner, Physician, QM, SysMgr
│       │   │   ├── doctor_workspace.py   ← get_context: pass
│       │   │   └── doctor_workspace.js   ← DoctorWorkspace class (~900 lines)
│       │   └── receptionist_workspace/
│       │       ├── receptionist_workspace.json ← roles: HC Admin, QM, SysMgr
│       │       ├── receptionist_workspace.py   ← get_context: pass
│       │       └── receptionist_workspace.js   ← ReceptionistWorkspace class (~1600 lines)
│       └── workspace/
│           └── clinic_flow/
│               └── clinic_flow.json      ← Workspace tile with shortcuts to both pages
├── pyproject.toml
├── README.md
├── license.txt
├── .editorconfig
├── .eslintrc
└── .pre-commit-config.yaml
```

### Integration with `healthcare`

Clinic Flow never modifies `healthcare` source files. Integration points:

| `healthcare` DocType | How Clinic Flow uses it |
|---|---|
| `Patient Appointment` | Extended via `QueueMixin`; triggers queue entry creation on check-in |
| `Patient` | Read for demographics; `quick_create_patient` inserts new patients |
| `Healthcare Practitioner` | Schedule, charge (`op_consulting_charge`), department, `user_id` linkage |
| `Practitioner Schedule` / `Healthcare Schedule Time Slot` | Drive slot availability calculations |
| `Practitioner Service Unit Schedule` | Join target linking practitioner → schedule |
| `Patient Encounter` | Created as Draft on Call Next; saved/submitted via workspace |
| `Vital Signs` | Read in patient summary panel |
| `Fee Validity` | Checked before showing consultation charge in payment step |
| `Appointment Type` | Resolved from `custom_queue_code` for encounter creation |
| `Medical Department` | `custom_dept_abbr` used as token prefix |
| `Diagnostic Report` / `Lab Test` | Lab results in patient summary (try/except fallback) |
| `Service Request` | Open orders in patient summary (try/except fallback) |

### Key Design Patterns

1. **`extend_doctype_class`** — Frappe v16 hook that adds `QueueMixin` to `Patient Appointment`. Marley's controller methods (`super().validate()` / `super().on_update()`) run first.
2. **Two-column receptionist layout** — Left: booking controls. Right: smart panel switching between modes without page navigation. All panel rendering rewrites `#rw-panel-body` innerHTML.
3. **Three-column doctor layout** — `280px queue / 1fr encounter editor / 300px patient summary` CSS grid.
4. **State-machine appointments** — `Patient Appointment.status = "Checked In"` is the canonical trigger for queue entry creation in `on_update`.
5. **Realtime + polling TV dashboard** — Vanilla JS starts polling every 6 s; upgrades to `frappe.realtime` 2 s after DOM ready if available.
6. **localStorage session recovery** — Doctor workspace stores active session name in `localStorage` so page reloads reconnect without re-selecting a session.

---

## 3. FRAPPE-SPECIFIC DESIGN

### Hooks (`hooks.py`)

```python
extend_doctype_class = {
    "Patient Appointment": ["clinic_flow.queue.appointment_mixin.QueueMixin"]
}
```
Chosen over `doc_events` because it gives full `Document` API access (`is_new()`, `has_value_changed()`, `super()`) and chains safely with Marley's controller.

```python
scheduler_events = {
    "cron": {
        "*/5 * * * *": ["clinic_flow.queue.scheduler.release_prebooked_slots"]
    }
}
```
Runs every 5 minutes; idempotent via `prebooked_released` flag.

```python
boot_session = "clinic_flow.api.boot.extend_boot"
```
Appends `home_page = "doctor-workspace"` for Physician / Queue Manager roles on every Frappe boot.

```python
require_type_annotated_api_methods = 1
```
Frappe v16 enforcement: all `@frappe.whitelist()` functions must carry Python type annotations.

```python
fixtures = [
    {"dt": "Custom Field",    "filters": [["module", "=", "Clinic Flow"]]},
    {"dt": "Property Setter", "filters": [["module", "=", "Clinic Flow"]]},
    {"dt": "Role",            "filters": [["name", "in", [
        "Queue Manager", "Queue Viewer", "Lab Queue Trigger"
    ]]]},
    {"dt": "Workspace",       "filters": [["name", "=", "Clinic Flow"]]},
]
```
Ensures custom fields, roles, and workspace tile survive `bench migrate` / reinstall.

### DocTypes Created

| DocType | Type | Autoname | Purpose |
|---|---|---|---|
| `Queue Session` | Regular | `QS-.YYYY.-.#####` | One per doctor per session-day; holds slot counters and round-robin state |
| `Queue Entry` | Regular | `QE-.YYYY.-.#####` | One per checked-in patient; tracks token, position, timing |
| `Slot Partition Config` | **Single** | — | Global percentages and weights; no per-doctor overrides |

### Custom Fields Added to Existing DocTypes

All tagged `module = "Clinic Flow"` so they export via fixtures:

| DocType | Field | Type | Purpose |
|---|---|---|---|
| `Patient Appointment` | `custom_queue_type` | Select | PRE_BOOKED / WALK_IN / FOLLOW_UP / EMERGENCY |
| `Patient Appointment` | `custom_queue_token` | Data | Written back by `QueueMixin.on_update` after token issued |
| `Patient Appointment` | `custom_dept_abbr` | Data | Optional dept override at booking time |
| `Appointment Type` | `custom_queue_code` | Data | `PRE / WLK / FLW / EMR` — maps type to token code segment |
| `Medical Department` | `custom_dept_abbr` | Data | Token prefix (e.g. `CARD`, `PED`, `GEN`) |

### DocType Controllers

**`QueueSession` (`queue_session.py`)**
- `before_insert()` — auto-fills `prebooked_total`, `walkin_total`, `emergency_total` from `session_capacity × pct`
- `validate()` — enforces: `end_time > start_time`; `dept_abbr` required; `session_capacity ≥ 1`

**`QueueEntry` (`queue_entry.py`)**
- `before_save()` — watches `status` changes and auto-sets timing fields:
  - `Called` → sets `called_at` (if not already set)
  - `With Doctor` → sets `seen_at`
  - `Done` → sets `done_at`; calculates `wait_minutes` from `called_at` to now

**`SlotPartitionConfig` (`slot_partition_config.py`)**
- Empty controller (`pass`); all logic lives in callers.

### Event Handlers (`QueueMixin` via `extend_doctype_class`)

`validate()` → `_clinic_flow_enforce_slot_limits()`:
- Skips terminal statuses (Cancelled, No Show, Checked Out, Closed)
- Skips Emergency
- Only fires on new docs or `custom_queue_type` change
- Looks up slot limit from Queue Session if one exists; falls back to config × default capacity (20)
- Throws `frappe.ValidationError` which surfaces on the booking form

`on_update()` → `_clinic_flow_maybe_create_queue_entry()`:
- Only acts when `status == "Checked In"`
- Uses raw SQL for session priority ordering (Frappe v16 rejects `FIELD()` in `frappe.get_all order_by`)
- Day-wide position via raw SQL `MAX(queue_position)` across all today's sessions for practitioner
- Emergency: shifts all Waiting entries' positions forward, inserts at `total_called + 1`
- `between_sessions` flag (session is Completed): creates entry but skips slot counter increment
- Always writes `custom_queue_token` back and broadcasts realtime update

### Background Jobs

`release_prebooked_slots` (every 5 min):
- Finds Active sessions where `prebooked_released = 0` and start_time ≤ now + release_minutes
- Adds `(unfilled_prebooked + unfilled_followup)` to `walkin_total`
- Sets `prebooked_released = 1` and commits immediately (background job safety)

### Whitelisted APIs

**`clinic_flow/api/appointments.py`**

| Function | Notable behaviour |
|---|---|
| `search_patients(query: str)` | Raw SQL; OR across `patient_name` and `mobile`; avoids Frappe ORM multi-column OR limitation |
| `quick_create_patient(first_name, last_name, mobile, dob, sex)` | Mobile required; uniqueness check on mobile before insert |
| `get_availability(practitioner, queue_type)` | Walk-in: `scan_days=1` (today only). Others: 30-day scan. Returns up to 7 slots. Checks `within_release` for walk-in slot release |
| `book_appointment(patient, practitioner, appointment_date, from_time, to_time, queue_type, schedule)` | Re-checks quota at save time; calculates unique `appointment_time` per booking |
| `cancel_appointment(appointment)` | Blocks cancel if Checked In or Checked Out |
| `get_patient_appointments(patient)` | Last 7 days forward, up to 20 records; enriches with `practitioner_name` |
| `get_todays_appointments(practitioner)` | All non-Cancelled today; optional practitioner filter |
| `get_consultation_charge(practitioner, patient)` | Returns `op_consulting_charge`; 0 if active Fee Validity covers. Also returns `payment_modes` list |
| `record_payment_and_checkin(appointment, mode_of_payment, paid_amount)` | Sets payment fields then calls `doc.save()` to trigger `QueueMixin.on_update` |

**`clinic_flow/api/queue.py`**

| Function | Notable behaviour |
|---|---|
| `get_today_schedules()` | Auto-detects practitioner from `frappe.session.user` |
| `start_session(schedule, from_time, to_time, capacity)` | Re-uses existing Active/Scheduled session; calls `_inherit_waiting_entries()` |
| `get_session(queue_session)` | Validates: Active, today, owned by current user's practitioner |
| `get_slot_availability(practitioner, appointment_date)` | Returns limit/used/available/full per queue type |
| `call_next(queue_session)` | Priority dequeue → mark Called → broadcast → create encounter → mark With Doctor → return workspace payload |
| `pause_session(queue_session)` | Active → Paused; broadcasts `session_status` |
| `resume_session(queue_session)` | Paused → Active; broadcasts + queue update |
| `end_session(queue_session, no_show_waiting)` | Marks remaining Waiting as No Show; → Completed; returns other active sessions |
| `reroute_patients(from_session, to_session)` | Bulk re-parent Waiting entries; appends after last position in target |
| `recall_patient(queue_entry)` | Re-broadcasts current token; no state change |
| `skip_patient(queue_entry, reason)` | Marks Skipped; immediately calls `call_next` |
| `get_queue_state(queue_session)` | Left panel: current + next 10 Waiting |
| `get_active_session_for_user()` | Returns today's Active session for logged-in practitioner |
| `get_queue_state_for_display(dept)` | `allow_guest=True`; multi-doctor payload for TV dashboard; returns `sessions[]` array |

**`clinic_flow/api/workspace.py`**

| Function | Notable behaviour |
|---|---|
| `get_workspace_payload(patient, encounter, queue_entry)` | Single round-trip: encounter + patient summary + queue entry |
| `save_encounter_draft(encounter, data)` | Maps: `symptoms → custom_chief_complaint`, `patient_note → encounter_comment`. Rejects submitted encounters |
| `submit_encounter(encounter)` | `enc.submit()`; marks Queue Entry Done; increments session used counter |

`clinic_flow/api/patient_data.py` — Internal only (not whitelisted).
`clinic_flow/api/boot.py` — `extend_boot(bootinfo)` — not whitelisted; invoked by `boot_session` hook.

---

## 4. DATA MODEL

### Core DocTypes and Relationships

```
Healthcare Practitioner
    │
    ├── has many Queue Sessions (one per session-day)
    │       │
    │       ├── rr_state (JSON round-robin cursor)
    │       └── has many Queue Entries
    │               ├── links Patient Appointment  (source of check-in)
    │               └── links Patient Encounter    (created on Call Next)
    │
    └── has many Patient Appointments
            │ status: Open → Checked In triggers QueueMixin.on_update
            └── custom_queue_token written back after Queue Entry created
```

### Queue Session Fields

| Field | Type | Notes |
|---|---|---|
| `session_name` | Data | Human label: e.g. "Morning · Mon 07 Apr 2026"; required |
| `practitioner` | Link(Healthcare Practitioner) | Required |
| `session_date` | Date | Default: Today; required |
| `start_time` / `end_time` | Time | From Practitioner Schedule or caller-provided; required |
| `dept_abbr` | Data | From `Medical Department.custom_dept_abbr`; required; token prefix |
| `session_capacity` | Int | Total patients this session handles; required; ≥ 1 |
| `prebooked_total` / `prebooked_used` | Int | Quota from `capacity × prebooked_pct%`; `used` read-only |
| `prebooked_released` | Check | Set when unfilled slots released to walk-in; prevents double-release |
| `walkin_total` / `walkin_used` | Int | Walk-in quota; `walkin_total` grows when slots released |
| `emergency_total` / `emergency_used` | Int | Holds FOLLOW_UP quota (misleadingly named — see §10) |
| `total_called` | Int | Cumulative calls this session; read-only |
| `current_token` | Data | Last token called; read-only |
| `rr_state` | Small Text (hidden) | JSON: `{"type": "PRE_BOOKED", "remaining": 2}` |
| `status` | Select | Scheduled → Active → Paused → Completed → Cancelled |

### Queue Entry Fields

| Field | Type | Notes |
|---|---|---|
| `token` | Data | `DEPT-CODE-NNN`; search-indexed; read-only |
| `queue_session` | Link(Queue Session) | Required; search-indexed |
| `patient` | Link(Patient) | Required |
| `patient_name` | Data | Fetch from `patient.patient_name`; auto-populated; read-only |
| `appointment` | Link(Patient Appointment) | Optional (emergency walk-ins may lack one) |
| `queue_type` | Select | PRE_BOOKED / WALK_IN / EMERGENCY / FOLLOW_UP; required |
| `status` | Select | Waiting → Called → With Doctor → Done / Skipped / No Show |
| `queue_position` | Int | Global position across today's sessions for practitioner; search-indexed |
| `called_at` / `seen_at` / `done_at` | Datetime | Auto-set by `QueueEntry.before_save()`; read-only |
| `wait_minutes` | Int | Calculated `called_at` to `done_at`; read-only |
| `patient_encounter` | Link(Patient Encounter) | Set by `call_next()`; read-only |
| `issued_by` | Link(User) | Default `__user` |
| `issued_by_role` | Select | Reception / System / Queue Manager |
| `notes` | Small Text | Used for skip reasons |

### Slot Partition Config (Single)

| Field | Default | Purpose |
|---|---|---|
| `prebooked_pct` | 60 | % of capacity for PRE_BOOKED |
| `walkin_pct` | 30 | % for WALK_IN |
| `followup_pct` | 10 | % for FOLLOW_UP |
| `release_minutes_before` | 60 | Minutes before session start to release unfilled slots |
| `weight_prebooked` | 3 | Round-robin weight |
| `weight_walkin` | 1 | Round-robin weight |
| `weight_followup` | 1 | Round-robin weight |
| `after_session_action` | — | Select field; not yet implemented |

### Important Data Assumptions

- `Healthcare Practitioner.user_id` must link the Frappe user. All session ownership checks use this.
- `Medical Department.custom_dept_abbr` must be set; falls back to `"GEN"`.
- `Appointment Type.custom_queue_code` (`PRE/WLK/FLW/EMR`) needed for encounter creation; falls back to first Appointment Type in system.
- `patient_name` on `Queue Entry` is a fetch field — auto-populates.
- FOLLOW_UP bookings use `emergency_total` as their quota field inside Queue Session (misnamed; see §10).

---

## 5. EXTENSION STRATEGY

### How We Avoided Modifying the Base App

1. Zero edits to `healthcare` source files.
2. `extend_doctype_class` adds behaviour to `Patient Appointment` without replacing Marley's controller.
3. All new fields on existing DocTypes are `Custom Field` records tagged `module = "Clinic Flow"`.
4. No monkey-patching.

### Override Patterns Used

- `extend_doctype_class` — the only override pattern. Frappe v16 chains all registered mixins in registration order; `super()` calls propagate correctly.
- `boot_session` — appends to boot payload, does not replace it.

### Safe Extension Points

| Extension | How |
|---|---|
| New queue type | Add to `queue_type` Select in Queue Entry JSON; update `field_map` dicts in `appointment_mixin.py`, `engine.py`, `queue.py`; add to `WEIGHTS` and `TYPE_ORDER` in `engine.get_next_token` |
| Per-doctor slot overrides | Add child table to `Healthcare Practitioner`; modify `_clinic_flow_enforce_slot_limits()` and `book_appointment()` to check it before falling back to config |
| SMS/WhatsApp on check-in | Add `frappe.enqueue(...)` at end of `_clinic_flow_maybe_create_queue_entry`, after token is assigned |
| New desk page | Create `Page` DocType in `clinic_flow/page/`; add shortcut to workspace JSON fixture |

### Areas Requiring Care on Future Changes

- **`rr_state` JSON format** — changing `type` or `remaining` keys breaks in-flight sessions.
- **`queue_position` across sessions** — all position and sequence queries must span all sessions for practitioner+date, not just the current session.
- **`FOLLOW_UP` shares `walkin_used`** — intentional but fragile; any code adding a separate follow-up counter must update all four increment/decrement callers.
- **`doc.save()` in `record_payment_and_checkin`** — switching to `frappe.db.set_value` silently breaks the entire check-in → queue entry flow.
- **`FIELD()` in raw SQL** — the three places that use raw SQL for session priority ordering are intentional workarounds; do not attempt to replace with `frappe.get_all order_by`.

---

## 6. BUSINESS LOGIC

### Core Workflow: Booking → Payment → Check-In → Token

```
Receptionist: left column
  ├── Select practitioner from dropdown
  ├── Select queue type tab (Standard / Follow-up / Walk-in)
  ├── Quota viz bars appear (get_slot_availability)
  └── Availability cards appear (get_availability)
        Walk-in → today only (scan_days=1)
        Others  → next 30 days, up to 7 sessions

  → Click "Book" on a slot → right panel switches to booking flow

  Step 1 (Patient):
    ├── Inline search by name/mobile (search_patients — raw SQL OR)
    ├── Select from dropdown → patient confirmed
    └── Or click "New Patient" → inline form expands (mobile required)

  Step 2 (Payment):
    ├── get_consultation_charge(practitioner, patient)
    │     ├── Fee Validity active? → charge = 0 ("Covered by Fee Validity")
    │     └── Otherwise → op_consulting_charge from practitioner
    └── Receptionist enters amount + mode → record_payment_and_checkin()
          ├── Sets paid_amount, mode_of_payment, invoiced=1, status="Checked In"
          ├── doc.save() → QueueMixin.on_update() fires
          │     ├── Raw SQL: find best session (Active > Paused > Completed)
          │     ├── get_next_sequence: COUNT across all today's sessions+queue_type
          │     ├── build_token: DEPT-CODE-NNN
          │     ├── Insert Queue Entry (Waiting)
          │     ├── Increment session slot counter (skip if between_sessions)
          │     ├── Write custom_queue_token back to appointment
          │     └── _broadcast_queue_update → TV dashboard refreshes
          └── Returns full payload (token, patient, practitioner, dept_abbr)

  Step 3 (Done):
    ├── Confirm screen with token badge
    ├── Print Receipt button → A5 laser print (browser print)
    └── Print Token button  → 80 mm thermal print (browser print)
```

### Core Workflow: Call Next → Encounter

```
Doctor clicks "Call Next" (call_next)
  └── get_next_token(queue_session)
        ├── Emergency first (status=Waiting, order by queue_position)
        └── Round-robin: rr_state loaded from Queue Session JSON
              current_type with remaining weight > 0
              If current type empty → skip-if-empty promotion to next in TYPE_ORDER
              TYPE_ORDER = [PRE_BOOKED, FOLLOW_UP, WALK_IN]

  → mark Queue Entry: Called
  → update Queue Session: current_token, total_called++
  → _broadcast_queue_update (TV refreshes; sorts by last_called_at)
  → _get_or_create_encounter:
        Find Draft encounter today for same patient+practitioner, or
        Create new one (appointment_type resolved from custom_queue_code)
  → mark Queue Entry: With Doctor, seen_at, patient_encounter
  → Return get_workspace_payload (encounter + patient summary + queue entry)

Doctor submits (submit_encounter):
  → enc.submit()
  → Queue Entry → Done (done_at set by QueueEntry.before_save)
  → _decrement_session_counter (increments _used counter for analytics)
```

### Slot Release (background, every 5 min)

```
release_prebooked_slots()
  Active sessions where prebooked_released=0 and start_time ≤ now+release_mins:
    unfilled = (prebooked_total - prebooked_used) + (emergency_total - emergency_used)
    walkin_total += unfilled
    prebooked_released = 1
    frappe.db.commit()
```

### Between-Session Check-In

When doctor is on break (previous session is `Completed`, no Active session):

1. `on_update` finds most recent Completed session via raw SQL priority order.
2. Sets `between_sessions = True`.
3. Creates Queue Entry against Completed session, status=Waiting.
4. Skips slot counter increment.
5. On doctor's next `start_session()` → `_inherit_waiting_entries()` re-parents all Waiting entries from Completed sessions to the new session and increments its counters.

### Emergency Intake

1. Receptionist clicks Emergency button → right panel switches to emergency mode.
2. Select practitioner with active session.
3. Patient identified → `book_appointment(..., queue_type="EMERGENCY")` — quota check skipped.
4. Check-in → `on_update`: position = `total_called + 1`; raw SQL shifts all existing Waiting positions forward.
5. TV dashboard: `is-emergency` card class applied; audio alert fires.

### Edge Cases Handled

| Scenario | Handling |
|---|---|
| Slot fills between availability check and booking | `book_appointment()` re-counts at save time; throws "Slot Full" |
| Appointment already has a Queue Entry | `already_queued` check in `on_update`; no duplicate created |
| No session today at check-in | Throws "No Session Found" (re-raised ValidationError surfaces to receptionist) |
| Unique `appointment_time` collision | Calculated as `from_time + (used × slot_mins)` per booking |
| Doctor between sessions | Checks Active → Paused → Completed; tokens created against Completed session |
| Token recycling across sessions | Sequence is `COUNT(*)` across ALL today's sessions for same practitioner+queue_type |
| Fee Validity covers consultation | `get_consultation_charge` returns `charge=0`; payment step shows "Covered" |
| Lab results DocType absent | `patient_data.py` wraps all lookups in try/except with `[]` / `{}` fallbacks |

---

## 7. FILE-LEVEL BREAKDOWN

### `hooks.py`
Central registration only. No logic. Contains: `extend_doctype_class`, `scheduler_events`, `boot_session`, `fixtures`, `require_type_annotated_api_methods`, `website_route_rules`, `required_apps = ["frappe", "healthcare"]`.

---

### `queue/appointment_mixin.py`

**Class:** `QueueMixin(Document)`

**`validate()`** → `_clinic_flow_enforce_slot_limits()`
- Guards: terminal statuses, Emergency, not-new-or-unchanged
- Looks up limit from Queue Session → falls back to config × 20
- `frappe.ValidationError` re-raised explicitly; generic exceptions are only logged

**`on_update()`** → `_clinic_flow_maybe_create_queue_entry()`
- Guard: `status == "Checked In"` only; idempotency check via `already_queued`
- Session priority via raw SQL: `ORDER BY FIELD(status, 'Active', 'Paused', 'Completed'), creation DESC LIMIT 1`
- Day-wide position: raw SQL `MAX(queue_position)` across practitioner+date
- Emergency: shifts existing Waiting entries forward, takes position `total_called + 1`
- Imports from `engine`: `build_token`, `get_next_sequence`, `_broadcast_queue_update`
- Calls module-level `_increment_session_slot` (not a mixin method)
- `frappe.ValidationError` re-raised so "No Session Found" surfaces to receptionist

**Module-level `_increment_session_slot(queue_session, queue_type)`**
- `field_map`: PRE_BOOKED→`prebooked_used`, WALK_IN→`walkin_used`, EMERGENCY→`emergency_used`, FOLLOW_UP→`walkin_used`

---

### `queue/engine.py`

**`build_token(dept_abbr, queue_type, sequence) → str`**
- Format: `{dept_abbr.upper()}-{code}-{seq:03d}`
- Fallback codes if Appointment Type not configured: PRE_BOOKED→PRE, WALK_IN→WLK, EMERGENCY→EMR, FOLLOW_UP→FLW

**`get_next_sequence(queue_session, queue_type) → int`**
- Raw SQL `COUNT(*)` across ALL sessions for same practitioner+date
- Guarantees day-wide uniqueness even when sessions restart

**`get_next_token(queue_session) → dict | None`**
- Step 1: Emergency bypass (first Waiting Emergency by queue_position)
- Step 2: Load `rr_state` from Queue Session (JSON, graceful fallback)
- Step 3: Try current type; if empty, advance through `TYPE_ORDER = [PRE_BOOKED, FOLLOW_UP, WALK_IN]` without resetting remaining weight
- Updates `rr_state` via `frappe.db.set_value` after each call

**`_broadcast_queue_update(queue_session)`**
- Publishes to `queue_{dept_abbr}` and `queue_all` rooms
- Payload: `current_token`, `next_tokens[:5]`, `practitioner`, `dept_abbr`

---

### `queue/scheduler.py`

**`release_prebooked_slots() → None`**
- Cron target (every 5 min via `hooks.py`)
- Combines unfilled prebooked + followup into single `unfilled` count added to `walkin_total`
- Sets `prebooked_released = 1` + `frappe.db.commit()` before logging

---

### `api/appointments.py`

All `@frappe.whitelist()` with complete type annotations.

**`search_patients(query: str) → list`**
- Direct SQL: `WHERE (patient_name LIKE %q% OR mobile LIKE %q%) AND status != 'Disabled'`
- Returns `name, patient_name, mobile, sex, dob`; limit 10

**`quick_create_patient(...) → dict`**
- Mobile required; uniqueness check before insert; returns `{patient, patient_name}`

**`get_availability(practitioner: str, queue_type: str) → list`**
- Reads `Slot Partition Config` and `Practitioner Service Unit Schedule → Healthcare Schedule Time Slot`
- `scan_days = 1 if queue_type == "WALK_IN" else 30`
- For WALK_IN today: checks `within_release` and adds released PRE_BOOKED + FOLLOW_UP headroom to limit
- Returns up to 7 slots with `available > 0`

**`book_appointment(...) → dict`**
- Re-checks quota (race condition guard)
- Unique `appointment_time`: `start_dt + timedelta(minutes = used × (total_mins // cap))`
- Resolves Appointment Type from `custom_queue_code` → fallback to first in system
- Returns `{appointment, patient}`

**`get_consultation_charge(practitioner: str, patient: str) → dict`**
- Reads `op_consulting_charge` and `op_consulting_charge_item` from Healthcare Practitioner
- Queries `Fee Validity` with `valid_till >= today AND status = "Pending"`; checks `visited < max_visits`
- Returns `{charge, original_charge, covered_by_validity, validity_till, payment_modes, billing_item}`

**`record_payment_and_checkin(appointment: str, mode_of_payment: str, paid_amount: float) → dict`**
- Sets `paid_amount`, `mode_of_payment`, `invoiced=1`, `status="Checked In"`
- Calls `doc.save(ignore_permissions=True)` — triggers `QueueMixin.on_update`
- Reads back `custom_queue_token` after save
- Returns full payload for printing: token, patient_name, practitioner_name, paid_amount, dept_abbr

---

### `api/queue.py`

**`start_session(schedule, from_time, to_time, capacity) → dict`**
- Auto-detects practitioner from `frappe.session.user` (never accepts from client)
- Re-uses existing Active/Scheduled session → marks Scheduled as Active
- Calls `_inherit_waiting_entries(prac.name, session_doc.name)` after creation

**`get_queue_state_for_display(dept: str) → dict`** — `allow_guest=True`
- Supports `?dept=all` or specific `dept_abbr`
- Builds per-session payload via `_build_session_payload`: waiting, current token type, `last_called_at`
- Returns backwards-compatible single-session fields plus `sessions[]` array

**`_inherit_waiting_entries(practitioner, new_session)`** — private module-level function
- Finds Waiting entries on today's Completed sessions (same practitioner)
- Re-parents to new session; calls `_increment_session_slot_for` for each

**`_get_or_create_encounter(entry, queue_session) → str`**
- Finds existing Draft encounter for patient+practitioner+today; or creates one
- appointment_type resolution: appointment → `custom_queue_code` map → first in system → throws if none

---

### `api/workspace.py`

**`save_encounter_draft(encounter, data) → dict`**
- `data` is JSON string (parsed internally)
- Field map: `symptoms → custom_chief_complaint`, `patient_note → encounter_comment`
- Allowed child tables: `drug_prescription`, `lab_test_prescription`, `procedure_prescription`, `diagnosis`
- Rejects submitted (docstatus != 0) encounters

**`submit_encounter(encounter) → dict`**
- `enc.submit()` with graceful `ValidationError` return (not re-raise)
- Marks Queue Entry Done; calls `_decrement_session_counter` (name is misleading — it increments `_used`)

---

### `api/patient_data.py`

Not whitelisted; called from `get_workspace_payload`. All sub-functions individually exception-safe.

Key fallbacks:
- `_get_recent_lab_results`: tries `Diagnostic Report` first; falls back to `Lab Test`
- `_get_open_orders`: tries `Service Request`; returns `[]` on any error
- `_get_fee_validity`: catches any exception; returns `{"has_validity": False}`
- `_get_active_medications`: iterates last 3 encounters; stops at first with prescriptions

---

### `api/boot.py`

**`extend_boot(bootinfo) → None`**
- Skips Guest and Administrator
- Appends `home_page = "doctor-workspace"` for Physician or Queue Manager roles

---

### `clinic_flow/page/doctor_workspace/doctor_workspace.js`

**Class:** `DoctorWorkspace`

**Layout:** 3-column CSS grid — `280px` queue list / `1fr` encounter editor / `300px` patient summary.

**Session init (3-step fallback):**
1. `localStorage.getItem('clinic_flow_session')` → validate via `get_session`
2. `get_active_session_for_user()`
3. Show "Start Consultation Session" prompt → `get_today_schedules()` → `start_session()`

**`_activate_session(session_name, label)`**
- Stores to `localStorage`; loads queue; binds events; subscribes realtime

**`_subscribe_realtime()`**
- `frappe.realtime.on('queue_update', ...)` → refreshes queue list
- `frappe.realtime.on('session_status', ...)` → updates pause status bar

**Encounter editor sections** (all collapsible):
Symptoms / Chief Complaint → Diagnosis (ICD-10 tags) → Plan & Notes → Medication Request → Lab Orders → Referral

**Patient summary panel (right):**
Token, queue type, age/sex, vitals, allergies, active Rx, recent diagnoses, fee validity, lab results.

**Roles allowed (Page JSON):** Healthcare Practitioner, Physician, System Manager, Queue Manager.

---

### `clinic_flow/page/receptionist_workspace/receptionist_workspace.js`

**Class:** `ReceptionistWorkspace`

**Layout:** Single-column root with:
1. Search row (top, prominent) — patient search with inline dropdown
2. Status bar — session pills + Emergency button
3. Two-column main area: Left (Book Appointment) / Right (Smart context panel)

**State fields:**
```
_queue_type, _practitioner, _all_appointments, _search_timer,
_booking_slot, _booking_patient, _booking_appt, _booking_charge, _booking_step,
_mgmt_patient, _rescheduling
```

**Panel modes:** `board`, `booking` (3-step), `patient_mgmt`, `emergency`

**Booking step flow:** `_booking_step` integer (0=patient, 1=payment, 2=done); each step rewrites `#rw-panel-body`.

**Quota visualisation (`#rw-quota-viz`):** Appears when practitioner selected; shows used/limit per type.

**Session pills:** All active/paused sessions with colour-coded status badge.

**Board mode:** `get_todays_appointments()` → appointment rows with inline Check-In buttons. Auto-refreshes every 30 s.

**Print functions:**
- `_print_receipt()` — A5 laser receipt (clinic header, patient name, token, amount, mode, timestamp)
- `_print_token()` — 80 mm thermal (large token display, queue type, practitioner, session info)

**Roles allowed (Page JSON):** Healthcare Administrator, Queue Manager, System Manager.

---

### `www/queue-dashboard.py`
Sets only: `no_cache = 1`, `no_breadcrumbs = 1`, `no_header = 1`, `no_sidebar = 1`. No Python logic.

---

### `www/queue-dashboard.html`

Self-contained standalone page. No Jinja / Frappe ORM — pure HTML + vanilla JS.

**Theme:** Dark (`#06060f` background), DM Sans + DM Mono fonts (Google Fonts CDN).

**Layout:** CSS grid — `60px` header / `1fr` main / `72px` footer. TV scanline texture via `body::after`.

**Carousel:**
- `allSessions[]` holds sorted active sessions; 2 doctors per page
- Auto-advances every 8 s; navigation dots + progress bar
- Sort: Active before Paused → most recently called (`last_called_at` desc) → fewest waiting

**Per-doctor card:** Avatar (photo or initials), name, service unit, status pill, "Now Serving" token (DM Mono), up to 3 "Up Next" rows.

**Token call detection:** Compares incoming `current_token` vs previous state; jumps carousel to page 0 with animation.

**Emergency alert:** Red border flash (CSS keyframes) + Web Audio API triple-beep. Guards via `lastEmergencyToken` var.

**Recall handler:** Briefly dims token text in matching card (opacity 0.3 → 1).

**Startup:** Poll every 6 s → after 2 s try `frappe.realtime` upgrade → subscribe to `queue_update`, `session_status`, `recall_patient`.

**URL parameter:** `?dept=cardiology` filters to one department.

---

### `clinic_flow/doctype/queue_entry/queue_entry.py`

**`QueueEntry.before_save()`**
- Watches `has_value_changed("status")`
- `Called` → sets `called_at` if not already set
- `With Doctor` → sets `seen_at`
- `Done` → sets `done_at`; calculates `wait_minutes` from `called_at` to now

### `clinic_flow/doctype/queue_session/queue_session.py`

**`QueueSession.before_insert()`** — auto-calculates slot totals from `capacity × pct`.
**`QueueSession.validate()`** — enforces end > start, dept_abbr required, capacity ≥ 1.

---

## 8. MIGRATIONS & PATCHES

### Schema Applied by `bench migrate`

All schema is introduced via DocType JSON files (new tables) and Custom Field fixtures (columns on existing tables). No raw SQL migration files exist.

### `patches.txt`

Present but empty — only scaffold headings (`[pre_model_sync]`, `[post_model_sync]`). No patches written yet.

### How to Write a Future Patch

```python
# clinic_flow/patches/YYYYMMDD_description.py
import frappe

def execute():
    """Backfill custom_queue_type on existing Patient Appointments."""
    frappe.db.sql("""
        UPDATE `tabPatient Appointment`
        SET custom_queue_type = 'PRE_BOOKED'
        WHERE custom_queue_type IS NULL OR custom_queue_type = ''
    """)
```

Register in `patches.txt` under `[post_model_sync]`:
```
clinic_flow.patches.YYYYMMDD_description
```

### Migration Risks

- **Removing fixture Custom Fields** — dangerous if data exists; write a patch to migrate data first.
- **Changing `rr_state` JSON structure** — add a patch that resets `rr_state = '{}'` for all Active sessions.
- **Adding `NOT NULL` columns** — provide defaults in the DocType JSON.

---

## 9. TESTING & VALIDATION

### Current Test Coverage

None. No `tests/` directory exists. Everything validated manually.

### Recommended Manual Validation Steps

**Environment:**
```bash
bench --site site1.localhost list-apps     # verify: frappe, healthcare, clinic_flow
bench --site site1.localhost migrate       # apply schema + fixtures
bench --site site1.localhost console
>>> frappe.get_single("Slot Partition Config").as_dict()
```

**Slot release (manual trigger):**
```bash
bench --site site1.localhost execute clinic_flow.queue.scheduler.release_prebooked_slots
```

**Full booking flow:**
1. Login as receptionist → `/receptionist-workspace`
2. Select practitioner → verify quota bars appear
3. Select queue type tab → verify slots appear (Walk-in: today only; PRE_BOOKED: future dates)
4. Click "Book" → right panel shows patient search → search by mobile → select patient
5. Payment step → enter amount → Check In
6. Verify token on done screen → print receipt and token (check print preview)

**Doctor workspace:**
1. Login as practitioner → auto-redirected to `/doctor-workspace`
2. Start session (select schedule)
3. Call Next → verify patient banner, encounter editor, patient summary
4. Edit symptoms → Save Draft → Submit
5. Verify Queue Entry status → Done

**TV dashboard:**
1. Open `/queue-dashboard?dept=all` as Guest
2. Verify current token and "Up Next" rows
3. Call Next from doctor workspace → verify TV updates within ~1 s
4. Pause session → verify "Away" status pill and dimmed card
5. End session with ≥1 doctor still active → verify carousel shows remaining doctor

**Between-session check-in:**
1. Doctor ends Session 1
2. Receptionist checks in patient → verify token issued against Completed session
3. Doctor starts Session 2 → verify Queue Entry re-parented to Session 2

---

## 10. KNOWN ISSUES / TECH DEBT

| Issue | Severity | Detail |
|---|---|---|
| No automated tests | High | Everything manually tested; easy to regress |
| `emergency_total` / `emergency_used` used for FOLLOW_UP quota | Medium | Field names mislead; should be `followup_total` / `followup_used` with a data migration |
| `_decrement_session_counter` in `workspace.py` is misnamed | Low | Actually increments `_used` counters (throughput tracking) |
| N+1 queries in `_get_active_medications` | Medium | Iterates up to 3 encounters loading full doc each time |
| `get_availability` runs one `frappe.db.count` per slot per date | Medium | Up to 7×30=210 queries in worst case; should aggregate with GROUP BY |
| Receptionist board doesn't receive realtime updates | Low | Must manually reload or wait 30 s auto-refresh |
| `after_session_action` in Slot Partition Config is unimplemented | Low | UI field exists but no logic reads it |
| Emergency `queue_position` shift uses direct SQL UPDATE | Low | Bypasses Frappe change tracking |
| No per-practitioner slot overrides | Medium | All doctors share same percentages |
| `get_queue_state_for_display` runs 3+ queries per session | Medium | Acceptable for ≤5 active doctors; slow at scale |
| TV dashboard loads Google Fonts from CDN | Low | Will fail in air-gapped environments |

---

## 11. DESIGN TRADEOFFS

### `extend_doctype_class` vs `doc_events`

**Chosen:** `extend_doctype_class`

`doc_events` gives only a handler function — no `self.is_new()`, no `self.has_value_changed()`, no `super()`. The mixin gives full `Document` API and chains cleanly with Marley's controller. Frappe v16-preferred pattern.

### Raw SQL for Session Priority Ordering

**Chosen:** `frappe.db.sql("... ORDER BY FIELD(status, 'Active', 'Paused', 'Completed')")`

Frappe v16 sanitises `order_by` in `frappe.get_all` and rejects `FIELD()`. Raw SQL is the only option. Isolated to three locations.

### Unique `appointment_time` per Booking

**Chosen:** `from_time + (used × (session_duration // capacity)) minutes`

Frappe Healthcare rejects two appointments with the same `appointment_time` for the same practitioner on the same day. Using `from_time` for all bookings causes the 2nd booking to fail. The offset formula is deterministic and requires no schema change.

### `doc.save()` for Check-In

**Chosen:** `doc.save(ignore_permissions=True)` in `record_payment_and_checkin`

`frappe.db.set_value` bypasses the document lifecycle. Queue Entry creation lives in `QueueMixin.on_update()`. `doc.save()` is the only correct approach.

### FOLLOW_UP Sharing Walk-In Slot Counter

**Chosen:** FOLLOW_UP increments `walkin_used`

When the scheduler runs, unfilled follow-up slots are released into `walkin_total`. It is therefore correct for follow-up check-ins to count against `walkin_used`. A separate counter would require matching logic to avoid double-counting.

### TV Dashboard: Polling + Realtime Upgrade

**Chosen:** Start with 6 s polling; upgrade to realtime after 2 s if `frappe.realtime` available

TV screens may be logged in as Guest or may not have Socket.io connected immediately. Polling ensures the dashboard always shows fresh data regardless.

---

## 12. HOW TO EXTEND THIS SYSTEM

### Adding a New Queue Type

1. Add to `Queue Entry.queue_type` Select options in `queue_entry.json`
2. Add quota fields to `queue_session.json` if needed
3. Update `field_map` in `appointment_mixin._increment_session_slot`
4. Update `WEIGHTS` and `TYPE_ORDER` in `engine.get_next_token`
5. Update `code_map` in `book_appointment` and `_get_or_create_encounter`
6. Update `pct_map` in `get_availability` and `book_appointment`
7. Update `TC` object in `queue-dashboard.html` for badge colours
8. Run `bench migrate`

### Adding Per-Doctor Slot Overrides

1. Add child table to `Healthcare Practitioner` with `queue_type` + `pct` columns
2. In `_clinic_flow_enforce_slot_limits` and `book_appointment`, check practitioner row before falling back to `Slot Partition Config`

### Adding Notifications After Check-In

In `QueueMixin._clinic_flow_maybe_create_queue_entry`, after the token is assigned:
```python
frappe.enqueue(
    "clinic_flow.api.notifications.send_token_sms",
    mobile=frappe.db.get_value("Patient", self.patient, "mobile"),
    token=token,
    queue="short",
)
```

### Adding a New Receptionist Panel Mode

1. Add mode constant and trigger (button or event)
2. Add `case 'new_mode':` in `_render_panel()`
3. Implement `_render_new_mode_panel()` setting `#rw-panel-body` innerHTML and binding events

### What NOT to Do

- **Do not edit `healthcare` app files.**
- **Do not use `document.getElementById` in desk pages.** Use `$(this.wrapper).find('#id')`.
- **Do not use `frappe.get_all` with `ORDER BY FIELD()`.**
- **Do not switch `record_payment_and_checkin` to `frappe.db.set_value`.**
- **Do not add untyped `@frappe.whitelist()` functions.**
- **Do not reset `rr_state` JSON without a migration.**

---

## 13. DEPLOYMENT & ENVIRONMENT

### Requirements

| Component | Requirement |
|---|---|
| Frappe | v16 |
| `healthcare` (Marley) | v16-compatible |
| Python | 3.11+ (union type syntax `X \| Y` used in annotations) |
| MariaDB | 10.6+ |
| Redis | For realtime (Socket.io) and cache |
| Internet access | TV dashboard loads DM Sans/DM Mono from Google Fonts CDN |

### Install on a New Site

```bash
bench get-app clinic_flow /path/or/url
bench --site site1.localhost install-app clinic_flow
bench --site site1.localhost migrate
bench --site site1.localhost list-apps   # verify
```

### Required One-Time Setup After Install

1. **Slot Partition Config** — defaults (60/30/10) pre-set; adjust if needed
2. **Medical Department.custom_dept_abbr** — set for each dept (e.g. `CARD`, `PED`, `GEN`)
3. **Appointment Type.custom_queue_code** — set `PRE`, `WLK`, `FLW`, `EMR` on corresponding types
4. **Healthcare Practitioner.user_id** — link each practitioner to their Frappe user account
5. **Practitioner Schedule** — each doctor needs a schedule with `Healthcare Schedule Time Slot` rows including `maximum_appointments`
6. **Roles** — assign `Queue Manager` to receptionists, `Physician` to doctors, `Queue Viewer` for TV accounts

### Roles and Access

| Role | Pages accessible | Key capabilities |
|---|---|---|
| `Physician` / `Healthcare Practitioner` | Doctor Workspace | Start/pause/end session; call next; submit encounter |
| `Queue Manager` | Doctor + Receptionist Workspaces | All above + booking + check-in + Slot Partition Config write |
| `Healthcare Administrator` | Receptionist Workspace | Booking + check-in |
| `Queue Viewer` | Queue Entry list (read) | TV display account |
| `System Manager` | All | Full access to all DocTypes |
| `Lab Queue Trigger` | — | Created as fixture; reserved for future lab integration |

### Website Route

`/queue-dashboard` → `clinic_flow/www/queue-dashboard.{html,py}` via `website_route_rules` in `hooks.py`. Accessible to guests.

---

## 14. GLOSSARY

| Term | Definition |
|---|---|
| **Queue Session** | DocType: one doctor's working session on one day. Holds slot quotas, round-robin state, and live counters. Autoname: `QS-.YYYY.-.#####` |
| **Queue Entry** | DocType: one patient's place in the queue. Created at check-in. Tracks token, position, and timing. Autoname: `QE-.YYYY.-.#####` |
| **Slot Partition Config** | Single DocType: global percentages and round-robin weights. No per-doctor overrides. |
| **Token** | Alphanumeric identifier issued to a checked-in patient: `DEPT-CODE-NNN` (e.g. `CARD-WLK-007`). |
| **Queue Type** | One of `PRE_BOOKED`, `WALK_IN`, `FOLLOW_UP`, `EMERGENCY`. Determines slot quota, round-robin weight, and token code. |
| **Round-Robin** | Dequeue algorithm: PRE_BOOKED (weight 3×), FOLLOW_UP (1×), WALK_IN (1×) in rotation. EMERGENCY bypasses it. |
| **PRE_BOOKED** | Advance-booked (up to 30 days). Quota = `session_capacity × prebooked_pct%`. |
| **WALK_IN** | Same-day only. Quota = `walkin_pct%`; grows via slot release. |
| **FOLLOW_UP** | Follow-up visit. Quota = `followup_pct%` (stored as `emergency_total` on Queue Session). Shares `walkin_used` counter. |
| **EMERGENCY** | No quota. Always called next. Shifts all Waiting positions forward by 1 on check-in. TV shows red border + audio alert. |
| **Slot Release** | Scheduler job: adds unfilled PRE_BOOKED + FOLLOW_UP slots to `walkin_total` 60 min before session start. |
| **Between-Sessions** | State where doctor's previous session is Completed but no new session started. `_inherit_waiting_entries` migrates tokens when next session starts. |
| **Inherit Waiting Entries** | `_inherit_waiting_entries()` in `queue.py`: re-parents Waiting entries from Completed sessions to the newly started session. |
| **custom_queue_type** | Custom field on `Patient Appointment`. Primary link between appointment and queue machinery. |
| **custom_queue_token** | Custom field on `Patient Appointment`. Written back after token issued; shown on done screen for printing. |
| **custom_queue_code** | Custom field on `Appointment Type`. Maps type to token code segment (`PRE`, `WLK`, etc.). |
| **custom_dept_abbr** | Custom field on `Medical Department`. Drives the `DEPT` prefix in the token. |
| **QueueMixin** | Python class in `appointment_mixin.py`. Added to `Patient Appointment` via `extend_doctype_class`. Implements slot enforcement and check-in logic. |
| **extend_doctype_class** | Frappe v16 hook. Adds a mixin class to an existing DocType's controller chain without replacing it. |
| **rr_state** | JSON field on Queue Session. Persists round-robin cursor between calls: `{"type": "PRE_BOOKED", "remaining": 2}`. |
| **dept_abbr** | Abbreviation for the medical department. First segment of every token. Set on `Medical Department.custom_dept_abbr`. |
| **Fee Validity** | Standard Frappe Healthcare DocType. Tracks pre-paid consultation packages. If active and `visited < max_visits`, charge shown as 0. |
| **Practitioner Schedule** | Frappe Healthcare DocType. Defines days/times a doctor is available. Child `Healthcare Schedule Time Slot` rows hold per-day times and capacity. |
| **Practitioner Service Unit Schedule** | Join table linking practitioner to schedule. Used in `get_today_schedules` and `get_availability` queries. |
| **Patient Encounter** | Frappe Healthcare DocType. Clinical record of one visit. Created as Draft on Call Next; submitted when doctor finishes. |
| **Realtime room** | `queue_{dept_abbr}` or `queue_all`. Frappe's Socket.io room name. TV dashboards and doctor workspaces subscribe. |
| **Smart context panel** | Right column of receptionist workspace (`#rw-panel`). Switches between modes by rewriting `#rw-panel-body` innerHTML. |
| **Carousel** | TV dashboard multi-doctor display. 2 doctors per page; auto-advances every 8 s. Sort: most-recently-called first. |

---

*Reflects actual codebase as of 2026-04-09. Python version: 3.14 (confirmed by `__pycache__` filenames). Branch: `version-16`. All file paths relative to `apps/clinic_flow/clinic_flow/` unless noted.*
