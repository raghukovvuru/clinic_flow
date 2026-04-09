import frappe
from frappe import _
from frappe.utils import now_datetime, today
from clinic_flow.queue.engine import get_next_token, _broadcast_queue_update


@frappe.whitelist()
def get_today_schedules() -> dict:
	"""
	Returns today's schedule slots for the logged-in practitioner.
	Used by the Doctor Workspace Start Session dialog.
	"""
	from frappe.utils import getdate

	prac = frappe.db.get_value(
		"Healthcare Practitioner",
		{"user_id": frappe.session.user},
		["name", "practitioner_name"],
		as_dict=True,
	)
	if not prac:
		return {"practitioner": None, "practitioner_name": None, "schedules": []}

	today_day = getdate().strftime("%A")  # "Monday", "Saturday" etc.

	rows = frappe.db.sql("""
		SELECT
			psu.schedule        AS schedule,
			psu.service_unit    AS service_unit,
			ts.from_time        AS from_time,
			ts.to_time          AS to_time,
			ts.maximum_appointments AS capacity
		FROM `tabPractitioner Service Unit Schedule` psu
		JOIN `tabHealthcare Schedule Time Slot` ts
		  ON ts.parent = psu.schedule AND ts.parenttype = 'Practitioner Schedule'
		WHERE psu.parent = %(prac)s
		  AND psu.parenttype = 'Healthcare Practitioner'
		  AND ts.day = %(day)s
	""", {"prac": prac.name, "day": today_day}, as_dict=True)

	return {
		"practitioner":      prac.name,
		"practitioner_name": prac.practitioner_name,
		"schedules":         rows,
	}


@frappe.whitelist()
def start_session(
	schedule: str = "",
	from_time: str = "",
	to_time: str = "",
	capacity: int = 0,
) -> dict:
	"""
	Start a Queue Session for the logged-in practitioner.
	- schedule provided  → derive name, times, capacity from the Practitioner Schedule.
	- schedule omitted   → unscheduled session; use from_time / to_time / capacity from caller.
	Practitioner is always auto-detected from the session user — never accepted from the client.
	"""
	from frappe.utils import getdate, formatdate

	# ── Identify the practitioner ──────────────────────────────────────────
	prac = frappe.db.get_value(
		"Healthcare Practitioner",
		{"user_id": frappe.session.user},
		["name", "practitioner_name", "department"],
		as_dict=True,
	)
	if not prac:
		frappe.throw(
			_("Your account is not linked to a Healthcare Practitioner. Contact the administrator."),
			frappe.PermissionError,
		)

	# ── Re-use today's active/scheduled session if one exists ──────────────
	existing = frappe.get_all(
		"Queue Session",
		filters={
			"practitioner": prac.name,
			"session_date": today(),
			"status": ["in", ["Scheduled", "Active"]],
		},
		fields=["name", "status", "session_name", "dept_abbr"],
		limit=1,
	)
	if existing:
		s = existing[0]
		if s.status == "Scheduled":
			frappe.db.set_value("Queue Session", s.name, "status", "Active")
		return {"session": s.name, "session_name": s.session_name,
				"dept_abbr": s.dept_abbr, "created": False}

	# ── Dept abbr ─────────────────────────────────────────────────────────
	dept_abbr = ""
	if prac.department:
		dept_abbr = frappe.db.get_value(
			"Medical Department", prac.department, "custom_dept_abbr"
		) or ""

	date_str = formatdate(today(), "EEE dd MMM yyyy")  # e.g. "Sun 05 Apr 2026"

	# ── Scheduled vs unscheduled ──────────────────────────────────────────
	if schedule:
		today_day = getdate().strftime("%A")
		slot = frappe.db.get_value(
			"Healthcare Schedule Time Slot",
			{"parent": schedule, "day": today_day},
			["from_time", "to_time", "maximum_appointments"],
			as_dict=True,
		)
		if not slot:
			frappe.throw(_(f"No time slot found for {today_day} in schedule '{schedule}'."))

		from_time = str(slot.from_time)
		to_time   = str(slot.to_time)
		session_cap = int(slot.maximum_appointments or 20)

		# Strip practitioner name from schedule name for a cleaner label
		label = schedule.replace(prac.practitioner_name or "", "").strip(" -·")
		session_name = f"{label} · {date_str}"
	else:
		# Unscheduled — caller provides times and optional capacity
		session_cap = int(capacity) if capacity else 20
		_honorifics = {"dr", "mr", "ms", "mrs", "prof", "sr", "jr"}
		_parts = (prac.practitioner_name or "Doctor").split()
		first_name = next(
			(p for p in _parts if p.rstrip(".").lower() not in _honorifics),
			_parts[-1] if _parts else "Doctor",
		)
		session_name = f"Unscheduled · {first_name} · {date_str}"

	session_doc = frappe.get_doc({
		"doctype":          "Queue Session",
		"session_name":     session_name,
		"practitioner":     prac.name,
		"session_date":     today(),
		"start_time":       from_time,
		"end_time":         to_time,
		"dept_abbr":        dept_abbr,
		"session_capacity": session_cap,
		"status":           "Active",
	})
	session_doc.insert(ignore_permissions=True)

	# Inherit any Waiting entries that were checked in while the doctor was between
	# sessions (i.e. while a prior session was Completed).  Re-parent them to this
	# new session so the round-robin picks them up immediately.
	_inherit_waiting_entries(prac.name, session_doc.name)

	return {"session": session_doc.name, "session_name": session_name,
			"dept_abbr": dept_abbr, "created": True}


