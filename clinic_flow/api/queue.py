import math
import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, now_datetime, today
from clinic_flow.queue.engine import get_next_token, get_next_special_token, _broadcast_queue_update
from clinic_flow.queue.service_point import (
	resolve_department_name,
	resolve_queue_code,
	resolve_service_point,
)


def _canonical_priority_from_legacy(queue_type: str | None) -> str:
	"""
	Phase 1 compatibility helper.

	Current runtime still relies on legacy queue_type, but later phases will move
	to canonical `priority`. Keep the mapping in one place so future readers do
	not have to reverse-engineer the semantics from UI terminology.
	"""
	if queue_type == "EMERGENCY":
		return "emergency"
	return "normal"


def _emergency_count(queue_session: str, statuses: list[str]) -> int:
	"""Compatibility helper while emergency moves fully to canonical priority."""
	return frappe.db.count(
		"Queue Entry",
		{
			"queue_session": queue_session,
			"status": ["in", statuses],
			"priority": "emergency",
		},
	)


def _special_reception_policy() -> dict:
	config = frappe.get_single("Slot Partition Config")
	return {
		"warning_minutes": int(config.special_reception_warning_minutes or 10),
		"escalation_minutes": int(config.special_reception_escalation_minutes or 12),
		"target_minutes": int(config.special_reception_target_minutes or 15),
		"gap_lookahead_tokens": int(config.special_gap_lookahead_tokens or 3),
		"max_consecutive_special_calls": int(config.max_consecutive_special_reception_calls or 2),
	}


def _special_reception_sla_state(elapsed_minutes: int, policy: dict) -> str:
	if elapsed_minutes >= policy["target_minutes"]:
		return "target_breach"
	if elapsed_minutes >= policy["escalation_minutes"]:
		return "escalation"
	if elapsed_minutes >= policy["warning_minutes"]:
		return "warning"
	return "normal"


def _special_reception_gap(queue_session: str, lookahead_tokens: int) -> dict | None:
	rows = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": queue_session,
			"priority": ["in", ["", "normal"]],
			"status": ["in", ["Booked", "Waiting", "Arrived"]],
		},
		fields=["name", "token", "token_number", "status"],
		order_by="token_number asc",
		limit=max(1, int(lookahead_tokens or 3)),
	)
	for row in rows:
		if row.status != "Arrived":
			return dict(row)
	return None


def _normal_arrived_patient_available(queue_session: str) -> bool:
	return bool(
		frappe.db.count(
			"Queue Entry",
			{
				"queue_session": queue_session,
				"priority": ["in", ["", "normal"]],
				"status": "Arrived",
			},
		)
	)


def _consecutive_special_reception_calls(queue_session: str) -> int:
	rows = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": queue_session,
			"called_to_reception_at": ["is", "set"],
		},
		fields=["name", "priority", "called_to_reception_at"],
		order_by="called_to_reception_at desc",
		limit=20,
	)
	count = 0
	for row in rows:
		if row.priority == "special":
			count += 1
		else:
			break
	return count


