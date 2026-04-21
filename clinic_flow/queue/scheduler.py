import frappe
from frappe.utils import today


def release_phone_quota_at_midnight() -> None:
	"""
	Runs at midnight (00:00) for sessions dated today.

	Releases any unused phone-protected quota to walk-in capacity. After this
	runs, same-day phone quota protection no longer applies — the effective
	booking protection becomes walk-in only.

	Idempotent: sessions with phone_quota_released=1 are skipped.
	"""
	sessions = frappe.get_all(
		"Queue Session",
		filters={
			"session_date": today(),
			"status": ["in", ["Scheduled", "Active", "Paused"]],
		},
		fields=["name", "planned_capacity", "phone_booked_count", "walkin_total", "phone_quota_released"],
	)
	config = frappe.get_single("Slot Partition Config")
	phone_pct = config.phone_pct or 60

	for session in sessions:
		if session.phone_quota_released:
			continue
		phone_quota = int((session.planned_capacity or 0) * phone_pct / 100)
		unused_phone = max(0, phone_quota - (session.phone_booked_count or 0))
		frappe.db.set_value("Queue Session", session.name, {
			"walkin_total": (session.walkin_total or 0) + unused_phone,
			"phone_quota_released": 1,
		})
		frappe.logger().info(
			f"clinic_flow: Released {unused_phone} unused phone-quota slots to walk-in "
			f"for session {session.name}"
		)
