# Special Overflow Admission Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend support for role-authorized special overflow admission without changing frontend flows, doctor workspace behavior, emergency semantics, or normal booking behavior.

**Architecture:** Extend the existing active admission authority, `clinic_flow/api/admission.py`, instead of creating a parallel special queue or emergency-like path. Persist overflow audit metadata on `Queue Entry`, keep special as `priority = "special"`, and preserve numeric `token_number` assignment and display-token composition. Doctor-side `Call Next Special` is already aligned because `clinic_flow/queue/engine.py::get_next_special_token()` only reads `Ready Near Doctor` entries with `priority = "special"`; this plan only adds tests to lock that boundary.

**Tech Stack:** Frappe v16, Python 3.11, native DocType JSON, whitelisted admission API with type annotations, `IntegrationTestCase`, `bench --site site1.localhost run-tests`

---

## Scope

Backend only.

In scope:

- `Queue Entry` overflow metadata fields.
- `confirm_booking()` support for special overflow authorization.
- Admission tests for full-capacity walk-in special overflow and full-quota phone special overflow.
- Admission lifecycle tests proving booked/arrived special patients are not doctor-callable until `Ready Near Doctor`.
- Optional live walk-in arrival timestamp support through a backend flag.

Out of scope:

- No `receptionist_dashboard` UI changes.
- No doctor workspace UI changes.
- No new persisted special queue.
- No emergency API changes.
- No fixed special token holding.
- No rewrite of `queue_position`, `rr_state`, or ordinary `Call Next` behavior.
- No changes inside `apps/healthcare/`.

## File Structure

- Modify: `clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json`
  - Add native metadata fields for special overflow audit.
  - Keep fields read-only so backend remains the authority.
- Modify: `clinic_flow/api/admission.py`
  - Extend `confirm_booking()` with typed optional parameters for special reason, overflow authorization, overflow reason/source, and live walk-in arrival marking.
  - Add small helper functions for capacity state, overflow validation, overflow metadata assignment, and live-arrival validation.
  - Preserve the existing normal path for non-special and in-capacity special bookings.
- Create: `clinic_flow/tests/test_special_overflow_admission.py`
  - Add focused backend integration tests for the new policy.
  - Use local test helpers copied from existing slice tests to avoid coupling the new tests to unrelated test modules.
- Do not modify: `clinic_flow/queue/engine.py`
  - Existing `get_next_special_token()` already filters `status = "Ready Near Doctor"` and `priority = "special"`; only add tests proving admission does not violate that lifecycle.
- Do not modify: `clinic_flow/api/queue.py`
  - `complete_reception()` already owns the `Ready Near Doctor` transition and accepts arbitrary `payment_mode` text such as `Free`.
- Do not modify: `clinic_flow/patches.txt`
  - Native DocType JSON migration is sufficient for new `Queue Entry` columns. No Healthcare custom field or data backfill patch is required for this backend slice.

---

### Task 1: Create the Backend Implementation Worktree

**Files:**

- Verify: `/home/raghu/frappe-bench/apps/clinic_flow`
- Create worktree path: `.worktrees/backend-special-overflow-admission`

- [ ] **Step 1: Verify the integration branch is clean**

Run from the main repo path:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git status --short --branch
git worktree list
```

Expected:

```text
## backend/receptionist-queue-refactor
/home/raghu/frappe-bench/apps/clinic_flow 3913b3b [backend/receptionist-queue-refactor]
```

- [ ] **Step 2: Create the backend-only worktree**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git worktree add .worktrees/backend-special-overflow-admission -b backend/special-overflow-admission
```

Expected:

```text
Preparing worktree (new branch 'backend/special-overflow-admission')
HEAD is now at 3913b3b docs: add special overflow admission design
```

- [ ] **Step 3: Verify isolation**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git worktree list
git status --short --branch
```

Expected:

```text
/home/raghu/frappe-bench/apps/clinic_flow                                      3913b3b [backend/receptionist-queue-refactor]
/home/raghu/frappe-bench/apps/clinic_flow/.worktrees/backend-special-overflow-admission  3913b3b [backend/special-overflow-admission]
## backend/receptionist-queue-refactor
```

- [ ] **Step 4: Continue all implementation inside the worktree**

Run all remaining commands from:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow/.worktrees/backend-special-overflow-admission
```

