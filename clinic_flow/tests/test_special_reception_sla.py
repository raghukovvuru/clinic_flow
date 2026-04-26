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

    def test_booked_special_is_ignored_by_special_reception_sla(self):
        session = self.make_queue_session()
        special = self.make_entry(session, token_number=5, status="Booked", priority="special")

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["special_reception_alerts"], [])
        self.assertIsNone(payload["recommended_reception_call"])
        self.assertEqual(frappe.db.get_value("Queue Entry", special.name, "status"), "Booked")

    def test_arrived_normal_is_not_included_in_special_reception_alerts(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=14)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["special_reception_alerts"], [])
        self.assertIsNone(payload["recommended_reception_call"])

    def test_arrived_special_appears_in_alert_payload(self):
        session = self.make_queue_session()
        special = self.make_entry(session, token_number=9, status="Arrived", priority="special", arrived_minutes_ago=5)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)
        alert = payload["special_reception_alerts"][0]

        self.assertEqual(alert["queue_entry"], special.name)
        self.assertEqual(alert["token_number"], 9)
        self.assertEqual(alert["token"], special.token)
        self.assertEqual(alert["patient"], special.patient)
        self.assertEqual(alert["patient_name"], special.patient_name)
        self.assertEqual(alert["sla_state"], "normal")
        self.assertEqual(alert["recommendation_reason"], "manual")
        self.assertTrue(alert["can_call_now"])
        self.assertFalse(alert["guardrail_blocked"])

    def test_sla_warning_escalation_and_target_breach_are_computed_from_arrived_at(self):
        session = self.make_queue_session()
        warning = self.make_entry(session, token_number=10, status="Arrived", priority="special", arrived_minutes_ago=10)
        escalation = self.make_entry(session, token_number=11, status="Arrived", priority="special", arrived_minutes_ago=12)
        target = self.make_entry(session, token_number=12, status="Arrived", priority="special", arrived_minutes_ago=16)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)
        states = {row["queue_entry"]: row["sla_state"] for row in payload["special_reception_alerts"]}
        reasons = {row["queue_entry"]: row["recommendation_reason"] for row in payload["special_reception_alerts"]}

        self.assertEqual(states[warning.name], "warning")
        self.assertEqual(states[escalation.name], "escalation")
        self.assertEqual(states[target.name], "target_breach")
        self.assertEqual(reasons[warning.name], "warning")
        self.assertEqual(reasons[escalation.name], "escalation")
        self.assertEqual(reasons[target.name], "target_breach")

    def test_one_missing_normal_token_in_lookahead_creates_gap_recommendation(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=66, status="Booked", priority="normal")
        self.make_entry(session, token_number=67, status="Arrived", priority="normal", arrived_minutes_ago=2)
        self.make_entry(session, token_number=68, status="Arrived", priority="normal", arrived_minutes_ago=2)
        special = self.make_entry(session, token_number=89, status="Arrived", priority="special", arrived_minutes_ago=5)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["recommended_reception_call"]["queue_entry"], special.name)
        self.assertEqual(payload["recommended_reception_call"]["kind"], "special")
        self.assertEqual(payload["recommended_reception_call"]["reason"], "gap")
        self.assertIn("token 66", payload["recommended_reception_call"]["message"])
        alert = payload["special_reception_alerts"][0]
        self.assertEqual(alert["recommendation_reason"], "gap")
        self.assertTrue(alert["can_call_now"])

    def test_max_consecutive_special_calls_blocks_when_normal_arrived_patients_are_available(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=3)
        self.make_entry(session, token_number=20, status="Called", priority="special", called_minutes_ago=2)
        self.make_entry(session, token_number=21, status="Called", priority="special", called_minutes_ago=1)
        candidate = self.make_entry(session, token_number=22, status="Arrived", priority="special", arrived_minutes_ago=13)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)
        alert = next(row for row in payload["special_reception_alerts"] if row["queue_entry"] == candidate.name)

        self.assertFalse(alert["can_call_now"])
        self.assertTrue(alert["guardrail_blocked"])
        self.assertIsNone(payload["recommended_reception_call"])

    def test_max_consecutive_special_calls_does_not_block_when_no_normal_arrived_patient_is_available(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=1, status="Booked", priority="normal")
        self.make_entry(session, token_number=20, status="Called", priority="special", called_minutes_ago=2)
        self.make_entry(session, token_number=21, status="Called", priority="special", called_minutes_ago=1)
        candidate = self.make_entry(session, token_number=22, status="Arrived", priority="special", arrived_minutes_ago=13)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)
        alert = next(row for row in payload["special_reception_alerts"] if row["queue_entry"] == candidate.name)

        self.assertTrue(alert["can_call_now"])
        self.assertFalse(alert["guardrail_blocked"])
        self.assertEqual(payload["recommended_reception_call"]["queue_entry"], candidate.name)

    def test_public_call_persists_public_mode(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=1)

        result = frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
            queue_entry=entry.name,
            call_mode="Public",
            recommendation_reason="manual",
        )

        refreshed = frappe.get_doc("Queue Entry", entry.name)
        self.assertEqual(result["status"], "Called")
        self.assertEqual(result["call_mode"], "Public")
        self.assertFalse(result["suppress_public_display"])
        self.assertEqual(refreshed.status, "Called")
        self.assertEqual(refreshed.reception_call_mode, "Public")
        self.assertEqual(refreshed.called_to_reception_by, frappe.session.user)
        self.assertEqual(refreshed.reception_recommendation_reason, "manual")
        self.assertFalse(refreshed.private_reception_call_reason)

    def test_private_call_requires_reason(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="special", arrived_minutes_ago=11)

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
                queue_entry=entry.name,
                call_mode="Private",
            )

    def test_private_call_persists_reason_and_still_sets_called_status(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="special", arrived_minutes_ago=11)

        result = frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
            queue_entry=entry.name,
            call_mode="Private",
            private_reason="parent contacted by phone",
            recommendation_reason="warning",
        )

        refreshed = frappe.get_doc("Queue Entry", entry.name)
        self.assertEqual(result["status"], "Called")
        self.assertEqual(result["call_mode"], "Private")
        self.assertTrue(result["suppress_public_display"])
        self.assertEqual(refreshed.status, "Called")
        self.assertEqual(refreshed.reception_call_mode, "Private")
        self.assertEqual(refreshed.private_reception_call_reason, "parent contacted by phone")
        self.assertEqual(refreshed.reception_recommendation_reason, "warning")
        self.assertIsNotNone(refreshed.called_to_reception_at)
        self.assertEqual(refreshed.called_to_reception_by, frappe.session.user)

    def test_invalid_call_mode_is_rejected(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=1)

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
                queue_entry=entry.name,
                call_mode="Silent",
            )

    def test_invalid_recommendation_reason_is_rejected(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=1)

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
                queue_entry=entry.name,
                recommendation_reason="vip",
            )

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