def _special_reception_state(queue_session: str) -> dict:
	policy = _special_reception_policy()
	gap = _special_reception_gap(queue_session, policy["gap_lookahead_tokens"])
	guardrail_blocked = (
		_consecutive_special_reception_calls(queue_session) >= policy["max_consecutive_special_calls"]
		and _normal_arrived_patient_available(queue_session)
	)

	rows = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": queue_session,
			"priority": "special",
			"status": "Arrived",
		},
		fields=[
			"name", "token", "token_number", "patient", "patient_name",
			"arrived_at", "creation",
		],
		order_by="arrived_at asc, creation asc",
	)

	now = now_datetime()
	alerts = []
	for row in rows:
		arrived_at = get_datetime(row.arrived_at) if row.arrived_at else get_datetime(row.creation)
		elapsed = max(0, int((now - arrived_at).total_seconds() // 60))
		sla_state = _special_reception_sla_state(elapsed, policy)
		reason = "manual"
		if gap:
			reason = "gap"
		elif sla_state != "normal":
			reason = sla_state

		alerts.append({
			"queue_entry": row.name,
			"token": row.token,
			"token_number": row.token_number,
			"patient": row.patient,
			"patient_name": row.patient_name,
			"arrived_at": str(row.arrived_at) if row.arrived_at else None,
			"elapsed_minutes": elapsed,
			"sla_state": sla_state,
			"recommendation_reason": reason,
			"can_call_now": not guardrail_blocked,
			"guardrail_blocked": guardrail_blocked,
		})

	recommended = None
	callable_alerts = [row for row in alerts if row["can_call_now"]]
	if callable_alerts:
		candidate = callable_alerts[0]
		if candidate["recommendation_reason"] != "manual":
			message = _special_reception_recommendation_message(candidate, gap)
			recommended = {
				"queue_entry": candidate["queue_entry"],
				"kind": "special",
				"reason": candidate["recommendation_reason"],
				"message": message,
			}

	return {
		"special_reception_policy": policy,
		"special_reception_alerts": alerts,
		"recommended_reception_call": recommended,
	}


def _special_reception_recommendation_message(candidate: dict, gap: dict | None) -> str:
	if candidate["recommendation_reason"] == "gap" and gap:
		return _("Special patient can fill a non-arrival gap at token {0}.").format(
			gap.get("token_number") or gap.get("token")
		)
	if candidate["recommendation_reason"] == "target_breach":
		return _("Special patient has breached the reception target time.")
	if candidate["recommendation_reason"] == "escalation":
		return _("Special patient has reached reception escalation time.")
	if candidate["recommendation_reason"] == "warning":
		return _("Special patient has reached reception warning time.")
	return _("Special patient is waiting at reception.")


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

	# ── Resolve queue identity (Service Point → dept_abbr cache) ─────────
	service_point = resolve_service_point(
		practitioner=prac.name, department=prac.department,
	)
	dept_abbr = resolve_queue_code(
		service_point=service_point,
		practitioner=prac.name,
		department=prac.department,
		fallback="",
	)
	dept_name = prac.department or ""
	if prac.department:
		row = frappe.db.get_value(
			"Medical Department", prac.department, ["department"], as_dict=True,
		) or {}
		dept_name = row.get("department") or prac.department

	# ── Re-use today's active/paused/scheduled session if one exists ─────────
	existing = frappe.get_all(
		"Queue Session",
		filters={
			"practitioner": prac.name,
			"session_date": today(),
			"status": ["in", ["Scheduled", "Active", "Paused"]],
		},
		fields=["name", "status", "session_name", "dept_abbr", "service_point"],
		order_by="modified desc",
		limit=1,
	)
	if existing:
		s = existing[0]
		if s.status == "Scheduled":
			frappe.db.set_value("Queue Session", s.name, "status", "Active")
			s.status = "Active"
		existing_dept_name = (
			resolve_department_name(service_point=s.service_point, dept_abbr=s.dept_abbr)
			or dept_name
			or s.dept_abbr
			or ""
		)
		return {"session": s.name, "session_name": s.session_name,
				"dept_abbr": s.dept_abbr, "dept_name": existing_dept_name,
				"status": s.status, "created": False}

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

		session_name = f"{schedule} · {date_str}"
	else:
		# Unscheduled — caller provides times and optional capacity
		session_cap = int(capacity) if capacity else 20
		session_name = f"{prac.practitioner_name} · Unscheduled Session · {date_str}"

	config = frappe.get_single("Slot Partition Config")
	session_doc = frappe.get_doc({
		"doctype":          "Queue Session",
		"session_name":     session_name,
		"practitioner":     prac.name,
		"session_date":     today(),
		"start_time":       from_time,
		"end_time":         to_time,
		"service_point":    service_point,
		"dept_abbr":        dept_abbr,
		"session_capacity": session_cap,
		"status":           "Active",
		"prebooked_total":  math.ceil(session_cap * (config.prebooked_pct or 60) / 100),
		"walkin_total":     math.ceil(session_cap * (config.walkin_pct    or 30) / 100),
		"followup_total":   math.ceil(session_cap * (config.followup_pct  or 10) / 100),
	})
	session_doc.insert(ignore_permissions=True)

	_inherit_waiting_entries(prac.name, session_doc.name)

	return {"session": session_doc.name, "session_name": session_name,
			"dept_abbr": dept_abbr, "dept_name": dept_name,
			"status": "Active", "created": True}


@frappe.whitelist()
def get_session(queue_session: str) -> dict | None:
	"""Verify a session is Active or Paused today AND belongs to the current user's practitioner."""
	if not frappe.db.exists("Queue Session", queue_session):
		return None
	s = frappe.db.get_value(
		"Queue Session", queue_session,
		["name", "session_name", "status", "session_date", "dept_abbr",
		 "service_point", "practitioner"],
		as_dict=True,
	)
	if not (s and s.status in ("Active", "Paused") and str(s.session_date) == today()):
		return None
	own_practitioner = frappe.db.get_value(
		"Healthcare Practitioner", {"user_id": frappe.session.user}, "name"
	)
	if own_practitioner and s.practitioner != own_practitioner:
		return None
	s["dept_name"] = (
		resolve_department_name(service_point=s.service_point, dept_abbr=s.dept_abbr)
		or s.dept_abbr
		or ""
	)
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
		["prebooked_total", "walkin_total", "followup_total", "session_capacity"],
		as_dict=True,
	)

	if session_row and session_row.prebooked_total:
		# Use the session's pre-calculated totals
		limits = {
			"PRE_BOOKED": session_row.prebooked_total,
			"WALK_IN":    session_row.walkin_total or 0,
			"FOLLOW_UP":  session_row.followup_total or 0,
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
	2. Move it into consultation.
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

	return _call_entry(queue_session, entry)


@frappe.whitelist()
def call_next_special(queue_session: str) -> dict:
	"""
	Doctor-only one-time override to pull the oldest eligible special patient
	from Ready Near Doctor without rewriting stored queue order.
	"""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])

	session_status = frappe.db.get_value("Queue Session", queue_session, "status")
	if session_status == "Paused":
		return {"status": "paused", "message": "Session is paused. Resume before calling patients."}
	if session_status not in ("Active",):
		return {"status": "error", "message": f"Session is {session_status}."}

	entry = get_next_special_token(queue_session)
	if not entry:
		return {"status": "empty", "message": "No special patient is ready near doctor."}

	return _call_entry(queue_session, entry, special_override=True)


