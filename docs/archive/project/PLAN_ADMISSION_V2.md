# Historical Note

This file is a historical implementation plan. Parts of it were implemented, parts changed, and parts remain incomplete.

Do not use it as active architecture context without checking the current code and active docs.

# Admission v2 — Implementation Plan

**Branch:** `feature/admission-v2` (branch off `version-16`)
**Scope:** Receptionist dashboard redesign — new booking flow, parent-child model,
time estimation engine, load-aware session recommendations, VIP buffer slots,
expanded patient state machine.
**Not in scope (this plan):** TV dashboard, SMS/WhatsApp alerts, doctor workspace
changes, admin reporting, round-robin serving changes.

---

## 1. Why a New Branch and New Page

The existing `receptionist_workspace` page is stable and in use. The changes
required for v2 are deep enough that building alongside the old page is safer
than modifying it in place:

- Booking flow reversal (payment moves from booking time to reception time)
- Parent-child data model (no concept of guardian in current app)
- Token board UI (completely new component)
- Expanded state machine (new statuses on Queue Entry)
- ETA engine (entirely new module)

The old page stays on `version-16`. The new page (`receptionist_dashboard`) is
built on the feature branch. When validated, the boot redirect in `api/boot.py`
is updated to point to the new page and the old page is retired.

---

## 2. What Is Reused

| Component | Reuse decision | Notes |
|---|---|---|
| `Queue Session` DocType | Reuse + extend | New fields added via fixtures |
| `Queue Entry` DocType | Reuse + extend | New statuses, new fields |
| `Slot Partition Config` | Reuse + extend | New ETA and VIP buffer fields |
| `engine.py` | Partially reuse | Simplify token format; keep sequence logic |
| `scheduler.py` | Reuse + change | Release window changes from 60 min to 2-3 hours |
| `api/queue.py` | Reuse session lifecycle | Add new state transition endpoints |
| `api/workspace.py` | Unchanged | Doctor workspace not affected in v1 |
| `api/patient_data.py` | Unchanged | Patient summary still needed |
| `api/boot.py` | Minor update later | Redirect updated when new page is ready |
| Doctor workspace page | Unchanged | Minor display update for new statuses |
| TV dashboard | Unchanged | Out of scope |
| Real-time broadcast | Reuse as-is | `_broadcast_queue_update` unchanged |
| Fee validity (healthcare) | Reuse as-is | `get_consultation_charge` logic unchanged |
| Emergency bypass | Reuse as-is | Same mechanism, plain token number |

---

## 3. What Is New

| Component | Description |
|---|---|
| `Patient Guardian` DocType | New — guardian/parent lookup model |
| `receptionist_dashboard` page | New Frappe desk page replacing the old workspace |
| `api/family.py` | Guardian lookup, child selection, registration |
| `api/admission.py` | Session offer, load tracking, token eligibility, booking |
| `api/eta.py` | Time estimation engine — all ETA logic lives here |
| Token board UI component | Visual grid of session token states |
| Live session panel | Expanded state control panel |

---

## 4. Data Model Changes

### 4.1 New DocType: Patient Guardian

A Custom DocType (tagged `module = "Clinic Flow"`) representing the
parent/guardian who brings the child.

```
Patient Guardian
  name          (autoname: PG-.YYYY.-.#####)
  guardian_name (Data, required)
  mobile        (Data, required, unique)
  relationship  (Select: Father | Mother | Guardian | Other)
  notes         (Small Text, optional)
  --- child table ---
  children      (Table: Guardian Child — see below)
```

**Guardian Child** (child DocType):

```
Guardian Child
  parent_guardian  (Link: Patient Guardian)
  patient          (Link: Patient — the child record)
  child_name       (Data — fetched from Patient, read-only display)
```

**Why not use the existing Patient mobile field as lookup?**
Multiple children share one guardian mobile. The Patient DocType in Marley
Healthcare is one record per patient (child). We cannot use it as the
parent/guardian lookup key without a separate guardian entity.

