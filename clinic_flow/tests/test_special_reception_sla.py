import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime, today


class TestSpecialReceptionSLA(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")
        config = frappe.get_single("Slot Partition Config")
        config.special_reception_warning_minutes = 10
        config.special_reception_escalation_minutes = 12
        config.special_reception_target_minutes = 15
        config.special_gap_lookahead_tokens = 3
        config.max_consecutive_special_reception_calls = 2
        config.save(ignore_permissions=True)

    def test_slot_partition_config_has_special_reception_fields(self):
        meta = frappe.get_meta("Slot Partition Config")

        self.assertTrue(meta.has_field("special_reception_warning_minutes"))
        self.assertTrue(meta.has_field("special_reception_escalation_minutes"))
        self.assertTrue(meta.has_field("special_reception_target_minutes"))
        self.assertTrue(meta.has_field("special_gap_lookahead_tokens"))
        self.assertTrue(meta.has_field("max_consecutive_special_reception_calls"))

    def test_queue_entry_has_reception_call_audit_fields(self):
        meta = frappe.get_meta("Queue Entry")

        self.assertTrue(meta.has_field("called_to_reception_by"))
        self.assertTrue(meta.has_field("reception_call_mode"))
        self.assertTrue(meta.has_field("private_reception_call_reason"))
        self.assertTrue(meta.has_field("reception_recommendation_reason"))

    def test_live_state_returns_policy_shape(self):
        session = self.make_queue_session()

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["special_reception_policy"]["warning_minutes"], 10)
        self.assertEqual(payload["special_reception_policy"]["escalation_minutes"], 12)
        self.assertEqual(payload["special_reception_policy"]["target_minutes"], 15)
        self.assertEqual(payload["special_reception_policy"]["gap_lookahead_tokens"], 3)
        self.assertEqual(payload["special_reception_policy"]["max_consecutive_special_calls"], 2)
        self.assertEqual(payload["special_reception_alerts"], [])
        self.assertIsNone(payload["recommended_reception_call"])

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_service_point(self):
        code = f"SR{frappe.generate_hash(length=5).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Special Reception {code}",
            "category": "consult",
            "is_active": 1,
        }).insert(ignore_permissions=True)

    def make_practitioner(self):
        return frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"SLA Prac {frappe.generate_hash(length=4)}",
            "gender": "Male",
        }).insert(ignore_permissions=True)

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Special",
            "last_name": f"Reception {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_queue_session(self):
        sp = self.make_service_point()
        practitioner = self.make_practitioner()
        return frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"Special Reception Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": 20,
            "planned_capacity": 20,
            "stretch_capacity": 20,
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_entry(
        self,
        session,
        token_number: int,
        status: str = "Booked",
        priority: str = "normal",
        arrived_minutes_ago: int | None = None,
        called_minutes_ago: int | None = None,
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
            "channel": "walkin",
            "load_class": "non_review_load",
            "patient_type": "new",
            "priority": priority,
            "queue_type": "WALK_IN",
            "status": status,
            "issued_by": frappe.session.user,
            "issued_by_role": "Queue Manager",
        }).insert(ignore_permissions=True)

        updates = {}
        if arrived_minutes_ago is not None:
            updates["arrived_at"] = add_to_date(now_datetime(), minutes=-arrived_minutes_ago)
        if called_minutes_ago is not None:
            updates["called_to_reception_at"] = add_to_date(now_datetime(), minutes=-called_minutes_ago)
        if updates:
            frappe.db.set_value("Queue Entry", entry.name, updates)
            entry = frappe.get_doc("Queue Entry", entry.name)
        return entry
