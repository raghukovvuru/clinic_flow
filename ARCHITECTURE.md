# ARCHITECTURE.md — Clinic Flow

System design reference for the `clinic_flow` Frappe v16 app.

---

## 1. System Overview

Clinic Flow is a queue management overlay on top of Marley Healthcare (`healthcare` app). It adds no replacement screens for clinical workflows — it only adds:

1. A **session model** (Queue Session) that represents a doctor's working period
2. A **token model** (Queue Entry) that represents a patient's position in the queue
3. A **receptionist workspace** for booking and check-in
4. A **doctor workspace** for calling patients and editing encounters
5. A **TV dashboard** for waiting room display

The system is entirely additive. Marley's DocTypes are read and extended; never replaced.

---

## 2. Integration Boundary

```
┌────────────────────────────────────────────────────────┐
│                    clinic_flow                         │
│                                                        │
│  Queue Session ──── Queue Entry                        │
│       │                  │                             │
│       │         Patient Appointment (extended)         │
│       │                  │                             │
└───────┼──────────────────┼─────────────────────────────┘
        │    healthcare     │
        │                  │
   Healthcare          Patient Encounter
   Practitioner        Vital Signs
        │              Fee Validity
   Practitioner        Appointment Type
   Schedule            Medical Department
```

Clinic Flow reads from Marley's DocTypes using standard Frappe ORM and extends `Patient Appointment` via `extend_doctype_class`. It never modifies Marley's source.

---

## 3. Hook Architecture

All hook registrations are in `hooks.py`:

| Hook | Value | Effect |
|---|---|---|
| `extend_doctype_class` | `QueueMixin` on `Patient Appointment` | Adds slot enforcement on validate; queue entry creation on check-in |
| `scheduler_events.cron` | `*/5 * * * *` → `release_prebooked_slots` | Releases unfilled slots to walk-in 60 min before session |
| `boot_session` | `extend_boot` | Redirects Physician/Queue Manager to `/doctor-workspace` on login |
| `fixtures` | Custom Field, Property Setter, Role, Workspace | Persists custom schema across migrations |
| `require_type_annotated_api_methods` | `1` | Enforces type annotations on all `@frappe.whitelist()` functions |
| `website_route_rules` | `/queue-dashboard` | Public TV dashboard route |

---

## 4. Data Model

### DocType Relationships

```
Healthcare Practitioner
  ├─< Queue Session (one per session-day)
  │     ├── session_capacity
  │     ├── prebooked_total / prebooked_used / prebooked_released
  │     ├── walkin_total / walkin_used
  │     ├── emergency_total / emergency_used  ← holds FOLLOW_UP quota (see §10)
  │     ├── rr_state (JSON round-robin cursor)
  │     ├── current_token
  │     ├── total_called
  │     └─< Queue Entry (one per checked-in patient)
  │           ├── token (DEPT-CODE-NNN)
  │           ├── queue_type (PRE_BOOKED|WALK_IN|FOLLOW_UP|EMERGENCY)
  │           ├── queue_position (global across today's sessions)
  │           ├── status (Waiting→Called→With Doctor→Done|Skipped|No Show)
  │           ├── called_at / seen_at / done_at / wait_minutes
  │           ├─→ Patient Appointment
  │           └─→ Patient Encounter
  │
  └─< Patient Appointment (extended via QueueMixin)
        ├── custom_queue_type  ← the trigger field
        ├── custom_queue_token ← written back after check-in
        └── custom_dept_abbr
```

### Slot Partition Config (Single — global)

```
prebooked_pct    default 60   % of session_capacity for PRE_BOOKED
walkin_pct       default 30   % for WALK_IN (grows via slot release)
followup_pct     default 10   % for FOLLOW_UP
release_minutes_before  60   mins before session to release unfilled slots
weight_prebooked  3           round-robin calls before switching type
weight_walkin     1
weight_followup   1
```

