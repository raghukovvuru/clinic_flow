# Historical Note

This file is an early build/spec document and is no longer an active source of truth for the current `clinic_flow` codebase.

It contains stale assumptions, including pre-migration setup guidance and older architecture details. Use these files instead for current context:

- `apps/clinic_flow/CLAUDE.md`
- `apps/clinic_flow/AGENTS.md`
- `apps/clinic_flow/ARCHITECTURE.md`
- `apps/clinic_flow/docs/service-point-policy.md`
- `apps/clinic_flow/docs/token-display-policy.md`
- `apps/clinic_flow/docs/healthcare-compatibility-audit.md`

# clinic_flow — Claude Code Build Specification
**Version:** 2.0  
**Prepared for:** Claude Code  
**Frappe / ERPNext / Marley target:** v16  
**Depends on:** `frappe`, `erpnext`, `health` (Marley Healthcare app name on v16)  
**Scope:** Queue management + Doctor Workspace. Lab return is explicitly OUT OF SCOPE.

> **v16 delta summary** — if you previously read v1.0 of this spec, four things changed:
> 1. `pyproject.toml` → `requires-python = ">=3.11"` and frappe dep `>=16.0.0`
> 2. `hooks.py` → `doc_events` for `Patient Appointment` replaced with `extend_doctype_class` mixin
> 3. All `@frappe.whitelist()` functions → full Python type annotations on every parameter
> 4. `www/queue-dashboard.html` → fully rewritten with proper CSS (previous version had none)

---

## 0. Before You Write Any Code — Read This Section Completely

### What this app is
`clinic_flow` is a **standalone Frappe custom app** installed on top of Marley Health. It must never modify Marley's core files. It communicates with Marley exclusively through:
- Frappe ORM (`frappe.get_doc`, `frappe.get_all`)
- `doc_events` hooks in `hooks.py` (document lifecycle)
- Reading/writing to custom fields on Marley DocTypes (pre-added by admin via Customize Form)

### What already exists in Marley (do NOT recreate)
The following DocTypes exist in Marley and must be used as-is:
- `Patient` — patient master
- `Patient Appointment` — scheduling record (has our custom fields already added)
- `Patient Encounter` — clinical record (has our custom fields already added)
- `Healthcare Practitioner` — doctor master
- `Healthcare Service Unit` — rooms/departments (has `custom_dept_abbr` already added)
- `Appointment Type` — has `custom_queue_code` already added
- `Observation Template`, `Sample Collection`, `Diagnostic Report` — lab (out of scope)

### Custom fields that admin has already added to Marley (do NOT re-add)
These fields exist in the live database. Reference them by `fieldname` in all queries.

**On `Patient Appointment`:**
- `custom_queue_type` (Select): `PRE_BOOKED | WALK_IN | EMERGENCY | FOLLOW_UP`
- `custom_dept_abbr` (Data): e.g. `CARD`, `PED`
- `custom_queue_token` (Data, Read Only): e.g. `CARD-WLK-009`
- `custom_is_lab_return` (Check)
- `custom_original_encounter` (Link → Patient Encounter, hidden)

**On `Patient Encounter`:**
- `custom_awaiting_lab_return` (Check)
- `custom_lab_return_queued` (Check, Read Only)

**On `Healthcare Service Unit`:**
- `custom_dept_abbr` (Data): abbreviation code

**On `Appointment Type`:**
- `custom_queue_code` (Data): 3-char code e.g. `PRE`, `WLK`, `EMR`, `FLW`

### Roles that already exist (do NOT recreate)
- `Queue Manager`
- `Queue Viewer`
- `Lab Queue Trigger`

---

## 1. App Scaffolding

### 1.1 Create the app
```bash
bench new-app clinic_flow
# When prompted:
# App Title: Clinic Flow
# App Description: Queue management and doctor workspace for Marley Health
# Publisher: [your org]
# Email: [your email]
# App license: MIT

bench --site [sitename] install-app clinic_flow
```

### 1.2 pyproject.toml
```toml
[build-system]
requires = ["flit_core >=3.4,<4"]
build-backend = "flit_core.buildapi"

[project]
name = "clinic_flow"
authors = [{ name = "Your Org", email = "dev@yourorg.com" }]
description = "Queue management and doctor workspace for Marley Health"
requires-python = ">=3.11"
readme = "README.md"
dynamic = ["version"]
dependencies = []

[tool.bench.frappe-dependencies]
frappe = ">=16.0.0,<17.0.0"
health = ">=16.0.0,<17.0.0"
```

> **v16 note:** Python 3.11+ is required. The Marley Healthcare app is registered in bench as `health` — confirm the exact name with `bench --site [site] list-apps` before running `install-app`.

### 1.3 `clinic_flow/__init__.py`
```python
__version__ = "0.1.0"
```

### 1.4 `modules.txt`
```
Clinic Flow
```

### 1.5 Final directory structure to create
```
apps/clinic_flow/
├── pyproject.toml
├── README.md
├── clinic_flow/
│   ├── __init__.py              # __version__ = "0.1.0"
│   ├── hooks.py
│   ├── modules.txt
│   ├── patches.txt
│   ├── patches/
│   │   └── __init__.py
│   ├── clinic_flow/             # "Clinic Flow" module
│   │   ├── __init__.py
│   │   └── doctype/
│   │       ├── slot_partition_config/
│   │       ├── queue_session/
│   │       └── queue_entry/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── queue.py             # Queue management endpoints
│   │   ├── workspace.py         # Doctor workspace endpoints
│   │   └── patient_data.py      # Patient data preload
│   ├── queue/
│   │   ├── __init__.py
│   │   ├── appointment_mixin.py # v16 extend_doctype_class mixin (replaces doc_events)
│   │   ├── engine.py            # Round-robin dequeue logic + token formatter
│   │   └── scheduler.py        # Timed jobs
│   ├── public/
│   │   ├── css/
│   │   │   └── doctor_workspace.css
│   │   └── js/
│   │       └── doctor_workspace.js
│   └── www/
│       ├── queue-dashboard.html  # TV display page
│       └── queue-dashboard.js
```

---

## 2. DocTypes to Create

### 2.1 Slot Partition Config
**Type:** Single DocType (one global config, editable per department)  
**Purpose:** Defines how many slots per session are reserved for each patient type.  
**Module:** Clinic Flow

Create as a **Single** DocType (`issingle: 1`).

Fields:

| Label | Fieldname | Fieldtype | Options / Notes |
|---|---|---|---|
| Section Break | — | Section Break | label: "Default Slot Allocation" |
| Pre-Booked Slots | `prebooked_slots` | Int | Default: 15 |
| Walk-In Slots | `walkin_slots` | Int | Default: 10 |
| Emergency / Follow-Up Slots | `emergency_slots` | Int | Default: 5 |
| Section Break | — | Section Break | label: "Dynamic Release" |
| Release Pre-Booked Slots (mins before session) | `release_minutes_before` | Int | Default: 60 |
| Section Break | — | Section Break | label: "Priority Ratio" |
| Pre-Booked Weight | `weight_prebooked` | Int | Default: 3 |
| Walk-In Weight | `weight_walkin` | Int | Default: 1 |
| Follow-Up Weight | `weight_followup` | Int | Default: 1 |
| Section Break | — | Section Break | label: "After-Hours Behaviour" |
| After Session Ends | `after_session_action` | Select | `Hold for Next Session\nRedirect to On-Call\nScheduled Follow-Up` |

Access in code: `frappe.get_single("Slot Partition Config")`

---

### 2.2 Queue Session
**Type:** Standard DocType  
**Purpose:** Represents one active scheduling session (e.g. Morning OPD, Cardiology PM). Tracks which slots are used/released.  
**Module:** Clinic Flow  
**Naming:** `QS-.YYYY.-.#####`

Fields:

| Label | Fieldname | Fieldtype | Options / Notes |
|---|---|---|---|
| Session Name | `session_name` | Data | Mandatory |
| Department | `department` | Link | Options: `Medical Department` |
| Department Abbreviation | `dept_abbr` | Data | Fetched from department. search_index: Yes |
| Practitioner | `practitioner` | Link | Options: `Healthcare Practitioner`. Mandatory |
| Session Date | `session_date` | Date | Default: Today. Mandatory |
| Start Time | `start_time` | Time | Mandatory |
| End Time | `end_time` | Time | Mandatory |
| Status | `status` | Select | `Scheduled\|Active\|Completed\|Cancelled`. Default: Scheduled. in_list_view: Yes |
| Section Break | — | Section Break | label: "Slot Allocation (overrides global config)" |
| Pre-Booked Slots Total | `prebooked_total` | Int | |
| Pre-Booked Used | `prebooked_used` | Int | Read Only |
| Pre-Booked Released | `prebooked_released` | Check | Read Only. Set by scheduler when T-60 fires |
| Walk-In Slots Total | `walkin_total` | Int | |
| Walk-In Used | `walkin_used` | Int | Read Only |
| Emergency Slots Total | `emergency_total` | Int | |
| Emergency Used | `emergency_used` | Int | Read Only |
| Section Break | — | Section Break | label: "Counters" |
| Total Called | `total_called` | Int | Default: 0. Read Only |
| Current Token | `current_token` | Data | Read Only. Token string of patient currently with doctor |
| Round-Robin State | `rr_state` | Small Text | Read Only. JSON string storing current round-robin position. Do not expose in UI. |

**Controller (`queue_session.py`):**
```python
class QueueSession(Document):
    def before_insert(self):
        config = frappe.get_single("Slot Partition Config")
        if not self.prebooked_total:
            self.prebooked_total = config.prebooked_slots
        if not self.walkin_total:
            self.walkin_total = config.walkin_slots
        if not self.emergency_total:
            self.emergency_total = config.emergency_slots

    def validate(self):
        if self.start_time >= self.end_time:
            frappe.throw("End time must be after start time.")
```

---

### 2.3 Queue Entry
**Type:** Standard DocType  
**Purpose:** One row per patient token in the queue. This is the core operational record.  
**Module:** Clinic Flow  
**Naming:** `QE-.YYYY.-.#####`  
**track_changes:** Yes (for audit)

Fields:

