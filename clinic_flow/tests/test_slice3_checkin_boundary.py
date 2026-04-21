"""
Slice 3 check-in boundary tests.

Lock:
  - arrival (mark_arrived) never makes a patient Ready Near Doctor
  - only receptionist check-in (complete_reception) moves a patient to Ready Near Doctor
  - Healthcare appointment sync is downstream of Clinic Flow queue-state transition
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestSlice3CheckinBoundary(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")

    # ── arrival boundary ──────────────────────────────────────────────────

    def test_arrival_does_not_make_patient_ready_for_doctor(self):
        entry = self.make_booked_queue_entry()

        result = frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(entry.name)

        refreshed = frappe.get_doc("Queue Entry", entry.name)
        self.assertEqual(result["status"], "Arrived")
        self.assertEqual(refreshed.status, "Arrived")

    def test_arrival_never_reaches_ready_near_doctor(self):
        """Arrival must stop at Arrived — no direct path to Ready Near Doctor."""
        entry = self.make_booked_queue_entry()

        frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(entry.name)

        refreshed = frappe.get_doc("Queue Entry", entry.name)
        self.assertNotEqual(refreshed.status, "Ready Near Doctor")

    # ── receptionist check-in boundary ───────────────────────────────────

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

    def test_complete_reception_requires_called_status(self):
        """complete_reception must reject patients that have not been called to reception."""
        entry = self.make_booked_queue_entry()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.queue.complete_reception")(
                queue_entry=entry.name,
                payment_mode="Cash",
                paid_amount=100.0,
            )

    def test_complete_reception_does_not_require_appointment_to_advance(self):
        """Queue state must advance even when there is no linked Patient Appointment."""
        entry = self.make_called_queue_entry()
        frappe.db.set_value("Queue Entry", entry.name, "appointment", None)

        result = frappe.get_attr("clinic_flow.api.queue.complete_reception")(
            queue_entry=entry.name,
        )

        self.assertEqual(result["status"], "Ready Near Doctor")

    # ── test helpers ──────────────────────────────────────────────────────

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_service_point(self):
        code = f"S3{frappe.generate_hash(length=5).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Slice3 {code}",
            "category": "consult",
            "is_active": 1,
        }).insert(ignore_permissions=True)

    def make_practitioner(self):
        return frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"Prac {frappe.generate_hash(length=4)}",
            "gender": "Male",
        }).insert(ignore_permissions=True)

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Slice",
            "last_name": f"Three {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_queue_session(self):
        sp = self.make_service_point()
        practitioner = self.make_practitioner()
        return frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"Slice3 Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": 20,
            "planned_capacity": 20,
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_booked_queue_entry(self):
        session = self.make_queue_session()
        patient = self.make_patient()
        entry = frappe.get_doc({
            "doctype": "Queue Entry",
            "queue_session": session.name,
            "patient": patient.name,
            "practitioner": session.practitioner,
            "dept_abbr": session.dept_abbr,
            "token_number": 1,
            "token": f"{session.dept_abbr}-001",
            "queue_position": 1,
            "channel": "walkin",
            "load_class": "non_review_load",
            "priority": "normal",
            "status": "Booked",
            "issued_by": frappe.session.user,
            "issued_by_role": "Queue Manager",
        })
        entry.insert(ignore_permissions=True)
        return entry

    def make_called_queue_entry(self):
        entry = self.make_booked_queue_entry()
        frappe.db.set_value("Queue Entry", entry.name, "status", "Called")
        return frappe.get_doc("Queue Entry", entry.name)