### Token Format

`{dept_abbr}-{code}-{seq:03d}` — e.g. `CARD-WLK-007`

- `dept_abbr` from `Medical Department.custom_dept_abbr`
- `code` from `Appointment Type.custom_queue_code` (`PRE`, `WLK`, `FLW`, `EMR`)
- `seq` = COUNT of all Queue Entries for same practitioner+date+queue_type across ALL sessions

Sequence is day-wide to prevent recycling when sessions restart.

---

## 5. Module Responsibilities

### `queue/engine.py`
Pure logic, no side effects except `frappe.db.set_value` on `rr_state`.

- `build_token(dept_abbr, queue_type, sequence)` — formats token string
- `get_next_sequence(queue_session, queue_type)` — day-wide COUNT via raw SQL
- `get_next_token(queue_session)` — priority dequeue (Emergency bypass + round-robin)
- `_broadcast_queue_update(queue_session)` — pushes to `queue_{dept_abbr}` and `queue_all` realtime rooms

### `queue/appointment_mixin.py`
Attached to `Patient Appointment` via `extend_doctype_class`.

- `validate()` → slot limit enforcement (skips Emergency; only on new/changed queue_type)
- `on_update()` → check-in handler (only when `status == "Checked In"`; idempotent)
- Module-level `_increment_session_slot()` — increments `_used` counter on Queue Session

### `queue/scheduler.py`
Cron target (every 5 min).

- Finds Active sessions with `prebooked_released=0` and start_time within release window
- Adds `unfilled_prebooked + unfilled_followup` to `walkin_total`
- Commits immediately (background job safety)

### `api/appointments.py`
Receptionist-facing API. All functions are `@frappe.whitelist()`.

| Function | Purpose |
|---|---|
| `search_patients` | Raw SQL OR on `patient_name`/`mobile` |
| `quick_create_patient` | Mobile-unique patient creation |
| `get_availability` | Next slots; walk-in restricted to today |
| `book_appointment` | Creates appointment with unique `appointment_time` |
| `get_consultation_charge` | Returns charge; 0 if Fee Validity covers |
| `record_payment_and_checkin` | Pays + checks in via `doc.save()` |
| `cancel_appointment` | Blocks cancel if Checked In/Out |
| `get_patient_appointments` | Last 7 days forward |
| `get_todays_appointments` | Board view data |

### `api/queue.py`
Session lifecycle + doctor workspace queries.

| Function | Purpose |
|---|---|
| `start_session` | Creates/reuses session; inherits orphaned entries |
| `call_next` | Dequeue → encounter → return workspace payload |
| `pause_session` / `resume_session` / `end_session` | Session state machine |
| `reroute_patients` | Bulk re-parent Waiting entries to another session |
| `get_queue_state_for_display` | Public (allow_guest); multi-doctor TV payload |
| `get_slot_availability` | Pre-booking availability check |
| `_inherit_waiting_entries` | Re-parents between-session entries on new session start |

### `api/workspace.py`
Doctor workspace clinical actions.

| Function | Purpose |
|---|---|
| `get_workspace_payload` | Single round-trip: encounter + patient summary + queue entry |
| `save_encounter_draft` | Partial field map to Patient Encounter |
| `submit_encounter` | Submits encounter; marks Queue Entry Done |

### `api/patient_data.py`
Internal only (not whitelisted). Assembles patient summary from 8 sources.
All sub-functions are individually exception-safe (returns `{}` or `[]` on failure).

### `api/boot.py`
`extend_boot(bootinfo)` — appends `home_page = "doctor-workspace"` for Physician/Queue Manager.

---

## 6. Core Workflows

### 6.1 Booking → Check-In → Token

