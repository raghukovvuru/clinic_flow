"""
Queue-identity resolution helpers.

Hot paths call the read-only resolvers. The migration patch (and only the
patch, or an explicit admin entry point) calls ``ensure_service_point``.
Creating Service Points from multiple hot paths risks duplicate rows under
concurrent load, even with a unique key — consolidate creation instead.
"""
import frappe


def resolve_service_point(
	practitioner: str | None = None,
	department: str | None = None,
) -> str | None:
	"""
	Read-only lookup. Returns an existing Service Point name or None.

	Preference:
	  1. an active Service Point whose default_practitioner matches
	  2. an active Service Point whose department matches
	  3. the practitioner's department's Service Point (follows the HP → dept link)
	"""
	if practitioner:
		name = frappe.db.get_value(
			"Service Point",
			{"default_practitioner": practitioner, "is_active": 1},
			"name",
		)
		if name:
			return name

	if not department and practitioner:
		department = frappe.db.get_value(
			"Healthcare Practitioner", practitioner, "department"
		) or None

	if department:
		# Prefer the department-wide (shared) Service Point — one with no
		# default_practitioner set — over practitioner-specific ones.
		shared = frappe.get_all(
			"Service Point",
			filters={
				"department": department,
				"is_active": 1,
				"default_practitioner": ["in", ["", None]],
			},
			fields=["name"],
			limit=1,
		)
		if shared:
			return shared[0].name
		any_match = frappe.db.get_value(
			"Service Point",
			{"department": department, "is_active": 1},
			"name",
		)
		if any_match:
			return any_match

	return None


def resolve_queue_code(
	service_point: str | None = None,
	dept_abbr: str | None = None,
	practitioner: str | None = None,
	department: str | None = None,
	fallback: str = "GEN",
) -> str:
	"""
	Pure read-only resolution. Fallback chain:
	  1. service_point -> Service Point.queue_code
	  2. dept_abbr
	  3. practitioner's department abbreviation (via Medical Department)
	  4. ``fallback`` (default "GEN")
	"""
	if service_point:
		code = frappe.db.get_value("Service Point", service_point, "queue_code")
		if code:
			return code.strip().upper()

	if dept_abbr:
		return dept_abbr.strip().upper()

	if not department and practitioner:
		department = frappe.db.get_value(
			"Healthcare Practitioner", practitioner, "department"
		) or None

	if department:
		code = frappe.db.get_value(
			"Medical Department", department, "custom_dept_abbr"
		)
		if code:
			return code.strip().upper()

	return fallback


def resolve_department_name(
	service_point: str | None = None,
	dept_abbr: str | None = None,
) -> str:
	"""
	Reverse-resolve a Medical Department label for display.

	Prefers Service Point → Medical Department.department; falls back to
	looking up by dept_abbr; returns an empty string when nothing resolves.
	"""
	if service_point:
		dept = frappe.db.get_value("Service Point", service_point, "department")
		if dept:
			dept_name = frappe.db.get_value("Medical Department", dept, "department")
			if dept_name:
				return dept_name

	if dept_abbr:
		dept_name = frappe.db.get_value(
			"Medical Department", {"custom_dept_abbr": dept_abbr}, "department"
		)
		if dept_name:
			return dept_name

	return ""


def ensure_service_point(
	practitioner: str | None = None,
	department: str | None = None,
) -> str | None:
	"""
	Create-if-missing helper. Call ONLY from the migration patch or an
	explicit admin entry point. Never from request-handling hot paths —
	concurrent invocations can materialize duplicate rows.

	Returns the Service Point name, or None if there is insufficient context
	to materialize one (no practitioner, no department, no dept_abbr).
	"""
	existing = resolve_service_point(
		practitioner=practitioner, department=department
	)
	if existing:
		return existing

	if not department and practitioner:
		department = frappe.db.get_value(
			"Healthcare Practitioner", practitioner, "department"
		) or None

	if not department:
		return None

	code = frappe.db.get_value(
		"Medical Department", department, "custom_dept_abbr"
	)
	if not code:
		return None

	code = code.strip().upper()
	if frappe.db.exists("Service Point", code):
		return code

	dept_name = frappe.db.get_value(
		"Medical Department", department, "department"
	) or department

	doc = frappe.new_doc("Service Point")
	doc.queue_code = code
	doc.display_label = dept_name
	doc.category = "consult"
	doc.department = department
	if practitioner:
		doc.default_practitioner = practitioner
	doc.is_active = 1
	doc.insert(ignore_permissions=True)
	return doc.name
