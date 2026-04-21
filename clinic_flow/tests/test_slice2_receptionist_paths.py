"""
Slice 2 receptionist path protection tests.

Lock the three receptionist intake UX patterns at the API-contract level:
  1. Phone, availability-first — get_suggested_sessions returns a ranked list
  2. Phone, direct / lookup-assisted — confirm_booking accepts phone channel
  3. Walk-in, token-first — confirm_booking accepts walkin with optional token_number override
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestSlice2ReceptionistPaths(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")

    # ── Path 1: phone availability-first ─────────────────────────────────

    def test_phone_availability_first_still_returns_ranked_sessions(self):
        sessions = frappe.get_attr("clinic_flow.api.admission.get_suggested_sessions")(
            load_class="non_review_load",
            channel="phone",
        )
        self.assertIsInstance(sessions, list)

    def test_get_suggested_sessions_accepts_walkin_channel(self):
        sessions = frappe.get_attr("clinic_flow.api.admission.get_suggested_sessions")(
            load_class="review_load",
            channel="walkin",
        )
        self.assertIsInstance(sessions, list)

    # ── Path 2: phone direct / lookup-assisted booking ────────────────────

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
        self.assertEqual(result["channel"], "phone")

    def test_phone_booking_links_patient_appointment(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="phone",
            load_class="review_load",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        self.assertEqual(entry.channel, "phone")
        self.assertEqual(entry.load_class, "review_load")

    # ── Path 3: walk-in token-first ───────────────────────────────────────

    def test_walkin_token_first_path_can_confirm_booking(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        self.assertIn("queue_entry", result)
        self.assertEqual(result["channel"], "walkin")

    def test_walkin_accepts_explicit_token_number_override(self):
        queue_session = self.make_queue_session()
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            token_number=5,
        )

        self.assertEqual(result["token_number"], 5)
        self.assertEqual(result["channel"], "walkin")

    def test_duplicate_token_number_override_is_rejected(self):
        queue_session = self.make_queue_session()
        patient1 = self.make_patient()
        patient2 = self.make_patient()

        frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient1.name,
            channel="walkin",
            load_class="non_review_load",
            token_number=3,
        )

        with self.assertRaises(frappe.exceptions.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=queue_session.name,
                patient=patient2.name,
                channel="walkin",
                load_class="non_review_load",
                token_number=3,
            )

    # ── cross-path: token board accessible for all paths ─────────────────

    def test_token_board_returns_session_state(self):
        queue_session = self.make_queue_session()

        board = frappe.get_attr("clinic_flow.api.admission.get_token_board")(
            queue_session=queue_session.name,
            load_class="non_review_load",
        )

        self.assertIn("session", board)
        self.assertIn("entries", board)
        self.assertIn("max_token", board)

    # ── test helpers ──────────────────────────────────────────────────────

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Path",
            "last_name": f"Guard {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_service_point(self):
        code = f"P{frappe.generate_hash(length=3).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Path {code}",
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
            "session_name": f"Path Session {frappe.generate_hash(length=4)}",
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
