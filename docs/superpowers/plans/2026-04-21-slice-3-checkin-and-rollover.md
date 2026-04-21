# Slice 3: Check-In Boundary and Midnight Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make receptionist check-in the only doctor-eligibility gate, narrow the Healthcare fee-validity sync boundary, implement midnight phone-to-walkin quota release, and demote the remaining legacy appointment check-in path.

**Architecture:** Keep Clinic Flow queue-state transitions authoritative and make Healthcare appointment sync a downstream integration step. Replace the old release semantics with an explicit midnight rollover rule and remove ambiguity around legacy appointment payment/check-in APIs.

**Tech Stack:** Frappe v16, Python 3.11, desk page JS, pytest/Frappe IntegrationTestCase, Clinic Flow APIs and scheduler

---

## File Map for This Slice

- Modify: `clinic_flow/api/queue.py`
  Purpose: make receptionist check-in the only active path to `Ready Near Doctor` and keep Healthcare sync narrow.

- Modify: `clinic_flow/api/arrival.py`
  Purpose: protect arrival as operational-only, never doctor-eligibility deciding.

- Modify: `clinic_flow/queue/scheduler.py`
  Purpose: replace old near-session release behavior with explicit midnight rollover behavior.

- Modify: `clinic_flow/api/appointments.py`
  Purpose: demote or isolate legacy appointment payment/check-in path from the active runtime.

- Modify: `ARCHITECTURE.md`
  Purpose: align the architecture narrative with Slice 3 behavior.

- Add: `clinic_flow/tests/test_slice3_checkin_boundary.py`
  Purpose: verify only receptionist check-in moves patients to `Ready Near Doctor` and that Healthcare sync remains narrow.

- Add: `clinic_flow/tests/test_slice3_midnight_rollover.py`
  Purpose: verify midnight phone-to-walkin quota release behavior.

---

### Task 1: Lock the Check-In Boundary with Tests

**Files:**
- Create: `clinic_flow/tests/test_slice3_checkin_boundary.py`
- Test: `clinic_flow/tests/test_slice3_checkin_boundary.py`

- [ ] **Step 1: Write failing boundary tests**

```python
from frappe.tests import IntegrationTestCase

import frappe


class TestSlice3CheckinBoundary(IntegrationTestCase):
    def test_arrival_does_not_make_patient_ready_for_doctor(self):
        entry = self.make_booked_queue_entry()

        result = frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(entry.name)

        refreshed = frappe.get_doc("Queue Entry", entry.name)
        self.assertEqual(result["status"], "Arrived")
        self.assertEqual(refreshed.status, "Arrived")

    def test_complete_reception_moves_patient_to_ready_near_doctor(self):
        entry = self.make_called_queue_entry()

        result = frappe.get_attr("clinic_flow.api.queue.complete_reception")(
            queue_entry=entry.name,
            payment_mode="Cash",
            paid_amount=100.0,
        )

        refreshed = frappe.get_doc("Queue Entry", entry.name)
        self.assertEqual(result["status"], "Ready Near Doctor")
        self.assertEqual(refreshed.status, "Ready Near Doctor")
```

- [ ] **Step 2: Run the test file**

Run:

```bash
pytest clinic_flow/tests/test_slice3_checkin_boundary.py -v
```

Expected:

- failures should isolate any remaining ambiguity around arrival vs check-in eligibility

- [ ] **Step 3: Add minimal helpers for booked and called entries**

```python
    def make_booked_queue_entry(self):
        session = self.make_queue_session()
        patient = self.make_patient()
        entry = frappe.get_doc({
            "doctype": "Queue Entry",
            "queue_session": session.name,
            "patient": patient.name,
            "practitioner": session.practitioner,
            "token_number": 1,
            "token": f"{session.dept_abbr}-001",
            "queue_position": 1,
            "channel": "walkin",
            "load_class": "non_review_load",
            "priority": "normal",
            "status": "Booked",
        })
        entry.insert(ignore_permissions=True)
        return entry

    def make_called_queue_entry(self):
        entry = self.make_booked_queue_entry()
        frappe.db.set_value("Queue Entry", entry.name, "status", "Called")
        return frappe.get_doc("Queue Entry", entry.name)
```

- [ ] **Step 4: Re-run the boundary test file**

Run:

```bash
pytest clinic_flow/tests/test_slice3_checkin_boundary.py -v
```

Expected:

- failures now point only to real Slice 3 behavior work

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/tests/test_slice3_checkin_boundary.py
git commit -m "test: lock slice3 receptionist checkin boundary"
```

---

### Task 2: Narrow the Healthcare Sync Adapter

**Files:**
- Modify: `clinic_flow/api/queue.py`
- Test: `clinic_flow/tests/test_slice3_checkin_boundary.py`
- Test: `clinic_flow/tests/test_healthcare_compatibility.py`

- [ ] **Step 1: Separate queue-state transition from Healthcare sync in `complete_reception()`**

Keep the structure explicit in `clinic_flow/api/queue.py`:

```python
    frappe.db.set_value("Queue Entry", queue_entry, {
        "status": "Ready Near Doctor",
        "reception_done_at": now_datetime(),
    })

    if entry.appointment:
        _checkin_patient_appointment(
            appointment=entry.appointment,
            payment_mode=payment_mode,
            paid_amount=paid_amount,
        )
```

The code should clearly show:

- queue-state transition happens because Clinic Flow says so
- Healthcare sync happens afterward as a downstream integration step

- [ ] **Step 2: Tighten `_checkin_patient_appointment()` so it is obviously one-way and side-effect-bounded**

Ensure the helper:

- updates only the linked appointment
- writes payment fields
- sets status to `Checked In`
- does not touch queue state

Target shape:

```python
def _checkin_patient_appointment(appointment: str, payment_mode: str, paid_amount: float | None) -> None:
    appt = frappe.get_doc("Patient Appointment", appointment)
    if appt.status in ("Checked In", "Checked Out", "Closed", "Cancelled"):
        return
    if payment_mode:
        appt.mode_of_payment = payment_mode
    if paid_amount is not None and float(paid_amount) > 0:
        appt.paid_amount = float(paid_amount)
        appt.invoiced = 1
    appt.status = "Checked In"
    appt.save(ignore_permissions=True)
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
pytest clinic_flow/tests/test_slice3_checkin_boundary.py -v
pytest clinic_flow/tests/test_healthcare_compatibility.py -v
```

Expected:

- PASS

- [ ] **Step 4: Re-read `complete_reception()` and helper comments**

Remove any wording that implies Healthcare appointment state is authoritative for queue readiness.

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/api/queue.py
git commit -m "refactor: narrow healthcare sync boundary for receptionist checkin"
```

---

### Task 3: Implement Midnight Phone-to-Walkin Rollover

**Files:**
- Create: `clinic_flow/tests/test_slice3_midnight_rollover.py`
- Modify: `clinic_flow/queue/scheduler.py`
- Test: `clinic_flow/tests/test_slice3_midnight_rollover.py`

- [ ] **Step 1: Write failing rollover tests**

```python
from frappe.tests import IntegrationTestCase

import frappe


class TestSlice3MidnightRollover(IntegrationTestCase):
    def test_midnight_rollover_releases_unused_phone_quota_to_walkin(self):
        session = self.make_today_session(phone_booked_count=2, walkin_count=1, planned_capacity=10)

        frappe.get_attr("clinic_flow.queue.scheduler.release_phone_quota_at_midnight")()

        refreshed = frappe.get_doc("Queue Session", session.name)
        self.assertEqual(refreshed.phone_quota_released, 1)
        self.assertGreaterEqual(refreshed.walkin_total or 0, 1)

    def test_rollover_is_idempotent(self):
        session = self.make_today_session(phone_booked_count=0, walkin_count=0, planned_capacity=10)

        fn = frappe.get_attr("clinic_flow.queue.scheduler.release_phone_quota_at_midnight")
        fn()
        first = frappe.get_doc("Queue Session", session.name)
        fn()
        second = frappe.get_doc("Queue Session", session.name)

        self.assertEqual(first.walkin_total, second.walkin_total)
```

- [ ] **Step 2: Run the rollover test file**

Run:

```bash
pytest clinic_flow/tests/test_slice3_midnight_rollover.py -v
```

Expected:

- FAIL because the current scheduler still models old release behavior

- [ ] **Step 3: Replace old scheduler semantics with midnight rollover behavior**

In `clinic_flow/queue/scheduler.py`, replace the old near-session release model with an explicit, idempotent midnight release function:

```python
def release_phone_quota_at_midnight() -> None:
    sessions = frappe.get_all(
        "Queue Session",
        filters={"session_date": frappe.utils.today(), "status": ["in", ["Scheduled", "Active", "Paused"]]},
        fields=["name", "planned_capacity", "phone_booked_count", "walkin_total", "phone_quota_released"],
    )
    config = frappe.get_single("Slot Partition Config")
    phone_pct = config.phone_pct or 60

    for session in sessions:
        if session.phone_quota_released:
            continue
        phone_quota = int((session.planned_capacity or 0) * phone_pct / 100)
        unused_phone = max(0, phone_quota - (session.phone_booked_count or 0))
        frappe.db.set_value("Queue Session", session.name, {
            "walkin_total": (session.walkin_total or 0) + unused_phone,
            "phone_quota_released": 1,
        })
```