@frappe.whitelist()
def get_session(queue_session: str) -> dict | None:
	"""Verify a session is Active today AND belongs to the current user's practitioner."""
	if not frappe.db.exists("Queue Session", queue_session):
		return None
	s = frappe.db.get_value(
		"Queue Session", queue_session,
		["name", "session_name", "status", "session_date", "dept_abbr", "practitioner"],
		as_dict=True,
	)
	if not (s and s.status == "Active" and str(s.session_date) == today()):
		return None
	# Verify ownership — reject sessions that belong to a different practitioner
	own_practitioner = frappe.db.get_value(
		"Healthcare Practitioner", {"user_id": frappe.session.user}, "name"
	)
	if own_practitioner and s.practitioner != own_practitioner:
		return None
	return s


@frappe.whitelist()
def get_slot_availability(practitioner: str, appointment_date: str) -> dict:
	"""
	Returns remaining bookable slots by queue type for a practitioner on a date.
	Called by the receptionist before booking to see what's available.
	"""
	import math as _math
	config = frappe.get_single("Slot Partition Config")

	# Try to get slot totals from an existing Queue Session for that date
	session_row = frappe.db.get_value(
		"Queue Session",
		{"practitioner": practitioner, "session_date": appointment_date,
		 "status": ["in", ["Scheduled", "Active"]]},
		["prebooked_total", "walkin_total", "emergency_total", "session_capacity"],
		as_dict=True,
	)

	if session_row and session_row.prebooked_total:
		# Use the session's pre-calculated totals
		limits = {
			"PRE_BOOKED": session_row.prebooked_total,
			"WALK_IN":    session_row.walkin_total or 0,
			"FOLLOW_UP":  session_row.emergency_total or 0,
			"EMERGENCY":  9999,
		}
	else:
		# No session yet — derive from default capacity × percentages
		cap = (session_row.session_capacity if session_row else None) or 20
		limits = {
			"PRE_BOOKED": _math.ceil(cap * (config.prebooked_pct or 60) / 100),
			"WALK_IN":    _math.ceil(cap * (config.walkin_pct    or 30) / 100),
			"FOLLOW_UP":  _math.ceil(cap * (config.followup_pct  or 10) / 100),
			"EMERGENCY":  9999,
		}

	rows = frappe.db.sql("""
		SELECT custom_queue_type, COUNT(*) AS cnt
		FROM `tabPatient Appointment`
		WHERE practitioner = %s
		  AND appointment_date = %s
		  AND custom_queue_type IS NOT NULL
		  AND custom_queue_type != ''
		  AND status NOT IN ('Cancelled', 'No Show')
		GROUP BY custom_queue_type
	""", (practitioner, appointment_date), as_dict=True)

	used = {r.custom_queue_type: r.cnt for r in rows}

	return {
		qt: {
			"limit":     limits[qt],
			"used":      used.get(qt, 0),
			"available": max(0, limits[qt] - used.get(qt, 0)),
			"full":      used.get(qt, 0) >= limits[qt] and limits[qt] < 9999,
		}
		for qt in limits
	}


