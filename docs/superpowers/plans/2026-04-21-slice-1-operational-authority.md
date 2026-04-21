# Slice 1: Operational Authority and Service Point Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Clinic Flow operationally authoritative for receptionist queue flow, formalize `Service Point` as canonical queue identity, and remove active dependence on Healthcare appointment update hooks for queue-entry creation.

**Architecture:** Keep the active receptionist UX intact while moving authority to `Queue Session` and `Queue Entry`. `Patient Appointment` remains an admission-time integration anchor, but no longer participates in queue creation or queue identity. `Service Point.queue_code` becomes the canonical queue identity and display-token source for active runtime paths.

**Tech Stack:** Frappe v16, Python 3.11, desk page JS, pytest/Frappe IntegrationTestCase, Clinic Flow DocTypes and APIs

---

## File Map for This Slice

- Modify: `clinic_flow/api/admission.py`
  Purpose: make active admission path independent of legacy queue-authority assumptions and treat `Service Point` as primary identity.

- Modify: `clinic_flow/api/queue.py`
  Purpose: ensure receptionist progression uses Clinic Flow operational state only, with Healthcare appointment sync remaining narrow and downstream.

- Modify: `clinic_flow/queue/service_point.py`
  Purpose: make canonical identity intent explicit and minimize active fallback dependence.

- Modify: `clinic_flow/queue/appointment_mixin.py`
  Purpose: disable queue-entry creation as an active authority path, while preserving temporary compatibility only if tests require it.

- Modify: `clinic_flow/hooks.py`
  Purpose: remove `extend_doctype_class` injection if replacement tests prove safe in this slice.

- Modify: `clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py`
  Purpose: stop managing Healthcare queue-identity custom fields that are no longer part of the target model.

- Modify: `ARCHITECTURE.md`
  Purpose: align active architecture doc with Slice 1 authority decisions.

- Add: `clinic_flow/tests/test_slice1_operational_authority.py`
  Purpose: integration tests for authority boundaries and active flow.

- Add: `clinic_flow/tests/test_slice1_service_point_identity.py`
  Purpose: verify canonical identity and display-token behavior.

---

### Task 1: Lock In the New Authority Model with Tests

**Files:**
- Create: `clinic_flow/tests/test_slice1_operational_authority.py`
- Test: `clinic_flow/tests/test_slice1_operational_authority.py`

- [ ] **Step 1: Write the failing authority-boundary tests**

```python
from frappe.tests import IntegrationTestCase

import frappe


class TestSlice1OperationalAuthority(IntegrationTestCase):
    def test_confirm_booking_creates_queue_entry_without_appointment_hook_dependency(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        self.assertEqual(entry.queue_session, queue_session.name)
        self.assertEqual(entry.patient, patient.name)
        self.assertEqual(entry.status, "Booked")

    def test_checking_in_patient_appointment_does_not_create_queue_entry(self):
        appointment = self.make_patient_appointment()

        appointment.status = "Checked In"
        appointment.save(ignore_permissions=True)

        rows = frappe.get_all(
            "Queue Entry",
            filters={"appointment": appointment.name},
            fields=["name"],
        )
        self.assertEqual(rows, [])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pytest clinic_flow/tests/test_slice1_operational_authority.py -v
```

Expected:

- the booking test may fail because fixtures/helpers are missing
- the appointment check-in test should fail because the current mixin still creates queue entries

- [ ] **Step 3: Add the minimal test helpers inside the test module**

```python
    def make_patient(self):
        patient = frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Slice",
            "last_name": "One",
            "sex": "Male",
            "status": "Active",
        })
        patient.insert(ignore_permissions=True)
        return patient

    def make_service_point(self):
        sp = frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": "SP1",
            "display_label": "Slice One OP",
            "category": "consult",
            "is_active": 1,
        })
        sp.insert(ignore_permissions=True)
        return sp

    def make_queue_session(self):
        sp = self.make_service_point()
        practitioner = self.make_practitioner()
        session = frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": "Slice 1 Session",
            "practitioner": practitioner.name,
            "session_date": frappe.utils.today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": 20,
            "status": "Scheduled",
        })
        session.insert(ignore_permissions=True)
        return session
```

