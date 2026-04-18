from pathlib import Path

import frappe
from frappe.model.base_document import get_controller
from frappe.tests import IntegrationTestCase
from frappe.utils import nowdate

from clinic_flow.api.emergency import (
	confirm_emergency_arrival,
	create_emergency_alert,
	mark_emergency_reconciled,
)
from clinic_flow.api.queue import call_next, call_next_special
from clinic_flow.queue.engine import build_display_token


class TestHealthcareCompatibility(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self._ensure_gender("Male")
		self._ensure_gender("Other")

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

	def test_deprecated_healthcare_custom_fields_are_absent(self):
		expected_missing = {
			"Patient Appointment": ("custom_original_encounter",),
			"Patient Encounter": (
				"custom_awaiting_lab_return",
				"custom_lab_return_queued",
			),
		}

		for doctype, fieldnames in expected_missing.items():
			meta = frappe.get_meta(doctype)
			for fieldname in fieldnames:
				self.assertIsNone(
					meta.get_field(fieldname),
					f"{doctype}.{fieldname} should be absent",
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
		self.assertIn(
			"clinic_flow.patches.v16_0.remove_deprecated_healthcare_custom_fields",
			content,
		)

	def test_legacy_session_fallback_still_resolves_queue_code(self):
		"""
		Healthcare-boundary compat: a session with no service_point must still
		resolve a queue code from dept_abbr (legacy Medical Department source).
		"""
		from clinic_flow.queue.service_point import resolve_queue_code

		session = self._make_queue_session()
		self.assertFalse(bool(session.service_point))
		self.assertTrue(bool(session.dept_abbr))

		resolved = resolve_queue_code(
			service_point=session.service_point,
			dept_abbr=session.dept_abbr,
			practitioner=session.practitioner,
			department=session.department,
		)
		self.assertEqual(resolved, session.dept_abbr)

	def test_call_next_prioritizes_emergency_entries(self):
		session = self._make_queue_session()
		self._make_queue_entry(
			session.name,
			queue_type="WALK_IN",
			status="Ready Near Doctor",
			queue_position=2,
			token_number=2,
			token="TST-002",
		)
		emergency = self._make_queue_entry(
			session.name,
			queue_type="EMERGENCY",
			status="Ready Near Doctor",
			queue_position=3,
			token_number=3,
			token="TST-003",
			priority="emergency",
		)

		result = call_next(session.name)

		self.assertEqual(result["queue_entry"]["name"], emergency.name)
		self.assertEqual(
			frappe.db.get_value("Queue Entry", emergency.name, "status"),
			"With Doctor",
		)
		self.assertEqual(
			frappe.db.get_value("Queue Session", session.name, "current_token"),
			emergency.token,
		)

	def test_call_next_special_uses_oldest_ready_special_without_reordering(self):
		session = self._make_queue_session()
		older = self._make_queue_entry(
			session.name,
			queue_type="WALK_IN",
			status="Ready Near Doctor",
			queue_position=2,
			token_number=2,
			token="TST-002",
			priority="special",
		)
		newer = self._make_queue_entry(
			session.name,
			queue_type="WALK_IN",
			status="Ready Near Doctor",
			queue_position=5,
			token_number=5,
			token="TST-005",
			priority="special",
		)

		result = call_next_special(session.name)

		self.assertEqual(result["queue_entry"]["name"], older.name)
		self.assertEqual(
			frappe.db.get_value("Queue Entry", older.name, "status"),
			"With Doctor",
		)
		self.assertEqual(
			frappe.db.get_value("Queue Entry", newer.name, "status"),
			"Ready Near Doctor",
		)
		self.assertEqual(
			frappe.db.get_value("Queue Entry", older.name, "special_override_by"),
			frappe.session.user,
		)
		self.assertIsNotNone(
			frappe.db.get_value("Queue Entry", older.name, "special_override_at")
		)

	def test_phone_emergency_alert_can_arrive_and_be_reconciled(self):
		session = self._make_queue_session()

		alert = create_emergency_alert(
			queue_session=session.name,
			display_label="Phone Emergency",
			mobile="9999999999",
			complaint_summary="Breathing difficulty",
		)
		intake_name = alert["intake"]
		self.assertEqual(
			frappe.db.get_value("Emergency Intake", intake_name, "status"),
			"Alerted",
		)

		issued = confirm_emergency_arrival(intake_name)
		entry_name = issued["queue_entry"]
		self.assertEqual(
			frappe.db.get_value("Emergency Intake", intake_name, "status"),
			"Awaiting Reconciliation",
		)
		self.assertEqual(
			frappe.db.get_value("Queue Entry", entry_name, "priority"),
			"emergency",
		)
		self.assertEqual(
			frappe.db.get_value("Queue Entry", entry_name, "token"),
			build_display_token(session.dept_abbr, issued["token_number"]),
		)
		self.assertEqual(
			frappe.db.get_value("Queue Entry", entry_name, "status"),
			"Ready Near Doctor",
		)

		done = mark_emergency_reconciled(intake_name, notes="Desk completed")
		self.assertEqual(done["status"], "Reconciled")
		self.assertEqual(
			frappe.db.get_value("Emergency Intake", intake_name, "status"),
			"Reconciled",
		)

	def _ensure_gender(self, gender_name: str):
		if frappe.db.exists("Gender", gender_name):
			return gender_name
		return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

	def _make_patient(self, label: str):
		return frappe.get_doc(
			{
				"doctype": "Patient",
				"first_name": f"Test {label}",
				"sex": "Male",
			}
		).insert()

	def _make_department(self, label: str):
		dept_abbr = f"T{label[:3]}".upper()
		doc = frappe.get_doc(
			{
				"doctype": "Medical Department",
				"department": f"Test Department {label}",
				"custom_dept_abbr": dept_abbr,
			}
		)
		return doc.insert()

	def _make_practitioner(self, label: str, department: str | None = None):
		return frappe.get_doc(
			{
				"doctype": "Healthcare Practitioner",
				"first_name": f"Practitioner {label}",
				"gender": "Male",
				"department": department,
			}
		).insert()

	def _make_appointment_type(self, label: str, queue_code: str):
		doc = frappe.get_doc(
			{
				"doctype": "Appointment Type",
				"appointment_type": f"Test {label} {queue_code}",
				"allow_booking_for": "Practitioner",
				"default_duration": 15,
				"custom_queue_code": queue_code,
			}
		)
		return doc.insert()

	def _make_queue_session(self):
		label = frappe.generate_hash(length=6)
		department = self._make_department(label)
		practitioner = self._make_practitioner(label, department=department.name)
		self._make_appointment_type(frappe.generate_hash(length=6), "WLK")
		self._make_appointment_type(frappe.generate_hash(length=6), "EMR")
		return frappe.get_doc(
			{
				"doctype": "Queue Session",
				"session_name": f"Test Session {frappe.generate_hash(length=6)}",
				"department": department.name,
				"dept_abbr": department.custom_dept_abbr,
				"practitioner": practitioner.name,
				"session_date": nowdate(),
				"start_time": "09:00:00",
				"end_time": "12:00:00",
				"status": "Active",
				"session_capacity": 10,
			}
		).insert()

	def _make_queue_entry(
		self,
		queue_session: str,
		queue_type: str,
		status: str,
		queue_position: int,
		token_number: int,
		token: str,
		priority: str = "normal",
	):
		session = frappe.get_doc("Queue Session", queue_session)
		patient = self._make_patient(frappe.generate_hash(length=6))
		load_class = "review_load" if queue_type == "FOLLOW_UP" else "non_review_load"
		patient_type = "review" if load_class == "review_load" else "new"
		return frappe.get_doc(
			{
				"doctype": "Queue Entry",
				"queue_session": queue_session,
				"patient": patient.name,
				"practitioner": session.practitioner,
				"department": session.department,
				"dept_abbr": session.dept_abbr or "TST",
				"token_number": token_number,
				"token": token,
				"queue_type": queue_type,
				"load_class": load_class,
				"channel": "walkin",
				"patient_type": patient_type,
				"priority": priority,
				"status": status,
				"queue_position": queue_position,
				"issued_by": frappe.session.user,
				"issued_by_role": "Queue Manager",
			}
		).insert()
