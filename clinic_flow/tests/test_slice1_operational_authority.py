"""
Slice 1 operational authority tests.

Authority model:
  - Queue Entry creation belongs to Clinic Flow admission (confirm_booking).
  - Patient Appointment status changes must NOT create Queue Entries.
  - Service Point is the canonical queue identity source.
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestSlice1OperationalAuthority(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")

    # ── authority boundary tests ──────────────────────────────────────────

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

    # ── test helpers ──────────────────────────────────────────────────────

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Slice",
            "last_name": f"One {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_service_point(self, queue_code: str | None = None):
        if queue_code is None:
            queue_code = f"T{frappe.generate_hash(length=3).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": queue_code,
            "display_label": f"Slice One {queue_code}",
            "category": "consult",
            "is_active": 1,
        }).insert(ignore_permissions=True)

    def make_practitioner(self):
        return frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"Prac {frappe.generate_hash(length=4)}",
            "gender": "Male",
        }).insert(ignore_permissions=True)

    def make_queue_session(self):
        sp = self.make_service_point()
        practitioner = self.make_practitioner()
        return frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"Slice1 Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": 20,
            "status": "Scheduled",
        }).insert(ignore_permissions=True)

    def make_patient_appointment(self):
        """
        Create a patient appointment with custom_queue_type set so that the
        legacy mixin *would* create a Queue Entry on check-in — verifying that
        after Slice 1 it no longer does.
        """
        tag = frappe.generate_hash(length=6)

        department = frappe.get_doc({
            "doctype": "Medical Department",
            "department": f"Slice Dept {tag}",
            "custom_dept_abbr": f"S{tag[:3].upper()}",
        }).insert(ignore_permissions=True)

        # op_consulting_charge_item must match Healthcare Settings to pass
        # Healthcare's billing validation on Patient Appointment insert.
        consulting_item = frappe.db.get_single_value(
            "Healthcare Settings", "op_consulting_charge_item"
        ) or "Outpatient Consultation Fee"

        practitioner = frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"PracSlice {tag}",
            "gender": "Male",
            "department": department.name,
            "op_consulting_charge_item": consulting_item,
            "op_consulting_charge": 500,
        }).insert(ignore_permissions=True)

        # Pre-create a Queue Session so _clinic_flow_get_or_create_session()
        # can find it (avoids schedule-lookup side-effects in the test).
        frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"Slice Appt Session {tag}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "dept_abbr": department.custom_dept_abbr,
            "session_capacity": 10,
            "status": "Active",
        }).insert(ignore_permissions=True)

        appt_type = frappe.get_doc({
            "doctype": "Appointment Type",
            "appointment_type": f"Slice WLK {tag}",
            "allow_booking_for": "Practitioner",
            "default_duration": 15,
            "custom_queue_code": "WLK",
            "custom_queue_type": "WALK_IN",
        }).insert(ignore_permissions=True)

        company = frappe.db.get_single_value("Global Defaults", "default_company")

        return frappe.get_doc({
            "doctype": "Patient Appointment",
            "patient": self.make_patient().name,
            "practitioner": practitioner.name,
            "appointment_for": "Healthcare Practitioner",
            "appointment_type": appt_type.name,
            "appointment_date": today(),
            "appointment_time": "09:00:00",
            "department": department.name,
            "company": company,
            "custom_queue_type": "WALK_IN",
            # Tells Healthcare to skip the OP Consulting Charge validation;
            # charge will be collected at check-in instead.
            "appointment_based_on_check_in": 1,
        }).insert(ignore_permissions=True)
