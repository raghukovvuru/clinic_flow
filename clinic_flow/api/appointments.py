import math
import frappe
from frappe import _
from frappe.utils import getdate, add_days, now_datetime, get_datetime, add_to_date, today


@frappe.whitelist()
def search_patients(query: str) -> list:
	"""
	Search patients by name or mobile number.
	Auto-detects whether query looks like a phone number.
	"""
	q = (query or "").strip()
	if not q:
		return []

	# Direct SQL to avoid field-name ambiguity and support OR across two columns
	results = frappe.db.sql("""
		SELECT name, patient_name, mobile, sex, dob
		FROM `tabPatient`
		WHERE (patient_name LIKE %(q)s OR mobile LIKE %(q)s)
		  AND status != 'Disabled'
		ORDER BY patient_name
		LIMIT 10
	""", {"q": f"%{q}%"}, as_dict=True)

	return results


@frappe.whitelist()
def quick_create_patient(
	first_name: str,
	last_name: str = "",
	mobile: str = "",
	dob: str = "",
	sex: str = "Male",
) -> dict:
	"""
	Minimal Patient creation for fast walk-up intake.
	Mobile is required and must be unique.
	"""
	if not mobile:
		frappe.throw(_("Mobile number is required to create a patient."), title=_("Missing Field"))

	# Uniqueness check: same name + mobile
	existing = frappe.db.get_value(
		"Patient",
		{"mobile": mobile},
		["name", "patient_name"],
		as_dict=True,
	)
	if existing:
		frappe.throw(
			_(
				"A patient with mobile {0} already exists: {1}. "
				"Search for them instead of creating a duplicate."
			).format(mobile, existing.patient_name),
			title=_("Duplicate Patient"),
		)

	patient = frappe.get_doc({
		"doctype":    "Patient",
		"first_name": first_name,
		"last_name":  last_name,
		"sex":        sex,
		"dob":        dob or None,
		"mobile":     mobile,
		"status":     "Active",
	})
	patient.insert(ignore_permissions=True)
	return {"patient": patient.name, "patient_name": patient.patient_name}


@frappe.whitelist()
def get_availability(practitioner: str, queue_type: str) -> list:
	"""
	Returns the next 7 sessions with available slots for practitioner + queue_type.
	Source of truth is the Practitioner Schedule. Queue Sessions are materialized
	on demand as Scheduled/Active operational instances when needed elsewhere.
	Scans up to 30 days out.

	Phase 1 note:
	`queue_type` here is still a legacy compatibility concept used by the older
	appointment path. The canonical vNext model is channel + patient_type +
	priority; do not extend this function with new business logic unless it is
	explicitly part of the legacy path.
	"""
	config = frappe.get_single("Slot Partition Config")
	pct_map = {
		"PRE_BOOKED": config.prebooked_pct or 60,
		"WALK_IN":    config.walkin_pct    or 30,
		"FOLLOW_UP":  config.followup_pct  or 10,
	}
	release_mins = config.release_minutes_before or 60

	schedule_slots = frappe.db.sql("""
		SELECT
			psu.schedule,
			ts.day,
			ts.from_time,
			ts.to_time,
			ts.maximum_appointments AS capacity
		FROM `tabPractitioner Service Unit Schedule` psu
		JOIN `tabHealthcare Schedule Time Slot` ts
		  ON ts.parent = psu.schedule AND ts.parenttype = 'Practitioner Schedule'
		WHERE psu.parent = %(prac)s
		  AND psu.parenttype = 'Healthcare Practitioner'
		ORDER BY ts.from_time
	""", {"prac": practitioner}, as_dict=True)

	if not schedule_slots:
		return []

	day_slots: dict = {}
	for slot in schedule_slots:
		day_slots.setdefault(slot.day, []).append(slot)

	results = []
	now = now_datetime()
	base_date = getdate()
	# Walk-ins are same-day only — no forward booking for walk-in type
	scan_days = 1 if queue_type == "WALK_IN" else 30

	for offset in range(scan_days):
		check_date = add_days(base_date, offset)
		day_name = check_date.strftime("%A")

		if day_name not in day_slots:
			continue

		for slot in day_slots[day_name]:
			cap = int(slot.capacity or 20)
			limit = math.ceil(cap * pct_map.get(queue_type, 60) / 100)

			within_release = False
			if offset == 0:
				session_start = get_datetime(f"{check_date} {slot.from_time}")
				release_threshold = add_to_date(now, minutes=release_mins)
				within_release = session_start <= release_threshold

			# Once a slot is within release window, it belongs to walk-in only
			if within_release and queue_type != "WALK_IN":
				continue

			if within_release and queue_type == "WALK_IN":
				for release_type, attr in [("PRE_BOOKED", "prebooked_pct"), ("FOLLOW_UP", "followup_pct")]:
					rel_pct = getattr(config, attr, None) or (60 if release_type == "PRE_BOOKED" else 10)
					rel_limit = math.ceil(cap * rel_pct / 100)
					rel_used = frappe.db.count("Patient Appointment", {
						"practitioner": practitioner,
						"appointment_date": check_date,
						"custom_queue_type": release_type,
						"status": ["not in", ["Cancelled", "No Show"]],
					})
					limit += max(0, rel_limit - rel_used)

			used = frappe.db.count("Patient Appointment", {
				"practitioner": practitioner,
				"appointment_date": check_date,
				"custom_queue_type": queue_type,
				"status": ["not in", ["Cancelled", "No Show"]],
			})

			available = max(0, limit - used)
			if available <= 0:
				continue

			results.append({
				"date":           str(check_date),
				"day":            day_name,
				"from_time":      str(slot.from_time),
				"to_time":        str(slot.to_time),
				"schedule":       slot.schedule,
				"capacity":       cap,
				"limit":          limit,
				"used":           used,
				"available":      available,
				"within_release": within_release,
			})

			if len(results) >= 7:
				break

		if len(results) >= 7:
			break

	return results