- [ ] **Step 4: Run the focused tests again**

Run:

```bash
pytest clinic_flow/tests/test_slice1_operational_authority.py -v
```

Expected:

- only the appointment-hook-dependency test should still fail for the real Slice 1 reason

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/tests/test_slice1_operational_authority.py
git commit -m "test: lock operational authority expectations"
```

---

### Task 2: Make Service Point the Canonical Identity in Active Admission Flow

**Files:**
- Create: `clinic_flow/tests/test_slice1_service_point_identity.py`
- Modify: `clinic_flow/api/admission.py`
- Modify: `clinic_flow/queue/service_point.py`
- Test: `clinic_flow/tests/test_slice1_service_point_identity.py`

- [ ] **Step 1: Write the failing Service Point identity tests**

```python
from frappe.tests import IntegrationTestCase

import frappe


class TestSlice1ServicePointIdentity(IntegrationTestCase):
    def test_confirm_booking_builds_token_from_service_point_queue_code(self):
        queue_session = self.make_queue_session_with_service_point("PED")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        self.assertTrue(result["token"].startswith("PED-"))

    def test_active_identity_does_not_require_healthcare_department_custom_field(self):
        queue_session = self.make_queue_session_with_service_point("OPD")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        self.assertEqual(entry.token, f"OPD-{entry.token_number:03d}")
```

- [ ] **Step 2: Run the test to verify the current behavior**

Run:

```bash
pytest clinic_flow/tests/test_slice1_service_point_identity.py -v
```

Expected:

- failures or brittle fallback behavior where identity still depends on department compatibility paths

- [ ] **Step 3: Tighten `resolve_queue_code()` and active admission token building**

Update `clinic_flow/queue/service_point.py` to keep fallback behavior but make the priority explicit:

```python
def resolve_queue_code(
    service_point: str | None = None,
    dept_abbr: str | None = None,
    practitioner: str | None = None,
    department: str | None = None,
    fallback: str = "GEN",
) -> str:
    if service_point:
        code = frappe.db.get_value("Service Point", service_point, "queue_code")
        if code:
            return code.strip().upper()

    # Compatibility fallback only. Active flow should arrive with service_point.
    if dept_abbr:
        return dept_abbr.strip().upper()
```

Update `clinic_flow/api/admission.py` so `confirm_booking()` treats `session_doc.service_point` as the intended identity source and only falls back for temporary compatibility:

```python
    dept_abbr = resolve_queue_code(
        service_point=session_doc.service_point,
        dept_abbr=session_doc.dept_abbr,
        practitioner=session_doc.practitioner,
        department=session_doc.department,
        fallback="TKN",
    )
```

- [ ] **Step 4: Run the Service Point tests**

Run:

```bash
pytest clinic_flow/tests/test_slice1_service_point_identity.py -v
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/tests/test_slice1_service_point_identity.py clinic_flow/api/admission.py clinic_flow/queue/service_point.py
git commit -m "refactor: make service point canonical in active admission flow"
```

---

### Task 3: Remove Appointment-Driven Queue Creation from the Active Runtime

**Files:**
- Modify: `clinic_flow/queue/appointment_mixin.py`
- Modify: `clinic_flow/hooks.py`
- Test: `clinic_flow/tests/test_slice1_operational_authority.py`

- [ ] **Step 1: Change the mixin so it no longer creates queue entries on appointment update**

Replace the `on_update()` queue-creation behavior in `clinic_flow/queue/appointment_mixin.py` with a no-op compatibility stub:

```python
    def on_update(self) -> None:
        super().on_update()
        # Slice 1 authority change:
        # Queue Entry creation belongs to Clinic Flow admission, not
        # Patient Appointment lifecycle hooks.
        return
