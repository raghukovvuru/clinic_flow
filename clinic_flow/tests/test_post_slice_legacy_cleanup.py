import inspect

import frappe
from frappe.model.base_document import get_controller
from frappe.tests import IntegrationTestCase


class TestPostSliceLegacyCleanup(IntegrationTestCase):
	def test_patient_appointment_controller_stays_on_healthcare_base(self):
		controller = get_controller("Patient Appointment")
		module = controller.__module__
		mro_names = {cls.__name__ for cls in controller.__mro__}

		self.assertNotIn("QueueMixin", mro_names)
		self.assertTrue(module.startswith("healthcare."), module)

	def test_scheduler_hooks_include_only_midnight_phone_rollover(self):
		cron = frappe.get_hooks("scheduler_events", app_name="clinic_flow").get("cron", {})

		self.assertEqual(set(cron), {"0 0 * * *"})
		self.assertEqual(
			cron.get("0 0 * * *"),
			["clinic_flow.queue.scheduler.release_phone_quota_at_midnight"],
		)

	def test_record_payment_and_checkin_is_legacy_compatibility_only(self):
		fn = frappe.get_attr("clinic_flow.api.appointments.record_payment_and_checkin")
		docstring = inspect.getdoc(fn) or ""

		self.assertIn("Legacy compatibility path only", docstring)