def _call_entry(queue_session: str, entry: dict, special_override: bool = False) -> dict:
	"""Shared state transition for moving a queue entry into consultation."""
	now = now_datetime()

	session_doc = frappe.get_doc("Queue Session", queue_session)
	frappe.db.set_value("Queue Session", queue_session, {
		"current_token": entry.token,
		"total_called": (session_doc.total_called or 0) + 1,
	})

	encounter_name = _get_or_create_encounter(entry, queue_session)

	entry_update = {
		"status": "With Doctor",
		"called_at": now,
		"seen_at": now,
		"patient_encounter": encounter_name,
	}
	if special_override:
		meta = frappe.get_meta("Queue Entry")
		if meta.has_field("special_override_by"):
			entry_update["special_override_by"] = frappe.session.user
		if meta.has_field("special_override_at"):
			entry_update["special_override_at"] = now
	frappe.db.set_value("Queue Entry", entry.name, entry_update)

	_broadcast_queue_update(queue_session)

	# Recalculate downstream ETAs if the actual pace has drifted significantly
	from clinic_flow.api.eta import check_pace_deviation, recalculate_downstream_etas
	if check_pace_deviation(queue_session):
		recalculate_downstream_etas(queue_session)

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
	- Marks remaining non-in-motion entries as No Show (if no_show_waiting=1).
	- Returns list of active sessions the doctor can re-route patients to.
	"""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	s = frappe.get_doc("Queue Session", queue_session)
	if s.status not in ("Active", "Paused"):
		frappe.throw(_(f"Session is already {s.status}."), frappe.ValidationError)

	pending_statuses = ["Booked", "Waiting", "Arrived", "No Response", "Pushed to End"]
	affected_pending = frappe.db.count(
		"Queue Entry",
		{"queue_session": queue_session, "status": ["in", pending_statuses]},
	)
	if no_show_waiting:
		frappe.db.sql(
			"UPDATE `tabQueue Entry` SET status='No Show' "
			"WHERE queue_session=%s AND status IN ('Booked', 'Waiting', 'Arrived', 'No Response', 'Pushed to End')",
			(queue_session,)
		)

	frappe.db.set_value("Queue Session", queue_session, "status", "Completed")
	_broadcast_session_status(queue_session, "Completed", s.dept_abbr, s.practitioner)
	_broadcast_queue_update(queue_session)

	# Return other active sessions so the doctor can suggest re-routing
	other_sessions = frappe.get_all(
		"Queue Session",
		filters={"status": "Active", "session_date": frappe.utils.today(),
				 "name": ["!=", queue_session]},
		fields=["name", "session_name", "practitioner", "dept_abbr"],
	)
	return {
		"status": "completed",
		"other_sessions": other_sessions,
		"affected_pending": affected_pending,
	}


@frappe.whitelist()
def cancel_session(queue_session: str, cancel_pending: int = 1) -> dict:
	"""
	Cancel a scheduled/active/paused session before it can continue normally.

	Policy:
	  - in-motion entries (Called / Ready Near Doctor / With Doctor) are not mutated here
	  - untouched/desk-pending entries are marked No Show when cancel_pending=1
	  - caller can use the returned counts to decide follow-up / reroute actions
	"""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	s = frappe.get_doc("Queue Session", queue_session)
	if s.status not in ("Scheduled", "Active", "Paused"):
		frappe.throw(_(f"Session is {s.status}, cannot cancel."), frappe.ValidationError)

	pending_statuses = ["Booked", "Waiting", "Arrived", "No Response", "Pushed to End"]
	in_motion_statuses = ["Called", "Ready Near Doctor", "With Doctor"]
	affected_pending = frappe.db.count(
		"Queue Entry",
		{"queue_session": queue_session, "status": ["in", pending_statuses]},
	)
	in_motion_count = frappe.db.count(
		"Queue Entry",
		{"queue_session": queue_session, "status": ["in", in_motion_statuses]},
	)

	if cancel_pending:
		frappe.db.sql(
			"UPDATE `tabQueue Entry` SET status='No Show' "
			"WHERE queue_session=%s AND status IN ('Booked', 'Waiting', 'Arrived', 'No Response', 'Pushed to End')",
			(queue_session,)
		)

	frappe.db.set_value("Queue Session", queue_session, "status", "Cancelled")
	_broadcast_session_status(queue_session, "Cancelled", s.dept_abbr, s.practitioner)
	_broadcast_queue_update(queue_session)

	other_sessions = frappe.get_all(
		"Queue Session",
		filters={
			"status": ["in", ["Scheduled", "Active", "Paused"]],
			"session_date": frappe.utils.today(),
			"name": ["!=", queue_session],
		},
		fields=["name", "session_name", "practitioner", "dept_abbr"],
	)
	return {
		"status": "cancelled",
		"affected_pending": affected_pending,
		"in_motion_count": in_motion_count,
		"other_sessions": other_sessions,
	}


@frappe.whitelist()
def extend_session(queue_session: str, extend_minutes: int = 30, stretch_capacity_delta: int = 0) -> dict:
	"""
	Extend the operational end-time/cushion for a session.

	This keeps the same session identity but adjusts the end boundary so
	reception and ETA logic have a clearer operational envelope.
	"""
	frappe.only_for(["Healthcare Practitioner", "Physician", "System Manager", "Queue Manager"])
	s = frappe.get_doc("Queue Session", queue_session)
	if s.status not in ("Scheduled", "Active", "Paused"):
		frappe.throw(_(f"Session is {s.status}, cannot extend."), frappe.ValidationError)

	extend_minutes = int(extend_minutes or 0)
	stretch_capacity_delta = int(stretch_capacity_delta or 0)
	if extend_minutes <= 0 and stretch_capacity_delta <= 0:
		frappe.throw(_("Provide extension minutes or stretch capacity to extend the session."))

	updates = {}
	if extend_minutes > 0:
		current_end = get_datetime(f"{s.session_date} {s.end_time}")
		updates["end_time"] = add_to_date(current_end, minutes=extend_minutes).strftime("%H:%M:%S")
	if stretch_capacity_delta > 0:
		updates["stretch_capacity"] = int(s.stretch_capacity or s.planned_capacity or s.session_capacity or 0) + stretch_capacity_delta

	frappe.db.set_value("Queue Session", queue_session, updates)
	refreshed = frappe.get_doc("Queue Session", queue_session)
	_broadcast_session_status(queue_session, refreshed.status, refreshed.dept_abbr, refreshed.practitioner)
	_broadcast_queue_update(queue_session)
	return {
		"status": refreshed.status,
		"end_time": refreshed.end_time,
		"stretch_capacity": refreshed.stretch_capacity,
	}


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
		filters={"queue_session": ["in", completed_sessions], "status": ["in", ["Waiting", "Arrived"]]},
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
		"FOLLOW_UP":  "followup_used",
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
	"""Doctor workspace queue strip: current token + next 10 ready patients."""
	frappe.has_permission("Queue Entry", "read", throw=True)

	session = frappe.get_doc("Queue Session", queue_session)
	waiting = frappe.get_all(
		"Queue Entry",
		filters={"queue_session": queue_session, "status": ["in", ["Ready Near Doctor", "Waiting"]]},
		fields=["name", "token", "patient_name", "queue_type", "queue_position", "status", "priority"],
		order_by="queue_position asc",
		limit=10,
	)
	status_order = {"Ready Near Doctor": 0, "Waiting": 1}
	waiting = sorted(
		waiting,
		key=lambda row: (status_order.get(row.get("status"), 9), row.get("queue_position") or 0),
	)
	current = frappe.get_all(
		"Queue Entry",
		filters={"queue_session": queue_session, "status": ["in", ["With Doctor", "Called"]]},
		fields=["name", "token", "patient_name", "queue_type", "priority", "patient", "patient_encounter"],
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
		"special_ready_count": sum(
			1 for row in waiting
			if row.get("status") == "Ready Near Doctor" and row.get("priority") == "special"
		),
	}


@frappe.whitelist()
def get_active_session_for_user() -> dict | None:
	"""Returns today's Active or Paused Queue Session for the logged-in practitioner."""
	practitioner = frappe.db.get_value(
		"Healthcare Practitioner",
		{"user_id": frappe.session.user},
		"name",
	)
	if not practitioner:
		return None

	sessions = frappe.get_all(
		"Queue Session",
		filters={"practitioner": practitioner, "session_date": today(),
				 "status": ["in", ["Active", "Paused"]]},
		fields=["name", "session_name", "dept_abbr", "service_point", "status"],
		order_by="modified desc",
		limit=1,
	)
	if not sessions:
		return None
	s = sessions[0]
	s["dept_name"] = (
		resolve_department_name(service_point=s.service_point, dept_abbr=s.dept_abbr)
		or s.dept_abbr
		or ""
	)
	return s


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
		emergency_active = bool(
			_emergency_count(session.name, ["Ready Near Doctor", "With Doctor", "Called"])
		)
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
			"emergency_active":     emergency_active,
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