**Integration with Patient:**
Add a Custom Field on Patient: `custom_guardian` (Link → Patient Guardian,
read-only, set at registration time). This lets us go Patient → Guardian
when needed (e.g. in Queue Entry details).

---

### 4.2 Queue Entry — New Fields and Statuses

**New status options** (replacing old Waiting/Called/With Doctor/Done/Skipped/No Show):

```
Booked           — token assigned; session not yet called this patient
Called           — token displayed on TV and announced; patient expected at reception
No Response      — called but patient did not appear within the hold window
Ready Near Doctor — reception processing complete; patient outside doctor's room
With Doctor      — in consultation
Completed        — consultation done
Pushed to End    — was No Response too long; queue position moved to last
```

Old statuses `Skipped` and `No Show` are retired. Existing rows keep their old
values; new rows use the new set.

**New fields on Queue Entry:**

```
token_number          Int       — plain sequential integer (1, 2, 3...)
                                  separate from the existing string `token` field
                                  which stays for backward compat with doctor workspace
load_class            Select    — review_load | non_review_load
report_by_time        Datetime  — patient-facing "come by this time"
predicted_doctor_time Datetime  — internal estimated consultation start
weight_recorded       Float     — child weight (kg) recorded at reception
weight_recorded_at    Datetime  — when weight was recorded
called_to_reception_at Datetime — when status moved to Called
no_response_at        Datetime  — when No Response was set
hold_patients_count   Int       — how many patients completed check-in while this
                                  entry was in No Response state
reception_done_at     Datetime  — when status moved to Ready Near Doctor
```

---

### 4.3 Queue Session — New Fields

```
planned_capacity      Int    — normal target intake
stretch_capacity      Int    — hidden overflow cushion (not shown to patients)
review_load_count     Int    — booked review_load entries this session
non_review_load_count Int    — booked non_review_load entries this session
weighted_load_total   Float  — sum of expected_duration per booked patient
phone_booked_count    Int    — bookings via phone channel
walkin_count          Int    — bookings via walk-in channel
vip_buffer_used       Int    — VIP buffer tokens assigned so far
```

**Existing fields kept:**
`prebooked_total`, `walkin_total`, `prebooked_used`, `walkin_used`,
`current_token`, `total_called`, `rr_state`, `session_capacity` (maps to
`planned_capacity` going forward — keep both during transition).

---

### 4.4 Slot Partition Config — New Fields

```
--- Channel allocation ---
phone_pct                  Int    default 60   % of planned capacity for phone
walkin_pct                 Int    default 40   % for walk-in
release_hours_before       Float  default 2.5  hours before session to release phone slots

--- VIP buffer ---
vip_buffer_count           Int    default 10   buffer tokens per session
vip_buffer_interval        Int    default 15   one buffer every N tokens

--- ETA defaults ---
default_review_consult_min     Float  default 2.0
default_non_review_consult_min Float  default 5.0
reception_processing_min       Float  default 3.0
ready_buffer_count             Int    default 2
reporting_safety_min           Float  default 15.0
rolling_avg_window_days        Int    default 7
min_samples_for_live_avg       Int    default 5
```

---

## 5. Patient State Machine

```
                    ┌─────────┐
              book  │ Booked  │
       ────────────▶│         │
                    └────┬────┘
                         │ token called on TV + audio
                         ▼
                    ┌─────────┐
                    │ Called  │  ← reception processes patient here
                    └────┬────┘    (payment, weight, fee validity)
                         │
               ┌─────────┴──────────┐
               │ patient appears    │ timeout (2-3 patients complete
               ▼                    │ check-in with no response)
    ┌──────────────────┐            ▼
    │ Ready Near Doctor│     ┌─────────────┐
    └────────┬─────────┘     │ No Response │
             │               └──────┬──────┘
             │ doctor calls         │
             ▼                      │ still absent after hold window
    ┌──────────────┐                ▼
    │ With Doctor  │         ┌──────────────┐
    └──────┬───────┘         │ Pushed to End│ ← queue_position = last
           │                 └──────┬───────┘
           │ done                   │ patient eventually arrives
           ▼                        └──────────▶ Called (again)
    ┌───────────┐
    │ Completed │
    └───────────┘
```

