import frappe
from frappe import _


@frappe.whitelist()
def get_workspace_payload(patient: str, encounter: str, queue_entry: str) -> dict:
	"""
	Master payload returned to the doctor workspace on Call Next and page load.
	Assembles all three panels' data in one round-trip.
	"""
	frappe.has_permission("Patient Encounter", "read", encounter, throw=True)

	from clinic_flow.api.patient_data import get_patient_summary
	return {
		"encounter": _get_encounter_data(encounter),
		"patient_summary": get_patient_summary(patient),
		"queue_entry": frappe.get_doc("Queue Entry", queue_entry).as_dict(),
	}


def _get_encounter_data(encounter: str) -> dict:
	enc = frappe.get_doc("Patient Encounter", encounter)
	return {
		"name": enc.name,
		"docstatus": enc.docstatus,
		"patient": enc.patient,
		"practitioner": enc.practitioner,
		"encounter_date": enc.encounter_date,
		# Clinical fields the doctor edits:
		# symptoms → custom_chief_complaint (Long Text custom field)
		# patient_note → encounter_comment (native text field)
		"symptoms": enc.get("custom_chief_complaint") or "",
		"diagnosis": enc.get("diagnosis"),
		"patient_note": enc.get("encounter_comment") or "",
		"drug_prescription": [r.as_dict() for r in (enc.drug_prescription or [])],
		"lab_test_prescription": [r.as_dict() for r in (enc.lab_test_prescription or [])],
		"procedure_prescription": [r.as_dict() for r in (enc.procedure_prescription or [])],
	}


@frappe.whitelist()
def save_encounter_draft(encounter: str, data: str) -> dict:
	"""
	Saves edits from the workspace into the Patient Encounter (Draft).
	`data` is a JSON string with partial encounter fields.
	Only Draft (docstatus=0) encounters can be saved here.
	"""
	frappe.has_permission("Patient Encounter", "write", encounter, throw=True)

	if isinstance(data, str):
		data = frappe.parse_json(data)

	enc = frappe.get_doc("Patient Encounter", encounter)
	if enc.docstatus != 0:
		frappe.throw(_("Cannot edit a submitted encounter."), frappe.ValidationError)

	# Map workspace keys → actual Patient Encounter field names
	FIELD_MAP = {
		"symptoms":     "custom_chief_complaint",
		"patient_note": "encounter_comment",
	}
	ALLOWED_CHILD_TABLES = {
		"drug_prescription": "Drug Prescription",
		"lab_test_prescription": "Lab Prescription",
		"procedure_prescription": "Procedure Prescription",
	}

	for ws_key, enc_field in FIELD_MAP.items():
		if ws_key in data:
			enc.set(enc_field, data[ws_key])

	for table_field in ALLOWED_CHILD_TABLES:
		if table_field in data:
			enc.set(table_field, data[table_field])

	# Diagnosis is a child table in newer Frappe Healthcare
	if "diagnosis" in data:
		enc.set("diagnosis", data["diagnosis"])

	enc.save(ignore_permissions=False)
	return {"status": "saved", "name": enc.name}


@frappe.whitelist()
def submit_encounter(encounter: str) -> dict:
	"""
	Submits the Patient Encounter after doctor finishes.
	Also marks the Queue Entry as Done.
	"""
	frappe.has_permission("Patient Encounter", "submit", encounter, throw=True)

	enc = frappe.get_doc("Patient Encounter", encounter)
	if enc.docstatus != 0:
		frappe.throw(_("Encounter is not in Draft state."), frappe.ValidationError)

	try:
		enc.submit()
	except frappe.ValidationError as e:
		return {"status": "error", "message": str(e)}

	# Mark Queue Entry as Done
	entries = frappe.get_all(
		"Queue Entry",
		filters={"patient_encounter": encounter},
		fields=["name", "queue_session"],
	)
	for entry in entries:
		frappe.db.set_value("Queue Entry", entry.name, {
			"status": "Done",
			"done_at": frappe.utils.now_datetime(),
		})
		# Update session type counter
		entry_doc = frappe.get_doc("Queue Entry", entry.name)
		_decrement_session_counter(entry.queue_session, entry_doc.queue_type)

	return {"status": "submitted", "name": enc.name}


def _decrement_session_counter(queue_session: str, queue_type: str) -> None:
	"""Track used slot counts on the session."""
	field_map = {
		"PRE_BOOKED": "prebooked_used",
		"WALK_IN": "walkin_used",
		"EMERGENCY": "emergency_used",
		"FOLLOW_UP": "walkin_used",  # follow-ups share walk-in counter
	}
	field = field_map.get(queue_type)
	if field:
		current = frappe.db.get_value("Queue Session", queue_session, field) or 0
		frappe.db.set_value("Queue Session", queue_session, field, current + 1)
