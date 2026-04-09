# ONBOARDING.md — Clinic Flow
Quick-start guide for new developers.

---

## What Is This?

`clinic_flow` is a Frappe v16 app that adds queue management to Marley Healthcare. It runs alongside the `healthcare` app on the same Frappe site and never modifies Marley's source code.

**Three things it does:**
1. Receptionists book appointments and check patients in → patients get a queue token
2. Doctors call patients in priority order from their workspace → a Patient Encounter is created
3. A TV in the waiting room shows the current and upcoming tokens in real time

---

## Prerequisites

- Frappe bench already set up with `healthcare` installed
- Python 3.11+ (the app uses `X | Y` union type syntax)
- `bench start` running on the dev machine
- Site: `http://site1.localhost:8000`

---

## First-Time Setup

### 1. Install the app

```bash
cd ~/frappe-bench
bench get-app clinic_flow /path/to/repo
bench --site site1.localhost install-app clinic_flow
bench --site site1.localhost migrate
```

### 2. Verify installation

```bash
bench --site site1.localhost list-apps
# Expected: frappe, healthcare, clinic_flow
```

### 3. One-time data setup (do this in the Frappe desk)

These must be configured before anything works end-to-end:

| Where | What to set | Example |
|---|---|---|
| Medical Department | `custom_dept_abbr` | CARD, PED, GEN |
| Appointment Type | `custom_queue_code` | PRE, WLK, FLW, EMR |
| Healthcare Practitioner | `user_id` | Link to the doctor's Frappe user |
| Practitioner Schedule | Time slots with `maximum_appointments` | Mon–Fri 08:00–12:00, capacity 20 |

Check the Slot Partition Config (already has defaults):
```
Slot Partition Config → PRE_BOOKED 60%, WALK_IN 30%, FOLLOW_UP 10%
```

### 4. Assign roles

| Role | Assign to |
|---|---|
| `Physician` or `Healthcare Practitioner` | Doctors |
| `Queue Manager` | Receptionists |
| `Queue Viewer` | TV display accounts |

---

## Running the App

```bash
cd ~/frappe-bench
bench start          # starts all services (web, worker, scheduler, redis)
```

| URL | Who uses it |
|---|---|
| `http://site1.localhost:8000/doctor-workspace` | Doctors (auto-redirect on login) |
| `http://site1.localhost:8000/receptionist-workspace` | Receptionists |
| `http://site1.localhost:8000/queue-dashboard` | Waiting room TV (public) |
| `http://site1.localhost:8000/queue-dashboard?dept=CARD` | Single-dept TV |

---

## The 5-Minute End-to-End Test

Run this to verify everything is wired up correctly.

**Step 1 — Doctor starts a session**
1. Login as a doctor → auto-redirected to Doctor Workspace
2. Click "Start Consultation Session" → select today's schedule → confirm
3. The queue panel on the left should show the session name

**Step 2 — Receptionist checks in a patient**
1. Login as receptionist → open `/receptionist-workspace`
2. Select the same practitioner + queue type "Standard" (PRE_BOOKED)
3. Session slot cards appear → click "Book" on the first one
4. Search for a patient by mobile number
5. Payment step → enter any amount → click "Check In"
6. Token appears on the done screen (e.g. `GEN-PRE-001`)

**Step 3 — Doctor calls the patient**
1. Back in the Doctor Workspace → click "Call Next"
2. Patient banner appears with the token
3. Edit symptoms → click "Submit Encounter"
4. Queue entry disappears from the list

**Step 4 — TV dashboard updates**
1. Open `http://site1.localhost:8000/queue-dashboard` in a new tab
2. After clicking "Call Next" in step 3, the TV should update within 1 second

If all four steps work, the system is healthy.

---

## Codebase Tour

```
apps/clinic_flow/clinic_flow/
│
├── hooks.py                  ← start here; all hook registrations
│
├── api/                      ← all @frappe.whitelist() endpoints
│   ├── appointments.py       ← booking, search, payment, check-in
│   ├── queue.py              ← session lifecycle, call-next
│   ├── workspace.py          ← encounter save/submit, workspace payload
│   ├── patient_data.py       ← patient summary (internal, not whitelisted)
│   └── boot.py               ← login redirect hook
│
├── queue/                    ← pure queue logic
│   ├── engine.py             ← token building, round-robin, realtime broadcast
│   ├── appointment_mixin.py  ← extends Patient Appointment
│   └── scheduler.py          ← slot release cron job
│
├── clinic_flow/
│   ├── doctype/
│   │   ├── queue_session/    ← Queue Session DocType
│   │   ├── queue_entry/      ← Queue Entry DocType
│   │   └── slot_partition_config/ ← global config (Single)
│   │
│   └── page/
│       ├── doctor_workspace/        ← doctor UI (JS + JSON)
│       └── receptionist_workspace/  ← receptionist UI (JS + JSON)
│
└── www/
    ├── queue-dashboard.html  ← TV dashboard (standalone, no Frappe JS)
    └── queue-dashboard.py    ← sets no_cache/no_header
```

