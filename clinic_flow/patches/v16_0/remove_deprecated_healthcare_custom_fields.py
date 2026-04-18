import frappe


DEPRECATED_CUSTOM_FIELDS = (
	"Patient Appointment-custom_original_encounter",
	"Patient Encounter-custom_awaiting_lab_return",
	"Patient Encounter-custom_lab_return_queued",
)


def execute():
	for custom_field in DEPRECATED_CUSTOM_FIELDS:
		frappe.delete_doc("Custom Field", custom_field, ignore_missing=True)