Do not switch branches in the main repo path.

---

### Task 2: Add Overflow Fields to Queue Entry

**Files:**

- Modify: `clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json`
- Test: `clinic_flow/tests/test_special_overflow_admission.py`

- [ ] **Step 1: Write the failing schema test**

Create `clinic_flow/tests/test_special_overflow_admission.py` with this initial content:

```python
import frappe
from frappe.tests import IntegrationTestCase


class TestSpecialOverflowAdmission(IntegrationTestCase):
    def test_queue_entry_has_overflow_audit_fields(self):
        meta = frappe.get_meta("Queue Entry")

        self.assertTrue(meta.has_field("is_overflow"))
        self.assertTrue(meta.has_field("overflow_reason"))
        self.assertTrue(meta.has_field("overflow_authorized_by"))
        self.assertTrue(meta.has_field("overflow_authorized_at"))
        self.assertTrue(meta.has_field("overflow_source"))
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_queue_entry_has_overflow_audit_fields
```

Expected: FAIL because `Queue Entry` does not yet have `is_overflow`.

- [ ] **Step 3: Add the overflow field order entries**

In `clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json`, update `field_order` immediately after `special_reason`:

```json
  "special_reason",
  "overflow_section",
  "is_overflow",
  "overflow_reason",
  "overflow_authorized_by",
  "overflow_authorized_at",
  "overflow_source",
  "special_override_by",
```

- [ ] **Step 4: Add the overflow field definitions**

In the same file, add these field objects immediately after the existing `special_reason` field object:

```json
  {
   "fieldname": "overflow_section",
   "fieldtype": "Section Break",
   "label": "Overflow Audit"
  },
  {
   "default": "0",
   "fieldname": "is_overflow",
   "fieldtype": "Check",
   "in_standard_filter": 1,
   "label": "Is Overflow",
   "read_only": 1,
   "description": "True when this booking bypassed normal/stretch capacity through explicit authorization."
  },
  {
   "fieldname": "overflow_reason",
   "fieldtype": "Small Text",
   "label": "Overflow Reason",
   "read_only": 1
  },
  {
   "fieldname": "overflow_authorized_by",
   "fieldtype": "Link",
   "label": "Overflow Authorized By",
   "options": "User",
   "read_only": 1
  },
  {
   "fieldname": "overflow_authorized_at",
   "fieldtype": "Datetime",
   "label": "Overflow Authorized At",
   "read_only": 1
  },
  {
   "fieldname": "overflow_source",
   "fieldtype": "Select",
   "label": "Overflow Source",
   "options": "\ndoctor instructed\nmanagement approval\nclose circle\nreturning special case\nother",
   "read_only": 1
  },
```

- [ ] **Step 5: Reload schema through migration**

Run:

```bash
bench --site site1.localhost migrate
```

Expected: migration completes without DocType JSON errors.

