import frappe
from frappe import _
from frappe.utils import now_datetime, today

from clinic_flow.api.admission import _canonical_priority, _set_canonical_queue_entry_fields, _next_normal_token
from clinic_flow.api.eta import recalculate_downstream_etas
from clinic_flow.queue.engine import _broadcast_queue_update, build_display_token
from clinic_flow.queue.service_point import resolve_queue_code


def _active_sessions() -> list[dict]:
	rows = frappe.get_all(
		"Queue Session",
		filters={"session_date": today(), "status": ["in", ["Active"]]},
		fields=["name", "session_name", "dept_abbr", "practitioner", "status", "start_time", "end_time"],
		order_by="start_time asc",
	)
	prac_ids = [r.practitioner for r in rows if r.practitioner]
	prac_map = {}
	if prac_ids:
		for p in frappe.get_all(
			"Healthcare Practitioner",
			filters={"name": ["in", prac_ids]},
			fields=["name", "practitioner_name"],
		):
			prac_map[p.name] = p.practitioner_name

	for row in rows:
		row["practitioner_name"] = prac_map.get(row.practitioner, row.practitioner)
	return rows


def _create_emergency_stub_patient(display_label: str = "", mobile: str = "") -> str:
	label = (display_label or "").strip() or "Emergency Intake"
	patient = frappe.get_doc({
		"doctype": "Patient",
		"first_name": "Emergency",
		"last_name": label[:80],
		"sex": "Other",
		"mobile": (mobile or "").strip() or None,
		"status": "Active",
	})
	patient.insert(ignore_permissions=True)
	return patient.name


def _next_queue_position(queue_session: str) -> int:
	rows = frappe.db.sql(
		"SELECT MAX(queue_position) FROM `tabQueue Entry` WHERE queue_session = %s",
		queue_session,
	)
	return int((rows[0][0] or 0) + 1)


def _issue_queue_entry_from_intake(intake_name: str, patient: str | None = None) -> dict:
	intake = frappe.get_doc("Emergency Intake", intake_name)
	if intake.queue_entry:
		return {
			"intake": intake.name,
			"queue_entry": intake.queue_entry,
			"patient": intake.patient,
		}

	if not intake.queue_session:
		frappe.throw(_("Queue Session is required to issue an emergency token."))

	session = frappe.get_doc("Queue Session", intake.queue_session)
	if session.status != "Active":
		frappe.throw(_("Emergency token can only be issued to an active session."))

	patient_name = patient or intake.patient or _create_emergency_stub_patient(
		display_label=intake.display_label or "",
		mobile=intake.mobile or "",
	)
	existing_tokens = {
		int(r[0])
		for r in frappe.db.sql(
			"SELECT token_number FROM `tabQueue Entry` WHERE queue_session = %s AND token_number > 0",
			intake.queue_session,
		)
		if r and r[0]
	}
	token_number = _next_normal_token(existing_tokens)

	entry = frappe.new_doc("Queue Entry")
	entry.queue_session = intake.queue_session
	entry.patient = patient_name
	entry.practitioner = session.practitioner
	entry.department = session.department
	entry.dept_abbr = session.dept_abbr
	entry.token_number = token_number
	# Emergency shares queue identity with the session. The "EMR" literal
	# is intentionally retired: urgency is conveyed via status/UX, not prefix.
	queue_code = resolve_queue_code(
		service_point=session.service_point,
		dept_abbr=session.dept_abbr,
		practitioner=session.practitioner,
		department=session.department,
	)
	entry.token = build_display_token(queue_code, token_number)
	entry.queue_position = _next_queue_position(intake.queue_session)
	entry.queue_type = "EMERGENCY"
	entry.load_class = "non_review_load"
	_set_canonical_queue_entry_fields(
		entry,
		channel="walkin",
		load_class="non_review_load",
		priority=_canonical_priority(emergency=True),
	)
	entry.status = "Ready Near Doctor"
	entry.issued_by = frappe.session.user
	entry.issued_by_role = "Reception"
	if intake.complaint_summary:
		entry.notes = intake.complaint_summary
	entry.save(ignore_permissions=True)

	intake.patient = patient_name
	intake.queue_entry = entry.name
	intake.status = "Awaiting Reconciliation"
	intake.issued_at = intake.issued_at or now_datetime()
	intake.arrival_confirmed_at = intake.arrival_confirmed_at or now_datetime()
	intake.save(ignore_permissions=True)

	_broadcast_queue_update(intake.queue_session)
	recalculate_downstream_etas(intake.queue_session)

	return {
		"intake": intake.name,
		"queue_entry": entry.name,
		"patient": patient_name,
		"token": entry.token,
		"token_number": token_number,
	}


@frappe.whitelist()
def get_emergency_sessions() -> list[dict]:
	"""Active sessions that can accept a live walk-in emergency."""
	frappe.has_permission("Queue Session", "read", throw=True)
	return _active_sessions()