```
receptionist selects practitioner + queue type
    │
    ▼
get_availability()
    uses Practitioner Schedule → Healthcare Schedule Time Slot
    walk-in: scan_days=1 (today only)
    others: scan up to 30 days, return first 7 with available > 0
    │
    ▼
book_appointment()
    re-checks quota (race guard)
    appointment_time = from_time + (used × session_duration/capacity) minutes
    inserts Patient Appointment (status=Open)
    │
    ▼
get_consultation_charge()
    checks Fee Validity (valid_till >= today, visited < max_visits)
    returns charge=0 if covered
    │
    ▼
record_payment_and_checkin()
    sets paid_amount, mode_of_payment, invoiced=1, status="Checked In"
    doc.save() ─────────────────────────────────────────────────────┐
                                                                    │
                                                    QueueMixin.on_update()
                                                        │
                                                        ├── raw SQL: find session
                                                        │   ORDER BY FIELD(status,
                                                        │   'Active','Paused','Completed')
                                                        │
                                                        ├── get_next_sequence()
                                                        │   COUNT across all today's sessions
                                                        │
                                                        ├── build_token() → DEPT-CODE-NNN
                                                        │
                                                        ├── insert Queue Entry (Waiting)
                                                        │
                                                        ├── _increment_session_slot()
                                                        │   (skipped if between_sessions)
                                                        │
                                                        ├── write custom_queue_token back
                                                        │
                                                        └── _broadcast_queue_update()
                                                            → TV dashboard refreshes
```

### 6.2 Call Next → Encounter

```
doctor clicks Call Next
    │
    ▼
get_next_token(queue_session)
    Step 1: any EMERGENCY Waiting? → return it (bypass round-robin)
    Step 2: load rr_state JSON from Queue Session
    Step 3: try current_type; if empty → skip to next in TYPE_ORDER
            TYPE_ORDER = [PRE_BOOKED, FOLLOW_UP, WALK_IN]
    update rr_state
    │
    ▼
mark Queue Entry: Called
update Queue Session: current_token, total_called++
_broadcast_queue_update() → TV shows new token
    │
    ▼
_get_or_create_encounter()
    find existing Draft encounter (patient+practitioner+today)
    or create new one (resolve Appointment Type from custom_queue_code)
    │
    ▼
mark Queue Entry: With Doctor
return get_workspace_payload() → doctor sees patient data
```

### 6.3 Between-Session Check-In

```
Session 1 ends (Completed)
    │
patient arrives at reception
    │
    ▼
QueueMixin.on_update() finds Completed session
between_sessions = True
Queue Entry inserted against Completed session
_increment_session_slot() SKIPPED
token issued and written to appointment
    │
    ▼
doctor starts Session 2
    │
    ▼
start_session() calls _inherit_waiting_entries()
    finds Waiting entries on today's Completed sessions
    re-parents to Session 2
    calls _increment_session_slot_for() for each
    _broadcast_queue_update()
```

### 6.4 Slot Release (every 5 min)

```
release_prebooked_slots()
    for each Active session where prebooked_released=0
        and start_time ≤ now + release_minutes_before:
            unfilled = (prebooked_total - prebooked_used)
                     + (emergency_total - emergency_used)  ← FOLLOW_UP quota
            walkin_total += unfilled
            prebooked_released = 1
            frappe.db.commit()
```

---

## 7. Round-Robin State Machine

State stored as JSON in `Queue Session.rr_state`:

```json
{"type": "PRE_BOOKED", "remaining": 2}
```

- `type`: which queue type is currently being served
- `remaining`: how many more tokens of this type before rotating

Default weights (from Slot Partition Config): PRE_BOOKED=3, FOLLOW_UP=1, WALK_IN=1

**Rotation example** with defaults:
```
PRE_BOOKED, PRE_BOOKED, PRE_BOOKED → FOLLOW_UP → WALK_IN → PRE_BOOKED, PRE_BOOKED, PRE_BOOKED ...
```

**Skip-if-empty**: If the current type has no Waiting entries, the algorithm advances to the next type without resetting the weight counter. This prevents starvation when one lane is empty.

