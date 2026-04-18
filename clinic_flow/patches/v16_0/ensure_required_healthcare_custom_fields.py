from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	# These upstream Healthcare extensions are still load-bearing for clinic_flow.
	# Manage them in code instead of depending on unmanaged site-local Custom Field rows.
	create_custom_fields(get_required_healthcare_custom_fields(), update=True)


def get_required_healthcare_custom_fields():
	return {
		"Appointment Type": [
			{
				"fieldname": "custom_queue_code",
				"label": "Queue Code",
				"fieldtype": "Data",
				"insert_after": "default_duration",
			},
			# Kept for now because Patient Appointment.custom_queue_type still fetches from it.
			{
				"fieldname": "custom_queue_type",
				"label": "Queue Type",
				"fieldtype": "Select",
				"options": "PRE_BOOKED\nWALK_IN\nEMERGENCY\nFOLLOW_UP\nLAB_RETURN",
				"insert_after": "custom_queue_code",
			},
		],
		"Medical Department": [
			{
				"fieldname": "custom_dept_abbr",
				"label": "Department Abbreviation",
				"fieldtype": "Data",
				"insert_after": "department",
			},
		],
		"Patient Appointment": [
			{
				"fieldname": "custom_dept_abbr",
				"label": "Department Abbreviation",
				"fieldtype": "Data",
				"fetch_from": "department.custom_dept_abbr",
				"insert_after": "department",
			},
			{
				"fieldname": "custom_queue_type",
				"label": "Queue Type",
				"fieldtype": "Select",
				"options": "PRE_BOOKED\nWALK_IN\nEMERGENCY\nFOLLOW_UP",
				"fetch_from": "appointment_type.custom_queue_type",
				"insert_after": "appointment_for",
			},
			{
				"fieldname": "custom_queue_token",
				"label": "Queue Token",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "custom_queue_type",
			},
		],
		"Patient Encounter": [
			{
				"fieldname": "custom_chief_complaint",
				"label": "Chief Complaint / Symptoms",
				"fieldtype": "Long Text",
				"insert_after": "encounter_comment",
			},
		],
	}
