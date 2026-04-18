import frappe

from clinic_flow.queue.engine import build_display_token


def execute():
	_update_queue_entries()
	_update_patient_appointments()
	_update_queue_sessions()


def _update_queue_entries():
	for row in frappe.get_all(
		"Queue Entry",
		filters={"token_number": [">", 0]},
		fields=["name", "dept_abbr", "token_number"],
		limit_page_length=0,
	):
		token = build_display_token(row.dept_abbr or "GEN", row.token_number)
		frappe.db.set_value("Queue Entry", row.name, "token", token, update_modified=False)


def _update_patient_appointments():
	rows = frappe.db.sql(
		"""
		SELECT
			pa.name AS appointment,
			qe.dept_abbr AS dept_abbr,
			qe.token_number AS token_number
		FROM `tabPatient Appointment` pa
		JOIN `tabQueue Entry` qe ON qe.appointment = pa.name
		WHERE qe.token_number > 0
		""",
		as_dict=True,
	)
	for row in rows:
		token = build_display_token(row.dept_abbr or "GEN", row.token_number)
		frappe.db.set_value(
			"Patient Appointment",
			row.appointment,
			"custom_queue_token",
			token,
			update_modified=False,
		)


def _update_queue_sessions():
	for session in frappe.get_all(
		"Queue Session",
		filters={"current_token": ["!=", ""]},
		fields=["name"],
		limit_page_length=0,
	):
		active_entry = frappe.db.get_value(
			"Queue Entry",
			{"queue_session": session.name, "status": "With Doctor"},
			["token"],
			as_dict=True,
		)
		if active_entry and active_entry.get("token"):
			frappe.db.set_value(
				"Queue Session",
				session.name,
				"current_token",
				active_entry["token"],
				update_modified=False,
			)