| Label | Fieldname | Fieldtype | Options / Notes |
|---|---|---|---|
| Token | `token` | Data | e.g. `CARD-WLK-009`. Read Only. search_index: Yes. in_list_view: Yes |
| Queue Session | `queue_session` | Link | Options: `Queue Session`. Mandatory. search_index: Yes |
| Patient | `patient` | Link | Options: `Patient`. Mandatory. in_list_view: Yes |
| Patient Name | `patient_name` | Data | fetch_from: `patient.patient_name`. Read Only |
| Appointment | `appointment` | Link | Options: `Patient Appointment` |
| Practitioner | `practitioner` | Link | Options: `Healthcare Practitioner`. in_list_view: Yes |
| Department | `department` | Link | Options: `Medical Department` |
| Dept Abbreviation | `dept_abbr` | Data | search_index: Yes |
| Queue Type | `queue_type` | Select | `PRE_BOOKED\|WALK_IN\|EMERGENCY\|FOLLOW_UP`. Mandatory. in_standard_filter: Yes. in_list_view: Yes |
| Status | `status` | Select | `Waiting\|Called\|With Doctor\|Done\|Skipped\|No Show`. Default: Waiting. in_standard_filter: Yes. in_list_view: Yes |
| Queue Position | `queue_position` | Int | Current position. search_index: Yes |
| Called At | `called_at` | Datetime | Read Only. Set when status → Called |
| Seen At | `seen_at` | Datetime | Read Only. Set when status → With Doctor |
| Done At | `done_at` | Datetime | Read Only. Set when status → Done |
| Wait Minutes | `wait_minutes` | Int | Read Only. Computed: called_at − created |
| Section Break | — | Section Break | label: "Encounter Link" |
| Patient Encounter | `patient_encounter` | Link | Options: `Patient Encounter`. Read Only |
| Section Break | — | Section Break | label: "Issue Metadata" |
| Issued By | `issued_by` | Link | Options: `User`. Default: current user |
| Issued By Role | `issued_by_role` | Select | `Reception\|System\|Queue Manager` |
| Notes | `notes` | Small Text | |

---

## 3. hooks.py — Complete File (v16)

> **v16 change:** `doc_events` with a function string is still valid for hooking individual
> lifecycle events on *other apps'* DocTypes. However, for `Patient Appointment` we use
> `extend_doctype_class` so our mixin is loaded as part of the class itself — this is the
> v16-preferred pattern and avoids potential ordering issues with Marley's own hooks on the
> same DocType. `doc_events` with a function string is kept for any future DocTypes where
> a full mixin is overkill.

```python
app_name = "clinic_flow"
app_title = "Clinic Flow"
app_publisher = "Your Org"
app_description = "Queue management and doctor workspace for Marley Health"
app_email = "dev@yourorg.com"
app_license = "MIT"

required_apps = ["frappe", "health"]

# ── v16: extend_doctype_class (preferred over doc_events for controller logic) ──
# Adds on_update mixin to Patient Appointment without replacing Marley's controller.
# Multiple apps can safely extend the same DocType this way.
extend_doctype_class = {
    "Patient Appointment": [
        "clinic_flow.queue.appointment_mixin.QueueMixin"
    ]
}

# ── Scheduled jobs ───────────────────────────────────────────────────────────
scheduler_events = {
    "cron": {
        # Runs every 5 minutes — checks if any session needs pre-booked slots released
        "*/5 * * * *": [
            "clinic_flow.queue.scheduler.release_prebooked_slots"
        ]
    }
}

# ── Static assets injected into desk ────────────────────────────────────────
app_include_css = []
app_include_js = []

# ── Fixtures ─────────────────────────────────────────────────────────────────
fixtures = [
    {
        "dt": "Custom Field",
        "filters": [["module", "=", "Clinic Flow"]]
    },
    {
        "dt": "Property Setter",
        "filters": [["module", "=", "Clinic Flow"]]
    },
    {
        "dt": "Role",
        "filters": [["name", "in", ["Queue Manager", "Queue Viewer", "Lab Queue Trigger"]]]
    },
]

# ── Web pages ────────────────────────────────────────────────────────────────
website_route_rules = [
    {"from_route": "/queue-dashboard", "to_route": "queue-dashboard"},
]
```

---

## 4. Queue Engine (`clinic_flow/queue/engine.py`)

This is the most critical Python file. Build it with these exact behaviors.

```python
import frappe
import json
from frappe import _
from frappe.utils import now_datetime, today


# ── Token formatter ──────────────────────────────────────────────────────────

def build_token(dept_abbr: str, queue_type: str, sequence: int) -> str:
    """
    Format: DEPT-CODE-SEQ
    Example: CARD-WLK-009
    queue_type maps to code via Appointment Type.custom_queue_code
    Fallback codes if Appointment Type not found:
      PRE_BOOKED → PRE, WALK_IN → WLK, EMERGENCY → EMR, FOLLOW_UP → FLW
    """
    FALLBACK_CODES = {
        "PRE_BOOKED": "PRE",
        "WALK_IN": "WLK",
        "EMERGENCY": "EMR",
        "FOLLOW_UP": "FLW",
    }
    code = FALLBACK_CODES.get(queue_type, "GEN")
    return f"{dept_abbr.upper()}-{code}-{str(sequence).zfill(3)}"


def get_next_sequence(queue_session: str, queue_type: str) -> int:
    """Get next sequence number for this session + type combo."""
    result = frappe.db.sql("""
        SELECT COUNT(*) as cnt
        FROM `tabQueue Entry`
        WHERE queue_session = %s AND queue_type = %s
    """, (queue_session, queue_type), as_dict=True)
    return (result[0].cnt or 0) + 1


# ── Round-robin dequeue ──────────────────────────────────────────────────────

def get_next_token(queue_session: str) -> dict | None:
    """
    Priority order:
      1. EMERGENCY — always next, bypasses round-robin
      2. Round-robin among PRE_BOOKED (weight 3), FOLLOW_UP (weight 1), WALK_IN (weight 1)
         with skip-if-empty promotion.
    
    Round-robin state is stored as JSON in QueueSession.rr_state:
    {"type": "PRE_BOOKED", "remaining": 2}
    
    Returns: Queue Entry dict or None if queue is empty.
    """
    config = frappe.get_single("Slot Partition Config")
    WEIGHTS = {
        "PRE_BOOKED": config.weight_prebooked or 3,
        "FOLLOW_UP": config.weight_followup or 1,
        "WALK_IN": config.weight_walkin or 1,
    }
    ROTATION = ["PRE_BOOKED", "PRE_BOOKED", "PRE_BOOKED", "FOLLOW_UP", "WALK_IN"]
    # Note: rotation is built from weights above — rebuild dynamically if weights change

    # Step 1: Emergency bypass
    emergency = frappe.get_all(
        "Queue Entry",
        filters={
            "queue_session": queue_session,
            "queue_type": "EMERGENCY",
            "status": "Waiting",
        },
        fields=["name", "token", "patient", "queue_type", "queue_position"],
        order_by="queue_position asc",
        limit=1,
    )
    if emergency:
        return emergency[0]

    # Step 2: Load round-robin state
    session_doc = frappe.get_doc("Queue Session", queue_session)
    try:
        rr_state = json.loads(session_doc.rr_state or "{}")
    except Exception:
        rr_state = {}

    current_type = rr_state.get("type", "PRE_BOOKED")
    remaining = rr_state.get("remaining", WEIGHTS.get(current_type, 1))

    # Step 3: Try to dequeue from current type, with skip-if-empty promotion
    TYPE_ORDER = ["PRE_BOOKED", "FOLLOW_UP", "WALK_IN"]
    start_idx = TYPE_ORDER.index(current_type) if current_type in TYPE_ORDER else 0

    for offset in range(len(TYPE_ORDER)):
        try_type = TYPE_ORDER[(start_idx + offset) % len(TYPE_ORDER)]
        candidate = frappe.get_all(
            "Queue Entry",
            filters={
                "queue_session": queue_session,
                "queue_type": try_type,
                "status": "Waiting",
            },
            fields=["name", "token", "patient", "queue_type", "queue_position"],
            order_by="queue_position asc",
            limit=1,
        )
        if candidate:
            # Found one — update rr_state
            new_remaining = (remaining - 1) if try_type == current_type else WEIGHTS.get(try_type, 1) - 1
            if new_remaining <= 0:
                # Advance to next type in rotation
                next_type = TYPE_ORDER[(TYPE_ORDER.index(try_type) + 1) % len(TYPE_ORDER)]
                new_state = {"type": next_type, "remaining": WEIGHTS.get(next_type, 1)}
            else:
                new_state = {"type": try_type, "remaining": new_remaining}

            frappe.db.set_value("Queue Session", queue_session, "rr_state", json.dumps(new_state))
            return candidate[0]

    return None  # Queue is empty


# ── Entry point: v16 extend_doctype_class mixin ──────────────────────────────
# This function is NOT in engine.py. It lives in appointment_mixin.py (see below).
# engine.py only contains build_token, get_next_sequence, get_next_token, and
# _broadcast_queue_update. The on_update hook is wired through the mixin.

def _broadcast_queue_update(queue_session: str):
    """Publish realtime event to all dashboard subscribers."""
    session_doc = frappe.get_doc("Queue Session", queue_session)
    waiting = frappe.get_all(
        "Queue Entry",
        filters={"queue_session": queue_session, "status": "Waiting"},
        fields=["token", "patient_name", "queue_type", "queue_position"],
        order_by="queue_position asc",
        limit=6,
    )
    payload = {
        "current_token": session_doc.current_token,
        "next_tokens": waiting[:5],
        "practitioner": session_doc.practitioner,
        "dept_abbr": session_doc.dept_abbr,
    }
    frappe.publish_realtime(
        event="queue_update",
        message=payload,
        room=f"queue_{session_doc.dept_abbr}",
    )
    frappe.publish_realtime(
        event="queue_update",
        message=payload,
        room="queue_all",
    )
```

---

## 4b. Appointment Mixin (`clinic_flow/queue/appointment_mixin.py`) — v16 ONLY

> This file replaces the `on_appointment_update(doc, method)` standalone function that
> was used in v15 via `doc_events`. In v16, `extend_doctype_class` is the correct pattern.
> The mixin's `on_update` is called by Frappe after every save of `Patient Appointment`.
> Marley's own `PatientAppointment.on_update` still runs first via `super()`.

```python
import frappe
from frappe.model.document import Document
from frappe.utils import today


class QueueMixin(Document):
    """
    Mixin added to Patient Appointment via extend_doctype_class in hooks.py.
    Responsible only for Queue Entry creation on check-in.
    ALWAYS call super() to preserve Marley's own on_update logic.
    """

    def on_update(self) -> None:
        super().on_update()
        self._clinic_flow_maybe_create_queue_entry()

    def _clinic_flow_maybe_create_queue_entry(self) -> None:
        """Creates a Queue Entry when appointment status transitions to Checked In."""
        if self.status != "Checked In":
            return
        if not self.custom_queue_type:
            return

        # Guard: do not create duplicate entries
        already_queued = frappe.db.exists(
            "Queue Entry",
            {
                "appointment": self.name,
                "status": ["in", ["Waiting", "Called", "With Doctor"]],
            },
        )
        if already_queued:
            return

        # Find active session for this practitioner today
        sessions = frappe.get_all(
            "Queue Session",
            filters={
                "practitioner": self.practitioner,
                "session_date": today(),
                "status": "Active",
            },
            fields=["name", "dept_abbr"],
            limit=1,
        )
        if not sessions:
            frappe.log_error(
                f"No active Queue Session for {self.practitioner} on {today()}",
                "clinic_flow: Queue Entry creation skipped",
            )
            return

        from clinic_flow.queue.engine import (
            build_token,
            get_next_sequence,
            _broadcast_queue_update,
        )

        session = sessions[0]
        seq = get_next_sequence(session.name, self.custom_queue_type)
        token = build_token(
            session.dept_abbr or self.custom_dept_abbr or "GEN",
            self.custom_queue_type,
            seq,
        )

        # Determine queue position (emergency injects near front)
        last_pos: int = (
            frappe.db.get_value(
                "Queue Entry",
                {"queue_session": session.name, "status": ["!=", "No Show"]},
                "max(queue_position)",
            )
            or 0
        )

        if self.custom_queue_type == "EMERGENCY":
            current_pos: int = (
                frappe.db.get_value("Queue Session", session.name, "total_called") or 0
            )
            position = current_pos + 1
            frappe.db.sql(
                """
                UPDATE `tabQueue Entry`
                SET queue_position = queue_position + 1
                WHERE queue_session = %s
                  AND status = 'Waiting'
                  AND queue_position >= %s
                """,
                (session.name, position),
            )
        else:
            position = last_pos + 1

        entry = frappe.get_doc(
            {
                "doctype": "Queue Entry",
                "queue_session": session.name,
                "patient": self.patient,
                "appointment": self.name,
                "practitioner": self.practitioner,
                "department": self.department,
                "dept_abbr": session.dept_abbr or self.custom_dept_abbr,
                "queue_type": self.custom_queue_type,
                "token": token,
                "queue_position": position,
                "status": "Waiting",
                "issued_by": frappe.session.user,
                "issued_by_role": "Reception",
            }
        )
        entry.insert(ignore_permissions=True)

        frappe.db.set_value("Patient Appointment", self.name, "custom_queue_token", token)
        _broadcast_queue_update(session.name)
```