# ---------------------------------------------------------------------------
# v2 reception state transitions
# ---------------------------------------------------------------------------

@frappe.whitelist()
def call_to_reception(queue_entry: str) -> dict:
	"""
	Receptionist calls a patient to the desk.
	Valid from: Waiting, Booked, Pushed to End.
	Sets status → Called, records called_to_reception_at.
	"""
	frappe.only_for(["Queue Manager", "System Manager"])

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token", "patient_name"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if entry.status not in ("Waiting", "Booked", "Arrived", "Pushed to End"):
		frappe.throw(
			_("Cannot call to reception: patient status is '{0}' (expected Waiting, Booked, Arrived, or Pushed to End).").format(
				entry.status
			),
			frappe.ValidationError,
		)

	frappe.db.set_value("Queue Entry", queue_entry, {
		"status": "Called",
		"called_to_reception_at": now_datetime(),
	})

	from clinic_flow.api.eta import recalculate_downstream_etas
	recalculate_downstream_etas(entry.queue_session)

	_broadcast_queue_update(entry.queue_session)

	return {"status": "Called", "token": entry.token, "patient_name": entry.patient_name}


@frappe.whitelist()
def mark_no_response(queue_entry: str) -> dict:
	"""
	Patient did not respond to the reception call.
	Valid from: Called.
	Sets status → No Response, records no_response_at.
	"""
	frappe.only_for(["Queue Manager", "System Manager"])

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if entry.status != "Called":
		frappe.throw(
			_("Cannot mark No Response: patient status is '{0}' (expected Called).").format(
				entry.status
			),
			frappe.ValidationError,
		)

	frappe.db.set_value("Queue Entry", queue_entry, {
		"status": "No Response",
		"no_response_at": now_datetime(),
	})
	_broadcast_queue_update(entry.queue_session)

	# No Response patient no longer blocks the queue — refresh ETAs
	from clinic_flow.api.eta import recalculate_downstream_etas
	recalculate_downstream_etas(entry.queue_session)

	return {"status": "No Response", "token": entry.token}


