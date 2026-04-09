import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class QueueEntry(Document):
	def before_save(self) -> None:
		if self.has_value_changed("status"):
			now = now_datetime()
			if self.status == "Called" and not self.called_at:
				self.called_at = now
			elif self.status == "With Doctor" and not self.seen_at:
				self.seen_at = now
			elif self.status == "Done":
				if not self.done_at:
					self.done_at = now
				if self.called_at:
					delta = now - frappe.utils.get_datetime(self.called_at)
					self.wait_minutes = int(delta.total_seconds() / 60)