**No Response hold rule:**
When a patient is in `No Response`, the system counts how many other patients
have moved from `Called` to `Ready Near Doctor` since `no_response_at` was set.
When `hold_patients_count` reaches the configured threshold (default: 3),
the system automatically moves the entry to `Pushed to End` and sets
`queue_position` to `MAX(queue_position) + 1` across all entries in the session.

---

## 6. Token Numbering

**Token number** (`token_number`) is a plain integer: 1, 2, 3...
It is assigned at booking time. It never changes.

It is day-wide and practitioner-wide — counts across all sessions for the same
practitioner on the same date (same logic as existing `get_next_sequence`).

The existing string `token` field (`DEPT-CODE-NNN`) is kept for backward
compatibility with the doctor workspace and TV dashboard. It will be retired in
a future phase. For new bookings, `token_number` is the primary identifier and
`token` is generated as a plain string representation (`str(token_number)`).

---

## 7. VIP Buffer Slots

At session creation (`Queue Session.before_insert`), the system generates a list
of VIP buffer positions based on `vip_buffer_interval` from Slot Partition Config.

Example: session capacity 150, interval 15 → buffer positions: 15, 30, 45, 60,
75, 90, 105, 120, 135, 150.

These positions are stored as a JSON list in a new field `vip_buffer_positions`
on Queue Session. They are not assigned token numbers at creation — they are
held open.

**Buffer token states on the token board:**
Buffer positions appear as `held` on the token board. They are not selectable
in the regular booking flow.

**VIP assignment:**
When a VIP needs a token, the receptionist uses the VIP booking path in the
admission panel. The system computes `suggested_vip_token`:

```python
# nearest buffer position >= current queue position
available_buffers = [p for p in session.vip_buffer_positions
                     if p not in assigned_buffers and p >= current_position]
suggested = min(available_buffers) if available_buffers else None
```

The receptionist can accept the suggestion or pick any other available buffer
position. The selected position becomes the VIP's `token_number`.