@frappe.whitelist()
def complete_reception(
	queue_entry: str,
	weight_kg: float | None = None,
	payment_mode: str = "",
	paid_amount: float | None = None,
) -> dict:
	"""
	Patient has completed reception check-in (payment collected, weight measured).
	Valid from: Called or No Response (patient returned before grace expired).
	Sets status → Ready Near Doctor, records reception_done_at.

	Also syncs the linked Patient Appointment to "Checked In" with payment data so
	Marley Healthcare's fee validity management and invoicing hooks fire correctly.

	Also increments hold_patients_count on all No Response entries in the same session,
	so the auto-push-to-end rule can fire.
	"""
	frappe.only_for(["Queue Manager", "System Manager"])

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token", "appointment"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if entry.status not in ("Called", "No Response"):
		frappe.throw(
			_("Cannot complete reception: patient status is '{0}' (expected Called or No Response).").format(
				entry.status
			),
			frappe.ValidationError,
		)

	update = {
		"status": "Ready Near Doctor",
		"reception_done_at": now_datetime(),
	}
	if weight_kg is not None:
		update["weight_recorded"] = float(weight_kg)
		update["weight_recorded_at"] = now_datetime()

	# Clinic Flow is the authority. Queue state advances here regardless of
	# whether a linked Patient Appointment exists.
	frappe.db.set_value("Queue Entry", queue_entry, update)

	# Downstream Healthcare sync — side-effect-bounded, must not drive queue
	# state decisions. Sets the linked appointment to "Checked In" so
	# Healthcare's fee-validity side effects (update_fee_validity) fire.
	if entry.appointment:
		_checkin_patient_appointment(
			appointment=entry.appointment,
			payment_mode=payment_mode,
			paid_amount=paid_amount,
		)

	# Increment hold counter on all No Response entries in this session
	config = frappe.get_single("Slot Partition Config")
	hold_threshold: int = config.no_response_hold_count or 3

	no_response_entries = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": entry.queue_session,
			"status": "No Response",
			"name": ["!=", queue_entry],
		},
		fields=["name", "hold_patients_count"],
	)

	for nr in no_response_entries:
		new_count = (nr.hold_patients_count or 0) + 1
		if new_count >= hold_threshold:
			# Auto-push to end
			frappe.db.set_value("Queue Entry", nr.name, {
				"hold_patients_count": new_count,
				"status": "Pushed to End",
			})
			_push_to_queue_end(nr.name, entry.queue_session)
		else:
			frappe.db.set_value("Queue Entry", nr.name, "hold_patients_count", new_count)

	_broadcast_queue_update(entry.queue_session)

	# Recalculate ETAs — one fewer pending patient changes everyone's estimate
	from clinic_flow.api.eta import recalculate_downstream_etas
	recalculate_downstream_etas(entry.queue_session)

	return {"status": "Ready Near Doctor", "token": entry.token}