- [ ] **Step 6: Run the schema test and verify it passes**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_queue_entry_has_overflow_audit_fields
```

Expected: PASS.

- [ ] **Step 7: Commit the schema change**

Run:

```bash
git status --short
git add clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json clinic_flow/tests/test_special_overflow_admission.py
git commit -m "feat: add queue entry overflow audit fields"
```

---

### Task 3: Lock Existing Normal Capacity Behavior Before Overflow Changes

**Files:**

- Modify: `clinic_flow/tests/test_special_overflow_admission.py`
- No implementation changes in this task.

- [ ] **Step 1: Add helpers and normal-capacity guard tests**

Replace `clinic_flow/tests/test_special_overflow_admission.py` with:

```python
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestSpecialOverflowAdmission(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")
        config = frappe.get_single("Slot Partition Config")
        config.phone_pct = 60
        config.save(ignore_permissions=True)

    def test_queue_entry_has_overflow_audit_fields(self):
        meta = frappe.get_meta("Queue Entry")

        self.assertTrue(meta.has_field("is_overflow"))
        self.assertTrue(meta.has_field("overflow_reason"))
        self.assertTrue(meta.has_field("overflow_authorized_by"))
        self.assertTrue(meta.has_field("overflow_authorized_at"))
        self.assertTrue(meta.has_field("overflow_source"))

    def test_normal_walkin_booking_still_rejects_when_stretch_capacity_is_full(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
            )

    def test_normal_phone_booking_still_rejects_when_phone_quota_is_full(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=4)
        self.make_booked_entry(session, token_number=1, channel="phone")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="phone",
                load_class="non_review_load",
            )

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Special",
            "last_name": f"Overflow {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_service_point(self):
        code = f"SO{frappe.generate_hash(length=5).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Special Overflow {code}",
            "category": "consult",
            "is_active": 1,
        }).insert(ignore_permissions=True)

    def make_practitioner(self):
        return frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"Overflow Prac {frappe.generate_hash(length=4)}",
            "gender": "Male",
        }).insert(ignore_permissions=True)

    def make_basic_user(self):
        email = f"overflow-{frappe.generate_hash(length=8)}@example.com"
        return frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Overflow",
            "last_name": "User",
            "enabled": 1,
            "send_welcome_email": 0,
        }).insert(ignore_permissions=True)

    def make_queue_session(self, planned_capacity: int = 2, stretch_capacity: int = 2, status: str = "Scheduled"):
        sp = self.make_service_point()
        practitioner = self.make_practitioner()
        return frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"Special Overflow Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": planned_capacity,
            "planned_capacity": planned_capacity,
            "stretch_capacity": stretch_capacity,
            "status": status,
        }).insert(ignore_permissions=True)

    def make_booked_entry(
        self,
        session,
        token_number: int,
        channel: str = "walkin",
        priority: str = "normal",
        status: str = "Booked",
    ):
        patient = self.make_patient()
        entry = frappe.get_doc({
            "doctype": "Queue Entry",
            "queue_session": session.name,
            "patient": patient.name,
            "practitioner": session.practitioner,
            "dept_abbr": session.dept_abbr,
            "token_number": token_number,
            "token": f"{session.dept_abbr}-{token_number:03d}",
            "queue_position": token_number,
            "channel": channel,
            "load_class": "non_review_load",
            "patient_type": "new",
            "priority": priority,
            "queue_type": "PRE_BOOKED" if channel == "phone" else "WALK_IN",
            "status": status,
            "issued_by": frappe.session.user,
            "issued_by_role": "Queue Manager",
        }).insert(ignore_permissions=True)

        counter_field = "phone_booked_count" if channel == "phone" else "walkin_count"
        current_count = frappe.db.get_value("Queue Session", session.name, counter_field) or 0
        frappe.db.set_value("Queue Session", session.name, counter_field, current_count + 1)
        return entry
```

- [ ] **Step 2: Run the guard tests and verify they pass before behavior changes**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission
```

Expected: PASS. These tests lock existing normal capacity rejection behavior.

- [ ] **Step 3: Commit the guard tests**

Run:

```bash
git status --short
git add clinic_flow/tests/test_special_overflow_admission.py
git commit -m "test: lock normal admission capacity boundaries"
```

---

### Task 4: Add Special Walk-In Overflow Authorization

**Files:**

- Modify: `clinic_flow/tests/test_special_overflow_admission.py`
- Modify: `clinic_flow/api/admission.py`

- [ ] **Step 1: Add failing walk-in overflow tests**

Add these methods to `TestSpecialOverflowAdmission` after the normal capacity tests:

