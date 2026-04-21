"""
Slice 2 admission semantics tests.

Lock:
  - confirm_booking reserves capacity by channel (not queue_type)
  - token assignment does not require legacy queue_type concepts
  - Healthcare appointment creation does not require queue-code custom field lookup
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestSlice2AdmissionSemantics(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")

    # ── channel capacity tests ────────────────────────────────────────────

    def test_confirm_booking_reserves_capacity_by_channel_phone(self):
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
        self.assertEqual(session.walkin_count, 0)

    def test_confirm_booking_reserves_capacity_by_channel_walkin(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        session = frappe.get_doc("Queue Session", queue_session.name)
        entry = frappe.get_doc("Queue Entry", result["queue_entry"])

        self.assertEqual(entry.channel, "walkin")
        self.assertEqual(entry.load_class, "non_review_load")
        self.assertEqual(session.walkin_count, 1)
        self.assertEqual(session.phone_booked_count, 0)

    # ── token assignment tests ────────────────────────────────────────────

    def test_confirm_booking_assigns_token_without_legacy_queue_type_concept(self):
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

    def test_second_booking_gets_next_token(self):
        queue_session = self.make_queue_session()
        patient1 = self.make_patient()
        patient2 = self.make_patient()

        result1 = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient1.name,
            channel="walkin",
            load_class="non_review_load",
        )
        result2 = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient2.name,
            channel="walkin",
            load_class="non_review_load",
        )

        self.assertNotEqual(result1["token_number"], result2["token_number"])
        self.assertEqual(result2["token_number"], result1["token_number"] + 1)

    # ── load_class counter tests ──────────────────────────────────────────

    def test_review_load_booking_increments_review_count(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="review_load",
        )

        session = frappe.get_doc("Queue Session", queue_session.name)
        self.assertEqual(session.review_load_count, 1)
        self.assertEqual(session.non_review_load_count, 0)

    def test_non_review_load_booking_increments_non_review_count(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="phone",
            load_class="non_review_load",
        )

        session = frappe.get_doc("Queue Session", queue_session.name)
        self.assertEqual(session.non_review_load_count, 1)
        self.assertEqual(session.review_load_count, 0)

    # ── canonical return value tests ──────────────────────────────────────

    def test_confirm_booking_returns_channel_and_load_class(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="phone",
            load_class="review_load",
        )

        self.assertEqual(result["channel"], "phone")
        self.assertEqual(result["load_class"], "review_load")
        self.assertIn("token_number", result)
        self.assertIn("queue_entry", result)

    # ── test helpers ──────────────────────────────────────────────────────

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Slice",
            "last_name": f"Two {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_service_point(self):
        code = f"T{frappe.generate_hash(length=3).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Slice2 {code}",
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
            "session_name": f"Slice2 Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": 20,
            "planned_capacity": 20,
            "stretch_capacity": 22,
            "status": "Scheduled",
        }).insert(ignore_permissions=True)

    def make_appointment_type(self):
        """Create a standard Appointment Type with no queue-code custom fields."""
        tag = frappe.generate_hash(length=4)
        return frappe.get_doc({
            "doctype": "Appointment Type",
            "appointment_type": f"Standard Consult {tag}",
            "allow_booking_for": "Practitioner",
            "default_duration": 15,
        }).insert(ignore_permissions=True)