---

## 5. Scheduler (`clinic_flow/queue/scheduler.py`)

```python
import frappe
from frappe.utils import now_datetime, add_to_date


def release_prebooked_slots():
    """
    Runs every 5 minutes via cron.
    For each Active Queue Session whose start_time is within release_minutes_before,
    release any unfilled pre-booked slots to walk-ins by:
      1. Incrementing walkin_total on the session
      2. Setting prebooked_released = 1 on the session
    Does not touch existing Queue Entries — only adjusts slot headroom.
    """
    config = frappe.get_single("Slot Partition Config")
    release_mins = config.release_minutes_before or 60

    release_threshold = add_to_date(now_datetime(), minutes=release_mins)

    sessions = frappe.get_all(
        "Queue Session",
        filters={
            "status": "Active",
            "prebooked_released": 0,
            "session_date": frappe.utils.today(),
        },
        fields=["name", "start_time", "prebooked_total", "prebooked_used", "walkin_total"],
    )

    for session in sessions:
        # Combine session_date + start_time into a datetime for comparison
        session_start_dt = frappe.utils.get_datetime(
            f"{frappe.utils.today()} {session.start_time}"
        )
        if session_start_dt <= release_threshold:
            unfilled = (session.prebooked_total or 0) - (session.prebooked_used or 0)
            if unfilled > 0:
                frappe.db.set_value("Queue Session", session.name, {
                    "walkin_total": (session.walkin_total or 0) + unfilled,
                    "prebooked_released": 1,
                })
                frappe.db.commit()
                frappe.logger().info(
                    f"clinic_flow: Released {unfilled} pre-booked slots to walk-in "
                    f"for session {session.name}"
                )
```

---

## 6. API Endpoints (`clinic_flow/api/`)

> **v16 requirement:** All `@frappe.whitelist()` functions must have full Python type
> annotations on every parameter and the return type. Frappe v16 validates these at
> request time via Pydantic. Missing annotations raise `FrappeTypeError`. The functions
> below are already annotated correctly — do not remove the type hints.
> Add `require_type_annotated_api_methods = 1` to `hooks.py` to enforce this app-wide.

### 6.1 `clinic_flow/api/queue.py`

```python
import frappe
from frappe import _
from frappe.utils import now_datetime
from clinic_flow.queue.engine import get_next_token, _broadcast_queue_update


@frappe.whitelist()
def call_next(queue_session: str) -> dict:
    """
    Doctor clicks "Call Next".
    1. Find next eligible token using priority engine.
    2. Mark it as Called.
    3. Update Queue Session.current_token and total_called.
    4. Create or reopen Patient Encounter draft.
    5. Return compact workspace payload.
    """
    frappe.only_for("Healthcare Practitioner")

    entry = get_next_token(queue_session)
    if not entry:
        return {"status": "empty", "message": "Queue is empty"}

    now = now_datetime()

    # Mark entry as Called
    frappe.db.set_value("Queue Entry", entry.name, {
        "status": "Called",
        "called_at": now,
    })

    # Update session counters
    session_doc = frappe.get_doc("Queue Session", queue_session)
    frappe.db.set_value("Queue Session", queue_session, {
        "current_token": entry.token,
        "total_called": (session_doc.total_called or 0) + 1,
    })

    # Broadcast
    _broadcast_queue_update(queue_session)

    # Create or open encounter draft
    encounter_name = _get_or_create_encounter(entry, queue_session)

    # Mark entry as With Doctor
    frappe.db.set_value("Queue Entry", entry.name, {
        "status": "With Doctor",
        "seen_at": now_datetime(),
        "patient_encounter": encounter_name,
    })

    # Load and return workspace payload
    from clinic_flow.api.workspace import get_workspace_payload
    return get_workspace_payload(entry.patient, encounter_name, entry.name)


@frappe.whitelist()
def recall_patient(queue_entry: str) -> dict:
    """
    Doctor clicks "Recall". Re-broadcasts current token to TV dashboard.
    No state change — patient is already Called/With Doctor.
    """
    frappe.only_for("Healthcare Practitioner")
    entry = frappe.get_doc("Queue Entry", queue_entry)
    session_doc = frappe.get_doc("Queue Session", entry.queue_session)

    frappe.publish_realtime(
        event="recall_patient",
        message={
            "token": entry.token,
            "patient_name": entry.patient_name,
            "queue_type": entry.queue_type,
        },
        room=f"queue_{session_doc.dept_abbr}",
    )
    frappe.publish_realtime(
        event="recall_patient",
        message={
            "token": entry.token,
            "patient_name": entry.patient_name,
            "queue_type": entry.queue_type,
        },
        room="queue_all",
    )
    return {"status": "recalled", "token": entry.token}


@frappe.whitelist()
def skip_patient(queue_entry: str, reason: str = "") -> dict:
    """
    Doctor clicks "Skip". Marks current patient as Skipped and calls next.
    The skipped entry stays in DB for audit — it does not re-enter the queue.
    Returns the next workspace payload.
    """
    frappe.only_for("Healthcare Practitioner")
    entry = frappe.get_doc("Queue Entry", queue_entry)
    frappe.db.set_value("Queue Entry", queue_entry, {
        "status": "Skipped",
        "notes": reason,
    })
    return call_next(entry.queue_session)


@frappe.whitelist()
def get_queue_state(queue_session: str) -> dict:
    """
    Returns the left panel data: current token + next 10 waiting entries.
    Called on page load and on queue_update realtime event.
    """
    frappe.has_permission("Queue Entry", "read", throw=True)

    session = frappe.get_doc("Queue Session", queue_session)
    waiting = frappe.get_all(
        "Queue Entry",
        filters={"queue_session": queue_session, "status": "Waiting"},
        fields=["name", "token", "patient_name", "queue_type", "queue_position"],
        order_by="queue_position asc",
        limit=10,
    )
    current = frappe.get_all(
        "Queue Entry",
        filters={"queue_session": queue_session, "status": ["in", ["Called", "With Doctor"]]},
        fields=["name", "token", "patient_name", "queue_type"],
        limit=1,
    )
    return {
        "session": {
            "name": session.name,
            "status": session.status,
            "current_token": session.current_token,
            "practitioner": session.practitioner,
            "dept_abbr": session.dept_abbr,
        },
        "current": current[0] if current else None,
        "waiting": waiting,
    }


def _get_or_create_encounter(entry: dict, queue_session: str) -> str:
    """
    Find an existing Draft encounter for this patient + today, or create one.
    Returns the encounter name.
    """
    session_doc = frappe.get_doc("Queue Session", queue_session)
    existing = frappe.get_all(
        "Patient Encounter",
        filters={
            "patient": entry.patient,
            "practitioner": session_doc.practitioner,
            "encounter_date": frappe.utils.today(),
            "docstatus": 0,  # Draft only
        },
        fields=["name"],
        limit=1,
    )
    if existing:
        return existing[0].name

    # Get appointment details
    appointment = {}
    if entry.get("appointment"):
        appt = frappe.get_doc("Patient Appointment", entry.appointment)
        appointment = {
            "appointment": entry.appointment,
            "appointment_type": appt.appointment_type,
        }

    enc = frappe.get_doc({
        "doctype": "Patient Encounter",
        "patient": entry.patient,
        "practitioner": session_doc.practitioner,
        "encounter_date": frappe.utils.today(),
        "department": session_doc.department,
        **appointment,
    })
    enc.insert(ignore_permissions=True)
    return enc.name
```

---

### 6.2 `clinic_flow/api/workspace.py`