```python
    def test_special_walkin_without_overflow_authorization_rejects_when_stretch_capacity_is_full(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
                is_special=True,
            )

    def test_special_walkin_overflow_requires_reason_and_source(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
                is_special=True,
                authorize_overflow=True,
                overflow_source="doctor instructed",
            )

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
                is_special=True,
                authorize_overflow=True,
                overflow_reason="Doctor requested add-on",
            )

    def test_special_walkin_overflow_records_audit_and_assigns_next_numeric_token(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            special_reason="Known special case",
            authorize_overflow=True,
            overflow_reason="Doctor requested add-on",
            overflow_source="doctor instructed",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        refreshed_session = frappe.get_doc("Queue Session", session.name)

        self.assertEqual(result["token_number"], 3)
        self.assertEqual(entry.token_number, 3)
        self.assertEqual(entry.queue_position, 3)
        self.assertEqual(entry.priority, "special")
        self.assertEqual(entry.channel, "walkin")
        self.assertEqual(entry.is_overflow, 1)
        self.assertEqual(entry.overflow_reason, "Doctor requested add-on")
        self.assertEqual(entry.overflow_source, "doctor instructed")
        self.assertEqual(entry.overflow_authorized_by, frappe.session.user)
        self.assertIsNotNone(entry.overflow_authorized_at)
        self.assertEqual(entry.special_reason, "Known special case")
        self.assertEqual(refreshed_session.walkin_count, 3)
        self.assertEqual(refreshed_session.stretch_capacity, 2)

    def test_special_overflow_requires_queue_manager_or_system_manager_role(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()
        user = self.make_basic_user()

        try:
            frappe.set_user(user.name)
            with self.assertRaises(frappe.PermissionError):
                frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                    queue_session=session.name,
                    patient=patient.name,
                    channel="walkin",
                    load_class="non_review_load",
                    is_special=True,
                    authorize_overflow=True,
                    overflow_reason="Unauthorized attempt",
                    overflow_source="other",
                )
        finally:
            frappe.set_user("Administrator")
```

- [ ] **Step 2: Run the walk-in overflow tests and verify they fail**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_walkin_without_overflow_authorization_rejects_when_stretch_capacity_is_full
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_walkin_overflow_requires_reason_and_source
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_walkin_overflow_records_audit_and_assigns_next_numeric_token
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_overflow_requires_queue_manager_or_system_manager_role
```

Expected: at least the audit test fails because `confirm_booking()` does not accept `authorize_overflow`, `overflow_reason`, or `overflow_source` yet.

- [ ] **Step 3: Extend the `confirm_booking()` signature**

In `clinic_flow/api/admission.py`, update the function signature at `confirm_booking()`:

```python
def confirm_booking(
    queue_session: str,
    patient: str,
    channel: str,
    load_class: str,
    guardian: str | None = None,
    notes: str = "",
    token_number: int | None = None,
    is_special: bool = False,
    special_reason: str = "",
    authorize_overflow: bool = False,
    overflow_reason: str = "",
    overflow_source: str = "",
    mark_arrived: bool = False,
    weight: float | None = None,
    complaint: str | None = None,
    age_at_visit: str | None = None,
) -> dict:
```

- [ ] **Step 4: Normalize new inputs after existing normalization**

In `confirm_booking()`, immediately after `is_special = bool(is_special)`, add:

```python
    special_reason = (special_reason or "").strip()
    authorize_overflow = bool(authorize_overflow)
    overflow_reason = (overflow_reason or "").strip()
    overflow_source = (overflow_source or "").strip()
    mark_arrived = bool(mark_arrived)
```

- [ ] **Step 5: Replace the inline capacity check with capacity state**

Replace the current `# Capacity check` block with:

```python
    capacity_state = _get_booking_capacity_state(
        session_doc=session_doc,
        channel=channel,
        phone_quota=phone_quota,
    )
    is_overflow = _validate_booking_capacity(
        channel=channel,
        is_special=is_special,
        authorize_overflow=authorize_overflow,
        overflow_reason=overflow_reason,
        overflow_source=overflow_source,
        capacity_state=capacity_state,
    )

    if mark_arrived and channel != "walkin":
        frappe.throw(_("Only walk-in bookings can be marked arrived during admission."))
```

- [ ] **Step 6: Add capacity and overflow helpers**

Add these helper functions above `_parse_special_positions()`:

