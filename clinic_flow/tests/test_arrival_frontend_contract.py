"""
Frontend contract tests for the arrival counter page API.

Tests the enriched response shape expected by the arrival_counter desk page.
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today, now_datetime, add_to_date


class TestArrivalFrontendContract(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")

    # ── contract tests ────────────────────────────────────────────────────

    def test_session_context_includes_current_next_stats_and_recent_arrivals(self):
        sp = self.make_service_point()
        session = self.make_queue_session(
            status="Active", start_time="09:00:00", service_point=sp
        )
        next_start = add_to_date(now_datetime(), minutes=20).strftime("%H:%M:%S")
        next_session = self.make_queue_session(
            status="Scheduled", start_time=next_start, service_point=sp
        )
        arrived = self.make_queue_entry(session, status="Arrived", token_number=1)
        self.make_queue_entry(session, status="Booked", token_number=2)

        result = frappe.get_attr("clinic_flow.api.arrival.get_arrival_session_context")(
            dept_abbr=sp.queue_code
        )

        self.assertTrue(result["has_active"])
        self.assertEqual(result["stats"]["arrived"], 1)
        self.assertEqual(result["stats"]["awaiting_arrival"], 1)
        self.assertEqual(result["current_session"]["name"], session.name)
        self.assertEqual(result["next_session"]["name"], next_session.name)
        self.assertEqual(result["recent_arrivals"][0]["queue_entry"], arrived.name)

    def test_lookup_arrival_candidate_keeps_legacy_candidates_and_adds_ui_fields(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=7)

        result = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(
            qr_code=entry.name
        )

        self.assertEqual(result["candidates"][0]["name"], entry.name)
        self.assertEqual(result["candidates"][0]["display_token"], entry.token)
        self.assertIn("state_label", result["candidates"][0])

    def test_lookup_arrival_candidate_supports_queue_entry_reconciliation_lookup(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Arrived", token_number=13)

        result = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(
            queue_entry=entry.name
        )

        self.assertEqual(len(result["candidates"]), 1)
        self.assertEqual(result["candidates"][0]["queue_entry"], entry.name)
        self.assertEqual(result["candidates"][0]["status"], "Arrived")

    def test_mark_arrived_returns_success_card_payload(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=3)

        result = frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(
            queue_entry=entry.name
        )

        self.assertEqual(result["status"], "Arrived")
        self.assertFalse(result["already_arrived"])
        self.assertEqual(result["result_card"]["display_token"], entry.token)
        self.assertIn("print_context", result["result_card"])

    # ── permission tests ─────────────────────────────────────────────────

    def test_arrival_api_methods_reject_non_staff_user(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=11)
        user = self.make_queue_viewer_user()

        protected_calls = [
            lambda: frappe.get_attr("clinic_flow.api.arrival.resolve_arrival_sessions")(),
            lambda: frappe.get_attr("clinic_flow.api.arrival.get_arrival_session_context")(),
            lambda: frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(qr_code=entry.name),
            lambda: frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(queue_entry=entry.name),
            lambda: frappe.get_attr("clinic_flow.api.arrival.get_token_qr")(queue_entry=entry.name),
        ]

        try:
            frappe.set_user(user.name)
            for call in protected_calls:
                with self.assertRaises(frappe.PermissionError):
                    call()
        finally:
            frappe.set_user("Administrator")

    def test_arrival_api_methods_allow_queue_manager_user(self):
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=12)
        user = self.make_arrival_staff_user("Queue Manager")

        try:
            frappe.set_user(user.name)
            context = frappe.get_attr("clinic_flow.api.arrival.get_arrival_session_context")()
            lookup = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(qr_code=entry.name)
            result = frappe.get_attr("clinic_flow.api.arrival.mark_arrived")(queue_entry=entry.name)
            qr = frappe.get_attr("clinic_flow.api.arrival.get_token_qr")(queue_entry=entry.name)

            self.assertIn("stats", context)
            self.assertEqual(lookup["candidates"][0]["queue_entry"], entry.name)
            self.assertEqual(result["status"], "Arrived")
            self.assertIn("<svg", qr)
        finally:
            frappe.set_user("Administrator")

    def test_has_active_false_when_only_scheduled_sessions_exist(self):
        """has_active must be False when no Active/Paused session exists."""
        from frappe.utils import now_datetime, add_to_date

        sp = self.make_service_point()
        now = now_datetime()
        current_time = now.strftime("%H:%M:%S")
        end_time = add_to_date(now, hours=3).strftime("%H:%M:%S")
        self.make_queue_session(status="Scheduled", start_time=current_time, end_time=end_time, service_point=sp)

        result = frappe.get_attr("clinic_flow.api.arrival.get_arrival_session_context")(
            dept_abbr=sp.queue_code
        )

        self.assertFalse(result["has_active"], "has_active should be False for Scheduled-only sessions")
        self.assertIsNone(result["current_session"])
        self.assertIsNotNone(result["next_session"])

    def test_print_context_absent_for_non_arrived_candidates(self):
        """print_context must not be included for Booked/Waiting candidates."""
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Booked", token_number=8)

        result = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(
            qr_code=entry.name
        )

        self.assertEqual(len(result["candidates"]), 1)
        self.assertNotIn("print_context", result["candidates"][0])

    def test_print_context_present_for_arrived_candidates(self):
        """print_context must be included for Arrived candidates (reprint support)."""
        session = self.make_queue_session(status="Active")
        entry = self.make_queue_entry(session, status="Arrived", token_number=9)

        result = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(
            qr_code=entry.name
        )

        self.assertEqual(len(result["candidates"]), 1)
        self.assertIn("print_context", result["candidates"][0])
        self.assertIn("qr_svg", result["candidates"][0]["print_context"])

    def make_queue_viewer_user(self):
        return self.make_arrival_staff_user("Queue Viewer")

    def make_arrival_staff_user(self, role: str):
        email = f"arrival-{role.lower().replace(' ', '-')}-{frappe.generate_hash(length=8)}@example.com"
        return frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Arrival",
            "last_name": role.replace(" ", ""),
            "user_type": "System User",
            "enabled": 1,
            "send_welcome_email": 0,
            "roles": [{"role": role}],
        }).insert(ignore_permissions=True)

    # ── test helpers ──────────────────────────────────────────────────────

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_service_point(self, queue_code=None):
        code = queue_code or f"AF{frappe.generate_hash(length=5).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"ArrivalFront {code}",
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
            "first_name": "Arrival",
            "last_name": f"Front {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_queue_session(self, status="Active", start_time="09:00:00", end_time=None, service_point=None):
        sp = service_point or self.make_service_point()
        practitioner = self.make_practitioner()
        if end_time is None:
            end_time = "12:00:00" if start_time <= "10:00:00" else "17:00:00"
        return frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"AF Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": start_time,
            "end_time": end_time,
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": 20,
            "planned_capacity": 20,
            "status": status,
        }).insert(ignore_permissions=True)

    def make_queue_entry(self, session, status="Booked", token_number=1):
        patient = self.make_patient()
        token = f"{session.dept_abbr}-{token_number:03d}"
        entry = frappe.get_doc({
            "doctype": "Queue Entry",
            "queue_session": session.name,
            "patient": patient.name,
            "practitioner": session.practitioner,
            "dept_abbr": session.dept_abbr,
            "token_number": token_number,
            "token": token,
            "queue_position": token_number,
            "channel": "walkin",
            "load_class": "non_review_load",
            "priority": "normal",
            "status": status,
            "issued_by": frappe.session.user,
            "issued_by_role": "Queue Manager",
        })
        entry.insert(ignore_permissions=True)
        return entry