@frappe.whitelist()
def create_emergency_alert(
	queue_session: str,
	display_label: str = "",
	mobile: str = "",
	complaint_summary: str = "",
) -> dict:
	"""Phone-side emergency advisory. No queue entry is created yet."""
	frappe.only_for(["Queue Manager", "System Manager"])

	session = frappe.db.get_value(
		"Queue Session",
		queue_session,
		["name", "practitioner", "status"],
		as_dict=True,
	)
	if not session or session.status != "Active":
		frappe.throw(_("Select an active session for the emergency alert."))

	doc = frappe.get_doc({
		"doctype": "Emergency Intake",
		"channel": "phone",
		"status": "Alerted",
		"queue_session": session.name,
		"practitioner": session.practitioner,
		"display_label": (display_label or "").strip(),
		"mobile": (mobile or "").strip(),
		"complaint_summary": (complaint_summary or "").strip(),
		"issued_by": frappe.session.user,
		"alerted_at": now_datetime(),
	})
	doc.insert(ignore_permissions=True)
	_broadcast_queue_update(session.name)
	return {"intake": doc.name, "status": doc.status}


@frappe.whitelist()
def issue_emergency_token(
	queue_session: str,
	patient: str | None = None,
	display_label: str = "",
	mobile: str = "",
	complaint_summary: str = "",
) -> dict:
	"""Walk-in emergency issuance: create intake + real queue entry immediately."""
	frappe.only_for(["Queue Manager", "System Manager"])

	session = frappe.db.get_value(
		"Queue Session",
		queue_session,
		["name", "practitioner", "status"],
		as_dict=True,
	)
	if not session or session.status != "Active":
		frappe.throw(_("Emergency token can only be issued to an active session."))

	doc = frappe.get_doc({
		"doctype": "Emergency Intake",
		"channel": "walkin",
		"status": "Awaiting Reconciliation",
		"queue_session": session.name,
		"practitioner": session.practitioner,
		"patient": patient or None,
		"display_label": (display_label or "").strip(),
		"mobile": (mobile or "").strip(),
		"complaint_summary": (complaint_summary or "").strip(),
		"issued_by": frappe.session.user,
		"issued_at": now_datetime(),
		"arrival_confirmed_at": now_datetime(),
	})
	doc.insert(ignore_permissions=True)
	issued = _issue_queue_entry_from_intake(doc.name, patient=patient)
	issued["status"] = "Awaiting Reconciliation"
	return issued


@frappe.whitelist()
def confirm_emergency_arrival(
	intake_name: str,
	patient: str | None = None,
	display_label: str = "",
	mobile: str = "",
	complaint_summary: str = "",
) -> dict:
	"""Convert a phone emergency alert into a real walk-in emergency queue entry."""
	frappe.only_for(["Queue Manager", "System Manager"])

	intake = frappe.get_doc("Emergency Intake", intake_name)
	if intake.status != "Alerted":
		frappe.throw(_("Only alerted phone emergencies can be confirmed on arrival."))

	if display_label:
		intake.display_label = display_label.strip()
	if mobile:
		intake.mobile = mobile.strip()
	if complaint_summary:
		intake.complaint_summary = complaint_summary.strip()
	intake.channel = "walkin"
	intake.status = "Awaiting Reconciliation"
	intake.arrival_confirmed_at = now_datetime()
	intake.issued_at = intake.issued_at or now_datetime()
	if patient:
		intake.patient = patient
	intake.save(ignore_permissions=True)
	issued = _issue_queue_entry_from_intake(intake.name, patient=patient)
	issued["status"] = "Awaiting Reconciliation"
	return issued


@frappe.whitelist()
def mark_emergency_reconciled(intake_name: str, notes: str = "") -> dict:
	"""Mark a pending emergency intake as reconciled after desk formalities are done."""
	frappe.only_for(["Queue Manager", "System Manager"])
	intake = frappe.get_doc("Emergency Intake", intake_name)
	intake.status = "Reconciled"
	intake.reconciled_by = frappe.session.user
	intake.reconciled_at = now_datetime()
	if notes:
		intake.notes = notes.strip()
	intake.save(ignore_permissions=True)
	if intake.queue_session:
		_broadcast_queue_update(intake.queue_session)
	return {"intake": intake.name, "status": intake.status}


@frappe.whitelist()
def get_open_emergency_intakes(queue_session: str = "") -> list[dict]:
	"""Pending emergency alerts/intakes for today, optionally scoped to a session."""
	filters = {
		"status": ["in", ["Alerted", "Awaiting Reconciliation"]],
	}
	if queue_session:
		filters["queue_session"] = queue_session
	rows = frappe.get_all(
		"Emergency Intake",
		filters=filters,
		fields=[
			"name", "channel", "status", "queue_session", "practitioner", "patient",
			"queue_entry", "display_label", "mobile", "complaint_summary",
			"issued_by", "alerted_at", "issued_at", "arrival_confirmed_at",
		],
		order_by="modified desc",
		limit=20,
	)
	for row in rows:
		if row.get("queue_entry"):
			qe = frappe.db.get_value(
				"Queue Entry",
				row.queue_entry,
				["status", "token", "token_number", "patient_name"],
				as_dict=True,
			) or {}
			row["queue_status"] = qe.get("status")
			row["token"] = qe.get("token")
			row["token_number"] = qe.get("token_number")
			row["patient_name"] = qe.get("patient_name")
		else:
			row["queue_status"] = None
			row["token"] = ""
			row["token_number"] = None
			row["patient_name"] = ""
		if not row.get("patient_name"):
			row["patient_name"] = row.get("display_label") or "Emergency Intake"
	return rows