@frappe.whitelist()
def get_patient_appointments(patient: str) -> list:
	"""
	Upcoming + recent appointments for a patient (last 7 days forward).
	Used by the appointment management panel in the receptionist workspace.
	"""
	cutoff = str(add_days(getdate(), -7))
	appointments = frappe.get_all(
		"Patient Appointment",
		filters={
			"patient": patient,
			"appointment_date": [">=", cutoff],
			"status": ["not in", ["Cancelled"]],
		},
		fields=[
			"name", "practitioner", "appointment_date", "appointment_time",
			"custom_queue_type", "status", "custom_queue_token",
		],
		order_by="appointment_date asc, appointment_time asc",
		limit=20,
	)

	prac_ids = list({a.practitioner for a in appointments if a.practitioner})
	prac_names: dict = {}
	if prac_ids:
		for p in frappe.get_all("Healthcare Practitioner",
								filters={"name": ["in", prac_ids]},
								fields=["name", "practitioner_name"]):
			prac_names[p.name] = p.practitioner_name

	for a in appointments:
		a["practitioner_name"] = prac_names.get(a.practitioner, a.practitioner)

	return appointments


@frappe.whitelist()
def cancel_appointment(appointment: str) -> dict:
	"""Cancel a Patient Appointment."""
	doc = frappe.get_doc("Patient Appointment", appointment)
	if doc.status in ("Checked In", "Checked Out"):
		frappe.throw(_("Cannot cancel an appointment that is already checked in."))
	frappe.db.set_value("Patient Appointment", appointment, "status", "Cancelled")
	return {"cancelled": True}


