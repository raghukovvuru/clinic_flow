from pathlib import Path

import frappe
from frappe.model.base_document import get_controller
from frappe.tests import IntegrationTestCase


class TestPostSliceLegacyCleanup(IntegrationTestCase):
	def test_patient_appointment_controller_is_not_extended_by_queue_mixin(self):
		controller = get_controller("Patient Appointment")
		mro_names = {cls.__name__ for cls in controller.__mro__}

		self.assertNotIn("QueueMixin", mro_names)

	def test_scheduler_hooks_include_only_midnight_phone_rollover(self):
		cron = frappe.get_hooks("scheduler_events", app_name="clinic_flow").get("cron", {})

		self.assertEqual(set(cron), {"0 0 * * *"})
		self.assertEqual(
			cron.get("0 0 * * *"),
			["clinic_flow.queue.scheduler.release_phone_quota_at_midnight"],
		)

	def test_appointments_module_keeps_legacy_compatibility_marker(self):
		source = Path(frappe.get_app_path("clinic_flow")) / "api" / "appointments.py"

		self.assertIn("Legacy compatibility path only", source.read_text())