@frappe.whitelist()
def call_next(queue_session: str) -> dict:
	"""
	Doctor clicks "Call Next".
	1. Find next eligible token via priority engine.
	2. Mark it Called.
	3. Update Queue Session current_token + total_called.
	4. Create or reopen Patient Encounter draft.
	5. Return compact workspace payload.
	"""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])

	session_status = frappe.db.get_value("Queue Session", queue_session, "status")
	if session_status == "Paused":
		return {"status": "paused", "message": "Session is paused. Resume before calling patients."}
	if session_status not in ("Active",):
		return {"status": "error", "message": f"Session is {session_status}."}

	entry = get_next_token(queue_session)
	if not entry:
		return {"status": "empty", "message": "Queue is empty"}

	now = now_datetime()

	frappe.db.set_value("Queue Entry", entry.name, {
		"status": "Called",
		"called_at": now,
	})

	session_doc = frappe.get_doc("Queue Session", queue_session)
	frappe.db.set_value("Queue Session", queue_session, {
		"current_token": entry.token,
		"total_called": (session_doc.total_called or 0) + 1,
	})

	_broadcast_queue_update(queue_session)

	encounter_name = _get_or_create_encounter(entry, queue_session)

	frappe.db.set_value("Queue Entry", entry.name, {
		"status": "With Doctor",
		"seen_at": now_datetime(),
		"patient_encounter": encounter_name,
	})

	from clinic_flow.api.workspace import get_workspace_payload
	return get_workspace_payload(entry.patient, encounter_name, entry.name)


@frappe.whitelist()
def pause_session(queue_session: str) -> dict:
	"""Pauses an active session. Call Next is blocked; TV shows 'Session Paused'."""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	s = frappe.get_doc("Queue Session", queue_session)
	if s.status != "Active":
		frappe.throw(_(f"Session is {s.status}, cannot pause."), frappe.ValidationError)
	frappe.db.set_value("Queue Session", queue_session, "status", "Paused")
	_broadcast_session_status(queue_session, "Paused", s.dept_abbr, s.practitioner)
	return {"status": "paused"}


@frappe.whitelist()
def resume_session(queue_session: str) -> dict:
	"""Resumes a paused session."""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	s = frappe.get_doc("Queue Session", queue_session)
	if s.status != "Paused":
		frappe.throw(_(f"Session is {s.status}, cannot resume."), frappe.ValidationError)
	frappe.db.set_value("Queue Session", queue_session, "status", "Active")
	_broadcast_session_status(queue_session, "Active", s.dept_abbr, s.practitioner)
	_broadcast_queue_update(queue_session)
	return {"status": "active"}


@frappe.whitelist()
def end_session(queue_session: str, no_show_waiting: int = 1) -> dict:
	"""
	Ends an active or paused session.
	- Marks remaining Waiting entries as No Show (if no_show_waiting=1).
	- Returns list of active sessions the doctor can re-route patients to.
	"""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	s = frappe.get_doc("Queue Session", queue_session)
	if s.status not in ("Active", "Paused"):
		frappe.throw(_(f"Session is already {s.status}."), frappe.ValidationError)

	if no_show_waiting:
		frappe.db.sql(
			"UPDATE `tabQueue Entry` SET status='No Show' "
			"WHERE queue_session=%s AND status='Waiting'",
			(queue_session,),
		)

	frappe.db.set_value("Queue Session", queue_session, "status", "Completed")
	_broadcast_session_status(queue_session, "Completed", s.dept_abbr, s.practitioner)

	# Return other active sessions so the doctor can suggest re-routing
	other_sessions = frappe.get_all(
		"Queue Session",
		filters={"status": "Active", "session_date": frappe.utils.today(),
				 "name": ["!=", queue_session]},
		fields=["name", "session_name", "practitioner", "dept_abbr"],
	)
	return {"status": "completed", "other_sessions": other_sessions}


