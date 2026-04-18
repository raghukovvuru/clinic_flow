import frappe
from frappe import _
from frappe.model.document import Document


class ServicePoint(Document):
	def autoname(self) -> None:
		if self.queue_code:
			self.queue_code = self.queue_code.strip().upper()
			self.name = self.queue_code

	def validate(self) -> None:
		if not self.queue_code:
			frappe.throw(_("Queue Code is required."))
		self.queue_code = self.queue_code.strip().upper()
		if not self.display_label:
			frappe.throw(_("Display Label is required."))
