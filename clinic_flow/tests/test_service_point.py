import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import nowdate

from clinic_flow.patches.v16_0.create_service_points import (
	_abort_on_collisions,
	_backfill_queue_session_service_point,
	_create_service_points_for_existing_codes,
	_sync_dept_abbr_with_service_point,
)
from clinic_flow.queue.service_point import (
	ensure_service_point,
	resolve_department_name,
	resolve_queue_code,
	resolve_service_point,
)


class TestServicePoint(IntegrationTestCase):
	"""
	Native Service Point behavior.

	Healthcare-boundary assertions live in test_healthcare_compatibility.py;
	keep this file focused on Service Point semantics. All fixtures use
	randomized queue codes and labels so tests do not collide with the
	migrated-in Service Points that already exist on the live site.
	"""

	def setUp(self) -> None:
		super().setUp()
		self._ensure_gender("Male")

	# ── DocType + autoname/validate ────────────────────────────────────

	def test_queue_code_is_normalized_and_used_as_name(self) -> None:
		code = self._code()
		sp = self._make_service_point(queue_code=f"  {code.lower()} ")
		self.assertEqual(sp.name, code)
		self.assertEqual(sp.queue_code, code)

	def test_unique_queue_code_is_enforced(self) -> None:
		code = self._code()
		self._make_service_point(queue_code=code)
		with self.assertRaises(frappe.exceptions.DuplicateEntryError):
			self._make_service_point(queue_code=code)

	# ── resolve_queue_code fallback chain ──────────────────────────────

	def test_resolve_queue_code_prefers_service_point_over_dept_abbr(self) -> None:
		sp = self._make_service_point()
		self.assertEqual(
			resolve_queue_code(service_point=sp.name, dept_abbr="ZZZ"),
			sp.queue_code,
		)

	def test_resolve_queue_code_falls_back_to_dept_abbr(self) -> None:
		self.assertEqual(resolve_queue_code(dept_abbr="ped"), "PED")

	def test_resolve_queue_code_falls_back_to_department(self) -> None:
		dept = self._make_department()
		self.assertEqual(
			resolve_queue_code(department=dept.name),
			dept.custom_dept_abbr,
		)

	def test_resolve_queue_code_final_fallback(self) -> None:
		self.assertEqual(resolve_queue_code(), "GEN")
		self.assertEqual(resolve_queue_code(fallback="TKN"), "TKN")

	# ── resolve_service_point precedence ──────────────────────────────

	def test_resolve_service_point_prefers_practitioner_match(self) -> None:
		dept = self._make_department()
		prac = self._make_practitioner(department=dept.name)
		by_dept = self._make_service_point(department=dept.name)
		by_prac = self._make_service_point(
			department=dept.name, default_practitioner=prac.name,
		)
		self.assertEqual(
			resolve_service_point(practitioner=prac.name, department=dept.name),
			by_prac.name,
		)
		# With no practitioner hint, prefer the shared (no default_practitioner)
		# Service Point over one that is pinned to a specific doctor.
		self.assertEqual(
			resolve_service_point(department=dept.name),
			by_dept.name,
		)

	# ── Session creation populates service_point + dept_abbr cache ─────

	def test_new_session_links_service_point_and_mirrors_dept_abbr(self) -> None:
		dept = self._make_department()
		prac = self._make_practitioner(department=dept.name)
		sp = self._make_service_point(department=dept.name)
		session = self._make_queue_session(prac, dept, dept_abbr=None)
		self.assertEqual(session.service_point, sp.name)
		self.assertEqual(session.dept_abbr, sp.queue_code)

	# ── Emergency token shares queue identity with session ─────────────

	def test_emergency_token_uses_session_queue_prefix(self) -> None:
		from clinic_flow.api.emergency import (
			confirm_emergency_arrival,
			create_emergency_alert,
		)

		dept = self._make_department()
		prac = self._make_practitioner(department=dept.name)
		sp = self._make_service_point(department=dept.name)
		session = self._make_queue_session(prac, dept, dept_abbr=None)

		alert = create_emergency_alert(
			queue_session=session.name, display_label="Test Emergency",
		)
		issued = confirm_emergency_arrival(alert["intake"])
		token = frappe.db.get_value("Queue Entry", issued["queue_entry"], "token")
		self.assertTrue(token.startswith(f"{sp.queue_code}-"), token)

	def test_emergency_without_resolvable_code_falls_back_to_GEN(self) -> None:
		"""Behavior change: the 'EMR' literal fallback is retired."""
		from clinic_flow.api.emergency import (
			confirm_emergency_arrival,
			create_emergency_alert,
		)

		prac = self._make_practitioner(department=None)
		session = frappe.get_doc({
			"doctype": "Queue Session",
			"session_name": f"No-Code Session {frappe.generate_hash(length=6)}",
			"practitioner": prac.name,
			"session_date": nowdate(),
			"start_time": "09:00:00",
			"end_time": "12:00:00",
			"dept_abbr": "TMP",  # required by validate(); cleared below
			"status": "Active",
			"session_capacity": 10,
		}).insert()
		frappe.db.set_value(
			"Queue Session", session.name, "dept_abbr", "", update_modified=False,
		)

		alert = create_emergency_alert(
			queue_session=session.name, display_label="No-Code Emergency",
		)
		issued = confirm_emergency_arrival(alert["intake"])
		token = frappe.db.get_value("Queue Entry", issued["queue_entry"], "token")
		self.assertTrue(token.startswith("GEN-"), token)
		self.assertFalse(token.startswith("EMR-"), token)

	# ── Department name reverse resolution via Service Point ──────────

	def test_resolve_department_name_prefers_service_point_link(self) -> None:
		dept = self._make_department()
		sp = self._make_service_point(department=dept.name)
		self.assertEqual(
			resolve_department_name(service_point=sp.name),
			dept.department,
		)

	# ── Patch: idempotent, collision-safe, orderly ────────────────────

	def test_patch_creates_service_points_and_links_sessions(self) -> None:
		dept = self._make_department()
		prac = self._make_practitioner(department=dept.name)
		session = frappe.get_doc({
			"doctype": "Queue Session",
			"session_name": f"Unlinked {frappe.generate_hash(length=6)}",
			"practitioner": prac.name,
			"session_date": nowdate(),
			"start_time": "09:00:00",
			"end_time": "12:00:00",
			"dept_abbr": dept.custom_dept_abbr,
			"status": "Scheduled",
			"session_capacity": 5,
		}).insert()
		frappe.db.set_value(
			"Queue Session", session.name, "service_point", None,
			update_modified=False,
		)

		_create_service_points_for_existing_codes()
		_backfill_queue_session_service_point()
		_sync_dept_abbr_with_service_point()

		self.assertTrue(frappe.db.exists("Service Point", dept.custom_dept_abbr))
		linked = frappe.db.get_value("Queue Session", session.name, "service_point")
		self.assertEqual(linked, dept.custom_dept_abbr)

	def test_patch_is_idempotent(self) -> None:
		dept = self._make_department()
		self._make_practitioner(department=dept.name)

		first = _create_service_points_for_existing_codes()
		second = _create_service_points_for_existing_codes()
		self.assertGreaterEqual(first, 1)
		self.assertEqual(second, 0)

	def test_patch_aborts_on_collision(self) -> None:
		code = self._code()
		self._make_department(abbr=code)
		self._make_department(abbr=code)
		with self.assertRaises(frappe.exceptions.ValidationError):
			_abort_on_collisions()

	# ── ensure_service_point creates with full metadata ───────────────

	def test_ensure_service_point_materializes_from_department(self) -> None:
		dept = self._make_department()
		prac = self._make_practitioner(department=dept.name)
		name = ensure_service_point(practitioner=prac.name, department=dept.name)
		self.assertEqual(name, dept.custom_dept_abbr)
		sp = frappe.get_doc("Service Point", dept.custom_dept_abbr)
		self.assertEqual(sp.department, dept.name)
		self.assertEqual(sp.default_practitioner, prac.name)

	# ── Fallback still works when service_point is absent ─────────────

	def test_legacy_session_without_service_point_still_resolves_via_dept_abbr(self) -> None:
		self.assertEqual(
			resolve_queue_code(service_point=None, dept_abbr="ONCO"),
			"ONCO",
		)

	# ── Fixtures ───────────────────────────────────────────────────────

	def _code(self) -> str:
		"""Random 4-char uppercase queue code unique across the site."""
		return f"T{frappe.generate_hash(length=3).upper()}"

	def _ensure_gender(self, gender_name: str) -> str:
		if frappe.db.exists("Gender", gender_name):
			return gender_name
		return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

	def _make_department(self, abbr: str | None = None):
		if abbr is None:
			abbr = self._code()
		tag = frappe.generate_hash(length=6)
		return frappe.get_doc({
			"doctype": "Medical Department",
			"department": f"Test Department {abbr} {tag}",
			"custom_dept_abbr": abbr,
		}).insert()

	def _make_practitioner(self, department: str | None = None):
		return frappe.get_doc({
			"doctype": "Healthcare Practitioner",
			"first_name": f"Practitioner {frappe.generate_hash(length=6)}",
			"gender": "Male",
			"department": department,
		}).insert()

	def _make_service_point(
		self,
		queue_code: str | None = None,
		display_label: str | None = None,
		category: str = "consult",
		department: str | None = None,
		default_practitioner: str | None = None,
	):
		if queue_code is None:
			queue_code = self._code()
		if display_label is None:
			display_label = f"SP {queue_code}"
		return frappe.get_doc({
			"doctype": "Service Point",
			"queue_code": queue_code,
			"display_label": display_label,
			"category": category,
			"department": department,
			"default_practitioner": default_practitioner,
			"is_active": 1,
		}).insert()

	def _make_queue_session(self, practitioner, department, dept_abbr: str | None = "STD"):
		data = {
			"doctype": "Queue Session",
			"session_name": f"Test Session {frappe.generate_hash(length=6)}",
			"practitioner": practitioner.name,
			"department": department.name,
			"session_date": nowdate(),
			"start_time": "09:00:00",
			"end_time": "12:00:00",
			"status": "Active",
			"session_capacity": 10,
		}
		if dept_abbr is not None:
			data["dept_abbr"] = dept_abbr
		else:
			sp = resolve_service_point(
				practitioner=practitioner.name, department=department.name,
			)
			data["service_point"] = sp
			data["dept_abbr"] = resolve_queue_code(
				service_point=sp,
				practitioner=practitioner.name,
				department=department.name,
			)
		return frappe.get_doc(data).insert()
