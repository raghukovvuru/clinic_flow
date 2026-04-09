import frappe


def extend_boot(bootinfo) -> None:
	"""
	Called during every boot (page load). Redirects Physician / Queue Manager
	users to the Doctor Workspace instead of the generic Frappe desk.
	"""
	if frappe.session.user in ("Guest", "Administrator"):
		return

	roles = frappe.get_roles(frappe.session.user)
	if any(r in roles for r in ("Physician", "Queue Manager")):
		bootinfo["home_page"] = "doctor-workspace"
