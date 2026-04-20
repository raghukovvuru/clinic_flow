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
		# symptoms → custom_chief_complaint (Long Text custom field)
		# patient_note → encounter_comment (native text field)
		"symptoms": enc.get("custom_chief_complaint") or "",
		"diagnosis": enc.get("diagnosis"),
		"patient_note": enc.get("encounter_comment") or "",
		"drug_prescription": [
			{
				"medication": r.medication or "",
				"drug_code": r.drug_code or "",
				"dosage": r.dosage or "",
				"period": r.period or "",
				"dosage_form": r.dosage_form or "",
				"comment": r.comment or "",
			}
			for r in (enc.drug_prescription or [])
		],
		"lab_test_prescription": [
			{
				"observation_template": r.observation_template or "",
				"lab_test_comment": r.lab_test_comment or "",
			}
			for r in (enc.lab_test_prescription or [])
		],
		# procedure_prescription is read-only in this workspace — returned for display only,
		# never written back via save_encounter_draft (not present in CHILD_ALLOWED).
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

	FIELD_MAP = {
		"symptoms":     "custom_chief_complaint",
		"patient_note": "encounter_comment",
	}

	# Only these fields are writable on each child row — matches Healthcare v16 schema.
	# drug_name and lab_test_name are read-only fetch fields; never set them directly.
	CHILD_ALLOWED: dict[str, list[str]] = {
		"drug_prescription": ["medication", "drug_code", "dosage", "period", "dosage_form", "comment"],
		"lab_test_prescription": ["observation_template", "lab_test_comment"],
	}

	for ws_key, enc_field in FIELD_MAP.items():
		if ws_key in data:
			enc.set(enc_field, data[ws_key])

	for table_field, allowed_fields in CHILD_ALLOWED.items():
		if table_field not in data:
			continue
		rows = [
			{k: v for k, v in row.items() if k in allowed_fields}
			for row in (data[table_field] or [])
		]
		enc.set(table_field, rows)

	if "diagnosis" in data:
		enc.set("diagnosis", data["diagnosis"])

	# Draft saves are intentionally lenient — full validation runs at submit time.
	# This allows partial rows (e.g. drug rows without drug_code yet) to be saved
	# without triggering Healthcare's mandatory-field validators.
	enc.flags.ignore_validate = True
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


@frappe.whitelist()
def get_drug_items(medication: str) -> list[dict]:
    """Return items linked to a Medication record."""
    return frappe.get_all(
        "Medication Linked Item",
        filters={"parent": medication},
        fields=["item"],
    )


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
