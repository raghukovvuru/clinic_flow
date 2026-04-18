"""
Create Service Point rows for queue codes currently in use and backfill
Queue Session.service_point.

Contract:
  - idempotent: rerunning on a migrated site is a no-op
  - fail-fast on queue code collisions (same code mapping to multiple distinct
    departments); operator must disambiguate before re-running
  - does NOT delete or rename legacy fields (custom_dept_abbr, dept_abbr)
  - does NOT overwrite an existing Service Point row
  - does NOT overwrite Queue Session.service_point when already set

Ordering (preserve this in any future edits):
  (a) collision pre-scan
  (b) create Service Point rows for distinct queue codes in use
  (c) backfill Queue Session.service_point where null
  (d) ensure Queue Session.dept_abbr == service_point.queue_code (cached mirror)
"""
import frappe
from frappe import _


def execute() -> None:
	_abort_on_collisions()
	_create_service_points_for_existing_codes()
	_backfill_queue_session_service_point()
	_sync_dept_abbr_with_service_point()


# ── (a) collision pre-scan ───────────────────────────────────────────────────

def _abort_on_collisions() -> None:
	"""
	Abort if any queue code maps to multiple distinct departments.

	Two sources are checked so we catch both config-level duplicates
	(Medical Department) and data drift (Queue Session).
	"""
	dept_collisions = frappe.db.sql("""
		SELECT custom_dept_abbr AS queue_code,
		       GROUP_CONCAT(DISTINCT name ORDER BY name) AS departments
		FROM `tabMedical Department`
		WHERE IFNULL(custom_dept_abbr, '') != ''
		GROUP BY custom_dept_abbr
		HAVING COUNT(*) > 1
	""", as_dict=True)

	session_collisions = frappe.db.sql("""
		SELECT dept_abbr AS queue_code,
		       GROUP_CONCAT(DISTINCT department ORDER BY department) AS departments
		FROM `tabQueue Session`
		WHERE IFNULL(dept_abbr, '') != ''
		  AND IFNULL(department, '') != ''
		GROUP BY dept_abbr
		HAVING COUNT(DISTINCT department) > 1
	""", as_dict=True)

	all_collisions = list(dept_collisions) + list(session_collisions)
	if not all_collisions:
		return

	seen: set[tuple[str, str]] = set()
	lines = ["Queue code collisions detected. Resolve before re-running:"]
	for row in all_collisions:
		key = (row["queue_code"], row["departments"])
		if key in seen:
			continue
		seen.add(key)
		lines.append(f"  - {row['queue_code']}: {row['departments']}")
	lines.append("")
	lines.append(
		"Remediation: edit Medical Department.custom_dept_abbr so each "
		"department has a unique code, then re-run `bench migrate`."
	)
	frappe.throw("\n".join(lines))


# ── (b) create Service Point rows ────────────────────────────────────────────

def _create_service_points_for_existing_codes() -> int:
	codes = _collect_distinct_queue_codes()
	created = 0
	for code, meta in codes.items():
		if frappe.db.exists("Service Point", code):
			continue
		doc = frappe.new_doc("Service Point")
		doc.queue_code = code
		doc.display_label = meta.get("display_label") or code
		doc.category = "consult"
		doc.is_active = 1
		if meta.get("department"):
			doc.department = meta["department"]
		if meta.get("default_practitioner"):
			doc.default_practitioner = meta["default_practitioner"]
		doc.insert(ignore_permissions=True)
		created += 1
	return created


def _collect_distinct_queue_codes() -> dict[str, dict]:
	"""
	Build {queue_code: {department, default_practitioner, display_label}}.

	Sources (Medical Department wins over Queue Session when both are present):
	  1. Medical Department.custom_dept_abbr — config-level source of truth
	  2. Queue Session.dept_abbr — picks up any live sessions that drifted
	"""
	result: dict[str, dict] = {}

	for d in frappe.get_all(
		"Medical Department",
		filters={"custom_dept_abbr": ["!=", ""]},
		fields=["name", "custom_dept_abbr", "department"],
	):
		code = (d.custom_dept_abbr or "").strip().upper()
		if not code or code in result:
			continue
		result[code] = {
			"department": d.name,
			"display_label": d.department or d.name,
			"default_practitioner": None,
		}

	for s in frappe.get_all(
		"Queue Session",
		filters={"dept_abbr": ["!=", ""]},
		fields=["dept_abbr", "department", "practitioner"],
	):
		code = (s.dept_abbr or "").strip().upper()
		if not code or code in result:
			continue
		result[code] = {
			"department": s.department or None,
			"display_label": s.department or code,
			"default_practitioner": None,
		}

	return result


# ── (c) backfill Queue Session.service_point ────────────────────────────────

def _backfill_queue_session_service_point() -> int:
	rows = frappe.db.sql("""
		SELECT name, dept_abbr
		FROM `tabQueue Session`
		WHERE (service_point IS NULL OR service_point = '')
		  AND IFNULL(dept_abbr, '') != ''
	""", as_dict=True)
	updated = 0
	for row in rows:
		code = (row["dept_abbr"] or "").strip().upper()
		if not code or not frappe.db.exists("Service Point", code):
			continue
		frappe.db.set_value(
			"Queue Session", row["name"], "service_point", code,
			update_modified=False,
		)
		updated += 1
	return updated


# ── (d) sync dept_abbr cached mirror ────────────────────────────────────────

def _sync_dept_abbr_with_service_point() -> int:
	rows = frappe.db.sql("""
		SELECT name, service_point, dept_abbr
		FROM `tabQueue Session`
		WHERE IFNULL(service_point, '') != ''
	""", as_dict=True)
	updated = 0
	for row in rows:
		code = (row["service_point"] or "").strip().upper()
		if (row["dept_abbr"] or "") == code:
			continue
		frappe.db.set_value(
			"Queue Session", row["name"], "dept_abbr", code,
			update_modified=False,
		)
		updated += 1
	return updated
