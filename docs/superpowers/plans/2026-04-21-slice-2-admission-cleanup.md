# Slice 2: Admission Flow Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up active admission logic so it matches the token-first, channel-based target model while preserving the three receptionist intake UX paths.

**Architecture:** Keep the receptionist dashboard interaction model unchanged and refactor the backend admission path around `channel`, `load_class`, `Service Point`, and admission-time token reservation. `Patient Appointment` remains created at admission, but the active admission path should stop depending on legacy queue-type mapping and Healthcare queue custom fields.

**Tech Stack:** Frappe v16, Python 3.11, desk page JS, pytest/Frappe IntegrationTestCase, Clinic Flow DocTypes and APIs

---

## File Map for This Slice

- Modify: `clinic_flow/api/admission.py`
  Purpose: remove active admission dependence on legacy `queue_type` semantics and queue-code-driven Healthcare appointment creation.

- Modify: `clinic_flow/clinic_flow/page/receptionist_dashboard/receptionist_dashboard.js`
  Purpose: keep the three intake UX flows intact and only adjust UI/backend contract details if admission payloads change.

- Modify: `ARCHITECTURE.md`
  Purpose: align the architecture narrative with Slice 2 admission semantics.

- Add: `clinic_flow/tests/test_slice2_admission_semantics.py`
  Purpose: prove active admission behavior is driven by `channel`, `load_class`, and token reservation rather than legacy queue-type concepts.

- Add: `clinic_flow/tests/test_slice2_receptionist_paths.py`
  Purpose: protect the three receptionist intake patterns at the API-contract level.

---

### Task 1: Lock the New Admission Semantics with Tests

**Files:**
- Create: `clinic_flow/tests/test_slice2_admission_semantics.py`
- Test: `clinic_flow/tests/test_slice2_admission_semantics.py`

- [ ] **Step 1: Write failing admission-semantics tests**

```python
from frappe.tests import IntegrationTestCase

import frappe


class TestSlice2AdmissionSemantics(IntegrationTestCase):
    def test_confirm_booking_reserves_capacity_by_channel(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="phone",
            load_class="review_load",
        )

        session = frappe.get_doc("Queue Session", queue_session.name)
        entry = frappe.get_doc("Queue Entry", result["queue_entry"])

        self.assertEqual(entry.channel, "phone")
        self.assertEqual(entry.load_class, "review_load")
        self.assertEqual(session.phone_booked_count, 1)

    def test_confirm_booking_assigns_token_without_needing_legacy_queue_type_concept(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        self.assertGreater(entry.token_number, 0)
        self.assertEqual(entry.status, "Booked")
```

- [ ] **Step 2: Run the new test file**

Run:

```bash
pytest clinic_flow/tests/test_slice2_admission_semantics.py -v
```

Expected:

- current tests may pass partially, but they should expose where active semantics are still explained or derived through `_legacy_queue_type()` and appointment-type coupling

- [ ] **Step 3: Add focused helpers to the test module**

Use the same style as Slice 1 helpers:

```python
    def make_patient(self):
        patient = frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Slice",
            "last_name": "Two",
            "sex": "Male",
            "status": "Active",
        })
        patient.insert(ignore_permissions=True)
        return patient

    def make_queue_session(self):
        service_point = self.make_service_point()
        practitioner = self.make_practitioner()
        session = frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": "Slice 2 Session",
            "practitioner": practitioner.name,
            "session_date": frappe.utils.today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": service_point.name,
            "dept_abbr": service_point.queue_code,
            "session_capacity": 20,
            "planned_capacity": 20,
            "stretch_capacity": 22,
            "status": "Scheduled",
        })
        session.insert(ignore_permissions=True)
        return session
```

- [ ] **Step 4: Re-run the test file**

Run:

```bash
pytest clinic_flow/tests/test_slice2_admission_semantics.py -v
```

Expected:

- failures should now isolate actual Slice 2 admission cleanup work

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/tests/test_slice2_admission_semantics.py
git commit -m "test: lock slice2 admission semantics"
```

---

### Task 2: Protect the Three Receptionist Intake Paths

**Files:**
- Create: `clinic_flow/tests/test_slice2_receptionist_paths.py`
- Modify: `clinic_flow/clinic_flow/page/receptionist_dashboard/receptionist_dashboard.js` only if contract changes require it
- Test: `clinic_flow/tests/test_slice2_receptionist_paths.py`

- [ ] **Step 1: Write path-preservation tests**

```python
from frappe.tests import IntegrationTestCase