```

- [ ] **Step 2: Run the authority test to verify appointment save no longer creates queue entries**

Run:

```bash
pytest clinic_flow/tests/test_slice1_operational_authority.py::TestSlice1OperationalAuthority::test_checking_in_patient_appointment_does_not_create_queue_entry -v
```

Expected:

- PASS

- [ ] **Step 3: Remove the active hook injection from `hooks.py`**

Update `clinic_flow/hooks.py` to remove:

```python
extend_doctype_class = {
    "Patient Appointment": [
        "clinic_flow.queue.appointment_mixin.QueueMixin"
    ]
}
```

and replace it with a temporary comment:

```python
# Slice 1 removed Patient Appointment as a queue-authority source.
# Keep Clinic Flow queue creation inside admission and receptionist APIs.
```

- [ ] **Step 4: Run the Slice 1 authority tests again**

Run:

```bash
pytest clinic_flow/tests/test_slice1_operational_authority.py -v
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/queue/appointment_mixin.py clinic_flow/hooks.py clinic_flow/tests/test_slice1_operational_authority.py
git commit -m "refactor: remove appointment-driven queue creation authority"
```

---

### Task 4: Shrink Healthcare Queue-Customization Dependence and Update Docs

**Files:**
- Modify: `clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py`
- Modify: `ARCHITECTURE.md`
- Test: `clinic_flow/tests/test_slice1_operational_authority.py`
- Test: `clinic_flow/tests/test_slice1_service_point_identity.py`

- [ ] **Step 1: Reduce required Healthcare custom fields to only the still-needed integration fields**

Update `clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py` by removing the queue-identity and queue-type custom fields from:

- `Appointment Type`
- `Medical Department`
- `Patient Appointment`

Retain only the field that is still required for doctor/encounter integration:

```python
def get_required_healthcare_custom_fields():
    return {
        "Patient Encounter": [
            {
                "fieldname": "custom_chief_complaint",
                "label": "Chief Complaint / Symptoms",
                "fieldtype": "Long Text",
                "insert_after": "encounter_comment",
            },
        ],
    }
```

- [ ] **Step 2: Update the architecture doc to match Slice 1**

Add a short section to `ARCHITECTURE.md` stating:

```markdown
### Slice 1 authority update

- Queue Session and Queue Entry are the operational source of truth.
- Patient Appointment is an integration anchor, not a queue-authority object.
- Service Point is the canonical queue identity.
- Healthcare custom queue fields are no longer part of the target runtime design.
```

- [ ] **Step 3: Run the Slice 1 test set**

Run:

```bash
pytest clinic_flow/tests/test_slice1_operational_authority.py clinic_flow/tests/test_slice1_service_point_identity.py -v
```

Expected:

- PASS

- [ ] **Step 4: Run a broader targeted regression pass**

Run:

```bash
pytest clinic_flow/tests/test_service_point.py clinic_flow/tests/test_healthcare_compatibility.py -v
```

Expected:

- update failing tests if they encode pre-Slice-1 authority assumptions
- final result should pass with Slice 1 semantics

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/patches/v16_0/ensure_required_healthcare_custom_fields.py ARCHITECTURE.md
git commit -m "docs: align architecture and healthcare boundary with slice 1"
```

---

## Self-Review

### Spec coverage

- operational authority moved to Clinic Flow: covered by Tasks 1 and 3
- Service Point as canonical identity: covered by Task 2
- remove appointment-driven queue creation: covered by Task 3
- reduce Healthcare custom queue dependence: covered by Task 4
- preserve active receptionist flow shape: protected by authority and identity tests, while avoiding UI rewrites in Slice 1

### Placeholder scan

- no `TODO`
- no `TBD`
- commands and file paths are explicit

### Type consistency

- uses `confirm_booking()` as current admission entry point
- uses `Service Point.queue_code` as canonical token source
- uses `Queue Entry` and `Queue Session` as operational source of truth consistently

---

Plan complete and saved to `docs/superpowers/plans/2026-04-21-slice-1-operational-authority.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
