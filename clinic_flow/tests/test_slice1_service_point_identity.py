"""
Slice 1 Service Point identity tests.

Validates that the active admission flow uses Service Point as the canonical
queue identity source and does not require Healthcare department custom fields
to build display tokens.
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestSlice1ServicePointIdentity(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")

    def test_confirm_booking_builds_token_from_service_point_queue_code(self):
        queue_session = self.make_queue_session_with_service_point()
        sp_code = frappe.db.get_value("Queue Session", queue_session.name, "dept_abbr")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        self.assertTrue(
            result["token"].startswith(f"{sp_code}-"),
            f"Expected token to start with '{sp_code}-', got: {result['token']}",
        )

    def test_active_identity_does_not_require_healthcare_department_custom_field(self):
        # Session has a Service Point but no Medical Department custom_dept_abbr dependency
        queue_session = self.make_queue_session_with_service_point()
        sp_code = frappe.db.get_value("Queue Session", queue_session.name, "dept_abbr")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=queue_session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        expected_token = f"{sp_code}-{entry.token_number:03d}"
        self.assertEqual(
            entry.token,
            expected_token,
            f"Token should be built from Service Point queue code, got: {entry.token}",
        )

    def test_session_with_service_point_resolves_canonical_queue_code(self):
        from clinic_flow.queue.service_point import resolve_queue_code

        sp = self.make_service_point()
        # Service Point takes priority over any dept_abbr
        resolved = resolve_queue_code(
            service_point=sp.name,
            dept_abbr="ZZZ",
        )
        self.assertEqual(resolved, sp.queue_code)

    def test_session_without_service_point_still_resolves_via_dept_abbr(self):
        """Backward-compat: sessions migrated without a service_point still work."""
        from clinic_flow.queue.service_point import resolve_queue_code

        resolved = resolve_queue_code(service_point=None, dept_abbr="ONCO")
        self.assertEqual(resolved, "ONCO")

    # ── helpers ──────────────────────────────────────────────────────────

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "SP",
            "last_name": f"Identity {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_service_point(self):
        code = f"T{frappe.generate_hash(length=3).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Test {code}",
            "category": "consult",
            "is_active": 1,
        }).insert(ignore_permissions=True)

    def make_queue_session_with_service_point(self):
        sp = self.make_service_point()
        practitioner = frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"Prac {frappe.generate_hash(length=4)}",
            "gender": "Male",
        }).insert(ignore_permissions=True)
        return frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"SP Identity Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": 20,
            "status": "Scheduled",
        }).insert(ignore_permissions=True)