@frappe.whitelist()
def push_to_end(queue_entry: str, reason: str = "") -> dict:
	"""
	Manually push a No Response patient to the end of the queue.
	Sets status → Pushed to End and reassigns queue_position to last.
	"""
	frappe.only_for(["Queue Manager", "System Manager"])

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if entry.status not in ("No Response", "Called"):
		frappe.throw(
			_("Cannot push to end: patient status is '{0}'.").format(entry.status),
			frappe.ValidationError,
		)

	update = {"status": "Pushed to End"}
	if reason:
		existing_notes = frappe.db.get_value("Queue Entry", queue_entry, "notes") or ""
		update["notes"] = (existing_notes + "\n" + reason).strip()

	frappe.db.set_value("Queue Entry", queue_entry, update)
	_push_to_queue_end(queue_entry, entry.queue_session)

	_broadcast_queue_update(entry.queue_session)

	# Recalculate ETAs — pushed patient no longer blocks others
	from clinic_flow.api.eta import recalculate_downstream_etas
	recalculate_downstream_etas(entry.queue_session)

	return {"status": "Pushed to End", "token": entry.token}


def _push_to_queue_end(queue_entry: str, queue_session: str) -> None:
	"""Assign the next available queue_position (max + 1) to the given entry."""
	result = frappe.db.sql(
		"SELECT MAX(queue_position) FROM `tabQueue Entry` "
		"WHERE queue_session = %s AND status != 'No Show'",
		(queue_session,),
	)
	last_pos: int = (result[0][0] or 0) if result else 0
	frappe.db.set_value("Queue Entry", queue_entry, "queue_position", last_pos + 1)


@frappe.whitelist()
def resume_held_token(queue_entry: str) -> dict:
	"""
	Patient in No Response has returned before grace expired.
	Moves No Response → Called so receptionist can process them at reception.
	"""
	frappe.only_for(["Queue Manager", "System Manager"])

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token", "patient_name"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if entry.status != "No Response":
		frappe.throw(
			_("Cannot resume: patient status is '{0}' (expected No Response).").format(
				entry.status
			),
			frappe.ValidationError,
		)

	frappe.db.set_value("Queue Entry", queue_entry, {
		"status": "Called",
		"called_to_reception_at": now_datetime(),
	})

	_broadcast_queue_update(entry.queue_session)
	return {"status": "Called", "token": entry.token, "patient_name": entry.patient_name}


