# AGENTS.md — Clinic Flow
Rules for AI coding agents (Codex, Claude Code, etc.) working on this codebase.

---

## Identity

- App: `clinic_flow` | Framework: Frappe v16 | Base app: `healthcare` (Marley)
- Site: `http://site1.localhost:8000`
- Branch: `version-16`
- Python: 3.11+ (union types `X | Y` in annotations required)

---

## Absolute Rules

### Never modify the base app
- Zero edits to any file inside `apps/healthcare/`
- Use `extend_doctype_class` (not `doc_events`) to add behaviour to existing DocTypes
- Add new fields via `Custom Field` fixtures tagged `module = "Clinic Flow"`

### Always use type annotations on whitelisted functions
```python
# CORRECT
@frappe.whitelist()
def my_fn(patient: str, amount: float) -> dict:

# WRONG — will be rejected at registration time
@frappe.whitelist()
def my_fn(patient, amount):
```
`require_type_annotated_api_methods = 1` is set in `hooks.py`.

### Never use `frappe.get_all` with `ORDER BY FIELD()`
Frappe v16 sanitises `order_by` and rejects `FIELD()`. Use `frappe.db.sql` for custom sort priority.
```python
# CORRECT
rows = frappe.db.sql("""
    SELECT name, status FROM `tabQueue Session`
    WHERE practitioner = %s
    ORDER BY FIELD(status, 'Active', 'Paused', 'Completed')
""", (practitioner,), as_dict=True)

# WRONG — raises exception
rows = frappe.get_all("Queue Session", order_by="FIELD(status,'Active','Paused')")
```

### Never switch `record_payment_and_checkin` to `frappe.db.set_value`
`doc.save()` is intentional — it triggers `QueueMixin.on_update()` which creates the Queue Entry and issues the token. Using `frappe.db.set_value` silently breaks the entire check-in flow.

### Never use `document.getElementById` in desk page JS
Frappe desk pages require jQuery scoped to the wrapper:
```javascript
// CORRECT
$(this.wrapper).find('#my-element')

// WRONG — may find elements from other pages or fail entirely
document.getElementById('my-element')
```

---

## Key Patterns

### Extending a DocType (Frappe v16 way)
```python
# hooks.py
extend_doctype_class = {
    "Patient Appointment": ["clinic_flow.queue.appointment_mixin.QueueMixin"]
}

# appointment_mixin.py
class QueueMixin(Document):
    def on_update(self) -> None:
        super().on_update()          # always call super first
        try:
            self._clinic_flow_do_thing()
        except frappe.ValidationError:
            raise                    # re-raise user-facing errors
        except Exception:
            frappe.log_error(frappe.get_traceback(), "clinic_flow: error label")
```

### Queue Entry creation is triggered by Patient Appointment status change
The flow is: `status = "Checked In"` → `doc.save()` → `QueueMixin.on_update()` → insert `Queue Entry` → write back `custom_queue_token`.

### Token format
`DEPT-CODE-NNN` e.g. `CARD-WLK-007`
- `DEPT` = `Medical Department.custom_dept_abbr`
- `CODE` = from `Appointment Type.custom_queue_code` (PRE / WLK / FLW / EMR)
- `NNN` = zero-padded sequence, counted across ALL sessions for same practitioner+date+queue_type

### Session priority ordering (3 places in codebase)
Always: Active → Paused → Completed. Use raw SQL `FIELD()`.

### FOLLOW_UP shares walk-in counter
`FOLLOW_UP` increments `walkin_used` (not a separate field). `emergency_total`/`emergency_used` on Queue Session are actually the FOLLOW_UP quota fields (misnamed — do not rename without a data migration).

---

## What to Check Before Making Changes

| Change type | Check |
|---|---|
| Adding a queue type | Update `field_map` dicts in `appointment_mixin.py`, `engine.py`, `queue.py`; update `WEIGHTS`/`TYPE_ORDER` in `engine.get_next_token`; update `TC` object in `queue-dashboard.html` |
| Adding a field to Queue Session | Also update `_increment_session_slot` field maps if it's a counter |
| Changing `rr_state` JSON keys | Migrate all Active sessions in a patch first |
| Changing queue_position logic | Must span ALL sessions for practitioner+date, never just the current session |
| Adding a whitelisted function | Must have complete Python type annotations |
| Adding a Custom Field | Tag it `module = "Clinic Flow"` so it exports via fixtures |

---

## File Map (where things live)

```
hooks.py                           — all hook registrations (touch this rarely)
api/appointments.py                — booking, patient search, payment, check-in
api/queue.py                       — session lifecycle, call-next, state queries
api/workspace.py                   — doctor workspace payload, encounter save/submit
api/patient_data.py                — patient summary (not whitelisted; internal only)
api/boot.py                        — boot_session hook
queue/engine.py                    — token builder, sequence, round-robin
queue/appointment_mixin.py         — QueueMixin: slot limits + check-in
queue/scheduler.py                 — cron: slot release job
clinic_flow/doctype/queue_session/ — Queue Session DocType + controller
clinic_flow/doctype/queue_entry/   — Queue Entry DocType + controller
clinic_flow/doctype/slot_partition_config/ — Singleton config
clinic_flow/page/doctor_workspace/ — Doctor page JS (~900 lines)
clinic_flow/page/receptionist_workspace/ — Receptionist page JS (~1600 lines)
www/queue-dashboard.html           — TV dashboard (standalone vanilla JS)
www/queue-dashboard.py             — sets no_cache/no_header/no_sidebar
patches/                           — empty; add patches here as needed
patches.txt                        — register patches here
```

---

## Safe Operations

- Reading `Slot Partition Config` via `frappe.get_single("Slot Partition Config")`
- Adding new `@frappe.whitelist()` functions to existing `api/` modules
- Adding new panel modes to receptionist workspace JS
- Adding new collapsible sections to doctor workspace JS
- Writing patches that only use `frappe.db.sql` for data migrations

## Risky Operations — Confirm Before Proceeding

- Any change to `rr_state` JSON format
- Renaming `emergency_total` / `emergency_used` (they hold FOLLOW_UP data)
- Changing `queue_position` calculation logic
- Any edit to `QueueMixin.on_update()` or `record_payment_and_checkin()`
- Adding fields that change the slot accounting behaviour
