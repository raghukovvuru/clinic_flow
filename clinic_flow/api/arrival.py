import frappe
from frappe import _
from frappe.utils import now_datetime, today, add_to_date


@frappe.whitelist()
def resolve_arrival_sessions(dept_abbr: str = "") -> list:
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
		"candidates": [dict(c) for c in candidates],
		"sessions": sessions,
	}


@frappe.whitelist()
def mark_arrived(queue_entry: str, queue_session: str = "") -> dict:
	"""
	Record a patient's physical arrival at the clinic.
	Valid from: Booked, Waiting.
	Idempotent: calling again when status is already Arrived returns without error.
	"""
	from clinic_flow.queue.engine import _broadcast_queue_update

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token", "patient_name", "token_number"],
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

	return {
		"status": "Arrived",
		"already_arrived": False,
		"token": entry.token,
		"token_number": entry.token_number,
		"patient_name": entry.patient_name,
		"queue_entry": entry.name,
	}


@frappe.whitelist()
def get_arrival_session_context(dept_abbr: str = "") -> dict:
	"""Summary payload for the arrival counter page header."""
	sessions = resolve_arrival_sessions(dept_abbr)
	if not sessions:
		return {"sessions": [], "has_active": False, "arrived_count": 0, "waiting_count": 0}

	session_names = [s["name"] for s in sessions]

	arrived_count = frappe.db.count(
		"Queue Entry",
		{"queue_session": ["in", session_names], "status": "Arrived"},
	)
	waiting_count = frappe.db.count(
		"Queue Entry",
		{"queue_session": ["in", session_names], "status": ["in", ["Booked", "Waiting"]]},
	)

	return {
		"sessions": sessions,
		"has_active": True,
		"arrived_count": arrived_count,
		"waiting_count": waiting_count,
	}