If the schema lacks `phone_quota_released`, adapt with an existing idempotence field or introduce the smallest needed field addition in a later sub-step.

- [ ] **Step 4: Run the rollover tests**

Run:

```bash
pytest clinic_flow/tests/test_slice3_midnight_rollover.py -v
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/queue/scheduler.py clinic_flow/tests/test_slice3_midnight_rollover.py
git commit -m "feat: add midnight phone quota rollover"
```

---

### Task 4: Demote the Legacy Appointment Payment/Check-In Path

**Files:**
- Modify: `clinic_flow/api/appointments.py`
- Test: `clinic_flow/tests/test_slice3_checkin_boundary.py`
- Test: `clinic_flow/tests/test_healthcare_compatibility.py`

- [ ] **Step 1: Re-label the legacy payment/check-in API as compatibility-only**

In `clinic_flow/api/appointments.py`, update `record_payment_and_checkin()` docstring and comments so it is clearly not an active receptionist path:

```python
@frappe.whitelist()
def record_payment_and_checkin(...):
    """
    Legacy compatibility path only.

    Active receptionist flow uses Clinic Flow admission -> arrival -> complete_reception.
    This helper remains only for compatibility with older appointment-centric paths.
    """
```

- [ ] **Step 2: Prevent active runtime confusion**

If feasible without breaking compatibility tests, add a clear runtime warning/log:

```python
    frappe.logger().warning("clinic_flow: legacy record_payment_and_checkin path invoked")
```

Do not let this function re-emerge as the preferred flow in docs or comments.

- [ ] **Step 3: Run targeted tests**

Run:

```bash
pytest clinic_flow/tests/test_slice3_checkin_boundary.py -v
pytest clinic_flow/tests/test_healthcare_compatibility.py -v
```

Expected:

- PASS

- [ ] **Step 4: Re-read neighboring docs/comments**

Remove any wording in `api/appointments.py` that still presents this as the active receptionist model.

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/api/appointments.py
git commit -m "docs: mark legacy appointment checkin path as compatibility only"
```

---

### Task 5: Document the Slice 3 Model

**Files:**
- Modify: `ARCHITECTURE.md`
- Test: `clinic_flow/tests/test_slice3_checkin_boundary.py`
- Test: `clinic_flow/tests/test_slice3_midnight_rollover.py`

- [ ] **Step 1: Update `ARCHITECTURE.md` with Slice 3 facts**

Add a short section:

```markdown
### Slice 3 receptionist boundary update

- Arrival is operational-only and does not make a patient doctor-eligible.
- Receptionist check-in is the only active path to `Ready Near Doctor`.
- Healthcare appointment sync is downstream of Clinic Flow queue-state changes.
- Unused phone-protected quota releases to walk-in at midnight of the session date.
- Legacy appointment payment/check-in APIs remain compatibility-only.
```

- [ ] **Step 2: Run the final Slice 3 targeted suite**

Run:

```bash
pytest clinic_flow/tests/test_slice3_checkin_boundary.py clinic_flow/tests/test_slice3_midnight_rollover.py clinic_flow/tests/test_healthcare_compatibility.py clinic_flow/tests/test_service_point.py -v
```

Expected:

- PASS

- [ ] **Step 3: Check git status for unintended files**

Run:

```bash
git status --short
```

Expected:

- only Slice 3 files are modified

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: align architecture with slice3 receptionist boundary"
```

---

## Self-Review

### Spec coverage

- receptionist check-in as only eligibility gate: covered by Tasks 1 and 2
- arrival remains operational-only: covered by Task 1
- hybrid fee-validity boundary: covered by Task 2
- midnight rollover: covered by Task 3
- legacy appointment check-in demotion: covered by Task 4
- documentation: covered by Task 5

### Placeholder scan

- no `TODO`
- no `TBD`
- commands and file paths are explicit

### Type consistency

- `Ready Near Doctor` remains the target doctor-eligibility state
- `complete_reception()` remains the active receptionist transition API
- midnight release is explicitly named and scoped to channel quota behavior

---

Plan complete and saved to `docs/superpowers/plans/2026-04-21-slice-3-checkin-and-rollover.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