**Emergency bypass**: Checked before round-robin. Any Emergency Waiting entry is always returned first.

---

## 8. Realtime Architecture

Events published via `frappe.publish_realtime`:

| Event | Room(s) | Payload | Triggered by |
|---|---|---|---|
| `queue_update` | `queue_{dept_abbr}`, `queue_all` | current_token, next_tokens[:5], practitioner, dept_abbr | `_broadcast_queue_update()` |
| `session_status` | `queue_{dept_abbr}`, `queue_all` | session, status, dept_abbr, practitioner | pause/resume/end session |
| `recall_patient` | `queue_{dept_abbr}`, `queue_all` | token, patient_name, queue_type | `recall_patient()` |

TV dashboard (`queue-dashboard.html`):
- Starts polling `get_queue_state_for_display` every 6 s on load
- After 2 s, attempts to upgrade to `frappe.realtime` (Socket.io)
- On realtime connect, cancels polling and subscribes to all three events

Doctor workspace:
- Subscribes to `queue_update` → refreshes left queue panel
- Subscribes to `session_status` → shows pause status bar

---

## 9. UI Architecture

### Doctor Workspace (`doctor_workspace.js`)

```
┌─────────────────────────────────────────────────────────────────┐
│ Action bar: Call Next | Recall | Skip | Save Draft | Submit | Pause | End Session │
├─────────────┬───────────────────────────────┬───────────────────┤
│  Queue      │  Encounter Editor             │  Patient Summary  │
│  280px      │  1fr                          │  300px            │
│             │                               │                   │
│ session     │ Symptoms (textarea)           │ Token             │
│ label       │ Diagnosis (ICD-10 tags)       │ Queue Type        │
│             │ Plan/Notes (textarea)         │ Age/Sex           │
│ queue       │ ─ collapsible sections ─      │ Chief Complaint   │
│ items       │ Medication Request            │ Vitals            │
│ (Waiting    │ Lab Orders                    │ Allergies         │
│  list)      │ Referral                      │ Active Rx         │
│             │                               │ Diagnoses         │
│             │                               │ Fee Validity      │
│             │                               │ Lab Results       │
└─────────────┴───────────────────────────────┴───────────────────┘
```

Session init (3-step fallback):
1. `localStorage.getItem('clinic_flow_session')` → validate via `get_session`
2. `get_active_session_for_user()` → server lookup
3. Show "Start Consultation Session" prompt → `get_today_schedules()` → `start_session()`

### Receptionist Workspace (`receptionist_workspace.js`)

```
┌────────────────────────────────────────────────────────────────┐
│ Search bar (prominent, centered, full-width)                   │
├──────────────────────────────────────┬─────────────────────────┤
│ Session pills (status bar)           │    Emergency button     │
├──────────────────────────────────────┴─────────────────────────┤
│ LEFT: Book Appointment               │ RIGHT: Smart Panel      │
│                                      │                         │
│ [Select Practitioner ▼]              │  ┌─ Panel modes ───┐   │
│ [Standard|Follow-up|Walk-in tabs]    │  │ board           │   │
│                                      │  │ booking (3-step)│   │
│ Today's Quota (bars)                 │  │ patient_mgmt    │   │
│ ▓▓▓▓▓░░░ PRE_BOOKED  8/12           │  │ emergency       │   │
│ ▓▓░░░░░░ WALK_IN     2/6            │  └─────────────────┘   │
│ ░░░░░░░░ FOLLOW_UP   0/2            │                         │
│                                      │  #rw-panel-body        │
│ Availability cards:                  │  (innerHTML replaced    │
│ ┌─ Mon 07 Apr 08:00–12:00 ──┐       │   on mode change)      │
│ │ 3 PRE_BOOKED available   [Book] │  │                         │
│ └──────────────────────────────┘    │                         │
└──────────────────────────────────────┴─────────────────────────┘
```