@frappe.whitelist()
def reroute_patients(from_session: str, to_session: str) -> dict:
	"""
	Moves all Waiting Queue Entries from one session to another.
	Used when a doctor ends their session and hands off to a colleague.
	"""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	to_doc = frappe.get_doc("Queue Session", to_session)

	waiting = frappe.get_all(
		"Queue Entry",
		filters={"queue_session": from_session, "status": "Waiting"},
		fields=["name", "queue_type"],
	)
	if not waiting:
		return {"moved": 0}

	# Find the highest queue_position in the destination session
	result = frappe.db.sql(
		"SELECT MAX(queue_position) FROM `tabQueue Entry` "
		"WHERE queue_session=%s AND status != 'No Show'",
		(to_session,),
	)
	last_pos: int = (result[0][0] or 0) if result else 0

	for i, entry in enumerate(waiting, start=1):
		frappe.db.set_value("Queue Entry", entry.name, {
			"queue_session": to_session,
			"dept_abbr":     to_doc.dept_abbr,
			"queue_position": last_pos + i,
		})

	_broadcast_queue_update(to_session)
	return {"moved": len(waiting)}


def _inherit_waiting_entries(practitioner: str, new_session: str) -> None:
	"""
	When a new session starts, pull in any Waiting Queue Entries that were
	created against an earlier Completed session today (checked in between sessions).
	Those entries already have correct tokens and positions — just re-parent them.
	"""
	completed_sessions = frappe.get_all(
		"Queue Session",
		filters={
			"practitioner": practitioner,
			"session_date":  today(),
			"status":        "Completed",
			"name":          ["!=", new_session],
		},
		pluck="name",
	)
	if not completed_sessions:
		return

	orphaned = frappe.get_all(
		"Queue Entry",
		filters={"queue_session": ["in", completed_sessions], "status": "Waiting"},
		fields=["name"],
	)
	if not orphaned:
		return

	new_dept = frappe.db.get_value("Queue Session", new_session, "dept_abbr") or ""
	for entry in orphaned:
		frappe.db.set_value("Queue Entry", entry.name, {
			"queue_session": new_session,
			"dept_abbr":     new_dept,
		})
		# Now we can safely count the slot
		queue_type = frappe.db.get_value("Queue Entry", entry.name, "queue_type")
		_increment_session_slot_for(new_session, queue_type)

	_broadcast_queue_update(new_session)


def _increment_session_slot_for(queue_session: str, queue_type: str) -> None:
	"""Increment the used-slot counter on the given session."""
	field_map = {
		"PRE_BOOKED": "prebooked_used",
		"WALK_IN":    "walkin_used",
		"EMERGENCY":  "emergency_used",
		"FOLLOW_UP":  "walkin_used",
	}
	field = field_map.get(queue_type)
	if field:
		current = frappe.db.get_value("Queue Session", queue_session, field) or 0
		frappe.db.set_value("Queue Session", queue_session, field, current + 1)


def _broadcast_session_status(queue_session: str, status: str,
							   dept_abbr: str, practitioner: str) -> None:
	"""Tells the TV dashboard about a session status change."""
	msg = {
		"queue_session": queue_session,
		"status":        status,
		"dept_abbr":     dept_abbr,
		"practitioner":  practitioner,
	}
	frappe.publish_realtime(event="session_status", message=msg,
		room=f"queue_{dept_abbr}")
	frappe.publish_realtime(event="session_status", message=msg, room="queue_all")