```python
def _get_booking_capacity_state(session_doc, channel: str, phone_quota: int) -> dict:
    """Return the current capacity state for the requested booking channel."""
    planned = int(session_doc.planned_capacity or 0)
    stretch = int(session_doc.stretch_capacity or planned)
    phone_booked = int(session_doc.phone_booked_count or 0)
    walkin_booked = int(session_doc.walkin_count or 0)
    total_booked = phone_booked + walkin_booked

    if channel == "phone":
        return {
            "is_full": phone_booked >= phone_quota,
            "message": _("Phone booking quota ({0}) is full for this session.").format(phone_quota),
            "planned_capacity": planned,
            "stretch_capacity": stretch,
            "phone_quota": phone_quota,
            "booked": phone_booked,
            "total_booked": total_booked,
        }

    return {
        "is_full": total_booked >= stretch,
        "message": _("Session is full ({0}/{1} booked).").format(total_booked, stretch),
        "planned_capacity": planned,
        "stretch_capacity": stretch,
        "phone_quota": phone_quota,
        "booked": walkin_booked,
        "total_booked": total_booked,
    }


def _validate_booking_capacity(
    channel: str,
    is_special: bool,
    authorize_overflow: bool,
    overflow_reason: str,
    overflow_source: str,
    capacity_state: dict,
) -> bool:
    """Validate booking capacity. Returns True when special overflow is used."""
    if not capacity_state.get("is_full"):
        return False

    if not is_special:
        frappe.throw(capacity_state.get("message") or _("Session is full."))

    if not authorize_overflow:
        frappe.throw(_("Special overflow requires authorization because capacity is full."))

    frappe.only_for(["Queue Manager", "System Manager"])

    if not overflow_reason:
        frappe.throw(_("Overflow reason is required."))
    if not overflow_source:
        frappe.throw(_("Overflow source is required."))

    return True
```

- [ ] **Step 7: Pass special reason and overflow metadata during entry creation**

Replace:

```python
    _set_special_queue_entry_fields(entry, is_special=is_special)
    entry.status         = "Booked"
```

With:

```python
    _set_special_queue_entry_fields(entry, is_special=is_special, reason=special_reason)
    _set_overflow_queue_entry_fields(
        entry,
        is_overflow=is_overflow,
        reason=overflow_reason,
        source=overflow_source,
    )
    entry.status = "Arrived" if mark_arrived else "Booked"
    if mark_arrived:
        entry.arrived_at = now_datetime()
```

- [ ] **Step 8: Add the overflow metadata helper**

Add this helper immediately after `_set_special_queue_entry_fields()`:

```python
def _set_overflow_queue_entry_fields(
    entry,
    is_overflow: bool = False,
    reason: str = "",
    source: str = "",
) -> None:
    """Persist overflow audit metadata when a special booking bypasses capacity."""
    if not is_overflow:
        return
    meta = frappe.get_meta("Queue Entry")
    field_map = {
        "is_overflow": 1,
        "overflow_reason": reason,
        "overflow_authorized_by": frappe.session.user,
        "overflow_authorized_at": now_datetime(),
        "overflow_source": source,
    }
    for fieldname, value in field_map.items():
        if meta.has_field(fieldname):
            setattr(entry, fieldname, value)
```

- [ ] **Step 9: Add overflow response fields**

In the returned dict from `confirm_booking()`, after `"is_special": is_special,`, add:

```python
        "is_overflow":           is_overflow,
        "overflow_source":      overflow_source if is_overflow else "",
```

- [ ] **Step 10: Run the walk-in overflow tests and verify they pass**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_walkin_without_overflow_authorization_rejects_when_stretch_capacity_is_full
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_walkin_overflow_requires_reason_and_source
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_walkin_overflow_records_audit_and_assigns_next_numeric_token
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_overflow_requires_queue_manager_or_system_manager_role
```

Expected: PASS.

- [ ] **Step 11: Run existing admission tests to verify normal behavior stayed intact**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice2_admission_semantics
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice2_receptionist_paths
```

Expected: PASS.

- [ ] **Step 12: Commit the walk-in overflow behavior**

Run:

```bash
git status --short
git add clinic_flow/api/admission.py clinic_flow/tests/test_special_overflow_admission.py
git commit -m "feat: support authorized walkin special overflow"
```

---

### Task 5: Add Phone Special Overflow While Keeping Channel Intact

**Files:**

- Modify: `clinic_flow/tests/test_special_overflow_admission.py`
- Modify only if tests fail: `clinic_flow/api/admission.py`

- [ ] **Step 1: Add the failing phone overflow test**

Add this method after the walk-in overflow tests:

