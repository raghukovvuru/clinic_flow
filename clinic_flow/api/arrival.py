import frappe
from frappe import _
from frappe.utils import now_datetime, today, add_to_date

from clinic_flow.api.arrival_permissions import enforce_arrival_counter_access


@frappe.whitelist()
def resolve_arrival_sessions(dept_abbr: str = "") -> list:
	enforce_arrival_counter_access()

	"""
	Sessions that can accept patient arrivals right now:
	  - Active and Paused sessions always qualify.
	  - Scheduled sessions qualify if their start_time is within the next 30 minutes
	    (pre-arrival window so patients can check in before the doctor starts).
	"""
	now = now_datetime()
	cutoff_time = add_to_date(now, minutes=30).strftime("%H:%M:%S")

	active_filters: dict = {
		"session_date": today(),
		"status": ["in", ["Active", "Paused"]],
	}
	if dept_abbr:
		active_filters["dept_abbr"] = dept_abbr.upper()

	sessions: list = frappe.get_all(
		"Queue Session",
		filters=active_filters,
		fields=["name", "session_name", "dept_abbr", "practitioner", "status", "start_time"],
	)

	# Scheduled sessions whose start time falls within the next 30-minute window
	dept_clause = "AND dept_abbr = %(dept_abbr)s" if dept_abbr else ""
	scheduled = frappe.db.sql(
		f"""
		SELECT name, session_name, dept_abbr, practitioner, status, start_time
		FROM `tabQueue Session`
		WHERE session_date = %(today)s
		  AND status = 'Scheduled'
		  AND TIME(start_time) <= %(cutoff)s
		  {dept_clause}
		""",
		{
			"today": today(),
			"cutoff": cutoff_time,
			"dept_abbr": dept_abbr.upper() if dept_abbr else None,
		},
		as_dict=True,
	)

	seen = {s["name"] for s in sessions}
	for s in scheduled:
		if s["name"] not in seen:
			sessions.append(s)
			seen.add(s["name"])

	return sessions


def _session_summary(row: dict) -> dict:
	return {
		"name": row.get("name"),
		"session_name": row.get("session_name"),
		"dept_abbr": row.get("dept_abbr"),
		"practitioner": row.get("practitioner"),
		"status": row.get("status"),
		"start_time": str(row.get("start_time") or ""),
	}


def _candidate_summary(row: dict) -> dict:
	display_token = row.get("token") or row.get("name")
	state_label = "Already Arrived" if row.get("status") == "Arrived" else "Ready to Confirm"
	visit_label = "Review Patient" if row.get("load_class") == "review_load" else "New Patient"

	from clinic_flow.utils import get_token_qr_svg

	qr_svg = get_token_qr_svg(row.get("name"))

	print_context = {
		"queue_entry": row.get("name"),
		"display_token": display_token,
		"patient_name": row.get("patient_name"),
		"qr_svg": qr_svg,
	}

	return {
		**dict(row),
		"queue_entry": row.get("name"),
		"display_token": display_token,
		"state_label": state_label,
		"visit_label": visit_label,
		"print_context": print_context,
	}


@frappe.whitelist()
def lookup_arrival_candidate(
	qr_code: str = "",
	phone: str = "",
	name_query: str = "",
	dept_abbr: str = "",
) -> dict:
	"""
	Find Queue Entries eligible for arrival check-in.
	Lookup priority: QR scan (exact docname) > phone number > patient name.
	Returns up to 10 candidates from today's arrival-eligible sessions.
	"""
	enforce_arrival_counter_access()
	sessions = resolve_arrival_sessions(dept_abbr)
	if not sessions:
		return {"candidates": [], "error": "no_active_session"}

	session_names = [s["name"] for s in sessions]
	ELIGIBLE_STATUSES = ["Booked", "Waiting", "Arrived"]
	CANDIDATE_FIELDS = [
		"name", "token", "token_number", "patient", "patient_name",
		"queue_session", "status", "queue_position", "dept_abbr",
		"load_class", "priority", "channel", "arrived_at",
	]

	candidates: list = []

	if qr_code:
		# QR code printed on the slip encodes the Queue Entry docname directly
		entry = frappe.db.get_value(
			"Queue Entry",
			{"name": qr_code, "queue_session": ["in", session_names],
			 "status": ["in", ELIGIBLE_STATUSES]},
			CANDIDATE_FIELDS,
			as_dict=True,
		)
		if entry:
			candidates = [entry]

	elif phone:
		phone_clean = "".join(c for c in phone if c.isdigit() or c == "+")
		if len(phone_clean) < 6:
			return {"candidates": [], "error": "phone_too_short"}

		# Match on trailing 6 digits of the mobile field (handles country-code variants)
		rows = frappe.db.sql(
			"""
			SELECT
				qe.name, qe.token, qe.token_number, qe.patient, qe.patient_name,
				qe.queue_session, qe.status, qe.queue_position, qe.dept_abbr,
				qe.load_class, qe.priority, qe.channel, qe.arrived_at
			FROM `tabQueue Entry` qe
			JOIN `tabPatient` p ON p.name = qe.patient
			WHERE qe.queue_session IN %(sessions)s
			  AND qe.status IN %(statuses)s
			  AND p.mobile LIKE %(phone_tail)s
			ORDER BY qe.queue_position ASC
			LIMIT 10
			""",
			{
				"sessions": tuple(session_names),
				"statuses": tuple(ELIGIBLE_STATUSES),
				"phone_tail": f"%{phone_clean[-6:]}",
			},
			as_dict=True,
		)
		candidates = list(rows)

	elif name_query and len(name_query.strip()) >= 2:
		candidates = frappe.get_all(
			"Queue Entry",
			filters={
				"queue_session": ["in", session_names],
				"status": ["in", ELIGIBLE_STATUSES],
				"patient_name": ["like", f"%{name_query.strip()}%"],
			},
			fields=CANDIDATE_FIELDS,
			order_by="queue_position asc",
			limit=10,
		)

	else:
		return {"candidates": [], "error": "no_search_criteria"}

	return {
		"candidates": [_candidate_summary(c) for c in candidates],
		"sessions": sessions,
	}