@frappe.whitelist()
def move_to_with_doctor(queue_entry: str) -> dict:
	"""
	Patient moves from the ready queue into the consultation room.
	Valid from: Ready Near Doctor.
	Records seen_at (consultation start time).
	"""
	frappe.only_for(["Queue Manager", "System Manager"])

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token", "patient_name"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if entry.status != "Ready Near Doctor":
		frappe.throw(
			_("Cannot move to With Doctor: patient status is '{0}' (expected Ready Near Doctor).").format(
				entry.status
			),
			frappe.ValidationError,
		)

	frappe.db.set_value("Queue Entry", queue_entry, {
		"status": "With Doctor",
		"seen_at": now_datetime(),
	})

	_broadcast_queue_update(entry.queue_session)
	return {"status": "With Doctor", "token": entry.token, "patient_name": entry.patient_name}


@frappe.whitelist()
def mark_completed(queue_entry: str) -> dict:
	"""
	Consultation has ended.
	Valid from: With Doctor.
	Triggers downstream ETA recalculation.
	"""
	frappe.only_for(["Queue Manager", "System Manager"])

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token", "patient_name", "seen_at"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if entry.status != "With Doctor":
		frappe.throw(
			_("Cannot mark Completed: patient status is '{0}' (expected With Doctor).").format(
				entry.status
			),
			frappe.ValidationError,
		)

	frappe.db.set_value("Queue Entry", queue_entry, "status", "Completed")

	_broadcast_queue_update(entry.queue_session)

	from clinic_flow.api.eta import recalculate_downstream_etas
	recalculate_downstream_etas(entry.queue_session)

	return {"status": "Completed", "token": entry.token, "patient_name": entry.patient_name}


@frappe.whitelist()
def get_session_urgency_summary() -> list[dict]:
	"""
	Returns today's sessions (Scheduled/Active/Paused) with per-session urgency counts
	for the receptionist's live-session chip bar.
	"""
	from frappe.utils import today as _today
	rows = frappe.db.sql(
		"""
		SELECT
			qs.name,
			qs.session_name,
			qs.dept_abbr,
			qs.status,
			qs.start_time,
			qs.current_token,
			hp.practitioner_name,
			COALESCE(SUM(qe.status = 'Arrived'), 0)           AS arrived_count,
			COALESCE(SUM(qe.priority = 'emergency'
				AND qe.status IN ('Booked','Waiting','Arrived','Called',
				                  'No Response','Ready Near Doctor','With Doctor',
				                  'Pushed to End')), 0)        AS emergency_count,
			COALESCE(SUM(qe.status IN ('Booked','Waiting','Arrived','Called',
			             'No Response','Ready Near Doctor','With Doctor',
			             'Pushed to End')), 0)                 AS active_count
		FROM `tabQueue Session` qs
		LEFT JOIN `tabQueue Entry` qe ON qe.queue_session = qs.name
		LEFT JOIN `tabHealthcare Practitioner` hp ON hp.name = qs.practitioner
		WHERE qs.session_date = %(today)s
		  AND qs.status IN ('Scheduled', 'Active', 'Paused')
		GROUP BY qs.name
		ORDER BY
			CASE qs.status WHEN 'Active' THEN 0 WHEN 'Paused' THEN 1 ELSE 2 END,
			qs.start_time ASC
		""",
		{"today": _today()},
		as_dict=True,
	)
	return [dict(r) for r in rows]