```python
import frappe
from frappe import _


@frappe.whitelist()
def get_workspace_payload(patient: str, encounter: str, queue_entry: str) -> dict:
    """
    Master payload returned to the doctor workspace on Call Next and page load.
    Assembles all three panels' data in one round-trip.
    """
    frappe.has_permission("Patient Encounter", "read", encounter, throw=True)

    from clinic_flow.api.patient_data import get_patient_summary
    return {
        "encounter": _get_encounter_data(encounter),
        "patient_summary": get_patient_summary(patient),
        "queue_entry": frappe.get_doc("Queue Entry", queue_entry).as_dict(),
    }


def _get_encounter_data(encounter: str) -> dict:
    enc = frappe.get_doc("Patient Encounter", encounter)
    return {
        "name": enc.name,
        "docstatus": enc.docstatus,
        "patient": enc.patient,
        "practitioner": enc.practitioner,
        "encounter_date": enc.encounter_date,
        # Clinical fields the doctor edits:
        "symptoms": enc.get("symptoms"),
        "diagnosis": enc.get("diagnosis"),
        "examination_detail": enc.get("examination_detail"),
        "patient_note": enc.get("patient_note"),
        "drug_prescription": [r.as_dict() for r in (enc.drug_prescription or [])],
        "lab_test_prescription": [r.as_dict() for r in (enc.lab_test_prescription or [])],
        "procedure_prescription": [r.as_dict() for r in (enc.procedure_prescription or [])],
        "therapist_referral": enc.get("therapist_referral"),
    }


@frappe.whitelist()
def save_encounter_draft(encounter: str, data: str) -> dict:
    """
    Saves edits from the workspace into the Patient Encounter (Draft).
    `data` is a JSON string with partial encounter fields.
    Only Draft (docstatus=0) encounters can be saved here.
    """
    frappe.has_permission("Patient Encounter", "write", encounter, throw=True)

    if isinstance(data, str):
        data = frappe.parse_json(data)

    enc = frappe.get_doc("Patient Encounter", encounter)
    if enc.docstatus != 0:
        frappe.throw(_("Cannot edit a submitted encounter."), frappe.ValidationError)

    # Allowed fields to update via workspace (whitelist — never use data.update blindly)
    ALLOWED_FIELDS = [
        "symptoms", "examination_detail", "patient_note",
    ]
    ALLOWED_CHILD_TABLES = {
        "drug_prescription": "Drug Prescription",
        "lab_test_prescription": "Lab Prescription",
        "procedure_prescription": "Procedure Prescription",
    }

    for field in ALLOWED_FIELDS:
        if field in data:
            enc.set(field, data[field])

    for table_field, child_doctype in ALLOWED_CHILD_TABLES.items():
        if table_field in data:
            enc.set(table_field, data[table_field])

    # Diagnosis is a child table in newer Frappe Healthcare
    if "diagnosis" in data:
        enc.set("diagnosis", data["diagnosis"])

    enc.save(ignore_permissions=False)
    return {"status": "saved", "name": enc.name}


@frappe.whitelist()
def submit_encounter(encounter: str) -> dict:
    """
    Submits the Patient Encounter after doctor finishes.
    Also marks the Queue Entry as Done.
    """
    frappe.has_permission("Patient Encounter", "submit", encounter, throw=True)

    enc = frappe.get_doc("Patient Encounter", encounter)
    if enc.docstatus != 0:
        frappe.throw(_("Encounter is not in Draft state."), frappe.ValidationError)

    enc.submit()

    # Mark Queue Entry as Done
    entries = frappe.get_all(
        "Queue Entry",
        filters={"patient_encounter": encounter},
        fields=["name", "queue_session"],
    )
    for entry in entries:
        frappe.db.set_value("Queue Entry", entry.name, {
            "status": "Done",
            "done_at": frappe.utils.now_datetime(),
        })
        # Update session type counter
        entry_doc = frappe.get_doc("Queue Entry", entry.name)
        _decrement_session_counter(entry.queue_session, entry_doc.queue_type)

    return {"status": "submitted", "name": enc.name}


def _decrement_session_counter(queue_session: str, queue_type: str):
    """Track used slot counts on the session."""
    field_map = {
        "PRE_BOOKED": "prebooked_used",
        "WALK_IN": "walkin_used",
        "EMERGENCY": "emergency_used",
        "FOLLOW_UP": "walkin_used",  # follow-ups share walk-in counter
    }
    field = field_map.get(queue_type)
    if field:
        current = frappe.db.get_value("Queue Session", queue_session, field) or 0
        frappe.db.set_value("Queue Session", queue_session, field, current + 1)
```

---

### 6.3 `clinic_flow/api/patient_data.py`

```python
import frappe
from frappe.utils import today, add_days


def get_patient_summary(patient: str) -> dict:
    """
    Assembles the right-panel patient summary.
    Called internally — not directly whitelisted (called via get_workspace_payload).
    """
    pat = frappe.get_doc("Patient", patient)

    return {
        "demographics": _get_demographics(pat),
        "vitals": _get_latest_vitals(patient),
        "allergies": _get_allergies(patient),
        "active_medications": _get_active_medications(patient),
        "recent_diagnoses": _get_recent_diagnoses(patient),
        "last_encounter_summary": _get_last_encounter_summary(patient),
        "recent_lab_results": _get_recent_lab_results(patient),
        "fee_validity": _get_fee_validity(patient),
        "open_orders": _get_open_orders(patient),
    }


def _get_demographics(pat) -> dict:
    return {
        "patient_name": pat.patient_name,
        "age": pat.age,
        "sex": pat.sex,
        "blood_group": pat.blood_group,
        "dob": pat.dob,
        "mobile": pat.mobile,
    }


def _get_latest_vitals(patient: str) -> dict:
    vitals = frappe.get_all(
        "Vital Signs",
        filters={"patient": patient},
        fields=["temperature", "pulse", "respiratory_rate",
                "bp_systolic", "bp_diastolic", "height", "weight", "bmi",
                "signs_date", "signs_time"],
        order_by="signs_date desc, signs_time desc",
        limit=1,
    )
    return vitals[0] if vitals else {}


def _get_allergies(patient: str) -> list:
    # Allergies stored on Patient DocType in Marley
    pat = frappe.get_doc("Patient", patient)
    return [a.as_dict() for a in (pat.get("allergy_medical_details") or [])]


def _get_active_medications(patient: str) -> list:
    # Get last encounter's drug prescription as proxy for active medications
    encounters = frappe.get_all(
        "Patient Encounter",
        filters={"patient": patient, "docstatus": 1},
        fields=["name", "encounter_date"],
        order_by="encounter_date desc",
        limit=3,
    )
    meds = []
    for enc in encounters:
        enc_doc = frappe.get_doc("Patient Encounter", enc.name)
        for rx in (enc_doc.drug_prescription or []):
            meds.append({
                "drug_name": rx.drug_name,
                "dosage": rx.dosage,
                "period": rx.period,
                "encounter_date": enc.encounter_date,
            })
        if meds:
            break  # Return meds from most recent encounter that has them
    return meds


def _get_recent_diagnoses(patient: str) -> list:
    encounters = frappe.get_all(
        "Patient Encounter",
        filters={"patient": patient, "docstatus": 1},
        fields=["name", "encounter_date"],
        order_by="encounter_date desc",
        limit=5,
    )
    diagnoses = []
    for enc in encounters:
        enc_doc = frappe.get_doc("Patient Encounter", enc.name)
        for dx in (enc_doc.diagnosis or []):
            diagnoses.append({
                "diagnosis": dx.diagnosis,
                "encounter_date": enc.encounter_date,
            })
    return diagnoses[:10]


def _get_last_encounter_summary(patient: str) -> dict:
    last = frappe.get_all(
        "Patient Encounter",
        filters={"patient": patient, "docstatus": 1},
        fields=["name", "encounter_date", "practitioner", "symptoms", "patient_note"],
        order_by="encounter_date desc",
        limit=1,
    )
    return last[0] if last else {}


def _get_recent_lab_results(patient: str) -> list:
    """
    Fetches recent Diagnostic Reports (newer Marley/Frappe Health).
    Falls back to Lab Test if Diagnostic Report DocType doesn't exist.
    """
    try:
        reports = frappe.get_all(
            "Diagnostic Report",
            filters={"patient": patient, "status": "Final"},
            fields=["name", "result_date", "practitioner"],
            order_by="result_date desc",
            limit=5,
        )
        return reports
    except Exception:
        # Fallback: Lab Test (older Marley)
        try:
            return frappe.get_all(
                "Lab Test",
                filters={"patient": patient, "docstatus": 1},
                fields=["name", "result_date", "practitioner"],
                order_by="result_date desc",
                limit=5,
            )
        except Exception:
            return []


def _get_fee_validity(patient: str) -> dict:
    """
    Checks if patient has a valid Fee Validity record.
    Fee Validity is a standard Frappe Healthcare DocType.
    """
    try:
        validity = frappe.get_all(
            "Fee Validity",
            filters={
                "patient": patient,
                "valid_till": [">=", today()],
            },
            fields=["name", "valid_till", "practitioner", "max_visits", "visited"],
            order_by="valid_till desc",
            limit=1,
        )
        if validity:
            v = validity[0]
            return {
                "has_validity": True,
                "valid_till": v.valid_till,
                "practitioner": v.practitioner,
                "visits_remaining": (v.max_visits or 0) - (v.visited or 0),
            }
    except Exception:
        pass
    return {"has_validity": False}


def _get_open_orders(patient: str) -> list:
    """
    Returns open Service Requests (pending lab tests, procedures).
    Service Request is the FHIR-aligned DocType in newer Marley.
    """
    try:
        return frappe.get_all(
            "Service Request",
            filters={
                "patient": patient,
                "status": ["in", ["Draft", "Requested", "Received"]],
            },
            fields=["name", "order_date", "template_dt", "template_dn", "status"],
            order_by="order_date desc",
            limit=10,
        )
    except Exception:
        return []
```

---

## 7. Doctor Workspace — Frappe Page

Create this as a **Frappe Page** (not a DocType), accessible at `/app/doctor-workspace`.

**Navigation:** In your Marley instance → search "Page" → New Page  
Or create the JSON file directly in the app.

### 7.1 Page definition file
Create `clinic_flow/clinic_flow/page/doctor_workspace/doctor_workspace.json`:
```json
{
    "creation": "2024-01-01 00:00:00",
    "doctype": "Page",
    "module": "Clinic Flow",
    "name": "doctor-workspace",
    "page_name": "doctor-workspace",
    "standard": "Yes",
    "system_page": 0,
    "title": "Doctor Workspace",
    "roles": [
        {"role": "Healthcare Practitioner"}
    ]
}
```

### 7.2 Page Python controller
Create `clinic_flow/clinic_flow/page/doctor_workspace/doctor_workspace.py`:
```python
import frappe

def get_context(context):
    # Called when page loads — pass initial data
    context.no_cache = 1
```

### 7.3 Page JavaScript (`doctor_workspace.js`)
Create `clinic_flow/clinic_flow/page/doctor_workspace/doctor_workspace.js`:

```javascript
frappe.pages['doctor-workspace'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Doctor Workspace',
        single_column: true,
    });

    // Inject the workspace HTML
    $(wrapper).find('.page-content').html(get_workspace_html());

    // Initialize the workspace controller
    new DoctorWorkspace(wrapper);
};

// ── HTML Template ─────────────────────────────────────────────────────────
function get_workspace_html() {
    return `
    <div class="clinic-workspace" style="display:grid;grid-template-columns:280px 1fr 300px;gap:16px;height:calc(100vh - 120px);overflow:hidden;">

        <!-- LEFT PANEL: Queue -->
        <div class="ws-panel ws-left" style="overflow-y:auto;border-right:1px solid var(--border-color);">
            <div class="panel-header" style="padding:12px 16px;border-bottom:1px solid var(--border-color);">
                <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Queue</div>
                <div id="ws-session-label" style="font-weight:500;font-size:13px;margin-top:2px;">—</div>
            </div>
            <div id="ws-queue-list" style="padding:8px 0;"></div>
        </div>

        <!-- CENTER PANEL: Active Patient -->
        <div class="ws-panel ws-center" style="overflow-y:auto;padding:0 8px;">
            <!-- Action bar -->
            <div id="ws-action-bar" style="display:flex;gap:8px;padding:12px 0;border-bottom:1px solid var(--border-color);flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" id="ws-btn-call-next">Call Next</button>
                <button class="btn btn-default btn-sm" id="ws-btn-recall" disabled>Recall</button>
                <button class="btn btn-default btn-sm" id="ws-btn-skip" disabled>Skip</button>
                <div style="flex:1"></div>
                <button class="btn btn-default btn-sm" id="ws-btn-save-draft" disabled>Save Draft</button>
                <button class="btn btn-success btn-sm" id="ws-btn-submit" disabled>Submit Encounter</button>
            </div>

            <!-- Patient token banner -->
            <div id="ws-patient-banner" style="display:none;background:var(--bg-color);border:1px solid var(--border-color);border-radius:6px;padding:12px 16px;margin:12px 0;">
                <div style="display:flex;align-items:center;gap:16px;">
                    <div id="ws-token-badge" style="font-size:22px;font-weight:700;color:var(--text-on-color);background:var(--primary);padding:6px 14px;border-radius:6px;letter-spacing:1px;"></div>
                    <div>
                        <div id="ws-patient-name" style="font-size:16px;font-weight:500;"></div>
                        <div id="ws-patient-meta" style="font-size:12px;color:var(--text-muted);margin-top:2px;"></div>
                    </div>
                    <div id="ws-queue-type-badge" style="margin-left:auto;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:500;"></div>
                </div>
            </div>

            <!-- Encounter editor -->
            <div id="ws-encounter-editor" style="display:none;">

                <!-- Symptoms -->
                <div class="ws-section">
                    <div class="ws-section-title">Symptoms / Chief Complaint</div>
                    <textarea id="ws-symptoms" class="form-control" rows="3" placeholder="Enter presenting complaints..."></textarea>
                </div>

                <!-- Diagnosis -->
                <div class="ws-section">
                    <div class="ws-section-title">Diagnosis</div>
                    <div id="ws-diagnosis-wrapper">
                        <!-- Diagnosis multi-select rendered here via frappe.ui.form.MultiSelect or simple input -->
                        <input type="text" id="ws-diagnosis-input" class="form-control" placeholder="Search diagnosis code (ICD-10)...">
                        <div id="ws-diagnosis-tags" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;"></div>
                    </div>
                </div>

                <!-- Plan / Notes -->
                <div class="ws-section">
                    <div class="ws-section-title">Plan & Notes</div>
                    <textarea id="ws-patient-note" class="form-control" rows="3" placeholder="Treatment plan, instructions to patient..."></textarea>
                </div>

                <!-- Medication -->
                <div class="ws-section">
                    <div class="ws-section-title" style="cursor:pointer;" onclick="ws_toggle_section('medications')">
                        Medication Request <span class="section-toggle">▸</span>
                    </div>
                    <div id="ws-section-medications" style="display:none;">
                        <div id="ws-drug-rows"></div>
                        <button class="btn btn-xs btn-default" onclick="ws_add_drug_row()">+ Add Medication</button>
                    </div>
                </div>

                <!-- Lab Orders -->
                <div class="ws-section">
                    <div class="ws-section-title" style="cursor:pointer;" onclick="ws_toggle_section('lab')">
                        Lab Orders <span class="section-toggle">▸</span>
                    </div>
                    <div id="ws-section-lab" style="display:none;">
                        <div id="ws-lab-rows"></div>
                        <button class="btn btn-xs btn-default" onclick="ws_add_lab_row()">+ Add Lab Order</button>
                    </div>
                </div>

                <!-- Referral -->
                <div class="ws-section">
                    <div class="ws-section-title" style="cursor:pointer;" onclick="ws_toggle_section('referral')">
                        Referral <span class="section-toggle">▸</span>
                    </div>
                    <div id="ws-section-referral" style="display:none;">
                        <textarea id="ws-referral-note" class="form-control" rows="2" placeholder="Referral details..."></textarea>
                    </div>
                </div>

            </div>

            <!-- Empty state -->
            <div id="ws-empty-state" style="text-align:center;padding:60px 20px;color:var(--text-muted);">
                <div style="font-size:36px;margin-bottom:12px;">🩺</div>
                <div style="font-size:15px;font-weight:500;">No active patient</div>
                <div style="font-size:13px;margin-top:4px;">Click "Call Next" to begin</div>
            </div>
        </div>

        <!-- RIGHT PANEL: Patient Summary -->
        <div class="ws-panel ws-right" style="overflow-y:auto;border-left:1px solid var(--border-color);padding:0 16px;">
            <div id="ws-summary-empty" style="padding:24px 0;text-align:center;color:var(--text-muted);font-size:13px;">
                Patient summary will appear here
            </div>
            <div id="ws-summary-content" style="display:none;">

                <div class="summary-section">
                    <div class="summary-label">Token</div>
                    <div id="sum-token" class="summary-value mono"></div>
                </div>
                <div class="summary-section">
                    <div class="summary-label">Type</div>
                    <div id="sum-queue-type" class="summary-value"></div>
                </div>
                <div class="summary-section">
                    <div class="summary-label">Age / Sex</div>
                    <div id="sum-age-sex" class="summary-value"></div>
                </div>

                <div class="summary-divider"></div>

                <div class="summary-section">
                    <div class="summary-label">Chief Complaint</div>
                    <div id="sum-chief-complaint" class="summary-value"></div>
                </div>

                <div class="summary-section">
                    <div class="summary-label">Vitals</div>
                    <div id="sum-vitals" class="summary-value small"></div>
                </div>

                <div class="summary-divider"></div>

                <div class="summary-section">
                    <div class="summary-label">Allergies</div>
                    <div id="sum-allergies" class="summary-value alert-text"></div>
                </div>
                <div class="summary-section">
                    <div class="summary-label">Active Medications</div>
                    <div id="sum-meds" class="summary-value small"></div>
                </div>
                <div class="summary-section">
                    <div class="summary-label">Recent Diagnoses</div>
                    <div id="sum-diagnoses" class="summary-value small"></div>
                </div>

                <div class="summary-divider"></div>

                <div class="summary-section">
                    <div class="summary-label">Fee Validity</div>
                    <div id="sum-fee-validity" class="summary-value"></div>
                </div>
                <div class="summary-section">
                    <div class="summary-label">Prior Lab Results</div>
                    <div id="sum-lab-results" class="summary-value small"></div>
                </div>

            </div>
        </div>

    </div>

    <style>
        .clinic-workspace { font-family: var(--font-stack); }
        .ws-section { margin-bottom:16px; }
        .ws-section-title { font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;padding:4px 0; }
        .summary-section { margin-bottom:10px; }
        .summary-label { font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px; }
        .summary-value { font-size:13px;color:var(--text-color); }
        .summary-value.small { font-size:12px; }
        .summary-value.mono { font-family:var(--mono-font);font-weight:600; }
        .summary-value.alert-text { color:var(--red);font-weight:500; }
        .summary-divider { border-top:1px solid var(--border-color);margin:12px 0; }
        .queue-item { padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border-color);transition:background .1s; }
        .queue-item:hover { background:var(--bg-color); }
        .queue-item.is-active { background:var(--primary-light);border-left:3px solid var(--primary); }
        .queue-item.is-emergency { border-left:3px solid var(--red); }
        .queue-badge { display:inline-block;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:500;margin-top:3px; }
        .badge-emergency { background:var(--red-light);color:var(--red); }
        .badge-prebooked { background:var(--blue-light);color:var(--blue); }
        .badge-walkin { background:var(--green-light);color:var(--green); }
        .badge-followup { background:var(--orange-light);color:var(--orange); }
    </style>
    `;
}


// ── Workspace Controller ───────────────────────────────────────────────────
class DoctorWorkspace {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.state = {
            queue_session: null,
            current_entry: null,
            current_encounter: null,
            diagnosis_list: [],
        };

        this._init();
    }

    async _init() {
        // Find active queue session for current user's practitioner
        try {
            const r = await frappe.call({
                method: 'clinic_flow.api.queue.get_active_session_for_user',
            });
            if (r.message) {
                this.state.queue_session = r.message.name;
                $('#ws-session-label').text(r.message.session_name || r.message.name);
                this._load_queue();
                this._bind_events();
                this._subscribe_realtime();
            } else {
                frappe.show_alert({ message: 'No active queue session found for today.', indicator: 'orange' });
            }
        } catch (e) {
            frappe.show_alert({ message: 'Failed to initialize workspace.', indicator: 'red' });
        }
    }

    _bind_events() {
        const self = this;

        $('#ws-btn-call-next').on('click', () => self._call_next());
        $('#ws-btn-recall').on('click', () => self._recall());
        $('#ws-btn-skip').on('click', () => self._skip());
        $('#ws-btn-save-draft').on('click', () => self._save_draft());
        $('#ws-btn-submit').on('click', () => self._submit_encounter());
    }

    _subscribe_realtime() {
        const self = this;
        frappe.realtime.on('queue_update', (data) => {
            self._render_queue(data.next_tokens, data.current_token);
        });
    }

    async _load_queue() {
        const r = await frappe.call({
            method: 'clinic_flow.api.queue.get_queue_state',
            args: { queue_session: this.state.queue_session },
        });
        if (r.message) {
            this._render_queue(r.message.waiting, r.message.session?.current_token);
        }
    }

    _render_queue(waiting, current_token) {
        const container = $('#ws-queue-list');
        container.empty();

        if (!waiting || !waiting.length) {
            container.html('<div style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center;">Queue is empty</div>');
            return;
        }

        waiting.forEach((entry, idx) => {
            const badge_class = {
                'EMERGENCY': 'badge-emergency',
                'PRE_BOOKED': 'badge-prebooked',
                'WALK_IN': 'badge-walkin',
                'FOLLOW_UP': 'badge-followup',
            }[entry.queue_type] || 'badge-walkin';

            const type_label = {
                'EMERGENCY': 'Emergency',
                'PRE_BOOKED': 'Pre-booked',
                'WALK_IN': 'Walk-in',
                'FOLLOW_UP': 'Follow-up',
            }[entry.queue_type] || entry.queue_type;

            const is_active = entry.token === current_token;
            const is_emergency = entry.queue_type === 'EMERGENCY';

            container.append(`
                <div class="queue-item ${is_active ? 'is-active' : ''} ${is_emergency ? 'is-emergency' : ''}">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-weight:600;font-size:14px;font-family:var(--mono-font);">${entry.token}</div>
                        <div style="font-size:12px;color:var(--text-muted);">#${idx + 1}</div>
                    </div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${entry.patient_name || ''}</div>
                    <span class="queue-badge ${badge_class}">${type_label}</span>
                </div>
            `);
        });
    }

    async _call_next() {
        const btn = $('#ws-btn-call-next');
        btn.prop('disabled', true).text('Calling...');

        try {
            const r = await frappe.call({
                method: 'clinic_flow.api.queue.call_next',
                args: { queue_session: this.state.queue_session },
            });

            const payload = r.message;
            if (payload.status === 'empty') {
                frappe.show_alert({ message: 'Queue is empty', indicator: 'blue' });
                return;
            }

            this.state.current_entry = payload.queue_entry;
            this.state.current_encounter = payload.encounter;
            this.state.diagnosis_list = [];

            this._render_patient_banner(payload);
            this._render_encounter_editor(payload.encounter);
            this._render_patient_summary(payload.patient_summary);
            this._set_buttons_active();
            this._load_queue();

        } catch (e) {
            frappe.show_alert({ message: 'Failed to call next patient', indicator: 'red' });
        } finally {
            btn.prop('disabled', false).text('Call Next');
        }
    }

    async _recall() {
        if (!this.state.current_entry) return;
        await frappe.call({
            method: 'clinic_flow.api.queue.recall_patient',
            args: { queue_entry: this.state.current_entry.name },
        });
        frappe.show_alert({ message: 'Patient recalled on display', indicator: 'green' });
    }

    async _skip() {
        if (!this.state.current_entry) return;
        const result = await frappe.confirm('Skip this patient? They will not be re-queued automatically.');
        if (!result) return;

        const r = await frappe.call({
            method: 'clinic_flow.api.queue.skip_patient',
            args: { queue_entry: this.state.current_entry.name },
        });

        if (r.message && r.message.status !== 'empty') {
            this.state.current_entry = r.message.queue_entry;
            this.state.current_encounter = r.message.encounter;
            this._render_patient_banner(r.message);
            this._render_encounter_editor(r.message.encounter);
            this._render_patient_summary(r.message.patient_summary);
        }
    }

    async _save_draft() {
        if (!this.state.current_encounter) return;

        const data = this._collect_encounter_data();
        const btn = $('#ws-btn-save-draft');
        btn.prop('disabled', true).text('Saving...');

        try {
            await frappe.call({
                method: 'clinic_flow.api.workspace.save_encounter_draft',
                args: {
                    encounter: this.state.current_encounter.name,
                    data: JSON.stringify(data),
                },
            });
            frappe.show_alert({ message: 'Draft saved', indicator: 'green' });
        } catch (e) {
            frappe.show_alert({ message: 'Save failed', indicator: 'red' });
        } finally {
            btn.prop('disabled', false).text('Save Draft');
        }
    }

    async _submit_encounter() {
        if (!this.state.current_encounter) return;

        // Save draft first
        await this._save_draft();

        const confirmed = await frappe.confirm('Submit this encounter? This cannot be undone.');
        if (!confirmed) return;

        const btn = $('#ws-btn-submit');
        btn.prop('disabled', true).text('Submitting...');

        try {
            await frappe.call({
                method: 'clinic_flow.api.workspace.submit_encounter',
                args: { encounter: this.state.current_encounter.name },
            });

            frappe.show_alert({ message: 'Encounter submitted', indicator: 'green' });
            this._reset_workspace();

        } catch (e) {
            frappe.show_alert({ message: 'Submit failed', indicator: 'red' });
        } finally {
            btn.prop('disabled', false).text('Submit Encounter');
        }
    }

    _collect_encounter_data() {
        return {
            symptoms: $('#ws-symptoms').val(),
            patient_note: $('#ws-patient-note').val(),
            diagnosis: this.state.diagnosis_list,
            // Drug and lab rows collected from dynamic row renderers
            drug_prescription: this._collect_drug_rows(),
            lab_test_prescription: this._collect_lab_rows(),
        };
    }

    _collect_drug_rows() {
        const rows = [];
        $('#ws-drug-rows .drug-row').each(function() {
            rows.push({
                drug_name: $(this).find('.drug-name').val(),
                dosage: $(this).find('.drug-dosage').val(),
                period: $(this).find('.drug-period').val(),
                dosage_form: $(this).find('.drug-form').val(),
            });
        });
        return rows.filter(r => r.drug_name);
    }

    _collect_lab_rows() {
        const rows = [];
        $('#ws-lab-rows .lab-row').each(function() {
            rows.push({
                lab_test_name: $(this).find('.lab-test-name').val(),
            });
        });
        return rows.filter(r => r.lab_test_name);
    }

    _render_patient_banner(payload) {
        const entry = payload.queue_entry;
        const summary = payload.patient_summary;
        const demo = summary?.demographics || {};

        $('#ws-patient-banner').show();
        $('#ws-empty-state').hide();

        $('#ws-token-badge').text(entry.token);
        $('#ws-patient-name').text(demo.patient_name || entry.patient_name || '');
        $('#ws-patient-meta').text(`${demo.age || '?'} yrs · ${demo.sex || '?'} · ${demo.blood_group || ''}`);

        const type_colors = {
            'EMERGENCY': '#dc3545',
            'PRE_BOOKED': '#0d6efd',
            'WALK_IN': '#198754',
            'FOLLOW_UP': '#fd7e14',
        };
        const type_labels = {
            'EMERGENCY': 'Emergency',
            'PRE_BOOKED': 'Pre-booked',
            'WALK_IN': 'Walk-in',
            'FOLLOW_UP': 'Follow-up',
        };
        const color = type_colors[entry.queue_type] || '#6c757d';
        $('#ws-queue-type-badge')
            .text(type_labels[entry.queue_type] || entry.queue_type)
            .css({ background: color + '20', color: color, border: `1px solid ${color}40` });
    }

    _render_encounter_editor(encounter) {
        $('#ws-encounter-editor').show();

        if (!encounter) return;

        $('#ws-symptoms').val(encounter.symptoms || '');
        $('#ws-patient-note').val(encounter.patient_note || '');

        // Render medication rows
        this._render_drug_rows(encounter.drug_prescription || []);
        this._render_lab_rows(encounter.lab_test_prescription || []);
    }

    _render_drug_rows(rows) {
        const container = $('#ws-drug-rows');
        container.empty();
        rows.forEach(row => ws_add_drug_row(row));
    }

    _render_lab_rows(rows) {
        const container = $('#ws-lab-rows');
        container.empty();
        rows.forEach(row => ws_add_lab_row(row));
    }

    _render_patient_summary(summary) {
        if (!summary) return;

        $('#ws-summary-empty').hide();
        $('#ws-summary-content').show();

        const entry = this.state.current_entry;
        const demo = summary.demographics || {};
        const vitals = summary.vitals || {};

        $('#sum-token').text(entry?.token || '—');
        $('#sum-queue-type').text(entry?.queue_type?.replace('_', ' ') || '—');
        $('#sum-age-sex').text(`${demo.age || '?'} yrs · ${demo.sex || '?'}`);

        // Vitals
        const vitals_str = vitals.bp_systolic
            ? `BP: ${vitals.bp_systolic}/${vitals.bp_diastolic} · Pulse: ${vitals.pulse} · Temp: ${vitals.temperature}°C`
            : 'No vitals recorded today';
        $('#sum-vitals').text(vitals_str);

        // Allergies
        const allergies = summary.allergies || [];
        $('#sum-allergies').text(
            allergies.length ? allergies.map(a => a.allergy).join(', ') : 'None recorded'
        );
        if (allergies.length) {
            $('#sum-allergies').addClass('alert-text');
        }

        // Active medications
        const meds = summary.active_medications || [];
        $('#sum-meds').html(
            meds.length
                ? meds.map(m => `<div>• ${m.drug_name} ${m.dosage || ''}</div>`).join('')
                : '<div>None</div>'
        );

        // Recent diagnoses
        const dx = summary.recent_diagnoses || [];
        $('#sum-diagnoses').html(
            dx.slice(0, 5).map(d => `<div>• ${d.diagnosis}</div>`).join('') || '<div>None</div>'
        );

        // Fee validity
        const fv = summary.fee_validity || {};
        $('#sum-fee-validity').text(
            fv.has_validity
                ? `Valid till ${fv.valid_till} · ${fv.visits_remaining} visits remaining`
                : 'No active validity'
        );

        // Lab results
        const labs = summary.recent_lab_results || [];
        $('#sum-lab-results').html(
            labs.length
                ? labs.map(l => `<div>• ${l.name} (${l.result_date || ''})</div>`).join('')
                : '<div>None</div>'
        );
    }

    _set_buttons_active() {
        $('#ws-btn-recall').prop('disabled', false);
        $('#ws-btn-skip').prop('disabled', false);
        $('#ws-btn-save-draft').prop('disabled', false);
        $('#ws-btn-submit').prop('disabled', false);
    }

    _reset_workspace() {
        this.state.current_entry = null;
        this.state.current_encounter = null;
        this.state.diagnosis_list = [];

        $('#ws-patient-banner').hide();
        $('#ws-encounter-editor').hide();
        $('#ws-empty-state').show();
        $('#ws-summary-empty').show();
        $('#ws-summary-content').hide();

        $('#ws-btn-recall, #ws-btn-skip, #ws-btn-save-draft, #ws-btn-submit').prop('disabled', true);

        this._load_queue();
    }
}

// ── Helper functions (module-scope, called from inline onclick) ────────────
function ws_toggle_section(id) {
    $(`#ws-section-${id}`).toggle();
}