**Booking flow (3 steps, all inline in right panel):**
1. Patient search/create + slot confirmation
2. Payment (charge shown; Fee Validity handled; mode selection)
3. Done screen + print receipt + print token

### TV Dashboard (`queue-dashboard.html`)

```
┌────────────────────────────────────────────────────────────────┐
│ ● OPD Queue   [CARDIOLOGY]                           14:32     │ header
├────────────────────────────────────────────────────────────────┤
│ ┌─ Dr. Smith ─────────────┐  ┌─ Dr. Jones ─────────────┐     │
│ │  [avatar]  Active       │  │  [avatar]  Away          │     │
│ │                         │  │                          │     │
│ │  Now Serving            │  │  Now Serving             │     │
│ │  ┌───────────────────┐  │  │  ┌───────────────────┐  │     │
│ │  │  CARD-PRE-004     │  │  │  │        —          │  │     │
│ │  └───────────────────┘  │  │  └───────────────────┘  │     │
│ │  ● Pre-booked           │  │  ⏸ Temporarily Unavail  │     │
│ │                         │  │                          │     │
│ │  Up Next                │  │  Up Next                 │     │
│ │  CARD-WLK-002  Shah A.  │  │  (empty)                 │     │
│ │  CARD-PRE-005  Ali M.   │  │                          │     │
│ └─────────────────────────┘  └──────────────────────────┘     │ main
│              ●  ○  ○   ← carousel dots                        │
├────────────────────────────────────────────────────────────────┤
│ Please wait for your token number to be called      14:32:45  │ footer
└────────────────────────────────────────────────────────────────┘
```

Shows 2 doctors per carousel page. Auto-rotates every 8 s.
Sort: Active before Paused → most-recently-called first → fewest waiting.
Emergency: red card border + audio beep (Web Audio API).

---

## 10. Known Design Constraints

### `emergency_total` / `emergency_used` hold FOLLOW_UP quota
When Queue Session was designed, FOLLOW_UP and EMERGENCY were merged into one slot bucket. The fields were named after Emergency but now store Follow-up data. Renaming requires a data migration and updates to all field_map dicts.

### FOLLOW_UP shares `walkin_used` counter
Slot release adds unfilled FOLLOW_UP headroom into `walkin_total`. Therefore FOLLOW_UP check-ins count against `walkin_used` — not a separate counter. This is correct but non-obvious.

### `doc.save()` is required in `record_payment_and_checkin`
Queue Entry creation lives in `QueueMixin.on_update()`. The only way to trigger it is via a full document save cycle. `frappe.db.set_value` skips `on_update`.

### `queue_position` must be day-wide
All queue position calculations use `MAX(queue_position)` across ALL sessions for a practitioner on a date. Single-session position queries would cause position recycling when sessions restart.

### Walk-in availability is today-only
`get_availability` uses `scan_days = 1 if queue_type == "WALK_IN" else 30`. Walk-ins cannot be pre-booked for future dates.

### Unique `appointment_time` per booking
Frappe Healthcare rejects two appointments with the same `appointment_time` for the same practitioner on the same day. Each booking gets: `from_time + (already_booked_count × (session_duration // capacity)) minutes`.

---

## 11. Fixture Strategy

Fixtures export to `apps/clinic_flow/clinic_flow/fixtures/` on `bench export-fixtures`:

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

After adding any Custom Field or Role via the Frappe UI, run:
```bash
bench --site site1.localhost export-fixtures --app clinic_flow
```
Then commit the updated fixture JSON files.

---

## 12. Patch Strategy

`patches.txt` has the scaffold sections but no patches yet.

When a data migration is needed:
1. Write `clinic_flow/patches/YYYYMMDD_description.py`
2. Add path to `patches.txt` under `[post_model_sync]`
3. Run with `bench --site site1.localhost migrate`

The patch file must be idempotent (safe to run twice).