import frappe


class TestSlice2ReceptionistPaths(IntegrationTestCase):
    def test_phone_availability_first_still_returns_ranked_sessions(self):
        sessions = frappe.get_attr("clinic_flow.api.admission.get_suggested_sessions")(
            load_class="non_review_load",
            channel="phone",
        )
        self.assertIsInstance(sessions, list)

    def test_phone_direct_booking_path_can_confirm_after_patient_lookup(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="phone",
            load_class="review_load",
        )
        self.assertIn("queue_entry", result)

    def test_walkin_token_first_path_can_confirm_booking(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            token_number=1,
        )
        self.assertEqual(result["channel"], "walkin")
```

- [ ] **Step 2: Run the receptionist-path tests**

Run:

```bash
pytest clinic_flow/tests/test_slice2_receptionist_paths.py -v
```

Expected:

- PASS or near-pass baseline that protects the existing three-path model before backend cleanup proceeds

- [ ] **Step 3: If API payload changes are required, update the dashboard narrowly**

If `clinic_flow/api/admission.py` response fields change during Slice 2, adjust only the minimum UI contract points in:

```javascript
// keep these concepts stable:
this.state.phone_flow_mode = 'availability';
this.state.phone_post_session_lookup = false;
this.state.walkin_phase = 'token_pick';
```

Do not redesign the flow layout or collapse the three intake modes.

- [ ] **Step 4: Re-run the receptionist-path tests**

Run:

```bash
pytest clinic_flow/tests/test_slice2_receptionist_paths.py -v
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/tests/test_slice2_receptionist_paths.py clinic_flow/clinic_flow/page/receptionist_dashboard/receptionist_dashboard.js
git commit -m "test: protect receptionist intake paths during slice2"
```

---

### Task 3: Remove Active Admission Dependence on Legacy Queue-Type Semantics

**Files:**
- Modify: `clinic_flow/api/admission.py`
- Test: `clinic_flow/tests/test_slice2_admission_semantics.py`
- Test: `clinic_flow/tests/test_slice2_receptionist_paths.py`

- [ ] **Step 1: Simplify `confirm_booking()` so active logic is expressed in canonical terms**

In `clinic_flow/api/admission.py`, keep:

- `channel`
- `load_class`
- token assignment
- `Service Point` queue code
- session counter updates

Demote or remove active dependence on:

- `_legacy_queue_type()`
- `patient_type` as an admission routing concept
- queue-type-first comments in `confirm_booking()`

Target structure:

```python
    priority = _canonical_priority(is_special=is_special, emergency=False)

    entry = frappe.new_doc("Queue Entry")
    entry.queue_session = queue_session
    entry.patient = patient
    entry.practitioner = session_doc.practitioner
    entry.department = session_doc.department
    entry.dept_abbr = dept_abbr
    entry.token_number = token_number
    entry.token = token_label
    entry.queue_position = token_number
    entry.load_class = load_class
    _set_canonical_queue_entry_fields(
        entry,
        channel=channel,
        load_class=load_class,
        priority=priority,
    )
```

- [ ] **Step 2: Keep any remaining `queue_type` write narrow and explicitly compatibility-only**

If downstream code still requires `entry.queue_type`, replace broad business mapping with a temporary compatibility adapter and mark it clearly:

```python
    # Compatibility-only field for neighboring runtime paths pending later slices.
    entry.queue_type = _compat_queue_type(channel=channel, load_class=load_class, priority=priority)
```

Rename `_legacy_queue_type()` to `_compat_queue_type()` if it still must exist.

- [ ] **Step 3: Run admission and receptionist-path tests**

Run:

```bash
pytest clinic_flow/tests/test_slice2_admission_semantics.py clinic_flow/tests/test_slice2_receptionist_paths.py -v
```

Expected:

- PASS

- [ ] **Step 4: Re-read `confirm_booking()` and remove stale comments**

Delete or rewrite comments that still describe active admission behavior as queue-type-driven.

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/api/admission.py
git commit -m "refactor: remove legacy queue-type semantics from active admission flow"
```