@frappe.whitelist()
def mark_arrived(queue_entry: str, queue_session: str = "") -> dict:
	"""
	Record a patient's physical arrival at the clinic.
	Valid from: Booked, Waiting.
	Idempotent: calling again when status is already Arrived returns without error.
	"""
	enforce_arrival_counter_access()
	from clinic_flow.queue.engine import _broadcast_queue_update

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token", "token_number",
		 "patient_name", "patient", "dept_abbr", "load_class",
		 "channel", "priority", "queue_position", "arrived_at"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if queue_session and entry.queue_session != queue_session:
		frappe.throw(
			_("Queue Entry does not belong to the given session."),
			frappe.ValidationError,
		)

	if entry.status == "Arrived":
		return {
			"status": "Arrived",
			"already_arrived": True,
			"token": entry.token,
			"patient_name": entry.patient_name,
			"queue_entry": entry.name,
			"result_card": _candidate_summary(dict(entry)),
		}

	if entry.status not in ("Booked", "Waiting"):
		frappe.throw(
			_("Cannot mark Arrived: patient status is '{0}' (expected Booked or Waiting).").format(
				entry.status
			),
			frappe.ValidationError,
		)

	frappe.db.set_value("Queue Entry", queue_entry, {
		"status": "Arrived",
		"arrived_at": now_datetime(),
	})

	_broadcast_queue_update(entry.queue_session)

	entry_dict = dict(entry)
	entry_dict["status"] = "Arrived"
	entry_dict["arrived_at"] = now_datetime()

	return {
		"status": "Arrived",
		"already_arrived": False,
		"token": entry.token,
		"token_number": entry.token_number,
		"patient_name": entry.patient_name,
		"queue_entry": entry.name,
		"result_card": _candidate_summary(entry_dict),
	}


@frappe.whitelist()
def get_token_qr(queue_entry: str) -> str:
	"""
	Returns the QR code SVG for a Queue Entry, for inline embedding in print slips.
	The QR encodes the docname so the arrival counter scanner can identify the patient.
	"""
	enforce_arrival_counter_access()
	from clinic_flow.utils import get_token_qr_svg
	return get_token_qr_svg(queue_entry)


@frappe.whitelist()
def get_arrival_session_context(dept_abbr: str = "") -> dict:
	"""Summary payload for the arrival counter page header."""
	enforce_arrival_counter_access()
	sessions = resolve_arrival_sessions(dept_abbr)
	if not sessions:
		return {
			"sessions": [], "has_active": False,
			"arrived_count": 0, "waiting_count": 0,
			"stats": {"arrived": 0, "awaiting_arrival": 0},
			"current_session": None, "next_session": None,
			"recent_arrivals": [],
		}

	session_names = [s["name"] for s in sessions]

	arrived_count = frappe.db.count(
		"Queue Entry",
		{"queue_session": ["in", session_names], "status": "Arrived"},
	)
	waiting_count = frappe.db.count(
		"Queue Entry",
		{"queue_session": ["in", session_names], "status": ["in", ["Booked", "Waiting"]]},
	)

	current_session = None
	next_session = None
	for s in sessions:
		if not current_session and s["status"] in ("Active", "Paused"):
			current_session = _session_summary(s)
		if not next_session and s["status"] == "Scheduled":
			next_session = _session_summary(s)
		if current_session and next_session:
			break

	recent_arrivals = frappe.db.sql(
		"""
		SELECT name AS queue_entry, token AS display_token,
		       patient_name, arrived_at, status
		FROM `tabQueue Entry`
		WHERE queue_session IN %(sessions)s
		  AND status = 'Arrived'
		ORDER BY arrived_at DESC
		LIMIT 8
		""",
		{"sessions": tuple(session_names)},
		as_dict=True,
	)

	return {
		"sessions": sessions,
		"has_active": True,
		"arrived_count": arrived_count,
		"waiting_count": waiting_count,
		"stats": {"arrived": arrived_count, "awaiting_arrival": waiting_count},
		"current_session": current_session,
		"next_session": next_session,
		"recent_arrivals": recent_arrivals,
	}
