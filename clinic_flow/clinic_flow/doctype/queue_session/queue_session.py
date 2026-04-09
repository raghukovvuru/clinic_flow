import math
import frappe
from frappe import _
from frappe.model.document import Document


class QueueSession(Document):
	def before_insert(self) -> None:
		config = frappe.get_single("Slot Partition Config")
		capacity: int = self.session_capacity or 20

		prebooked_pct: int = config.prebooked_pct or 60
		walkin_pct: int    = config.walkin_pct    or 30
		followup_pct: int  = config.followup_pct  or 10

		if not self.prebooked_total:
			self.prebooked_total = math.ceil(capacity * prebooked_pct / 100)
		if not self.walkin_total:
			self.walkin_total = math.ceil(capacity * walkin_pct / 100)
		if not self.emergency_total:
			self.emergency_total = math.ceil(capacity * followup_pct / 100)

	def validate(self) -> None:
		if self.start_time >= self.end_time:
			frappe.throw(_("End time must be after start time."))
		if not self.dept_abbr:
			frappe.throw(_("Department Abbreviation is required (e.g. CARD, PED). Set it on this session."))
		if not self.session_capacity or self.session_capacity < 1:
			frappe.throw(_("Session Capacity must be at least 1."))