@frappe.whitelist()
def recall_patient(queue_entry: str) -> dict:
	"""Re-broadcasts current token. No state change."""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	entry = frappe.get_doc("Queue Entry", queue_entry)
	session_doc = frappe.get_doc("Queue Session", entry.queue_session)

	msg = {
		"token": entry.token,
		"patient_name": entry.patient_name,
		"queue_type": entry.queue_type,
	}
	frappe.publish_realtime(event="recall_patient", message=msg,
		room=f"queue_{session_doc.dept_abbr}")
	frappe.publish_realtime(event="recall_patient", message=msg, room="queue_all")
	return {"status": "recalled", "token": entry.token}


@frappe.whitelist()
def skip_patient(queue_entry: str, reason: str = "") -> dict:
	"""Marks patient Skipped and immediately calls next."""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	entry = frappe.get_doc("Queue Entry", queue_entry)
	frappe.db.set_value("Queue Entry", queue_entry, {"status": "Skipped", "notes": reason})
	return call_next(entry.queue_session)


@frappe.whitelist()
def get_queue_state(queue_session: str) -> dict:
	"""Left panel data: current token + next 10 waiting."""
	frappe.has_permission("Queue Entry", "read", throw=True)

	session = frappe.get_doc("Queue Session", queue_session)
	waiting = frappe.get_all(
		"Queue Entry",
		filters={"queue_session": queue_session, "status": "Waiting"},
		fields=["name", "token", "patient_name", "queue_type", "queue_position"],
		order_by="queue_position asc",
		limit=10,
	)
	current = frappe.get_all(
		"Queue Entry",
		filters={"queue_session": queue_session, "status": ["in", ["Called", "With Doctor"]]},
		fields=["name", "token", "patient_name", "queue_type"],
		limit=1,
	)
	return {
		"session": {
			"name": session.name,
			"status": session.status,
			"current_token": session.current_token,
			"practitioner": session.practitioner,
			"dept_abbr": session.dept_abbr,
		},
		"current": current[0] if current else None,
		"waiting": waiting,
	}


@frappe.whitelist()
def get_active_session_for_user() -> dict | None:
	"""Returns today's Active Queue Session for the logged-in practitioner."""
	practitioner = frappe.db.get_value(
		"Healthcare Practitioner",
		{"user_id": frappe.session.user},
		"name",
	)
	if not practitioner:
		return None

	sessions = frappe.get_all(
		"Queue Session",
		filters={"practitioner": practitioner, "session_date": today(), "status": "Active"},
		fields=["name", "session_name", "dept_abbr", "status"],
		limit=1,
	)
	return sessions[0] if sessions else None