```python
    def test_special_phone_overflow_keeps_phone_channel_and_records_audit(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=4)
        self.make_booked_entry(session, token_number=1, channel="phone")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="phone",
            load_class="review_load",
            is_special=True,
            special_reason="Management approved phone special",
            authorize_overflow=True,
            overflow_reason="Phone quota already full",
            overflow_source="management approval",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        refreshed_session = frappe.get_doc("Queue Session", session.name)

        self.assertEqual(entry.channel, "phone")
        self.assertEqual(entry.queue_type, "PRE_BOOKED")
        self.assertEqual(entry.load_class, "review_load")
        self.assertEqual(entry.priority, "special")
        self.assertEqual(entry.is_overflow, 1)
        self.assertEqual(entry.overflow_reason, "Phone quota already full")
        self.assertEqual(entry.overflow_source, "management approval")
        self.assertEqual(refreshed_session.phone_booked_count, 2)
        self.assertEqual(refreshed_session.walkin_count, 0)
```

- [ ] **Step 2: Run the phone overflow test**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_phone_overflow_keeps_phone_channel_and_records_audit
```

Expected: PASS if Task 4 generalized the helper correctly. If it fails, fix only `clinic_flow/api/admission.py` capacity helper logic so `channel == "phone"` uses `phone_booked_count >= phone_quota` and does not convert the booking to walk-in.

- [ ] **Step 3: Run all special overflow tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission
```

Expected: PASS.

- [ ] **Step 4: Commit the phone overflow coverage**

Run:

```bash
git status --short
git add clinic_flow/api/admission.py clinic_flow/tests/test_special_overflow_admission.py
git commit -m "test: cover phone special overflow admission"
```

---

### Task 6: Add In-Capacity Special and Live Walk-In Arrival Behavior

**Files:**

- Modify: `clinic_flow/tests/test_special_overflow_admission.py`
- Modify only if tests fail: `clinic_flow/api/admission.py`

- [ ] **Step 1: Add in-capacity special test**

Add this method:

```python
    def test_special_booking_within_stretch_capacity_is_not_overflow(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=3)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            special_reason="Close circle",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])

        self.assertEqual(entry.priority, "special")
        self.assertEqual(entry.is_overflow, 0)
        self.assertFalse(entry.overflow_reason)
        self.assertFalse(entry.overflow_source)
        self.assertEqual(entry.special_reason, "Close circle")
```

- [ ] **Step 2: Add live walk-in arrival test**

Add this method:

```python
    def test_live_special_walkin_overflow_can_record_arrival_without_readying_patient(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1, status="Active")
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            special_reason="Doctor requested live add-on",
            authorize_overflow=True,
            overflow_reason="Doctor requested live add-on",
            overflow_source="doctor instructed",
            mark_arrived=True,
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])

        self.assertEqual(entry.status, "Arrived")
        self.assertIsNotNone(entry.arrived_at)
        self.assertNotEqual(entry.status, "Ready Near Doctor")
        self.assertFalse(entry.reception_done_at)
```

- [ ] **Step 3: Add phone arrival guard test**

Add this method:

```python
    def test_phone_special_overflow_cannot_be_marked_arrived_during_booking(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=4)
        self.make_booked_entry(session, token_number=1, channel="phone")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="phone",
                load_class="non_review_load",
                is_special=True,
                authorize_overflow=True,
                overflow_reason="Phone quota full",
                overflow_source="management approval",
                mark_arrived=True,
            )
```

- [ ] **Step 4: Run the new tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_special_booking_within_stretch_capacity_is_not_overflow
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_live_special_walkin_overflow_can_record_arrival_without_readying_patient
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_phone_special_overflow_cannot_be_marked_arrived_during_booking
```

Expected: PASS if Task 4 implemented `mark_arrived` and overflow state correctly. If the phone guard raises a generic validation exception with the expected failure type, keep it; do not overfit the message.

- [ ] **Step 5: Commit live-arrival behavior coverage**

Run:

```bash
git status --short
git add clinic_flow/api/admission.py clinic_flow/tests/test_special_overflow_admission.py
git commit -m "feat: support live special walkin arrival marking"
```

---

### Task 7: Lock Doctor Eligibility Boundary Without Changing Doctor Code

**Files:**

- Modify: `clinic_flow/tests/test_special_overflow_admission.py`
- No implementation changes expected.

- [ ] **Step 1: Add tests proving booked/arrived special patients are not doctor-callable**

Add these methods:

```python
    def test_call_next_special_does_not_call_booked_special_overflow(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1, status="Active")
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()

        frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            authorize_overflow=True,
            overflow_reason="Doctor requested add-on",
            overflow_source="doctor instructed",
        )

        result = frappe.get_attr("clinic_flow.api.queue.call_next_special")(session.name)

        self.assertEqual(result["status"], "empty")

    def test_call_next_special_does_not_call_arrived_special_overflow_before_reception(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1, status="Active")
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()

        frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            authorize_overflow=True,
            overflow_reason="Doctor requested live add-on",
            overflow_source="doctor instructed",
            mark_arrived=True,
        )

        result = frappe.get_attr("clinic_flow.api.queue.call_next_special")(session.name)

        self.assertEqual(result["status"], "empty")
