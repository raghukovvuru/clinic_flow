import frappe
from frappe.utils import today, add_days


def get_patient_summary(patient: str) -> dict:
	"""
	Assembles the right-panel patient summary.
	Called internally — not directly whitelisted (called via get_workspace_payload).
	"""
	pat = frappe.get_doc("Patient", patient)

	return {
		"demographics": _get_demographics(pat),
		"vitals": _get_latest_vitals(patient),
		"allergies": _get_allergies(patient),
		"active_medications": _get_active_medications(patient),
		"recent_diagnoses": _get_recent_diagnoses(patient),
		"last_encounter_summary": _get_last_encounter_summary(patient),
		"recent_lab_results": _get_recent_lab_results(patient),
		"fee_validity": _get_fee_validity(patient),
		"open_orders": _get_open_orders(patient),
	}


def _get_demographics(pat) -> dict:
	return {
		"patient_name": pat.patient_name,
		"age": pat.age,
		"sex": pat.sex,
		"blood_group": pat.blood_group,
		"dob": pat.dob,
		"mobile": pat.mobile,
	}


def _get_latest_vitals(patient: str) -> dict:
	vitals = frappe.get_all(
		"Vital Signs",
		filters={"patient": patient},
		fields=["temperature", "pulse", "respiratory_rate",
				"bp_systolic", "bp_diastolic", "height", "weight", "bmi",
				"signs_date", "signs_time"],
		order_by="signs_date desc, signs_time desc",
		limit=1,
	)
	return vitals[0] if vitals else {}


def _get_allergies(patient: str) -> list:
	# Allergies stored on Patient DocType in Marley
	pat = frappe.get_doc("Patient", patient)
	return [a.as_dict() for a in (pat.get("allergy_medical_details") or [])]


def _get_active_medications(patient: str) -> list:
	# Get last encounter's drug prescription as proxy for active medications
	encounters = frappe.get_all(
		"Patient Encounter",
		filters={"patient": patient, "docstatus": 1},
		fields=["name", "encounter_date"],
		order_by="encounter_date desc",
		limit=3,
	)
	meds = []
	for enc in encounters:
		enc_doc = frappe.get_doc("Patient Encounter", enc.name)
		for rx in (enc_doc.drug_prescription or []):
			meds.append({
				"drug_name": rx.drug_name,
				"dosage": rx.dosage,
				"period": rx.period,
				"encounter_date": enc.encounter_date,
			})
		if meds:
			break  # Return meds from most recent encounter that has them
	return meds


def _get_recent_diagnoses(patient: str) -> list:
	encounters = frappe.get_all(
		"Patient Encounter",
		filters={"patient": patient, "docstatus": 1},
		fields=["name", "encounter_date"],
		order_by="encounter_date desc",
		limit=5,
	)
	diagnoses = []
	for enc in encounters:
		enc_doc = frappe.get_doc("Patient Encounter", enc.name)
		for dx in (enc_doc.diagnosis or []):
			diagnoses.append({
				"diagnosis": dx.diagnosis,
				"encounter_date": enc.encounter_date,
			})
	return diagnoses[:10]


def _get_last_encounter_summary(patient: str) -> dict:
	last = frappe.get_all(
		"Patient Encounter",
		filters={"patient": patient, "docstatus": 1},
		fields=["name", "encounter_date", "practitioner", "encounter_comment"],
		order_by="encounter_date desc",
		limit=1,
	)
	return last[0] if last else {}


def _get_recent_lab_results(patient: str) -> list:
	"""
	Fetches recent Diagnostic Reports (newer Marley/Frappe Health).
	Falls back to Lab Test if Diagnostic Report DocType doesn't exist.
	"""
	try:
		reports = frappe.get_all(
			"Diagnostic Report",
			filters={"patient": patient, "status": "Final"},
			fields=["name", "result_date", "practitioner"],
			order_by="result_date desc",
			limit=5,
		)
		return reports
	except Exception:
		# Fallback: Lab Test (older Marley)
		try:
			return frappe.get_all(
				"Lab Test",
				filters={"patient": patient, "docstatus": 1},
				fields=["name", "result_date", "practitioner"],
				order_by="result_date desc",
				limit=5,
			)
		except Exception:
			return []


def _get_fee_validity(patient: str) -> dict:
	"""
	Checks if patient has a valid Fee Validity record.
	Fee Validity is a standard Frappe Healthcare DocType.
	"""
	try:
		validity = frappe.get_all(
			"Fee Validity",
			filters={
				"patient": patient,
				"valid_till": [">=", today()],
			},
			fields=["name", "valid_till", "practitioner", "max_visits", "visited"],
			order_by="valid_till desc",
			limit=1,
		)
		if validity:
			v = validity[0]
			return {
				"has_validity": True,
				"valid_till": v.valid_till,
				"practitioner": v.practitioner,
				"visits_remaining": (v.max_visits or 0) - (v.visited or 0),
			}
	except Exception:
		pass
	return {"has_validity": False}


def _get_open_orders(patient: str) -> list:
	"""
	Returns open Service Requests (pending lab tests, procedures).
	Service Request is the FHIR-aligned DocType in newer Marley.
	"""
	try:
		return frappe.get_all(
			"Service Request",
			filters={
				"patient": patient,
				"status": ["in", ["Draft", "Requested", "Received"]],
			},
			fields=["name", "order_date", "template_dt", "template_dn", "status"],
			order_by="order_date desc",
			limit=10,
		)
	except Exception:
		return []
