from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	# Slice 1 authority change: queue-identity custom fields on Healthcare doctypes
	# (Appointment Type, Medical Department, Patient Appointment) are no longer
	# managed here. They remain on existing sites from previous patch runs but are
	# not part of the target operational model.
	#
	# Only the Patient Encounter integration field is still actively managed.
	create_custom_fields(get_required_healthcare_custom_fields(), update=True)


def get_required_healthcare_custom_fields():
	return {
		"Patient Encounter": [
			{
				"fieldname": "custom_chief_complaint",
				"label": "Chief Complaint / Symptoms",
				"fieldtype": "Long Text",
				"insert_after": "encounter_comment",
			},
		],
	}