@frappe.whitelist()
def get_todays_appointments(practitioner: str = "") -> list:
	"""
	All appointments for today, enriched with practitioner name.
	Used by the Live Session Board in the receptionist workspace.
	"""
	filters: dict = {
		"appointment_date": today(),
		"status": ["not in", ["Cancelled"]],
	}
	if practitioner:
		filters["practitioner"] = practitioner

	appointments = frappe.get_all(
		"Patient Appointment",
		filters=filters,
		fields=[
			"name", "patient", "patient_name", "practitioner",
			"appointment_time", "custom_queue_type", "status",
			"custom_queue_token",
		],
		order_by="appointment_time asc",
	)

	prac_ids = list({a.practitioner for a in appointments if a.practitioner})
	prac_names: dict = {}
	if prac_ids:
		for p in frappe.get_all(
			"Healthcare Practitioner",
			filters={"name": ["in", prac_ids]},
			fields=["name", "practitioner_name"],
		):
			prac_names[p.name] = p.practitioner_name

	for a in appointments:
		a["practitioner_name"] = prac_names.get(a.practitioner, a.practitioner)

	return appointments


@frappe.whitelist()
def book_appointment(
	patient: str,
	practitioner: str,
	appointment_date: str,
	from_time: str,
	to_time: str,
	queue_type: str,
	schedule: str = "",
) -> dict:
	"""
	Book a Patient Appointment after verifying the slot is still available.
	Calculates a unique appointment_time per slot to avoid Frappe Healthcare's
	overlap validator rejecting back-to-back bookings.
	"""
	config = frappe.get_single("Slot Partition Config")
	pct_map = {
		"PRE_BOOKED": config.prebooked_pct or 60,
		"WALK_IN":    config.walkin_pct    or 30,
		"FOLLOW_UP":  config.followup_pct  or 10,
		"EMERGENCY":  100,
	}

	cap = 20
	if schedule:
		day_name = getdate(appointment_date).strftime("%A")
		slot_cap = frappe.db.get_value(
			"Healthcare Schedule Time Slot",
			{"parent": schedule, "day": day_name},
			"maximum_appointments",
		)
		cap = int(slot_cap or 20)

	limit = math.ceil(cap * pct_map.get(queue_type, 60) / 100)

	# For same-day walk-in within the release window, expand limit by unused slots
	# from PRE_BOOKED and FOLLOW_UP — mirrors the logic in get_availability().
	if queue_type == "WALK_IN" and getdate(appointment_date) == getdate():
		release_mins = config.release_minutes_before or 60
		session_start = get_datetime(f"{appointment_date} {from_time}")
		within_release = session_start <= add_to_date(now_datetime(), minutes=release_mins)
		if within_release:
			for release_type, attr in [("PRE_BOOKED", "prebooked_pct"), ("FOLLOW_UP", "followup_pct")]:
				rel_pct = getattr(config, attr, None) or (60 if release_type == "PRE_BOOKED" else 10)
				rel_limit = math.ceil(cap * rel_pct / 100)
				rel_used = frappe.db.count("Patient Appointment", {
					"practitioner": practitioner,
					"appointment_date": appointment_date,
					"custom_queue_type": release_type,
					"status": ["not in", ["Cancelled", "No Show"]],
				})
				limit += max(0, rel_limit - rel_used)

	used = frappe.db.count("Patient Appointment", {
		"practitioner": practitioner,
		"appointment_date": appointment_date,
		"custom_queue_type": queue_type,
		"status": ["not in", ["Cancelled", "No Show"]],
	})

	if queue_type != "EMERGENCY" and used >= limit:
		frappe.throw(
			_(
				"The {0} slot for {1} on {2} just became full. "
				"Please select another session."
			).format(queue_type.replace("_", " ").title(), practitioner, appointment_date),
			title=_("Slot Full"),
		)

	# Calculate a unique appointment_time within the session to avoid overlap errors.
	# Divide session duration equally across capacity; each booking gets a unique minute.
	appt_time = from_time
	try:
		start_dt = get_datetime(f"{appointment_date} {from_time}")
		end_dt   = get_datetime(f"{appointment_date} {to_time}")
		total_mins = int((end_dt - start_dt).total_seconds() // 60)
		slot_mins  = max(1, total_mins // cap)
		slot_dt    = add_to_date(start_dt, minutes=used * slot_mins)
		appt_time  = str(slot_dt.time())
	except Exception:
		pass  # Fall back to from_time if calculation fails

	# Resolve Appointment Type from queue_type code
	code_map = {"PRE_BOOKED": "PRE", "WALK_IN": "WLK", "FOLLOW_UP": "FLW", "EMERGENCY": "EMR"}
	code = code_map.get(queue_type)
	appointment_type = None
	if code:
		appointment_type = frappe.db.get_value(
			"Appointment Type", {"custom_queue_code": code}, "name"
		)
	if not appointment_type:
		result = frappe.db.sql("SELECT name FROM `tabAppointment Type` LIMIT 1")
		appointment_type = result[0][0] if result else None

	appt = frappe.get_doc({
		"doctype":                      "Patient Appointment",
		"patient":                      patient,
		"practitioner":                 practitioner,
		"appointment_date":             appointment_date,
		"appointment_time":             appt_time,
		"custom_queue_type":            queue_type,
		"appointment_type":             appointment_type,
		"duration":                     1,
		# All clinic_flow appointments are queue-driven; appointment_time is only a
		# uniqueness key, not a hard slot. Setting this flag tells Frappe Healthcare
		# to skip the strict time-range overlap check.
		"appointment_based_on_check_in": 1,
	})
	appt.insert(ignore_permissions=True)
	return {"appointment": appt.name, "patient": patient, "appointment_date": appointment_date}


@frappe.whitelist()
def get_consultation_charge(practitioner: str, patient: str) -> dict:
	"""
	Returns the consultation charge for this practitioner + patient combination.
	Checks active Fee Validity — if covered, charge is 0.
	Also returns available Modes of Payment.
	"""
	prac = frappe.db.get_value(
		"Healthcare Practitioner", practitioner,
		["op_consulting_charge", "op_consulting_charge_item"],
		as_dict=True,
	) or {}

	original_charge = float(prac.get("op_consulting_charge") or 0)

	# Check if patient has an active fee validity for this practitioner
	validity = frappe.db.get_value(
		"Fee Validity",
		{
			"patient":      patient,
			"practitioner": practitioner,
			"valid_till":   [">=", today()],
			"status":       "Pending",
		},
		["name", "visited", "max_visits", "valid_till"],
		as_dict=True,
	)
	covered = bool(validity and (validity.visited or 0) < (validity.max_visits or 1))

	modes = frappe.get_all("Mode of Payment", fields=["name"], order_by="name")

	return {
		"charge":               0 if covered else original_charge,
		"original_charge":      original_charge,
		"covered_by_validity":  covered,
		"validity_till":        str(validity.valid_till) if validity else None,
		"payment_modes":        [m.name for m in modes],
		"billing_item":         prac.get("op_consulting_charge_item") or "",
	}


@frappe.whitelist()
def record_payment_and_checkin(
	appointment: str,
	mode_of_payment: str,
	paid_amount: float,
) -> dict:
	"""
	Records payment on the appointment and sets status to Checked In.
	Uses doc.save() so the QueueMixin.on_update() fires and issues the token.
	"""
	doc = frappe.get_doc("Patient Appointment", appointment)

	if float(paid_amount) > 0:
		doc.paid_amount     = float(paid_amount)
		doc.mode_of_payment = mode_of_payment
		doc.invoiced        = 1

	doc.status = "Checked In"
	doc.save(ignore_permissions=True)

	# Token is written by QueueMixin.on_update — read it back after save
	token = frappe.db.get_value("Patient Appointment", appointment, "custom_queue_token")
	prac_name = frappe.db.get_value(
		"Healthcare Practitioner", doc.practitioner, "practitioner_name"
	) or doc.practitioner

	return {
		"appointment":       appointment,
		"patient_name":      doc.patient_name,
		"practitioner_name": prac_name,
		"token":             token or "",
		"paid_amount":       float(paid_amount or 0),
		"mode_of_payment":   mode_of_payment,
		"appointment_date":  str(doc.appointment_date),
		"appointment_time":  str(doc.appointment_time or ""),
		"queue_type":        doc.custom_queue_type or "",
		"dept_abbr":         frappe.db.get_value(
			"Queue Entry", {"appointment": appointment}, "dept_abbr"
		) or "",
	}