@frappe.whitelist(allow_guest=True)
def get_queue_state_for_display(dept: str = "all") -> dict:
	"""
	TV dashboard initial load — returns all active sessions for the dept.
	Supports single-doctor (returns sessions[0] data) and multi-doctor
	(returns sessions list for side-by-side display).
	"""
	filters: dict = {"status": ["in", ["Active", "Paused"]], "session_date": today()}
	if dept and dept != "all":
		filters["dept_abbr"] = dept.upper()

	sessions = frappe.get_all(
		"Queue Session",
		filters=filters,
		fields=["name", "current_token", "practitioner", "dept_abbr", "status"],
		limit=10,
	)
	if not sessions:
		return {
			"has_active_session": False,
			"session_status": None,
			"current_token": None,
			"next_tokens": [],
			"practitioner": None,
			"dept_abbr": None,
			"sessions": [],
		}

	# Pre-fetch practitioner details in one query
	prac_ids = list({s.practitioner for s in sessions})
	prac_rows = frappe.get_all(
		"Healthcare Practitioner",
		filters={"name": ["in", prac_ids]},
		fields=["name", "practitioner_name", "image"],
	)
	prac_map = {p.name: p for p in prac_rows}

	# Pre-fetch service units
	su_rows = frappe.db.sql(
		"SELECT parent, service_unit FROM `tabPractitioner Service Unit Schedule` "
		"WHERE parenttype='Healthcare Practitioner' AND parent IN %(ids)s",
		{"ids": prac_ids}, as_dict=True,
	)
	su_map = {r.parent: r.service_unit for r in su_rows}

	def _build_session_payload(session: dict) -> dict:
		waiting = frappe.get_all(
			"Queue Entry",
			filters={"queue_session": session.name, "status": "Waiting"},
			fields=["token", "patient_name", "queue_type", "queue_position"],
			order_by="queue_position asc",
			limit=5,
		)
		current_type = None
		if session.current_token:
			current_type = frappe.db.get_value(
				"Queue Entry",
				{"queue_session": session.name, "token": session.current_token},
				"queue_type",
			)
		# Most recent call time — used by client-side sort to bring freshly-called doctor to front
		last_called_rows = frappe.get_all(
			"Queue Entry",
			filters={"queue_session": session.name, "status": ["in", ["Called", "With Doctor"]]},
			fields=["called_at"],
			order_by="called_at desc",
			limit=1,
		)
		last_called_at = str(last_called_rows[0].called_at) if last_called_rows else None

		prac = prac_map.get(session.practitioner, frappe._dict())
		return {
			"session":              session.name,
			"session_status":       session.status,
			"current_token":        session.current_token,
			"current_queue_type":   current_type,
			"next_tokens":          waiting,
			"waiting_count":        len(waiting),
			"last_called_at":       last_called_at,
			"practitioner":         session.practitioner,
			"practitioner_name":    prac.get("practitioner_name") or session.practitioner,
			"practitioner_image":   prac.get("image") or "",
			"service_unit":         su_map.get(session.practitioner, ""),
			"dept_abbr":            session.dept_abbr,
		}

	payloads = [_build_session_payload(s) for s in sessions]
	has_active = bool(payloads)

	# Backwards-compatible single-session fields (used by realtime path)
	first = payloads[0]
	return {
		"has_active_session": has_active,
		"session_status":     first["session_status"],
		"current_token":      first["current_token"],
		"current_queue_type": first["current_queue_type"],
		"next_tokens":        first["next_tokens"],
		"practitioner":       first["practitioner"],
		"dept_abbr":          first["dept_abbr"],
		"sessions":           payloads,        # all sessions for multi-doctor layout
	}


def _get_or_create_encounter(entry: dict, queue_session: str) -> str:
	"""Find an existing Draft encounter or create one. Returns encounter name."""
	session_doc = frappe.get_doc("Queue Session", queue_session)
	existing = frappe.get_all(
		"Patient Encounter",
		filters={
			"patient": entry.patient,
			"practitioner": session_doc.practitioner,
			"encounter_date": today(),
			"docstatus": 0,
		},
		fields=["name"],
		limit=1,
	)
	if existing:
		return existing[0].name

	# appointment_type is mandatory on Patient Encounter — resolve it from multiple sources
	appointment_type = None

	if entry.get("appointment"):
		appt = frappe.get_doc("Patient Appointment", entry.appointment)
		appointment_type = appt.appointment_type

	if not appointment_type:
		# Map queue_type → Appointment Type name by custom_queue_code or name match
		queue_type = entry.get("queue_type", "")
		code_map = {"PRE_BOOKED": "PRE", "WALK_IN": "WLK", "EMERGENCY": "EMR", "FOLLOW_UP": "FLW"}
		code = code_map.get(queue_type)
		if code:
			appointment_type = frappe.db.get_value(
				"Appointment Type", {"custom_queue_code": code}, "name"
			)

	if not appointment_type:
		# Last resort: any appointment type in the system
		result = frappe.db.sql("SELECT name FROM `tabAppointment Type` LIMIT 1")
		appointment_type = result[0][0] if result else None

	if not appointment_type:
		frappe.throw(
			_("Cannot create Patient Encounter: no Appointment Type found. "
			  "Create at least one Appointment Type in the system."),
			frappe.ValidationError,
		)

	enc_data = {
		"doctype": "Patient Encounter",
		"patient": entry.patient,
		"practitioner": session_doc.practitioner,
		"encounter_date": today(),
		"department": session_doc.department,
		"appointment_type": appointment_type,
	}

	if entry.get("appointment"):
		enc_data["appointment"] = entry.appointment

	enc = frappe.get_doc(enc_data)
	enc.insert(ignore_permissions=True)
	return enc.name