function ws_add_drug_row(data = {}) {
    $('#ws-drug-rows').append(`
        <div class="drug-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center;">
            <input class="form-control form-control-sm drug-name" placeholder="Drug name" value="${data.drug_name || ''}">
            <input class="form-control form-control-sm drug-dosage" placeholder="Dosage" value="${data.dosage || ''}">
            <input class="form-control form-control-sm drug-period" placeholder="Period" value="${data.period || ''}">
            <input class="form-control form-control-sm drug-form" placeholder="Form" value="${data.dosage_form || ''}">
            <button class="btn btn-xs btn-danger" onclick="$(this).closest('.drug-row').remove()">✕</button>
        </div>
    `);
}

function ws_add_lab_row(data = {}) {
    $('#ws-lab-rows').append(`
        <div class="lab-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
            <input class="form-control form-control-sm lab-test-name" placeholder="Test name / Observation Template" value="${data.lab_test_name || ''}">
            <button class="btn btn-xs btn-danger" onclick="$(this).closest('.lab-row').remove()">✕</button>
        </div>
    `);
}
```

---

## 8. TV Queue Dashboard

### 8.1 Serving strategy — IMPORTANT

Do NOT put this in `www/queue-dashboard.html`. Frappe's `www/` pipeline injects its own
CSS reset, desk stylesheet, and sidebar into every page rendered through the Jinja base
template. That is why the previous version had no visible styling — Frappe's styles were
overriding the inline CSS.

**Correct approach:** Serve the dashboard as a **no-layout Frappe Web Page** so you get
full-screen control without any desk chrome.

Steps (done in the Frappe admin UI, not in code):
1. Go to **Website → Web Page → New**
2. Set **Route** to `queue-dashboard`
3. Set **Published** to Yes
4. Set **Show Sidebar** to No
5. Tick **No Cache**
6. Set **Content Type** to `HTML`
7. Paste the full HTML below into the **Content** field (or the **Custom HTML** block)

Alternatively, create the file at `clinic_flow/www/queue-dashboard.html` and add a
companion `queue-dashboard.py` context file that sets `no_cache = 1` and `no_breadcrumbs = 1`.
The HTML must start with `{% raw %}` or use `no_wrap = 1` in the context to skip the
base template entirely:

```python
# clinic_flow/www/queue-dashboard.py
no_cache = 1
no_breadcrumbs = 1
no_header = 1
no_sidebar = 1
```

And the HTML file must begin with this Frappe directive to skip the base layout:

```
{%- from "templates/macros/form_macros.html" import no_sidebar -%}
```

The safest method — which guarantees zero Frappe stylesheet interference — is the
**Web Page route** approach above. Use that for production.

---

### 8.2 Full dashboard HTML

Save this as the Web Page content. It is a fully self-contained page — no external
font CDN calls that might be blocked in the clinic's network. All fonts are loaded
from Google Fonts with a local fallback stack.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OPD Queue Display</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">

    <style>
        /* ── Reset ── */
        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        /* ── Design tokens ── */
        :root {
            --bg:          #06060f;
            --surface:     #0e0e1f;
            --surface-2:   #161628;
            --border:      #1f1f3a;
            --border-glow: #2d2d5e;

            --text-primary:   #eeeef5;
            --text-secondary: #8888aa;
            --text-muted:     #44445a;

            --accent:      #7c6aff;
            --accent-dim:  #3a2e8a;
            --accent-glow: rgba(124, 106, 255, 0.15);

            --green:       #22d998;
            --green-dim:   #0a3d2a;
            --blue:        #4da6ff;
            --blue-dim:    #0a1f3d;
            --amber:       #ffb340;
            --amber-dim:   #3d2500;
            --red:         #ff5f5f;
            --red-dim:     #3d0a0a;

            --token-size:  clamp(64px, 9vw, 112px);
            --radius:      12px;
        }

        /* ── Layout shell ── */
        html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
        }

        body {
            background: var(--bg);
            color: var(--text-primary);
            font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
            display: grid;
            grid-template-rows: 64px 1fr auto 80px;
            grid-template-areas:
                "header"
                "current"
                "next"
                "footer";
        }

        /* ── Header ── */
        .hdr {
            grid-area: header;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 40px;
            background: var(--surface);
            border-bottom: 1px solid var(--border);
        }

        .hdr-left {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .hdr-pulse {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--green);
            box-shadow: 0 0 0 0 rgba(34, 217, 152, 0.4);
            animation: live-pulse 2s ease-in-out infinite;
        }

        @keyframes live-pulse {
            0%   { box-shadow: 0 0 0 0   rgba(34,217,152,0.5); }
            70%  { box-shadow: 0 0 0 10px rgba(34,217,152,0); }
            100% { box-shadow: 0 0 0 0   rgba(34,217,152,0); }
        }

        .hdr-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--text-primary);
            letter-spacing: 0.3px;
        }

        .hdr-dept {
            font-size: 13px;
            color: var(--text-secondary);
            background: var(--surface-2);
            border: 1px solid var(--border);
            padding: 3px 12px;
            border-radius: 20px;
        }

        .hdr-time {
            font-family: 'DM Mono', monospace;
            font-size: 22px;
            font-weight: 500;
            color: var(--text-primary);
            letter-spacing: 2px;
            font-variant-numeric: tabular-nums;
        }

        /* ── Current token (main stage) ── */
        .stage {
            grid-area: current;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px 40px 0;
            position: relative;
        }

        /* Ambient glow behind the token */
        .stage::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -60%);
            width: 320px;
            height: 200px;
            background: var(--accent-glow);
            filter: blur(80px);
            border-radius: 50%;
            pointer-events: none;
            transition: background 0.6s ease;
        }

        .stage.is-emergency::before {
            background: rgba(255, 95, 95, 0.12);
        }

        .now-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 4px;
            color: var(--text-muted);
            margin-bottom: 16px;
        }

        .token-wrap {
            position: relative;
            display: inline-block;
        }

        .token-main {
            font-family: 'DM Mono', monospace;
            font-size: var(--token-size);
            font-weight: 500;
            letter-spacing: 8px;
            color: var(--text-primary);
            line-height: 1;
            text-align: center;
            transition: color 0.4s ease, transform 0.3s ease;
            position: relative;
            z-index: 1;
        }

        .token-main.flash-in {
            animation: token-appear 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes token-appear {
            from { opacity: 0; transform: translateY(18px) scale(0.94); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
        }

        .token-main.is-emergency {
            color: var(--red);
        }

        /* Animated underline accent */
        .token-accent {
            display: block;
            height: 3px;
            border-radius: 2px;
            background: linear-gradient(90deg, transparent, var(--accent), transparent);
            margin: 10px auto 0;
            width: 60%;
            transition: background 0.4s ease;
        }

        .stage.is-emergency .token-accent {
            background: linear-gradient(90deg, transparent, var(--red), transparent);
            animation: emergency-bar 0.8s ease-in-out infinite alternate;
        }

        @keyframes emergency-bar {
            from { opacity: 0.5; transform: scaleX(0.7); }
            to   { opacity: 1;   transform: scaleX(1); }
        }

        .token-type-badge {
            margin-top: 18px;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 5px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            letter-spacing: 0.5px;
            border: 1px solid transparent;
            transition: all 0.3s ease;
        }

        .badge-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
        }

        .badge-emergency { background: var(--red-dim);   color: var(--red);   border-color: rgba(255,95,95,0.25); }
        .badge-prebooked { background: var(--blue-dim);  color: var(--blue);  border-color: rgba(77,166,255,0.25); }
        .badge-walkin    { background: var(--green-dim); color: var(--green); border-color: rgba(34,217,152,0.25); }
        .badge-followup  { background: var(--amber-dim); color: var(--amber); border-color: rgba(255,179,64,0.25); }

        .dot-emergency { background: var(--red); }
        .dot-prebooked { background: var(--blue); }
        .dot-walkin    { background: var(--green); }
        .dot-followup  { background: var(--amber); }

        .token-doctor {
            margin-top: 12px;
            font-size: 15px;
            color: var(--text-secondary);
            font-weight: 300;
            letter-spacing: 0.3px;
        }

        /* Emergency flash overlay */
        .emergency-overlay {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 100;
            border: 3px solid var(--red);
            border-radius: 0;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .emergency-overlay.flash {
            animation: border-flash 1.2s ease-in-out 3;
        }

        @keyframes border-flash {
            0%, 100% { opacity: 0; }
            50%      { opacity: 1; }
        }

        /* ── Next up ── */
        .next-section {
            grid-area: next;
            padding: 24px 40px 16px;
        }

        .next-label {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 3px;
            color: var(--text-muted);
            margin-bottom: 14px;
        }

        .next-row {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
        }

        .next-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 14px 10px 12px;
            text-align: center;
            transition: border-color 0.2s ease, background 0.2s ease;
        }

        .next-card:first-child {
            border-color: var(--border-glow);
            background: var(--surface-2);
        }

        .next-card-pos {
            font-size: 10px;
            font-weight: 500;
            color: var(--text-muted);
            letter-spacing: 1px;
            margin-bottom: 6px;
        }

        .next-card-token {
            font-family: 'DM Mono', monospace;
            font-size: clamp(15px, 1.8vw, 22px);
            font-weight: 500;
            letter-spacing: 2px;
            color: var(--text-primary);
        }

        .next-card-badge {
            display: inline-block;
            margin-top: 7px;
            padding: 2px 9px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
            letter-spacing: 0.5px;
        }

        .nb-emergency { background: var(--red-dim);   color: var(--red); }
        .nb-prebooked { background: var(--blue-dim);  color: var(--blue); }
        .nb-walkin    { background: var(--green-dim); color: var(--green); }
        .nb-followup  { background: var(--amber-dim); color: var(--amber); }

        /* ── Footer ── */
        .footer {
            grid-area: footer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 40px;
            border-top: 1px solid var(--border);
            background: var(--surface);
        }

        .footer-msg {
            font-size: 13px;
            color: var(--text-muted);
            letter-spacing: 0.3px;
        }

        .footer-ticker {
            font-size: 12px;
            color: var(--text-muted);
            font-family: 'DM Mono', monospace;
        }

        /* ── Empty state ── */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: var(--text-muted);
        }

        .empty-state-icon {
            font-size: 48px;
            opacity: 0.3;
            margin-bottom: 8px;
        }

        .empty-state-text {
            font-size: 18px;
            font-weight: 300;
        }

        /* ── Scan-line texture (optional TV effect) ── */
        body::after {
            content: '';
            position: fixed;
            inset: 0;
            background: repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0,0,0,0.03) 2px,
                rgba(0,0,0,0.03) 4px
            );
            pointer-events: none;
            z-index: 200;
        }
    </style>
</head>
<body>

    <!-- Emergency border flash overlay -->
    <div class="emergency-overlay" id="emg-overlay"></div>

    <!-- Header -->
    <header class="hdr">
        <div class="hdr-left">
            <div class="hdr-pulse"></div>
            <span class="hdr-title">OPD Queue</span>
            <span class="hdr-dept" id="hdr-dept">All Departments</span>
        </div>
        <div class="hdr-time" id="hdr-time">00:00</div>
    </header>

    <!-- Main stage: current token -->
    <main class="stage" id="stage">
        <div class="empty-state" id="empty-state">
            <div class="empty-state-icon">⏳</div>
            <div class="empty-state-text">Waiting for queue to start</div>
        </div>

        <div id="token-display" style="display:none; flex-direction:column; align-items:center;">
            <div class="now-label">Now Serving</div>
            <div class="token-wrap">
                <div class="token-main" id="token-main">—</div>
                <span class="token-accent"></span>
            </div>
            <div class="token-type-badge" id="token-badge">
                <span class="badge-dot" id="badge-dot"></span>
                <span id="badge-label"></span>
            </div>
            <div class="token-doctor" id="token-doctor"></div>
        </div>
    </main>

    <!-- Next 5 -->
    <section class="next-section">
        <div class="next-label">Up next</div>
        <div class="next-row" id="next-row">
            <!-- filled by JS -->
        </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
        <span class="footer-msg">Please wait for your token number to be called at the counter</span>
        <span class="footer-ticker" id="footer-ticker">—</span>
    </footer>

    <script>
    (function () {
        'use strict';

        /* ── URL params ── */
        const params = new URLSearchParams(window.location.search);
        const dept   = params.get('dept') || 'all';
        const room   = params.get('room') || '';

        document.getElementById('hdr-dept').textContent =
            dept === 'all' ? 'All Departments'
                           : dept + (room ? '\u00a0·\u00a0' + room : '');

        /* ── Clock ── */
        function tick() {
            const now = new Date();
            const h   = String(now.getHours()).padStart(2, '0');
            const m   = String(now.getMinutes()).padStart(2, '0');
            const s   = String(now.getSeconds()).padStart(2, '0');
            document.getElementById('hdr-time').textContent     = h + ':' + m;
            document.getElementById('footer-ticker').textContent = h + ':' + m + ':' + s;
        }
        tick();
        setInterval(tick, 1000);

        /* ── Type config ── */
        const TYPE_CONFIG = {
            EMERGENCY: { label: 'Emergency', badgeCls: 'badge-emergency', dotCls: 'dot-emergency', nbCls: 'nb-emergency' },
            PRE_BOOKED: { label: 'Pre-booked', badgeCls: 'badge-prebooked', dotCls: 'dot-prebooked', nbCls: 'nb-prebooked' },
            WALK_IN:    { label: 'Walk-in',   badgeCls: 'badge-walkin',    dotCls: 'dot-walkin',    nbCls: 'nb-walkin'    },
            FOLLOW_UP:  { label: 'Follow-up', badgeCls: 'badge-followup',  dotCls: 'dot-followup',  nbCls: 'nb-followup'  },
        };
        const DEFAULT_TYPE = TYPE_CONFIG.WALK_IN;

        function typeOf(t) { return TYPE_CONFIG[t] || DEFAULT_TYPE; }

        /* ── Render current token ── */
        function renderCurrent(token, queueType, practitioner) {
            const cfg = typeOf(queueType);

            document.getElementById('empty-state').style.display  = 'none';
            const display = document.getElementById('token-display');
            display.style.display = 'flex';

            const tokenEl = document.getElementById('token-main');
            tokenEl.textContent = token || '—';
            tokenEl.className   = 'token-main flash-in' + (queueType === 'EMERGENCY' ? ' is-emergency' : '');

            /* remove + re-add class to retrigger animation */
            void tokenEl.offsetWidth;
            tokenEl.classList.add('flash-in');

            const stage = document.getElementById('stage');
            stage.className = 'stage' + (queueType === 'EMERGENCY' ? ' is-emergency' : '');

            const badge = document.getElementById('token-badge');
            badge.className = 'token-type-badge ' + cfg.badgeCls;

            document.getElementById('badge-dot').className   = 'badge-dot ' + cfg.dotCls;
            document.getElementById('badge-label').textContent = cfg.label;

            const docEl = document.getElementById('token-doctor');
            docEl.textContent = practitioner ? 'Dr.\u00a0' + practitioner : '';
        }

        /* ── Render next 5 ── */
        function renderNext(tokens) {
            const row = document.getElementById('next-row');
            row.innerHTML = '';

            if (!tokens || !tokens.length) return;

            tokens.slice(0, 5).forEach(function (entry, i) {
                const cfg = typeOf(entry.queue_type);
                const card = document.createElement('div');
                card.className = 'next-card';
                card.innerHTML =
                    '<div class="next-card-pos">' + (i === 0 ? 'NEXT' : '#' + (i + 1)) + '</div>' +
                    '<div class="next-card-token">' + (entry.token || '—') + '</div>' +
                    '<span class="next-card-badge ' + cfg.nbCls + '">' + cfg.label + '</span>';
                row.appendChild(card);
            });
        }

        /* ── Emergency visual + audio alert ── */
        function triggerEmergencyAlert() {
            const overlay = document.getElementById('emg-overlay');
            overlay.classList.remove('flash');
            void overlay.offsetWidth;
            overlay.classList.add('flash');

            try {
                const ctx  = new (window.AudioContext || window.webkitAudioContext)();
                [880, 1100, 880].forEach(function (freq, i) {
                    const osc  = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.22);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.22 + 0.18);
                    osc.start(ctx.currentTime + i * 0.22);
                    osc.stop(ctx.currentTime  + i * 0.22 + 0.2);
                });
            } catch (e) { /* AudioContext may be blocked until user gesture */ }
        }

        /* ── Main update handler ── */
        function handleQueueUpdate(data) {
            if (data.current_token) {
                renderCurrent(data.current_token, data.current_queue_type, data.practitioner);
            }
            renderNext(data.next_tokens || []);
        }

        /* ── Recall handler ── */
        function handleRecall(data) {
            if (data.queue_type === 'EMERGENCY') {
                triggerEmergencyAlert();
            } else {
                /* gentle flash for non-emergency recall */
                const tokenEl = document.getElementById('token-main');
                tokenEl.style.opacity = '0.3';
                setTimeout(function () { tokenEl.style.opacity = '1'; }, 300);
            }
        }

        /* ── Frappe realtime subscription ──
           frappe.js and socket.io are auto-loaded when this page is served
           through a Frappe Web Page. If serving as a raw standalone file,
           you must load /assets/frappe/js/frappe-web.min.js manually.
        */
        function subscribeRealtime() {
            if (typeof frappe === 'undefined' || !frappe.realtime) {
                /* retry until frappe.js is ready */
                setTimeout(subscribeRealtime, 400);
                return;
            }
            frappe.realtime.on('queue_update', handleQueueUpdate);
            frappe.realtime.on('recall_patient', handleRecall);

            /* initial state load via REST — avoids waiting for first broadcast */
            fetch('/api/method/clinic_flow.api.queue.get_queue_state_for_display'
                + '?dept=' + encodeURIComponent(dept))
                .then(function (r) { return r.json(); })
                .then(function (r) { if (r.message) handleQueueUpdate(r.message); })
                .catch(function () { /* fail silently — realtime will catch up */ });
        }

        document.addEventListener('DOMContentLoaded', subscribeRealtime);

    })();
    </script>
</body>
</html>
```

