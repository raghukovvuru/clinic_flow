import math
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import today, getdate, get_datetime, add_to_date, now_datetime


class QueueMixin(Document):
	"""
	Mixin added to Patient Appointment via extend_doctype_class in hooks.py.
	Two responsibilities:
	  1. validate() — enforce slot limits at booking time
	  2. on_update() — auto-create Queue Entry on Checked In
	"""

	def validate(self) -> None:
		super().validate()
		try:
			self._clinic_flow_enforce_slot_limits()
		except frappe.ValidationError:
			raise  # Re-raise slot limit errors so the form shows them
		except Exception:
			frappe.log_error(frappe.get_traceback(), "clinic_flow: slot limit check error")

	def on_update(self) -> None:
		super().on_update()
		try:
			self._clinic_flow_maybe_create_queue_entry()
		except frappe.ValidationError:
			raise  # Surface "No Session Found" and similar errors to the receptionist
		except Exception:
			frappe.log_error(frappe.get_traceback(), "clinic_flow: Queue Entry creation error")

	# ── Booking-time slot enforcement ────────────────────────────────────────

	def _clinic_flow_enforce_slot_limits(self) -> None:
		"""
		Block appointment save when the slot limit for that queue type is reached.
		Only fires when custom_queue_type is set and the appointment is not cancelled.
		"""
		if self.status in ("Cancelled", "No Show", "Checked Out", "Closed"):
			return
		if not self.custom_queue_type or self.custom_queue_type == "EMERGENCY":
			return  # Emergency is never blocked

		# Only check on new bookings or when queue_type changes
		if not (self.is_new() or self.has_value_changed("custom_queue_type")):
			return

		config = frappe.get_single("Slot Partition Config")

		# Try to get limit from existing Queue Session (session_capacity × % gives the total)
		session_row = frappe.db.get_value(
			"Queue Session",
			{"practitioner": self.practitioner, "session_date": self.appointment_date,
			 "status": ["in", ["Scheduled", "Active"]]},
			["prebooked_total", "walkin_total", "followup_total", "session_capacity", "start_time"],
			as_dict=True,
		)

		field_map = {
			"PRE_BOOKED": "prebooked_total",
			"WALK_IN":    "walkin_total",
			"FOLLOW_UP":  "followup_total",
		}
		session_field = field_map.get(self.custom_queue_type, "prebooked_total")
		limit: int | None = None

		if session_row and session_row.get(session_field):
			# Session already exists — trust its pre-calculated total
			limit = session_row[session_field]
		elif session_row and session_row.get("session_capacity"):
			# Session exists but totals not yet filled — derive from capacity × pct
			cap = session_row.session_capacity
			pct_map = {
				"PRE_BOOKED": config.prebooked_pct or 60,
				"WALK_IN":    config.walkin_pct    or 30,
				"FOLLOW_UP":  config.followup_pct  or 10,
			}
			limit = math.ceil(cap * pct_map.get(self.custom_queue_type, 60) / 100)
		else:
			# No session yet — fall back to a default capacity of 20 × configured %
			pct_map = {
				"PRE_BOOKED": config.prebooked_pct or 60,
				"WALK_IN":    config.walkin_pct    or 30,
				"FOLLOW_UP":  config.followup_pct  or 10,
			}
			default_capacity = 20
			limit = math.ceil(default_capacity * pct_map.get(self.custom_queue_type, 60) / 100)

		if not limit:
			return

		# For same-day walk-in within the release window, expand limit by unused
		# PRE_BOOKED and FOLLOW_UP slots — mirrors get_availability() release logic.
		if self.custom_queue_type == "WALK_IN" and getdate(self.appointment_date) == getdate():
			release_mins = config.release_minutes_before or 60
			start_time = session_row.get("start_time") if session_row else None
			if start_time:
				session_start = get_datetime(f"{self.appointment_date} {start_time}")
				within_release = session_start <= add_to_date(now_datetime(), minutes=release_mins)
				if within_release:
					cap = (session_row.session_capacity if session_row else 20) or 20
					for release_type, pct_attr, total_field in [
						("PRE_BOOKED", "prebooked_pct", "prebooked_total"),
						("FOLLOW_UP",  "followup_pct",  "followup_total"),
					]:
						if session_row and session_row.get(total_field):
							rel_limit = session_row[total_field]
						else:
							rel_pct = getattr(config, pct_attr, None) or (60 if release_type == "PRE_BOOKED" else 10)
							rel_limit = math.ceil(cap * rel_pct / 100)
						rel_used = frappe.db.count("Patient Appointment", {
							"practitioner":     self.practitioner,
							"appointment_date": self.appointment_date,
							"custom_queue_type": release_type,
							"status":           ["not in", ["Cancelled", "No Show"]],
						})
						limit += max(0, rel_limit - rel_used)

		count = frappe.db.count("Patient Appointment", {
			"practitioner":    self.practitioner,
			"appointment_date": self.appointment_date,
			"custom_queue_type": self.custom_queue_type,
			"status":          ["not in", ["Cancelled", "No Show"]],
			"name":            ["!=", self.name],
		})

		if count >= limit:
			labels = {"PRE_BOOKED": "Pre-booked", "WALK_IN": "Walk-in", "FOLLOW_UP": "Follow-up"}
			frappe.throw(
				_(
					"{0} slots are fully booked for {1} on {2} ({3}/{4} used). "
					"No more {0} appointments can be scheduled for this session."
				).format(
					labels.get(self.custom_queue_type, self.custom_queue_type),
					self.practitioner,
					self.appointment_date,
					count,
					limit,
				),
				title=_("Slot Limit Reached"),
			)

	# ── Check-in: auto Queue Entry creation ──────────────────────────────────

	def _clinic_flow_maybe_create_queue_entry(self) -> None:
		"""Creates a Queue Entry when appointment status transitions to Checked In."""
		if self.status != "Checked In":
			return
		if not self.custom_queue_type:
			frappe.log_error(
				f"Appointment {self.name} checked in but custom_queue_type is not set.",
				"clinic_flow: missing queue_type",
			)
			return

		already_queued = frappe.db.exists(
			"Queue Entry",
			{"appointment": self.name, "status": ["in", ["Waiting", "Called", "With Doctor"]]},
		)
		if already_queued:
			return

		# Look for a session in priority order:
		#   1. Active / Paused  — normal flow
		#   2. Completed        — doctor is on a break between sessions; issue the token
		#                         now and it will be inherited by the next session.
		# If no session exists at all today, block with a clear error so the
		# receptionist knows they need to start one (or redirect the patient).
		# frappe.get_all rejects FIELD() in order_by — use raw SQL for priority ordering
		sessions = frappe.db.sql("""
			SELECT name, dept_abbr, status
			FROM `tabQueue Session`
			WHERE practitioner = %s
			  AND session_date = %s
			  AND status IN ('Active', 'Paused', 'Completed')
			ORDER BY FIELD(status, 'Active', 'Paused', 'Completed'), creation DESC
			LIMIT 1
		""", (self.practitioner, today()), as_dict=True)
		if not sessions:
			frappe.throw(
				_(
					"No queue session exists for {0} today. "
					"Please start a session before checking in patients."
				).format(self.practitioner),
				title=_("No Session Found"),
			)

		session = sessions[0]
		between_sessions = session.status == "Completed"

		from clinic_flow.queue.engine import build_token, get_next_sequence, _broadcast_queue_update

		dept = session.dept_abbr or self.custom_dept_abbr or "GEN"
		seq = get_next_sequence(session.name, self.custom_queue_type)
		token = build_token(dept, self.custom_queue_type, seq)

		# Max position across ALL of today's sessions for this practitioner so that
		# between-sessions check-ins don't restart numbering from 0.
		result = frappe.db.sql("""
			SELECT MAX(qe.queue_position)
			FROM `tabQueue Entry` qe
			JOIN `tabQueue Session` qs ON qs.name = qe.queue_session
			WHERE qs.practitioner = %s
			  AND qs.session_date  = %s
			  AND qe.status != 'No Show'
		""", (self.practitioner, self.appointment_date))
		last_pos: int = (result[0][0] or 0) if result else 0

		if self.custom_queue_type == "EMERGENCY":
			current_pos: int = frappe.db.get_value(
				"Queue Session", session.name, "total_called") or 0
			position = current_pos + 1
			frappe.db.sql(
				"UPDATE `tabQueue Entry` SET queue_position = queue_position + 1 "
				"WHERE queue_session = %s AND status = 'Waiting' AND queue_position >= %s",
				(session.name, position),
			)
		else:
			position = last_pos + 1

		entry = frappe.get_doc({
			"doctype": "Queue Entry",
			"queue_session": session.name,
			"patient": self.patient,
			"appointment": self.name,
			"practitioner": self.practitioner,
			"department": self.department,
			"dept_abbr": dept,
			"queue_type": self.custom_queue_type,
			"token": token,
			"queue_position": position,
			"status": "Waiting",
			"issued_by": frappe.session.user,
			"issued_by_role": "Reception",
		})
		entry.insert(ignore_permissions=True)

		# Only increment slot counters on a live session — if the doctor is between
		# sessions (session is Completed) the counter will be picked up by the next
		# session when it inherits this Queue Entry.
		if not between_sessions:
			_increment_session_slot(session.name, self.custom_queue_type)

		frappe.db.set_value(
			"Patient Appointment", self.name, "custom_queue_token", token,
			update_modified=False,
		)
		_broadcast_queue_update(session.name)


def _increment_session_slot(queue_session: str, queue_type: str) -> None:
	"""Increment the session's used-slot counter when a patient checks in."""
	field_map = {
		"PRE_BOOKED": "prebooked_used",
		"WALK_IN":    "walkin_used",
		"FOLLOW_UP":  "followup_used",
	}
	field = field_map.get(queue_type)
	if field:
		current = frappe.db.get_value("Queue Session", queue_session, field) or 0
		frappe.db.set_value("Queue Session", queue_session, field, current + 1)
