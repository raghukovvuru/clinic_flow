from pathlib import Path

import frappe
from frappe.model.base_document import get_controller
from frappe.tests import IntegrationTestCase


class TestHealthcareCompatibility(IntegrationTestCase):
	def test_required_healthcare_custom_fields_exist(self):
		expected = {
			"Appointment Type": {
				"custom_queue_code": {"fieldtype": "Data"},
				"custom_queue_type": {"fieldtype": "Select"},
			},
			"Medical Department": {
				"custom_dept_abbr": {"fieldtype": "Data"},
			},
			"Patient Appointment": {
				"custom_dept_abbr": {"fieldtype": "Data"},
				"custom_queue_type": {"fieldtype": "Select"},
				"custom_queue_token": {"fieldtype": "Data"},
			},
			"Patient Encounter": {
				"custom_chief_complaint": {"fieldtype": "Long Text"},
			},
		}

		for doctype, fields in expected.items():
			meta = frappe.get_meta(doctype)
			for fieldname, attrs in fields.items():
				df = meta.get_field(fieldname)
				self.assertIsNotNone(df, f"{doctype}.{fieldname} should exist")
				for attr, expected_value in attrs.items():
					self.assertEqual(
						getattr(df, attr),
						expected_value,
						f"{doctype}.{fieldname} should have {attr}={expected_value}",
					)

	def test_patient_appointment_controller_is_extended(self):
		controller = get_controller("Patient Appointment")
		module = controller.__module__
		mro_names = {cls.__name__ for cls in controller.__mro__}

		self.assertIn("QueueMixin", mro_names)
		self.assertTrue(module.startswith("healthcare."), module)

	def test_required_patch_is_registered(self):
		patches_path = (
			Path(frappe.get_app_path("clinic_flow")).parent
			/ "clinic_flow"
			/ "patches.txt"
		)
		content = patches_path.read_text()
		self.assertIn(
			"clinic_flow.patches.v16_0.ensure_required_healthcare_custom_fields",
			content,
		)