### 8.3 Add one extra API endpoint for the initial page load

Add this to `clinic_flow/api/queue.py`. It gives the dashboard its initial state
without waiting for a realtime event:

```python
@frappe.whitelist(allow_guest=False)
def get_queue_state_for_display(dept: str = "all") -> dict:
    """
    Called by the TV dashboard on page load to get the current queue snapshot.
    Returns same shape as the realtime queue_update event.
    """
    filters: dict = {"status": "Active", "session_date": frappe.utils.today()}
    if dept and dept != "all":
        filters["dept_abbr"] = dept.upper()

    sessions = frappe.get_all(
        "Queue Session",
        filters=filters,
        fields=["name", "current_token", "practitioner", "dept_abbr"],
        limit=1,
    )
    if not sessions:
        return {"current_token": None, "next_tokens": [], "practitioner": None}

    session = sessions[0]
    waiting = frappe.get_all(
        "Queue Entry",
        filters={"queue_session": session.name, "status": "Waiting"},
        fields=["token", "patient_name", "queue_type", "queue_position"],
        order_by="queue_position asc",
        limit=5,
    )

    # Get queue type of current token
    current_type = None
    if session.current_token:
        current_entry = frappe.db.get_value(
            "Queue Entry",
            {"queue_session": session.name, "token": session.current_token},
            "queue_type",
        )
        current_type = current_entry

    return {
        "current_token":      session.current_token,
        "current_queue_type": current_type,
        "next_tokens":        waiting,
        "practitioner":       session.practitioner,
        "dept_abbr":          session.dept_abbr,
    }
```