@frappe.whitelist()
def get_live_session_state(queue_session: str) -> dict:
	"""
	Return the full pipeline state for the receptionist's right (live session) panel.

	Groups Queue Entries by status bucket:
	  with_doctor  — currently in consultation (max 1)
	  ready        — Ready Near Doctor, ordered by queue_position asc
	  called       — Called to reception, ordered by called_to_reception_at asc
	  due_soon     — next 5 Booked entries, ordered by queue_position asc
	  no_response  — No Response, ordered by no_response_at asc

	Also returns session metadata and summary counts.
	"""
	if not queue_session:
		frappe.throw(_("Queue Session is required."))

	session = frappe.db.get_value(
		"Queue Session",
		queue_session,
		[
			"name", "session_name", "session_date", "start_time", "end_time",
			"status", "dept_abbr", "practitioner",
			"planned_capacity", "review_load_count", "non_review_load_count",
			"phone_booked_count", "walkin_count",
		],
		as_dict=True,
	)
	if not session:
		frappe.throw(_("Queue Session {0} not found.").format(queue_session))

	_ENTRY_FIELDS = [
		"name", "token_number", "token", "patient", "patient_name",
		"load_class", "queue_type", "status", "queue_position",
		"arrived_at", "called_to_reception_at", "no_response_at", "hold_patients_count",
		"reception_done_at", "weight_recorded",
		"report_by_time", "predicted_doctor_time",
		"seen_at", "creation",
	]

	def _fetch(statuses: list, order: str = "queue_position asc", limit: int = 0) -> list:
		kwargs = dict(
			filters={"queue_session": queue_session, "status": ["in", statuses]},
			fields=_ENTRY_FIELDS,
			order_by=order,
		)
		if limit:
			kwargs["limit"] = limit
		return frappe.get_all("Queue Entry", **kwargs)

	with_doctor   = _fetch(["With Doctor"],        "seen_at desc", limit=1)
	ready         = _fetch(["Ready Near Doctor"],  "queue_position asc")
	called        = _fetch(["Called"],             "called_to_reception_at asc")
	arrived       = _fetch(["Arrived"],            "arrived_at asc")
	due_soon      = _fetch(["Booked", "Waiting"],  "queue_position asc", limit=5)
	no_response   = _fetch(["No Response"],        "no_response_at asc")
	pushed_to_end = _fetch(["Pushed to End"],      "queue_position asc")
	from clinic_flow.api.emergency import get_open_emergency_intakes
	emergency_pending = get_open_emergency_intakes(queue_session)
	special_reception = _special_reception_state(queue_session)

	total_booked    = frappe.db.count(
		"Queue Entry",
		{"queue_session": queue_session,
		 "status": ["not in", ["No Show", "Skipped"]]}
	)
	completed_today = frappe.db.count(
		"Queue Entry",
		{"queue_session": queue_session,
		 "status": ["in", ["Completed", "Done"]]}
	)
	emergency_active = bool(
		_emergency_count(queue_session, ["Ready Near Doctor", "With Doctor", "Called"])
	)

	return {
		"session":         session,
		"with_doctor":     with_doctor,
		"ready":           ready,
		"called":          called,
		"arrived":         arrived,
		"due_soon":        due_soon,
		"no_response":     no_response,
		"pushed_to_end":   pushed_to_end,
		"emergency_pending": emergency_pending,
		"emergency_active": emergency_active,
		"special_reception_policy": special_reception["special_reception_policy"],
		"special_reception_alerts": special_reception["special_reception_alerts"],
		"recommended_reception_call": special_reception["recommended_reception_call"],
		"counts": {
			"total_booked":    total_booked,
			"completed_today": completed_today,
			"remaining":       max(0, total_booked - completed_today),
			"arrived_count":   len(arrived),
			"emergency_pending": len(emergency_pending),
		},
	}


# ---------------------------------------------------------------------------
# patient encounter helper
# ---------------------------------------------------------------------------

def _get_or_create_encounter(entry: dict, queue_session: str) -> str:
	"""Find an existing Draft encounter or create one. Returns encounter name."""
	# get_next_token() returns a minimal dict; re-fetch fields needed for encounter creation
	full_entry = frappe.db.get_value(
		"Queue Entry",
		entry.name,
		["appointment", "queue_type", "complaint"],
		as_dict=True,
	) or {}
	entry = frappe._dict({**entry, **full_entry})

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

	# Pre-populate complaint from booking so doctor sees it immediately
	if entry.get("complaint"):
		enc.custom_chief_complaint = entry.complaint

	enc.insert(ignore_permissions=True)
	return enc.name


# ---------------------------------------------------------------------------
# Healthcare appointment sync helper
# ---------------------------------------------------------------------------

def _checkin_patient_appointment(
	appointment: str,
	payment_mode: str,
	paid_amount: float | None,
) -> None:
	"""
	Downstream Healthcare sync adapter — sets the linked Patient Appointment to
	'Checked In' so Healthcare's fee-validity side effects fire.

	This helper is a one-way, side-effect-bounded integration step. It must not:
	  - create Queue Entries
	  - decide queue progression
	  - determine doctor eligibility

	Clinic Flow queue state is already advanced before this is called.
	Healthcare's on_update() → update_fee_validity() → manage_fee_validity():
	  - review patients: increments fee_validity.visited
	  - new patients:    creates a new Fee Validity record
	"""
	try:
		appt = frappe.get_doc("Patient Appointment", appointment)
		if appt.status in ("Checked In", "Checked Out", "Closed", "Cancelled"):
			return  # Already processed — do not double-trigger

		appt.status = "Checked In"
		if payment_mode:
			appt.mode_of_payment = payment_mode
		if paid_amount is not None and float(paid_amount) > 0:
			appt.paid_amount = float(paid_amount)
			appt.invoiced    = 1
		appt.save(ignore_permissions=True)
		# Healthcare on_update() → update_fee_validity() fires here
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			f"clinic_flow: failed to check in Patient Appointment {appointment}",
		)