**Buffer release:**
When a session ends or a buffer position falls more than 20 positions behind
`current_token` (the doctor's current position), unreleased buffer tokens are
converted to regular available tokens (removed from `vip_buffer_positions`).

---

## 8. ETA Engine

Lives in `api/eta.py`. No side effects — pure calculation functions.
Called at booking time and at recalculation triggers.

### 8.1 Core Algorithm

```python
def estimate(
    queue_session: str,
    token_number: int,
    load_class: str,
) -> dict:
    """
    Returns:
      predicted_doctor_time: datetime
      report_by_time:        datetime
      estimated_window_end:  datetime
    """
```

**Step 1 — Get consultation duration averages**

```python
review_avg    = get_rolling_avg("review_load", session)
               or config.default_review_consult_min

non_review_avg = get_rolling_avg("non_review_load", session)
               or config.default_non_review_consult_min
```

`get_rolling_avg` queries Queue Entry for completed entries in the last
`rolling_avg_window_days` days for the same practitioner, grouped by
`load_class`. Falls back to defaults if fewer than `min_samples_for_live_avg`
samples exist.

**Step 2 — Weighted time ahead**

```python
entries_ahead = frappe.db.sql("""
    SELECT load_class
    FROM `tabQueue Entry`
    WHERE queue_session = %s
      AND token_number < %s
      AND status NOT IN ('Completed', 'Pushed to End', 'No Response')
""", (queue_session, token_number), as_dict=True)

weighted_time_ahead = sum(
    review_avg if e.load_class == "review_load" else non_review_avg
    for e in entries_ahead
)
```

**Step 3 — Session reference time**

```python
if session.status in ("Active", "Paused"):
    # session is live — reference from last completed entry
    reference_time = get_last_completed_time(session) or session_start
else:
    # future session — reference from scheduled start
    reference_time = session_start_datetime
```

**Step 4 — Predicted doctor time**

```python
predicted_doctor_time = reference_time + timedelta(minutes=weighted_time_ahead)
```

**Step 5 — Report-by time**

```python
pipeline_lead = config.ready_buffer_count * (
    (review_avg + non_review_avg) / 2
)

report_by_time = (
    predicted_doctor_time
    - timedelta(minutes=config.reception_processing_min)
    - timedelta(minutes=pipeline_lead)
    - timedelta(minutes=config.reporting_safety_min)
)
```

**Step 6 — Estimated window end**

```python
consult_duration = (
    review_avg if load_class == "review_load" else non_review_avg
)
estimated_window_end = predicted_doctor_time + timedelta(minutes=consult_duration)
```

### 8.2 Recalculation Triggers

The following events trigger `recalculate_downstream_etas(queue_session)`:

- Any Queue Entry moves to `Completed`
- Any Queue Entry moves to `Pushed to End`
- Any Queue Entry moves to `No Response`
- A new Queue Entry is inserted into the session
- Session pace deviation detected (actual avg deviates >20% from estimated avg)

`recalculate_downstream_etas` recomputes and writes `predicted_doctor_time` and
`report_by_time` for all `Booked` and `Called` entries in the session.
It does not send notifications (that is a later phase).

### 8.3 Session Pace Monitoring

A lightweight check runs inside `call_next` (after each patient is called):

```python
def check_pace_deviation(queue_session: str) -> bool:
    """Returns True if actual pace has deviated >20% from expected."""
    completed = get_completed_entries_today(queue_session)
    if len(completed) < min_samples:
        return False
    actual_avg = mean(e.actual_consult_minutes for e in completed)
    expected_avg = get_blended_expected_avg(queue_session)
    return abs(actual_avg - expected_avg) / expected_avg > 0.20
```

---

## 9. Load Balancing — Admission Time

Balancing is enforced at booking time, not at call time. No round-robin serving
changes in v1.

### 9.1 Session Load State

Each session has a load state derived from its current counts:

```python
def get_session_load_state(session) -> dict:
    """
    Returns:
      available_for_review:     bool
      available_for_non_review: bool
      overall_available:        bool
      message:                  str (human-readable, shown to receptionist)
    """
    total = session.review_load_count + session.non_review_load_count
    capacity = session.planned_capacity

    # Overall full check (allow stretch)
    if total >= session.stretch_capacity:
        return overall_full()

    # Check non-review saturation
    # Target: non_review ≤ 67% of total booked (1/3 review : 2/3 non-review)
    non_review_pct = session.non_review_load_count / max(total, 1)
    if non_review_pct > 0.75 and session.non_review_load_count >= 10:
        # Too many heavy cases — steer non-review elsewhere
        available_for_non_review = False
    else:
        available_for_non_review = True

    # Check review saturation
    review_pct = session.review_load_count / max(total, 1)
    if review_pct > 0.50 and session.review_load_count >= 10:
        available_for_review = False
    else:
        available_for_review = True

    return {
        "available_for_review": available_for_review,
        "available_for_non_review": available_for_non_review,
        "overall_available": total < capacity,
    }
```

### 9.2 Guided Session Offer

`get_suggested_sessions(load_class, channel, date)` returns an ordered list of
sessions the system recommends, earliest first:

```python
def get_suggested_sessions(
    load_class: str,
    channel: str,
    from_date: str,
) -> list[dict]:
    """
    Returns sessions in order: earliest suitable first.
    Filters out sessions that are saturated for the given load_class.
    Walk-in channel: today only.
    Phone channel: from_date to from_date + 3 days; skip same-day by default.
    """
```

The receptionist is shown the top result first. If declined, the next is shown.
The system never asks "which session do you want?" as the opening question.

### 9.3 Booking Increments Load Counters

When a booking is confirmed (`api/admission.confirm_booking`):

```python
if load_class == "review_load":
    frappe.db.set_value("Queue Session", session_name,
        "review_load_count", session.review_load_count + 1)
else:
    frappe.db.set_value("Queue Session", session_name,
        "non_review_load_count", session.non_review_load_count + 1)
# Also increment weighted_load_total
weighted_load_total += expected_consult_duration(load_class)
```

---

## 10. Booking Flow (New)

Old flow: book → pay → token issued → queue entry created.
New flow: book → token issued → queue entry created (Booked) → patient arrives
         → called to reception → pay + weight at reception → Ready Near Doctor.

### 10.1 `api/admission.py` — Key Functions

```python
@frappe.whitelist()
def search_guardian(mobile: str) -> dict:
    """
    Returns: {found: bool, guardian: {...}, children: [...]}
    Each child includes: patient name, dob, age, last_visit, visit_type
    """

@frappe.whitelist()
def get_visit_type(patient: str) -> dict:
    """
    Returns: {visit_type: "review"|"existing_outside_window"|"new_child",
              load_class: "review_load"|"non_review_load",
              fee_validity_valid: bool, fee_validity_till: date}
    Checks fee validity from healthcare app.
    """

@frappe.whitelist()
def get_suggested_sessions(
    load_class: str,
    channel: str,
    from_date: str,
) -> list:
    """Returns ordered list of suitable sessions with load state."""

@frappe.whitelist()
def get_token_board(queue_session: str) -> dict:
    """
    Returns full token board for a session:
      tokens: list of {token_number, state, patient_name (if booked)}
    States: available | booked | held | vip_buffer | called | completed
    """

@frappe.whitelist()
def confirm_booking(
    queue_session: str,
    token_number: int,
    patient: str,
    channel: str,
    load_class: str,
    guardian: str,
    chief_complaint: str,
    weight: float | None,
) -> dict:
    """
    Creates Queue Entry (status=Booked), increments session counters,
    calculates ETA, returns {token_number, report_by_time, predicted_doctor_time,
    estimated_window_end}.
    Does NOT collect payment.
    """

@frappe.whitelist()
def register_guardian_and_child(
    guardian_name: str,
    mobile: str,
    relationship: str,
    child_name: str,
    dob: str,
    weight: float | None,
) -> dict:
    """Creates Patient Guardian + Patient (child) + Guardian Child link."""

@frappe.whitelist()
def add_child_to_guardian(
    guardian: str,
    child_name: str,
    dob: str,
    weight: float | None,
) -> dict:
    """Creates Patient (child) and links to existing guardian."""
```

### 10.2 `api/queue.py` — New State Transition Endpoints

```python
@frappe.whitelist()
def call_to_reception(queue_entry: str) -> dict:
    """
    Moves Queue Entry from Booked → Called.
    Records called_to_reception_at.
    Triggers broadcast.
    """

@frappe.whitelist()
def mark_no_response(queue_entry: str) -> dict:
    """
    Moves Called → No Response.
    Records no_response_at. Sets hold_patients_count = 0.
    """

@frappe.whitelist()
def complete_reception(
    queue_entry: str,
    payment_mode: str,
    paid_amount: float,
    weight: float | None,
) -> dict:
    """
    Moves Called → Ready Near Doctor.
    Records payment, weight, reception_done_at.
    This is the single formal payment collection point.
    """

@frappe.whitelist()
def push_to_end(queue_entry: str) -> dict:
    """
    Moves No Response → Pushed to End.
    Sets queue_position to MAX + 1.
    Triggers ETA recalculation for session.
    """
```

---

## 11. Scheduler Changes

`queue/scheduler.py` — change release window from 60 minutes to the configured
`release_hours_before` value (default 2.5 hours = 150 minutes):

```python
# OLD
release_mins = config.release_minutes_before or 60

# NEW
release_mins = int((config.release_hours_before or 2.5) * 60)
```

Also add: `increment_no_response_hold_counts` — called every 5 minutes. For
each Queue Entry in `No Response` state, counts how many other entries in the
same session have moved to `Ready Near Doctor` since `no_response_at`. When
count reaches threshold (default 3), auto-calls `push_to_end`.

---

## 12. `engine.py` Changes

**`build_token`** — for new bookings, token string = plain integer string:

```python
def build_token(token_number: int) -> str:
    return str(token_number)
```

Old `DEPT-CODE-NNN` format kept for existing rows and doctor workspace
compatibility. New Queue Entries from v2 booking flow use plain string.

**`get_next_token`** — v1 serving: next by `queue_position` ascending, no
round-robin (round-robin deferred to later phase). Emergency bypass kept.

---

## 13. New Receptionist Dashboard Page

**Location:** `clinic_flow/page/receptionist_dashboard/`

Files:
```
receptionist_dashboard.json   ← page definition
receptionist_dashboard.py     ← empty controller
receptionist_dashboard.js     ← all UI logic
```

### 13.1 Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Top bar: date | Morning: 42/150/160 | Evening: 0/150/160     │
│           Doctor now seeing: 38                                │
├──────────────────┬───────────────────────┬─────────────────────┤
│  LEFT            │  CENTER               │  RIGHT              │
│  Admission       │  Token Board          │  Live Session       │
│  Panel           │                       │  Panel              │
│  380px           │  flex 1               │  340px              │
└──────────────────┴───────────────────────┴─────────────────────┘
```

### 13.2 Left Panel — Admission Flow

States: `idle → searching → child_select → session_offer → token_select
        → data_capture → confirmed`

```
[Phone] [Walk-in]           ← channel selector tabs

[ Parent mobile number  ]   ← auto-focus on page load
[ Search                ]

── after search ──

Parent: Anita Sharma
Children:
  ● Rohan (4y)  Review ✓    ← green badge if within fee validity
  ● Priya (7y)  New visit
  [+ Add New Child]

── after child select ──

Visit type: Review Patient
Load class: review_load
Fee validity: valid till 20 Apr 2026

[Find Next Suitable Slot →]

── after slot found ──

Recommended: Tuesday Morning (15 Apr)
Token 47 suggested
Estimated time: ~10:35 AM
Report by: 10:10 AM

[Confirm] [Try next session →]
```

### 13.3 Center Panel — Token Board

Renders a grid of token number cells for the selected session.

**Cell states and colours:**
- `available` — green
- `booked` — red / filled
- `vip_buffer` — amber / held (only visible, not selectable in regular flow)
- `called` — blue (in progress today)
- `completed` — grey
- `recommended` — green with highlight ring

Receptionist may click any `available` cell to override the recommended token.
Clicking a `booked` or `vip_buffer` cell opens a read-only detail drawer.
Clicking a `called` or `completed` cell opens the patient detail drawer.

The board re-renders on every `queue_update` realtime event.

### 13.4 Right Panel — Live Session

Shows the pipeline for today's active session.

```
WITH DOCTOR
  ┌─────────────────────────────────┐
  │  Token 38 — Rohan Sharma        │
  │  review_load  |  Since 10:14 AM │
  └─────────────────────────────────┘

READY NEAR DOCTOR
  Token 39 — Priya Mehta
  Token 40 — Arjun Nair

AT RECEPTION (Called)
  Token 41 — [Awaiting]          ← called, not arrived yet
    [No Response]

DUE SOON (next 5 Booked)
  42 · 43 · 44 · 45 · 46

NO RESPONSE (on hold)
  Token 37 — Sneha Patel          ← with hold counter: 2/3 patients
    [Push to End]
```

Actions per card:
- Booked → [Call to Reception]
- Called → [Complete Reception ↓] [No Response]
- No Response → [Push to End]
- Ready Near Doctor → (doctor workspace handles advancement)

### 13.5 Patient Detail Drawer

Slides in from the right when a token cell or patient card is clicked.

```
Token 41                    [×]

Parent:   Anita Sharma | +91 98765 43210
Child:    Rohan Sharma  | 4y 2m | 14.2 kg
Visit:    Review Patient
Session:  Tuesday Morning
Report by: 10:10 AM
Estimated: ~10:35 AM

Fee validity: ✓ valid till 20 Apr 2026
Payment: Pending

Status: Called

[Complete Reception]
  Payment mode: [Cash ▼]  Amount: [₹ ____]
  Weight today: [____ kg]
  [Confirm & Send to Doctor]
```

---

## 14. Implementation Phases

### Phase 1 — Data Model (no UI changes)

1. Add Custom Fields to Queue Entry (new statuses, new fields)
2. Add Custom Fields to Queue Session (load counters, capacity fields)
3. Add Custom Fields to Slot Partition Config (ETA defaults, VIP buffer config)
4. Create Patient Guardian DocType + Guardian Child child DocType
5. Add `custom_guardian` field to Patient
6. Export fixtures: `bench --site site1.localhost export-fixtures --app clinic_flow`
7. Run migrate: `bench --site site1.localhost migrate`

**Done when:** All new fields visible in Frappe desk. Patient Guardian can be
created and linked to children manually.

---

### Phase 2 — Backend: Family API + Admission API (no UI)

1. Create `api/family.py` — `search_guardian`, `register_guardian_and_child`,
   `add_child_to_guardian`
2. Create `api/admission.py` — `get_visit_type`, `get_suggested_sessions`,
   `get_token_board`, `confirm_booking`
3. Update `api/queue.py` — add `call_to_reception`, `mark_no_response`,
   `complete_reception`, `push_to_end`
4. Update `queue/scheduler.py` — release window + no-response hold counter

**Done when:** All APIs testable via `bench console` or Postman.
Manual test: create a guardian, add a child, call `get_visit_type`,
`get_suggested_sessions`, `confirm_booking` — Queue Entry created with
status=Booked and valid `report_by_time`.

---

### Phase 3 — ETA Engine

1. Create `api/eta.py` — full estimation logic (sections 8.1–8.3)
2. Wire into `confirm_booking` (called at booking time)
3. Wire recalculation into `complete_reception` and `push_to_end`
4. Wire pace deviation check into existing `call_next` in `api/queue.py`

**Done when:** `confirm_booking` returns a realistic `report_by_time`.
Completing a consultation triggers downstream ETA update on remaining entries.

---

### Phase 4 — New Receptionist Dashboard Shell + Left Panel

1. Create `clinic_flow/page/receptionist_dashboard/` page files
2. Build top summary bar (session status, current token)
3. Build left panel: channel selector, mobile search, guardian/child display,
   visit type badge, "Find Next Suitable Slot" flow, booking confirmation
4. Wire to `api/family.py` and `api/admission.py`
5. Booking confirmation: show token number + report-by time + print slip

**Done when:** Receptionist can search a parent, select a child, get a session
recommendation, confirm a booking, and see the token + report time. No token
board yet (center panel is a placeholder).

---

### Phase 5 — Token Board (Center Panel)

1. Build token board component — grid of cells with state colouring
2. Wire to `get_token_board` API
3. Cell click → patient detail drawer
4. Realtime refresh on `queue_update` event
5. VIP buffer cells shown in amber, non-selectable in regular flow

**Done when:** Token board renders for today's session showing all token states.
Clicking a booked cell shows patient details. Clicking an available cell
overrides the recommended token.

---

### Phase 6 — Live Session Panel (Right Panel) + VIP Flow

1. Build right panel: pipeline sections (With Doctor, Ready, Called, Due Soon,
   No Response)
2. Wire state transition actions (Call to Reception, No Response, Complete
   Reception, Push to End)
3. Complete Reception drawer: payment mode, amount, weight
4. Add VIP booking path to left panel: shows available buffer tokens, assigns
   nearest suggested buffer

**Done when:** Full session day can be run from the new dashboard. Patient
progresses from Booked → Called → Ready Near Doctor → With Doctor → Completed.
No Response hold and Push to End both work. VIP can be assigned a buffer token.

---

### Phase 7 — Cutover

1. Update `api/boot.py` redirect to point to `receptionist_dashboard`
2. Smoke test full booking + session day on staging site
3. Keep `receptionist_workspace` page in codebase (do not delete) for 2 weeks
4. Archive old page after confirmed stable

---

## 15. Things Explicitly Not in This Plan

These are confirmed for later phases and must not be pre-built in v1:

- SMS / WhatsApp notifications
- TV dashboard changes
- Admin / payment reporting
- Round-robin serving changes
- Doctor workspace state machine updates
- Advanced VIP hidden-priority scoring
- Patient-facing mobile app or portal
- Multi-doctor support