---

## 9. Additional API endpoint needed in `queue.py`

Add this method (referenced in doctor_workspace.js `_init()`):

```python
@frappe.whitelist()
def get_active_session_for_user() -> dict | None:
    """
    Returns the active Queue Session for the current user's Healthcare Practitioner.
    """
    practitioner = frappe.db.get_value(
        "Healthcare Practitioner",
        {"user": frappe.session.user},
        "name"
    )
    if not practitioner:
        return None

    sessions = frappe.get_all(
        "Queue Session",
        filters={
            "practitioner": practitioner,
            "session_date": frappe.utils.today(),
            "status": "Active",
        },
        fields=["name", "session_name", "dept_abbr", "status"],
        limit=1,
    )
    return sessions[0] if sessions else None
```

---

## 10. Build Order — Follow This Sequence

Claude Code should build in this exact order. Each step must pass before the next begins.

```
Step 1: Scaffold app
  → bench new-app clinic_flow
  → verify pyproject.toml (requires-python >=3.11, health >=16.0.0)
  → verify __init__.py (__version__ = "0.1.0"), modules.txt
  → bench --site [site] install-app clinic_flow

Step 2: Create DocTypes (via Frappe UI or JSON files)
  → Slot Partition Config (Single)
  → Queue Session
  → Queue Entry
  → bench --site [site] migrate

Step 3: Build queue/engine.py
  → build_token()
  → get_next_sequence()
  → get_next_token() with round-robin + emergency bypass
  → _broadcast_queue_update()
  → NOTE: do NOT put on_update logic here — that goes in appointment_mixin.py

Step 4: Build queue/appointment_mixin.py  ← v16 new file
  → QueueMixin class with on_update() calling super().on_update() first
  → _clinic_flow_maybe_create_queue_entry() with duplicate guard
  → Register in hooks.py via extend_doctype_class

Step 5: Register hooks in hooks.py
  → extend_doctype_class for Patient Appointment → QueueMixin
  → scheduler_events for release job
  → require_type_annotated_api_methods = 1
  → bench --site [site] migrate

Step 6: Build scheduler.py
  → release_prebooked_slots()
  → Test: bench --site [site] execute clinic_flow.queue.scheduler.release_prebooked_slots

Step 7: Build API layer (all with full type annotations)
  → clinic_flow/api/queue.py
      (call_next, recall_patient, skip_patient, get_queue_state,
       get_active_session_for_user, get_queue_state_for_display)
  → clinic_flow/api/patient_data.py (get_patient_summary + helpers)
  → clinic_flow/api/workspace.py (get_workspace_payload, save_encounter_draft, submit_encounter)

Step 8: Doctor Workspace Page
  → Create Page DocType record / JSON at clinic_flow/clinic_flow/page/doctor_workspace/
  → Build doctor_workspace.js (HTML + DoctorWorkspace class)
  → Test: navigate to /app/doctor-workspace as a Healthcare Practitioner user

Step 9: TV Dashboard
  → In Frappe admin: Website → Web Page → New
  → Route: queue-dashboard, no sidebar, no cache, Content Type: HTML
  → Paste full HTML from Section 8.2 into the content field
  → Test at /queue-dashboard?dept=all — verify dark theme renders, clock ticks
  → Trigger a queue update and verify token appears with animation

Step 10: Fixtures
  → bench --site [site] export-fixtures --app clinic_flow
  → Verify custom fields are exported to clinic_flow/clinic_flow/fixtures/

Step 11: Smoke test end-to-end
  → Create a Queue Session (status = Active) for today
  → Check in a Patient Appointment (set status = Checked In, set custom_queue_type)
  → Verify Queue Entry is created with correct token format (e.g. CARD-WLK-001)
  → Open Doctor Workspace → verify session loads in left panel
  → Click Call Next → verify encounter is created, patient banner appears
  → Fill symptoms + diagnosis → Save Draft → verify Patient Encounter updated in Marley
  → Submit Encounter → verify Queue Entry status = Done
  → Open TV dashboard → verify token CARD-WLK-001 appeared in the "Up Next" row
  → Click Call Next again → verify CARD-WLK-001 moves to "Now Serving" on dashboard
```

---

## 11. Known Edge Cases to Handle

1. **No active session when appointment checks in** — `on_appointment_update` must log and return silently. Do not throw.

2. **Doctor is not linked to a Practitioner record** — `get_active_session_for_user` returns None. Workspace shows a setup message, not an error.

3. **Appointment has no `custom_queue_type`** — skip Queue Entry creation. Receptionist must set the type before check-in.

4. **Duplicate Queue Entry** — before inserting, check if a `Queue Entry` already exists for this appointment in a Waiting/Called/With Doctor status. If so, skip creation.

5. **`Diagnostic Report` DocType not found** — `_get_recent_lab_results` falls back to Lab Test. Wrap in try/except (already done in spec).

6. **Submit encounter fails due to missing mandatory fields** — catch the ValidationError in `submit_encounter`, return the error message to the UI as a readable string, not a traceback.

7. **Round-robin state corruption** — if `rr_state` JSON is unparseable, reset to `{"type": "PRE_BOOKED", "remaining": 3}` silently.

---

## 12. What is Explicitly Out of Scope (Do Not Build)

- Lab return queue trigger (deferred — pending clinical team decision)
- Diagnostic Report / Observation hooks
- Billing integration
- Pharmacy / medication dispensing
- Inpatient ward management
- Any modification to Marley's core Python files
```
