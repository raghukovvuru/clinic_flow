from pathlib import Path
import unittest
from unittest.mock import patch

import frappe
from frappe.model.base_document import get_controller
from frappe.tests import IntegrationTestCase

from clinic_flow.api.boot import extend_boot


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

	def test_boot_redirects_doctors_to_doctor_workspace_v2(self):
		bootinfo = {}

		with (
			patch.dict(frappe.session, {"user": "test-physician@example.com"}),
			patch("clinic_flow.api.boot.frappe.get_roles", return_value=["Physician"]),
		):
			extend_boot(bootinfo)

		self.assertEqual(bootinfo.get("home_page"), "doctor-workspace-v2")


class TestPostSliceLegacyCleanupSourceMarkers(unittest.TestCase):
	def test_queue_mixin_module_is_retired(self):
		source = Path(__file__).resolve().parents[1] / "queue" / "appointment_mixin.py"

		self.assertFalse(source.exists())

	def test_appointments_module_keeps_legacy_compatibility_marker(self):
		source = Path(__file__).resolve().parents[1] / "api" / "appointments.py"

		self.assertIn("Legacy compatibility path only", source.read_text())

	def test_receptionist_workspace_is_marked_compatibility_only(self):
		source = (
			Path(__file__).resolve().parents[1]
			/ "clinic_flow"
			/ "page"
			/ "receptionist_workspace"
			/ "receptionist_workspace.js"
		)

		content = source.read_text()
		self.assertIn("Legacy compatibility page.", content)
		self.assertIn("Do not extend this page for new product work.", content)