---

### Task 4: Decouple Healthcare Appointment Creation from Legacy Queue-Code Mapping

**Files:**
- Modify: `clinic_flow/api/admission.py`
- Test: `clinic_flow/tests/test_slice2_admission_semantics.py`
- Test: `clinic_flow/tests/test_healthcare_compatibility.py`

- [ ] **Step 1: Write or extend a test for admission-time Healthcare appointment creation without queue-code custom-field dependence**

Add to `clinic_flow/tests/test_slice2_admission_semantics.py`:

```python
    def test_confirm_booking_creates_patient_appointment_without_queue_code_lookup(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        self.assertTrue(entry.appointment)
        appointment = frappe.get_doc("Patient Appointment", entry.appointment)
        self.assertEqual(appointment.patient, patient.name)
```

- [ ] **Step 2: Replace queue-code-based appointment-type resolution with a standard fallback strategy**

In `_create_patient_appointment()` in `clinic_flow/api/admission.py`, remove active dependence on:

- `Appointment Type.custom_queue_code`
- queue-type code maps

Prefer:

1. an explicitly configured/default `Appointment Type` if one exists
2. otherwise first available appointment type
3. otherwise fail clearly with a log entry

Target shape:

```python
    appointment_type = frappe.db.get_value("Appointment Type", {"disabled": 0}, "name")
    if not appointment_type:
        result = frappe.db.sql("SELECT name FROM `tabAppointment Type` LIMIT 1")
        appointment_type = result[0][0] if result else None
```

Do not write queue custom fields onto the Healthcare appointment.

- [ ] **Step 3: Run targeted tests**

Run:

```bash
pytest clinic_flow/tests/test_slice2_admission_semantics.py -v
pytest clinic_flow/tests/test_healthcare_compatibility.py -v
```

Expected:

- PASS

- [ ] **Step 4: Re-read `_create_patient_appointment()` for remaining legacy coupling**

Remove comments and arguments that still frame appointment creation as queue-type-mapped behavior.

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/api/admission.py clinic_flow/tests/test_slice2_admission_semantics.py
git commit -m "refactor: decouple admission appointment creation from legacy queue mapping"
```

---

### Task 5: Document the Slice 2 Admission Model

**Files:**
- Modify: `ARCHITECTURE.md`
- Test: `clinic_flow/tests/test_slice2_admission_semantics.py`
- Test: `clinic_flow/tests/test_slice2_receptionist_paths.py`

- [ ] **Step 1: Update the architecture doc with the Slice 2 admission model**

Add a short section to `ARCHITECTURE.md` covering:

```markdown
### Slice 2 admission update

- Active admission behavior is expressed in channel, load_class, token reservation, and Service Point identity.
- The receptionist dashboard preserves three intake paths:
  - phone availability-first
  - phone direct / lookup-assisted booking
  - walk-in token-first
- Patient and Patient Appointment are still created at admission time.
- queue_type remains compatibility-only where still present.
```

- [ ] **Step 2: Run the final Slice 2 targeted suite**

Run:

```bash
pytest clinic_flow/tests/test_slice2_admission_semantics.py clinic_flow/tests/test_slice2_receptionist_paths.py clinic_flow/tests/test_healthcare_compatibility.py clinic_flow/tests/test_service_point.py -v
```

Expected:

- PASS

- [ ] **Step 3: Check git status for unintended files**

Run:

```bash
git status --short
```

Expected:

- only Slice 2 files staged or intentionally modified

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: align architecture with slice2 admission model"
```

---

## Self-Review

### Spec coverage

- preserve three intake paths: covered by Task 2
- clean active admission semantics: covered by Tasks 1 and 3
- keep patient + appointment creation at admission: covered by Task 4
- reduce Healthcare queue-coupling in admission: covered by Task 4
- document new model: covered by Task 5

### Placeholder scan

- no `TODO`
- no `TBD`
- commands and file paths are explicit

### Type consistency

- `channel` and `load_class` remain the active admission inputs throughout
- `Service Point` remains the canonical identity source
- `queue_type` is treated only as compatibility where still needed

---

Plan complete and saved to `docs/superpowers/plans/2026-04-21-slice-2-admission-cleanup.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