**Tip:** Read `queue/appointment_mixin.py` first. It's the heart of the system — it's what turns a Patient Appointment check-in into a queue token.

---

## Common Development Tasks

### Add a new API endpoint

1. Add function to the appropriate `api/` module
2. Decorate with `@frappe.whitelist()`
3. Include **complete** type annotations (v16 requirement):
   ```python
   @frappe.whitelist()
   def my_new_fn(patient: str, amount: float = 0.0) -> dict:
       ...
   ```
4. Call from JS: `frappe.call({ method: 'clinic_flow.api.appointments.my_new_fn', args: {...} })`

### Add a custom field to an existing DocType

1. In Frappe desk: Customise Form → add field → set **Module** to `Clinic Flow`
2. Export fixtures:
   ```bash
   bench --site site1.localhost export-fixtures --app clinic_flow
   ```
3. Commit the updated file in `clinic_flow/fixtures/`

### Add a patch (data migration)

1. Create `clinic_flow/patches/YYYYMMDD_describe_change.py`
2. Write an `execute()` function:
   ```python
   import frappe

   def execute():
       # idempotent migration SQL here
       frappe.db.sql("UPDATE ... SET ...")
   ```
3. Register in `patches.txt` under `[post_model_sync]`:
   ```
   clinic_flow.patches.YYYYMMDD_describe_change
   ```
4. `bench --site site1.localhost migrate`

### Trigger the slot-release job manually

```bash
bench --site site1.localhost execute clinic_flow.queue.scheduler.release_prebooked_slots
```

### Open a bench console to inspect live data

```bash
bench --site site1.localhost console
```
```python
# Check slot config
frappe.get_single("Slot Partition Config").as_dict()

# See today's sessions
frappe.get_all("Queue Session", filters={"session_date": frappe.utils.today()}, fields=["*"])

# Check a specific token
frappe.get_all("Queue Entry", filters={"token": "CARD-WLK-003"}, fields=["*"])
```

---

## Key Concepts to Understand Before Writing Code

### The check-in trigger
`Patient Appointment.status = "Checked In"` → `doc.save()` → `QueueMixin.on_update()` → `Queue Entry` created. This chain must be triggered via `doc.save()`, not `frappe.db.set_value`.

### Queue position is day-wide
All position and sequence numbers span every session for a practitioner on a given date. If you see a position query that filters by a single session, it's probably wrong.

### Walk-in slots are today-only
`get_availability()` uses `scan_days = 1` for `WALK_IN`. Attempting to book a walk-in for a future date will return no slots.

### FOLLOW_UP quota is stored in `emergency_total`/`emergency_used`
This is a naming mismatch in the Queue Session schema. The fields were originally designed for Emergency but now hold Follow-up quota. EMERGENCY appointments have no quota — they always bypass the queue.

### Extending Patient Appointment
Use `extend_doctype_class` in `hooks.py` — not `doc_events`. See `queue/appointment_mixin.py` for the pattern. Always call `super()` first.

---

## Debugging Tips

### Check if `on_update` fired
```bash
bench --site site1.localhost console
```
```python
# Did a Queue Entry get created?
frappe.get_all("Queue Entry", filters={"appointment": "PA-XXXXX"}, fields=["*"])

# Is the token written back?
frappe.db.get_value("Patient Appointment", "PA-XXXXX", "custom_queue_token")
```

### Check the scheduler ran
```bash
bench --site site1.localhost show-pending-jobs
# Or look at frappe logs:
tail -f ~/frappe-bench/logs/worker.error.log
```

### Check Error Log in desk
Setup → Error Log → filter by `clinic_flow:` prefix.

### Realtime not updating the TV?
1. Confirm `bench start` includes the Socket.io server (you should see `socketio` in the output)
2. Open browser console on `/queue-dashboard` — look for WebSocket connection errors
3. The dashboard falls back to polling every 6 s — check network tab for `/api/method/clinic_flow.api.queue.get_queue_state_for_display` requests

### Session not found on doctor workspace
The workspace stores the session in `localStorage`. If the session expired or was deleted:
```javascript
// Open browser console on /doctor-workspace
localStorage.removeItem('clinic_flow_session')
// Then reload
```

---

## What You Must NOT Do

- **Do not edit files in `apps/healthcare/`** — use `extend_doctype_class` instead
- **Do not omit type annotations** on `@frappe.whitelist()` functions — they will be rejected
- **Do not use `frappe.get_all` with `ORDER BY FIELD()`** — use `frappe.db.sql`
- **Do not use `frappe.db.set_value` to set `status = "Checked In"`** on appointments — the Queue Entry will not be created
- **Do not use `document.getElementById`** in desk page JS — use `$(this.wrapper).find('#id')`

---

## Reference

| Document | Purpose |
|---|---|
| `AGENTS.md` | Concise rules for AI coding agents |
| `ARCHITECTURE.md` | System design, data model, core workflows |
| `clinic_flow_spec.md` (bench root) | Original queue management specification |
| `CLAUDE.md` (bench root) | Development rules for Claude Code |