```

- [ ] **Step 2: Run the eligibility boundary tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_call_next_special_does_not_call_booked_special_overflow
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_call_next_special_does_not_call_arrived_special_overflow_before_reception
```

Expected: PASS without changing `clinic_flow/queue/engine.py` or `clinic_flow/api/queue.py`.

- [ ] **Step 3: Commit the lifecycle boundary tests**

Run:

```bash
git status --short
git add clinic_flow/tests/test_special_overflow_admission.py
git commit -m "test: lock special overflow doctor eligibility boundary"
```

---

### Task 8: Final Backend Verification and Graph Update

**Files:**

- Verify: `clinic_flow/api/admission.py`
- Verify: `clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json`
- Verify: `clinic_flow/tests/test_special_overflow_admission.py`
- Update generated graph output if `graphify update .` modifies tracked files.

- [ ] **Step 1: Run the focused backend test suite**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice2_admission_semantics
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice2_receptionist_paths
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_healthcare_compatibility
```

Expected: all commands PASS.

- [ ] **Step 2: Run migration verification**

Run:

```bash
bench --site site1.localhost migrate
```

Expected: migration completes without errors and the new `Queue Entry` fields exist.

- [ ] **Step 3: Update the graph after code changes**

Run:

```bash
graphify update .
```

Expected: graph update completes. If it changes tracked files, review and commit them with the backend slice only if they are expected graph artifacts for this repo.

- [ ] **Step 4: Review the branch diff**

Run:

```bash
git status --short
git diff --stat backend/receptionist-queue-refactor..HEAD
git log --oneline backend/receptionist-queue-refactor..HEAD
```

Expected changed files:

```text
clinic_flow/api/admission.py
clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json
clinic_flow/tests/test_special_overflow_admission.py
```

- [ ] **Step 5: Commit graph artifacts only if needed**

If `graphify update .` produced tracked graph changes, run:

```bash
git add graphify-out
git commit -m "chore: update graph after special overflow backend changes"
```

If `graphify-out/` remains untracked or ignored, do not force-add it.

- [ ] **Step 6: Prepare integration review from the main repo path**

Run from the main repo path:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git log --oneline backend/receptionist-queue-refactor..backend/special-overflow-admission
git diff --stat backend/receptionist-queue-refactor..backend/special-overflow-admission
```

Expected: only backend slice commits appear.

---

## Self-Review Notes

- Spec coverage: The plan covers overflow fields, role-based authorization, mandatory reason/source, special priority, phone/walk-in channel preservation, numeric token assignment beyond capacity, live walk-in arrival marking, status lifecycle, and tests for full-capacity walk-in plus full-quota phone special overflow.
- Deferred by scope: Frontend prompts, optional slip printing, and receptionist dashboard indicators are intentionally excluded from this backend-only slice.
- Doctor-side behavior: The plan does not modify doctor dequeue code because current `get_next_special_token()` already filters `Ready Near Doctor` special entries; Task 7 adds regression tests around that boundary.
- Type consistency: New API parameters are `special_reason: str`, `authorize_overflow: bool`, `overflow_reason: str`, `overflow_source: str`, and `mark_arrived: bool`; the same names are used in tests and helper calls.
- Placeholder scan: No implementation step depends on undefined functions without including the intended code snippet in the same task.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-25-special-overflow-admission-backend.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
