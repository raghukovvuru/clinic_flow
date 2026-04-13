import json
import math
import frappe
from frappe import _
from frappe.model.document import Document


class QueueSession(Document):
	def before_insert(self) -> None:
		config = frappe.get_single("Slot Partition Config")
		capacity: int = self.session_capacity or 20

		# v1 slot percentages
		prebooked_pct: int = config.prebooked_pct or 60
		walkin_pct: int    = config.walkin_pct    or 30
		followup_pct: int  = config.followup_pct  or 10

		if not self.prebooked_total:
			self.prebooked_total = math.ceil(capacity * prebooked_pct / 100)
		if not self.walkin_total:
			self.walkin_total = math.ceil(capacity * walkin_pct / 100)
		if not self.followup_total:
			self.followup_total = math.ceil(capacity * followup_pct / 100)

		# v2: derive planned_capacity and stretch_capacity from session_capacity if not set
		if not self.planned_capacity:
			self.planned_capacity = capacity
		if not self.stretch_capacity:
			# stretch = 110% of planned, rounded up
			self.stretch_capacity = math.ceil(self.planned_capacity * 1.1)

		# v2: generate VIP buffer positions if not already set
		if not self.vip_buffer_positions:
			self.vip_buffer_positions = json.dumps(
				_compute_vip_buffer_positions(
					self.planned_capacity,
					config.vip_buffer_count or 10,
					config.vip_buffer_interval or 15,
				)
			)

	def validate(self) -> None:
		if self.start_time >= self.end_time:
			frappe.throw(_("End time must be after start time."))
		if not self.dept_abbr:
			frappe.throw(_("Department Abbreviation is required (e.g. CARD, PED). Set it on this session."))
		if not self.session_capacity or self.session_capacity < 1:
			frappe.throw(_("Session Capacity must be at least 1."))


def _compute_vip_buffer_positions(capacity: int, count: int, interval: int) -> list[int]:
	"""
	Pre-compute the VIP buffer token positions for a session.

	Positions are spaced `interval` apart, starting at `interval`.
	Only positions within `capacity` are included. The total number of
	positions is capped at `count`.

	Example: capacity=150, count=10, interval=15 → [15, 30, 45, 60, 75, 90, 105, 120, 135, 150]
	"""
	positions = []
	pos = interval
	while pos <= capacity and len(positions) < count:
		positions.append(pos)
		pos += interval
	return positions
