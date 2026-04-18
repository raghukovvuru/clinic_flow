import frappe
import json
from frappe import _
from frappe.utils import now_datetime, today


# ── Token formatter ──────────────────────────────────────────────────────────

def build_display_token(queue_code: str, token_number: int | str) -> str:
	"""
	Build the front-facing token label.

	Internal queue ordering remains numeric via token_number. This helper only
	composes the visible token so multiple active queues remain distinguishable
	in shared waiting areas.
	"""
	code = (queue_code or "GEN").strip().upper()
	try:
		number = int(token_number)
	except (TypeError, ValueError):
		return code
	return f"{code}-{number:03d}"

def build_token(dept_abbr: str, queue_type: str, sequence: int) -> str:
	"""
	Legacy compatibility wrapper.

	Display tokens no longer encode queue type. Keep the old function signature
	so legacy call sites continue to work while we standardize the visible token.
	"""
	return build_display_token(dept_abbr, sequence)


def get_next_sequence(queue_session: str, queue_type: str) -> int:
	"""
	Get the next sequence number for this queue type for the doctor today.
	Counts across ALL sessions for the same practitioner on the same day so
	that restarting a session never recycles token numbers.
	"""
	result = frappe.db.sql("""
		SELECT COUNT(*) AS cnt
		FROM `tabQueue Entry` qe
		JOIN `tabQueue Session` qs ON qs.name = qe.queue_session
		WHERE qs.practitioner = (SELECT practitioner FROM `tabQueue Session` WHERE name = %s)
		  AND qs.session_date  = (SELECT session_date  FROM `tabQueue Session` WHERE name = %s)
		  AND qe.queue_type = %s
	""", (queue_session, queue_session, queue_type), as_dict=True)
	return (result[0].cnt or 0) + 1


# ── Round-robin dequeue ──────────────────────────────────────────────────────

def get_next_token(queue_session: str) -> dict | None:
	"""
	Priority order:
	  1. EMERGENCY already ready near doctor — always next, bypasses round-robin
	  2. Round-robin among PRE_BOOKED (weight 3), FOLLOW_UP (weight 1), WALK_IN (weight 1)
	     across patients who are ready near doctor
	  3. Legacy fallback: if no ready-near-doctor entries exist yet, use Waiting
	     so the older workspace flow keeps working during transition.

	Round-robin state is stored as JSON in QueueSession.rr_state:
	{"type": "PRE_BOOKED", "remaining": 2}

	Returns: Queue Entry dict or None if queue is empty.
	"""
	config = frappe.get_single("Slot Partition Config")
	WEIGHTS = {
		"PRE_BOOKED": config.weight_prebooked or 3,
		"FOLLOW_UP": config.weight_followup or 1,
		"WALK_IN": config.weight_walkin or 1,
	}

	ready_statuses = ["Ready Near Doctor"]
	legacy_statuses = ["Waiting"]

	def _get_candidate(queue_type: str | None, statuses: list[str], priority: str | None = None) -> list[dict]:
		filters = {
			"queue_session": queue_session,
			"status": ["in", statuses],
		}
		if queue_type:
			filters["queue_type"] = queue_type
		if priority:
			filters["priority"] = priority
		return frappe.get_all(
			"Queue Entry",
			filters=filters,
			fields=["name", "token", "patient", "queue_type", "queue_position", "priority"],
			order_by="queue_position asc",
			limit=1,
		)

	# Step 1: Emergency bypass
	emergency = _get_candidate(None, ready_statuses, priority="emergency")
	if emergency:
		return emergency[0]

	# Step 2: Load round-robin state
	session_doc = frappe.get_doc("Queue Session", queue_session)
	try:
		rr_state = json.loads(session_doc.rr_state or "{}")
	except Exception:
		rr_state = {}

	current_type = rr_state.get("type", "PRE_BOOKED")
	remaining = rr_state.get("remaining", WEIGHTS.get(current_type, 1))

	def _dequeue_by_rr(statuses: list[str]) -> dict | None:
		TYPE_ORDER = ["PRE_BOOKED", "FOLLOW_UP", "WALK_IN"]
		start_idx = TYPE_ORDER.index(current_type) if current_type in TYPE_ORDER else 0

		for offset in range(len(TYPE_ORDER)):
			try_type = TYPE_ORDER[(start_idx + offset) % len(TYPE_ORDER)]
			candidate = _get_candidate(try_type, statuses)
			if candidate:
				# Found one — update rr_state
				new_remaining = (remaining - 1) if try_type == current_type else WEIGHTS.get(try_type, 1) - 1
				if new_remaining <= 0:
					next_type = TYPE_ORDER[(TYPE_ORDER.index(try_type) + 1) % len(TYPE_ORDER)]
					new_state = {"type": next_type, "remaining": WEIGHTS.get(next_type, 1)}
				else:
					new_state = {"type": try_type, "remaining": new_remaining}

				frappe.db.set_value("Queue Session", queue_session, "rr_state", json.dumps(new_state))
				return candidate[0]
		return None

	candidate = _dequeue_by_rr(ready_statuses)
	if candidate:
		return candidate

	emergency = _get_candidate(None, legacy_statuses, priority="emergency")
	if emergency:
		return emergency[0]

	candidate = _dequeue_by_rr(legacy_statuses)
	if candidate:
		return candidate

	return None  # Queue is empty


def get_next_special_token(queue_session: str) -> dict | None:
	"""
	Doctor-only one-time override for special patients.

	Policy:
	  - eligible only from Ready Near Doctor
	  - oldest ready special patient goes next
	  - does not rewrite stored queue order
	"""
	rows = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": queue_session,
			"priority": "special",
			"status": "Ready Near Doctor",
		},
		fields=["name", "token", "patient", "queue_type", "queue_position"],
		order_by="queue_position asc",
		limit=1,
	)
	return rows[0] if rows else None


# ── Realtime broadcast ───────────────────────────────────────────────────────

def _broadcast_queue_update(queue_session: str) -> None:
	"""Publish realtime event to dashboard subscribers and the practitioner's browser."""
	session_doc = frappe.get_doc("Queue Session", queue_session)
	next_tokens = frappe.get_all(
		"Queue Entry",
		filters={"queue_session": queue_session, "status": ["in", ["Ready Near Doctor", "Waiting"]]},
		fields=["token", "patient_name", "queue_type", "queue_position", "status", "priority"],
		order_by="queue_position asc",
		limit=6,
	)
	status_order = {"Ready Near Doctor": 0, "Waiting": 1}
	next_tokens = sorted(
		next_tokens,
		key=lambda row: (status_order.get(row.get("status"), 9), row.get("queue_position") or 0),
	)
	payload = {
		"current_token": session_doc.current_token,
		"next_tokens": next_tokens[:5],
		"practitioner": session_doc.practitioner,
		"dept_abbr": session_doc.dept_abbr,
	}
	# Send directly to the practitioner's browser (doctor workspace)
	practitioner_user = frappe.db.get_value(
		"Healthcare Practitioner", session_doc.practitioner, "user_id"
	)
	if practitioner_user:
		frappe.publish_realtime(
			event="queue_update",
			message=payload,
			user=practitioner_user,
		)
	# Also broadcast to room-based subscribers (TV display board)
	frappe.publish_realtime(
		event="queue_update",
		message=payload,
		room=f"queue_{session_doc.dept_abbr}",
	)
	frappe.publish_realtime(
		event="queue_update",
		message=payload,
		room="queue_all",
	)
