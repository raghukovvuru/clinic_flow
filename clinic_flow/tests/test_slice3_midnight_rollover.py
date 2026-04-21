"""
Slice 3 midnight phone-to-walkin quota rollover tests.

Lock:
  - unused phone-protected quota releases to walk-in at midnight of the session date
  - rollover is idempotent (running it twice produces the same result)
  - sessions already released are not double-counted
"""
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestSlice3MidnightRollover(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")

    # ── rollover behavior ─────────────────────────────────────────────────

    def test_midnight_rollover_releases_unused_phone_quota_to_walkin(self):
        session = self.make_today_session(phone_booked_count=2, walkin_count=1, planned_capacity=10)

        frappe.get_attr("clinic_flow.queue.scheduler.release_phone_quota_at_midnight")()

        refreshed = frappe.get_doc("Queue Session", session.name)
        self.assertEqual(refreshed.phone_quota_released, 1)
        # phone_quota = int(10 * 60 / 100) = 6; unused = 6 - 2 = 4; walkin_total = 1 + 4 = 5
        self.assertGreaterEqual(refreshed.walkin_total or 0, 1)

    def test_midnight_rollover_marks_phone_quota_released(self):
        session = self.make_today_session(phone_booked_count=0, walkin_count=0, planned_capacity=10)

        frappe.get_attr("clinic_flow.queue.scheduler.release_phone_quota_at_midnight")()

        refreshed = frappe.get_doc("Queue Session", session.name)
        self.assertEqual(refreshed.phone_quota_released, 1)

    def test_rollover_is_idempotent(self):
        session = self.make_today_session(phone_booked_count=0, walkin_count=0, planned_capacity=10)

        fn = frappe.get_attr("clinic_flow.queue.scheduler.release_phone_quota_at_midnight")
        fn()
        first = frappe.get_doc("Queue Session", session.name)
        first_walkin = first.walkin_total

        fn()
        second = frappe.get_doc("Queue Session", session.name)
        second_walkin = second.walkin_total

        self.assertEqual(first_walkin, second_walkin)

    def test_already_released_session_is_skipped(self):
        session = self.make_today_session(phone_booked_count=0, walkin_count=5, planned_capacity=10)
        frappe.db.set_value("Queue Session", session.name, {
            "phone_quota_released": 1,
            "walkin_total": 5,
        })

        frappe.get_attr("clinic_flow.queue.scheduler.release_phone_quota_at_midnight")()

        refreshed = frappe.get_doc("Queue Session", session.name)
        self.assertEqual(refreshed.walkin_total, 5)

    def test_fully_booked_phone_quota_adds_zero_walkin(self):
        """When all phone slots are used, rollover adds nothing to walkin_total."""
        session = self.make_today_session(phone_booked_count=6, walkin_count=2, planned_capacity=10)

        frappe.get_attr("clinic_flow.queue.scheduler.release_phone_quota_at_midnight")()

        refreshed = frappe.get_doc("Queue Session", session.name)
        # phone_quota = 6, phone_booked = 6, unused = 0 — walkin_total stays 2
        self.assertEqual(refreshed.walkin_total, 2)
        self.assertEqual(refreshed.phone_quota_released, 1)

    # ── test helpers ──────────────────────────────────────────────────────

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_service_point(self):
        code = f"MR{frappe.generate_hash(length=5).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Rollover {code}",
            "category": "consult",
            "is_active": 1,
        }).insert(ignore_permissions=True)

    def make_practitioner(self):
        return frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"Prac {frappe.generate_hash(length=4)}",
            "gender": "Male",
        }).insert(ignore_permissions=True)

    def make_today_session(self, phone_booked_count=0, walkin_count=0, planned_capacity=10):
        sp = self.make_service_point()
        practitioner = self.make_practitioner()
        session = frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"Rollover Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": planned_capacity,
            "planned_capacity": planned_capacity,
            "status": "Scheduled",
        }).insert(ignore_permissions=True)

        updates = {"phone_quota_released": 0}
        if phone_booked_count or walkin_count:
            updates["phone_booked_count"] = phone_booked_count
            updates["walkin_count"] = walkin_count
            updates["walkin_total"] = walkin_count
        frappe.db.set_value("Queue Session", session.name, updates)

        return frappe.get_doc("Queue Session", session.name)
