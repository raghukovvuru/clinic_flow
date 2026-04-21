import frappe
from frappe.utils import now_datetime, add_to_date, today


def release_prebooked_slots() -> None:
	"""
	Runs every 5 minutes via cron.
	For each Active Queue Session whose start_time is within release_minutes_before,
	release any unfilled pre-booked slots to walk-ins by:
	  1. Incrementing walkin_total on the session
	  2. Setting prebooked_released = 1 on the session
	Does not touch existing Queue Entries — only adjusts slot headroom.
	"""
	config = frappe.get_single("Slot Partition Config")
	# v2: release_hours_before (float, e.g. 2.5 hours). Fall back to legacy
	# release_minutes_before if the v2 field is not set.
	if config.release_hours_before:
		release_mins = config.release_hours_before * 60
	else:
		release_mins = config.release_minutes_before or 60

	release_threshold = add_to_date(now_datetime(), minutes=release_mins)

	sessions = frappe.get_all(
		"Queue Session",
		filters={
			"status": "Active",
			"prebooked_released": 0,
			"session_date": frappe.utils.today(),
		},
		fields=["name", "start_time", "prebooked_total", "prebooked_used",
				"followup_total", "followup_used", "walkin_total"],
	)

	for session in sessions:
		# Combine session_date + start_time into a datetime for comparison
		session_start_dt = frappe.utils.get_datetime(
			f"{frappe.utils.today()} {session.start_time}"
		)
		if session_start_dt <= release_threshold:
			unfilled_prebooked = max(0, (session.prebooked_total or 0) - (session.prebooked_used or 0))
			unfilled_followup  = max(0, (session.followup_total  or 0) - (session.followup_used  or 0))
			unfilled = unfilled_prebooked + unfilled_followup
			if unfilled > 0:
				frappe.db.set_value("Queue Session", session.name, {
					"walkin_total": (session.walkin_total or 0) + unfilled,
					"prebooked_released": 1,
				})
				frappe.db.commit()
				frappe.logger().info(
					f"clinic_flow: Released {unfilled} pre-booked slots to walk-in "
					f"for session {session.name}"
				)


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
