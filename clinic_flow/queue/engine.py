import frappe
import json
from frappe import _
from frappe.utils import now_datetime, today


# ── Token formatter ──────────────────────────────────────────────────────────

def build_token(dept_abbr: str, queue_type: str, sequence: int) -> str:
	"""
	Format: DEPT-CODE-SEQ
	Example: CARD-WLK-009
	queue_type maps to code via Appointment Type.custom_queue_code
	Fallback codes if Appointment Type not found:
	  PRE_BOOKED → PRE, WALK_IN → WLK, EMERGENCY → EMR, FOLLOW_UP → FLW
	"""
	FALLBACK_CODES = {
		"PRE_BOOKED": "PRE",
		"WALK_IN": "WLK",
		"EMERGENCY": "EMR",
		"FOLLOW_UP": "FLW",
	}
	code = FALLBACK_CODES.get(queue_type, "GEN")
	return f"{dept_abbr.upper()}-{code}-{str(sequence).zfill(3)}"


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
	  1. EMERGENCY — always next, bypasses round-robin
	  2. Round-robin among PRE_BOOKED (weight 3), FOLLOW_UP (weight 1), WALK_IN (weight 1)
	     with skip-if-empty promotion.

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

	# Step 1: Emergency bypass
	emergency = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": queue_session,
			"queue_type": "EMERGENCY",
			"status": "Waiting",
		},
		fields=["name", "token", "patient", "queue_type", "queue_position"],
		order_by="queue_position asc",
		limit=1,
	)
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

	# Step 3: Try to dequeue from current type, with skip-if-empty promotion
	TYPE_ORDER = ["PRE_BOOKED", "FOLLOW_UP", "WALK_IN"]
	start_idx = TYPE_ORDER.index(current_type) if current_type in TYPE_ORDER else 0

	for offset in range(len(TYPE_ORDER)):
		try_type = TYPE_ORDER[(start_idx + offset) % len(TYPE_ORDER)]
		candidate = frappe.get_all(
			"Queue Entry",
			filters={
				"queue_session": queue_session,
				"queue_type": try_type,
				"status": "Waiting",
			},
			fields=["name", "token", "patient", "queue_type", "queue_position"],
			order_by="queue_position asc",
			limit=1,
		)
		if candidate:
			# Found one — update rr_state
			new_remaining = (remaining - 1) if try_type == current_type else WEIGHTS.get(try_type, 1) - 1
			if new_remaining <= 0:
				# Advance to next type in rotation
				next_type = TYPE_ORDER[(TYPE_ORDER.index(try_type) + 1) % len(TYPE_ORDER)]
				new_state = {"type": next_type, "remaining": WEIGHTS.get(next_type, 1)}
			else:
				new_state = {"type": try_type, "remaining": new_remaining}

			frappe.db.set_value("Queue Session", queue_session, "rr_state", json.dumps(new_state))
			return candidate[0]

	return None  # Queue is empty


# ── Realtime broadcast ───────────────────────────────────────────────────────

def _broadcast_queue_update(queue_session: str) -> None:
	"""Publish realtime event to all dashboard subscribers."""
	session_doc = frappe.get_doc("Queue Session", queue_session)
	waiting = frappe.get_all(
		"Queue Entry",
		filters={"queue_session": queue_session, "status": "Waiting"},
		fields=["token", "patient_name", "queue_type", "queue_position"],
		order_by="queue_position asc",
		limit=6,
	)
	payload = {
		"current_token": session_doc.current_token,
		"next_tokens": waiting[:5],
		"practitioner": session_doc.practitioner,
		"dept_abbr": session_doc.dept_abbr,
	}
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
