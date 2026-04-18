"""
Admission flow APIs for the v2 receptionist dashboard.

Covers:
  - Detecting review vs new patient load class
  - Suggesting available sessions
  - Returning the token board state for a session
  - Confirming a booking (creates QueueEntry, updates session counters)
"""
import json
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime, today, get_datetime, add_to_date
from clinic_flow.queue.engine import build_display_token


# ---------------------------------------------------------------------------
# visit type detection
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_visit_type(patient: str, practitioner: str | None = None) -> dict:
    """
    Return load_class for this patient: 'review_load' or 'non_review_load'.

    A patient is review_load if they have an active, unexpired Fee Validity record
    (Marley Healthcare) with remaining visits. Otherwise they are non_review_load.

    practitioner: optional — if provided, restricts the lookup to that practitioner's
    Fee Validity. When not provided (e.g. before session selection), any valid Fee
    Validity for the patient qualifies them as a review patient.
    """
    if not patient:
        frappe.throw(_("Patient is required."))

    filters: dict = {
        "patient":    patient,
        "valid_till": [">=", today()],
    }
    if practitioner:
        filters["practitioner"] = practitioner

    validity = frappe.db.get_value(
        "Fee Validity",
        filters,
        ["name", "visited", "max_visits", "valid_till", "practitioner"],
        as_dict=True,
    )

    covered = bool(validity and (validity.visited or 0) < (validity.max_visits or 1))
    load_class = "review_load" if covered else "non_review_load"

    dob = frappe.db.get_value("Patient", patient, "dob")

    return {
        "patient":              patient,
        "load_class":           load_class,
        "fee_validity_valid":   covered,
        "fee_validity_till":    str(validity.valid_till) if validity else None,
        "fee_validity_name":    validity.name if validity else None,
        "fee_validity_prac":    validity.practitioner if validity else None,
        "dob":                  str(dob) if dob else None,
    }


# ---------------------------------------------------------------------------
# session suggestions
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_suggested_sessions(
    load_class: str,
    channel: str = "walkin",
    from_date: str | None = None,
    days_ahead: int = 3,
    is_special: bool = False,
) -> list:
    """
    Return sessions with available capacity, sourced from practitioner schedules.

    Walk-in  — today only.
        The doctor may not have started yet (session could be Scheduled).
        Receptionist books walk-in patients in the morning from the schedule;
        the session becomes Active when the doctor arrives and starts it.
        A Scheduled session is auto-created for today if the practitioner has
        a schedule for today but the session record doesn't exist yet.

    Phone  — tomorrow through today + days_ahead (default 3 days).
        Advance booking. Same schedule-based lookup; Scheduled sessions are
        created on demand so phone slots can be attached before the doctor
        has started their session.

    is_special  — priority flag, orthogonal to channel.
        Special patients now share the same session suggestion pool and token
        recommendation as normal bookings. The operational difference is
        applied later through doctor-side queue handling.

    In all cases practitioner schedules are the source of truth, not whatever
    Queue Session records happen to already exist.
    """
    if channel not in ("phone", "walkin"):
        frappe.throw(_("channel must be 'phone' or 'walkin'."))

    config    = frappe.get_single("Slot Partition Config")
    phone_pct = config.phone_pct or 60

    today_date = getdate(today())

    if channel == "phone":
        # Phone: tomorrow → today + days_ahead
        start = today_date + timedelta(days=1)
        end   = today_date + timedelta(days=int(days_ahead))
    else:
        # Walk-in: today only
        start = today_date
        end   = today_date

    sessions = _sessions_for_date_range(start, end)
    filtered = _apply_channel_filter(
        sessions,
        channel,
        phone_pct,
        is_special=bool(is_special),
        load_class=load_class,
    )
    ranked = sorted(filtered, key=_recommendation_key)
    for idx, row in enumerate(ranked):
        row["recommendation_rank"] = idx
        row["is_recommended"] = idx == 0
    return ranked


# ---------------------------------------------------------------------------
# session suggestion helpers
# ---------------------------------------------------------------------------

def _sessions_for_date_range(start, end) -> list:
    """
    For every practitioner schedule slot in [start, end], return the
    existing Queue Session (Scheduled or Active) or create a new Scheduled
    one.  Returns a list of frappe._dict session records.
    """
    from frappe.utils import formatdate

    # All active-practitioner schedule slots
    rows = frappe.db.sql("""
        SELECT
            hp.name             AS practitioner,
            hp.practitioner_name,
            hp.department,
            psu.schedule,
            ts.day,
            ts.from_time,
            ts.to_time,
            ts.maximum_appointments AS capacity
        FROM `tabPractitioner Service Unit Schedule` psu
        JOIN `tabHealthcare Practitioner` hp
             ON hp.name = psu.parent AND psu.parenttype = 'Healthcare Practitioner'
        JOIN `tabHealthcare Schedule Time Slot` ts
             ON ts.parent = psu.schedule AND ts.parenttype = 'Practitioner Schedule'
        WHERE hp.status = 'Active'
        ORDER BY hp.name, ts.from_time
    """, as_dict=True)

    if not rows:
        return []

    # dept_abbr per department (one query)
    dept_abbr_map: dict[str, str] = {}
    dept_ids = {r.department for r in rows if r.department}
    if dept_ids:
        for d in frappe.get_all(
            "Medical Department",
            filters={"name": ["in", list(dept_ids)]},
            fields=["name", "custom_dept_abbr"],
        ):
            dept_abbr_map[d.name] = d.custom_dept_abbr or ""

    # practitioner → {weekday_name → first matching slot}
    prac_day: dict[str, dict[str, frappe._dict]] = {}
    for r in rows:
        day_map = prac_day.setdefault(r.practitioner, {})
        if r.day not in day_map:
            day_map[r.day] = r

    _FIELDS = [
        "name", "session_name", "session_date", "start_time", "end_time",
        "practitioner", "dept_abbr",
        "planned_capacity", "stretch_capacity",
        "review_load_count", "non_review_load_count",
        "weighted_load_total",
        "phone_booked_count", "walkin_count",
        "vip_buffer_positions", "vip_buffer_used",  # DB field names kept as-is
    ]

    result = []
    current = start
    while current <= end:
        day_name = current.strftime("%A")

        for practitioner, day_map in prac_day.items():
            if day_name not in day_map:
                continue

            slot      = day_map[day_name]
            dept_abbr = dept_abbr_map.get(slot.department or "", "")
            if not dept_abbr:
                # dept_abbr is mandatory on Queue Session — skip
                continue

            # Find an existing session for this practitioner + date
            existing = frappe.db.get_value(
                "Queue Session",
                {
                    "practitioner": practitioner,
                    "session_date":  current,
                    "status":        ["in", ["Scheduled", "Active"]],
                },
                _FIELDS,
                as_dict=True,
            )
            if existing:
                result.append(existing)
                continue

            # No session yet — create a Scheduled one from the schedule
            date_label   = formatdate(current, "EEE dd MMM yyyy")
            schedule     = slot.schedule or ""
            session_name = (
                f"{schedule} · {date_label}" if schedule
                else f"{slot.practitioner_name} · {date_label}"
            )
            try:
                doc = frappe.get_doc({
                    "doctype":          "Queue Session",
                    "session_name":     session_name,
                    "practitioner":     practitioner,
                    "session_date":     current,
                    "start_time":       str(slot.from_time),
                    "end_time":         str(slot.to_time),
                    "dept_abbr":        dept_abbr,
                    "session_capacity": int(slot.capacity or 20),
                    "status":           "Scheduled",
                })
                doc.insert(ignore_permissions=True)
            except Exception:
                frappe.log_error(
                    frappe.get_traceback(),
                    f"clinic_flow: failed to auto-create Queue Session for {session_name}",
                )
                continue

            # before_insert has populated planned_capacity, stretch_capacity,
            # vip_buffer_positions — use the doc directly
            result.append(frappe._dict({
                "name":                  doc.name,
                "session_name":          doc.session_name,
                "session_date":          doc.session_date,
                "start_time":            doc.start_time,
                "end_time":              doc.end_time,
                "practitioner":          practitioner,
                "dept_abbr":             doc.dept_abbr,
                "planned_capacity":      doc.planned_capacity,
                "stretch_capacity":      doc.stretch_capacity,
                "review_load_count":     0,
                "non_review_load_count": 0,
                "weighted_load_total":   0,
                "phone_booked_count":    0,
                "walkin_count":          0,
                "vip_buffer_positions":  doc.vip_buffer_positions,
                "vip_buffer_used":       0,
            }))

        current = current + timedelta(days=1)

    return result


def _apply_channel_filter(
    sessions: list,
    channel: str,
    phone_pct: int,
    is_special: bool = False,
    load_class: str = "non_review_load",
) -> list:
    """Filter sessions by channel capacity and build result rows."""
    config = frappe.get_single("Slot Partition Config")
    result = []
    for s in sessions:
        planned      = s.planned_capacity or 0
        stretch      = s.stretch_capacity or planned
        total_booked = (s.phone_booked_count or 0) + (s.walkin_count or 0)
        phone_quota  = int(planned * phone_pct / 100)

        if channel == "phone":
            available = phone_quota - (s.phone_booked_count or 0)
        else:  # walkin
            available = stretch - total_booked

        if available <= 0:
            continue

        prac_name = frappe.db.get_value(
            "Healthcare Practitioner", s.practitioner, "practitioner_name"
        ) or s.practitioner

        row = {
            "queue_session":         s.name,
            "session_name":          s.session_name,
            "session_date":          str(s.session_date),
            "start_time":            str(s.start_time),
            "end_time":              str(s.end_time),
            "practitioner":          s.practitioner,
            "practitioner_name":     prac_name,
            "dept_abbr":             s.dept_abbr,
            "available_slots":       available,
            "review_load_count":     s.review_load_count or 0,
            "non_review_load_count": s.non_review_load_count or 0,
            "total_booked":          total_booked,
            "load_ratio":            _load_ratio(s),
            "stress_label":          _stress_label(_load_ratio(s)),
            "stress_color":          _stress_color(_load_ratio(s)),
            "fit_label":             _fit_label(_load_ratio(s), load_class),
            "likely_hour_band":      _estimate_hour_band(s, config, load_class),
        }

        recommended_normal = _recommended_token_for_session(s, is_special=False)
        row["recommended_special_token"] = recommended_normal
        row["recommended_normal_token"] = recommended_normal
        row["recommended_token"] = recommended_normal
        if is_special:
            row["suggested_special_token"] = recommended_normal

        result.append(row)

    return result


def _recommendation_key(session: dict) -> tuple[float, float]:
    """
    Preserve the current recommendation heuristic while moving ownership into
    backend: lower load_ratio first, then higher available_slots.
    """
    score = float(session.get("load_ratio") or 0) + (0 if (session.get("available_slots") or 0) > 0 else 10)
    slots = float(session.get("available_slots") or 0)
    return (score, -slots)


def _recommended_token_for_session(session: frappe._dict | dict, is_special: bool = False) -> int | None:
    """Return the next recommended token number for a given session."""
    queue_session = session.get("name") or session.get("queue_session")
    if not queue_session:
        return None

    used = {
        int(r[0])
        for r in frappe.db.sql(
            "SELECT token_number FROM `tabQueue Entry` WHERE queue_session = %s AND token_number > 0",
            queue_session,
        )
        if r and r[0]
    }
    max_token = max(
        int(session.get("stretch_capacity") or session.get("planned_capacity") or 0),
        max(used, default=0),
    )
    for token in range(1, max_token + 1):
        if token not in used:
            return token
    return None


def _stress_label(load_ratio: float) -> str:
    if load_ratio < 0.4:
        return "Low Stress"
    if load_ratio < 0.75:
        return "Medium Stress"
    return "High Stress"


def _stress_color(load_ratio: float) -> str:
    if load_ratio < 0.4:
        return "#15803d"
    if load_ratio < 0.75:
        return "#b45309"
    return "#b91c1c"


def _fit_label(load_ratio: float, load_class: str = "non_review_load") -> str:
    is_review = (load_class or "").strip() == "review_load"
    if load_ratio < 0.4:
        return "Good for Review" if is_review else "Good for New"
    if load_ratio < 0.75:
        return "Balanced"
    return "Better for New" if is_review else "Better for Review"


def _estimate_hour_band(session: frappe._dict, config, load_class: str) -> str:
    session_date = str(session.session_date or "")
    start_time = session.start_time
    if not session_date or not start_time:
        return ""

    try:
        start_dt = get_datetime(f"{session_date} {start_time}")
    except Exception:
        return ""

    weighted_total = float(getattr(session, "weighted_load_total", 0) or 0)
    if weighted_total <= 0:
        review_min = float(config.default_review_consult_min or 2.0)
        non_review_min = float(config.default_non_review_consult_min or 5.0)
        weighted_total = (
            (float(session.review_load_count or 0) * review_min) +
            (float(session.non_review_load_count or 0) * non_review_min)
        )

    consult_default = (
        config.default_review_consult_min
        if load_class == "review_load"
        else config.default_non_review_consult_min
    )
    consult_min = float(consult_default or 5.0)
    likely_dt = add_to_date(start_dt, minutes=int(weighted_total + max(consult_min / 2, 1)))
    band_start = likely_dt.replace(minute=0, second=0, microsecond=0)
    band_end = add_to_date(band_start, hours=1)
    return f"{band_start.strftime('%-I %p')} - {band_end.strftime('%-I %p')}"


# ---------------------------------------------------------------------------
# token board
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_token_board(queue_session: str) -> dict:
    """
    Return the full token board state for a session.

    Returns:
      - session metadata
      - list of token entries (token_number, patient_name, load_class, status)
      - token entries and max token for the board renderer
    """
    if not queue_session:
        frappe.throw(_("Queue Session is required."))

    session = frappe.db.get_value(
        "Queue Session",
        queue_session,
        [
            "session_name", "session_date", "start_time", "end_time",
            "status", "planned_capacity", "stretch_capacity",
            "review_load_count", "non_review_load_count",
            "phone_booked_count", "walkin_count",
            "vip_buffer_positions", "vip_buffer_used",
        ],
        as_dict=True,
    )
    if not session:
        frappe.throw(_("Queue Session {0} not found.").format(queue_session))

    entries = frappe.get_all(
        "Queue Entry",
        filters={"queue_session": queue_session},
        fields=[
            "name", "token_number", "token", "patient", "patient_name",
            "load_class", "queue_type", "status", "queue_position",
            "report_by_time", "predicted_doctor_time",
            "called_to_reception_at", "reception_done_at",
            "no_response_at", "hold_patients_count",
        ],
        order_by="token_number asc",
    )

    used_tokens = {e.token_number for e in entries if e.token_number}

    # Compute max token to know how many cells to draw
    max_token = max(
        (session.stretch_capacity or session.planned_capacity or 0),
        max((e.token_number for e in entries if e.token_number), default=0),
    )

    return {
        "session": session,
        "entries": entries,
        # Phase 3: special is no longer a reserved-token workflow. Keep the
        # token board visually simple and let special remain a queue priority
        # concern only.
        "special_buffer_available": [],
        "special_buffer_reserved":  [],
        "max_token": max_token,
    }


# ---------------------------------------------------------------------------
# confirm booking
# ---------------------------------------------------------------------------

@frappe.whitelist()
def confirm_booking(
    queue_session: str,
    patient: str,
    channel: str,
    load_class: str,
    guardian: str | None = None,
    notes: str = "",
    token_number: int | None = None,
    is_special: bool = False,
    weight: float | None = None,
    complaint: str | None = None,
    age_at_visit: str | None = None,
) -> dict:
    """
    Confirm a booking: assign a token number and create a QueueEntry.

    channel: 'phone' | 'walkin'
    is_special: priority flag, orthogonal to channel.
        Special patients keep normal booking-time capacity and token behavior.
        The operational difference is applied later in the live queue via
        doctor-side override, not through reserved buffer positions.
    load_class: 'review_load' | 'non_review_load'
    token_number: optional override — receptionist selected a specific cell on the
        token board. Validated against existing tokens.

    Returns the new QueueEntry name and token_number.
    """
    queue_session = (queue_session or "").strip()
    patient       = (patient or "").strip()
    channel       = (channel or "walkin").strip().lower()
    load_class    = (load_class or "non_review_load").strip()
    is_special    = bool(is_special)

    if not queue_session:
        frappe.throw(_("Queue Session is required."))
    if not patient:
        frappe.throw(_("Patient is required."))
    if load_class not in ("review_load", "non_review_load"):
        frappe.throw(_("load_class must be 'review_load' or 'non_review_load'."))
    if channel not in ("phone", "walkin"):
        frappe.throw(_("channel must be 'phone' or 'walkin'."))

    session_doc = frappe.get_doc("Queue Session", queue_session)

    if session_doc.status not in ("Scheduled", "Active"):
        frappe.throw(_("Session {0} is not open for booking (status: {1}).").format(
            queue_session, session_doc.status
        ))

    config = frappe.get_single("Slot Partition Config")
    phone_pct: int = config.phone_pct or 60

    planned      = session_doc.planned_capacity or 0
    stretch      = session_doc.stretch_capacity or planned
    phone_quota  = int(planned * phone_pct / 100)
    total_booked = (session_doc.phone_booked_count or 0) + (session_doc.walkin_count or 0)

    # Capacity check
    if channel == "phone":
        if (session_doc.phone_booked_count or 0) >= phone_quota:
            frappe.throw(_("Phone booking quota ({0}) is full for this session.").format(phone_quota))
    else:  # walkin
        if total_booked >= stretch:
            frappe.throw(_("Session is full ({0}/{1} booked).").format(total_booked, stretch))

    # Assign token number
    existing_tokens = {
        r[0]
        for r in frappe.db.sql(
            "SELECT token_number FROM `tabQueue Entry` WHERE queue_session = %s AND token_number > 0",
            queue_session,
        )
    }
    if token_number is not None:
        # Validate the override token
        token_number = int(token_number)
        if token_number in existing_tokens:
            frappe.throw(_("Token {0} is already assigned in this session.").format(token_number))
    else:
        token_number = _next_normal_token(existing_tokens)

    # queue_position = token_number at booking time (ETA engine can reorder later)
    queue_position = token_number

    # Canonical vNext semantics are written alongside the legacy queue_type
    # during the refactor period. Keep the legacy mapping behavior intact for
    # now so downstream Healthcare / queue code does not change unexpectedly.
    patient_type = _canonical_patient_type(load_class)
    priority = _canonical_priority(is_special=is_special, emergency=False)
    queue_type = _legacy_queue_type(channel, patient_type, priority)

    # Build token label (for display, e.g. PED-042)
    dept_abbr   = session_doc.dept_abbr or "TKN"
    token_label = build_display_token(dept_abbr, token_number)

    # ── Create Patient Appointment (Healthcare integration) ──────────────────
    # This keeps the Marley Healthcare appointment calendar in sync and ensures
    # fee validity management, sales invoices, and check-in flow work correctly.
    patient_appointment = _create_patient_appointment(
        patient=patient,
        session_doc=session_doc,
        queue_type=queue_type,
        token_number=token_number,
    )

    # Create QueueEntry
    entry = frappe.new_doc("Queue Entry")
    entry.queue_session  = queue_session
    entry.patient        = patient
    entry.practitioner   = session_doc.practitioner
    entry.department     = session_doc.department
    entry.dept_abbr      = dept_abbr
    entry.token_number   = token_number
    entry.token          = token_label
    entry.queue_position = queue_position
    entry.queue_type     = queue_type
    entry.load_class     = load_class
    _set_canonical_queue_entry_fields(
        entry,
        channel=channel,
        load_class=load_class,
        priority=priority,
    )
    _set_special_queue_entry_fields(entry, is_special=is_special)
    entry.status         = "Booked"
    entry.issued_by      = frappe.session.user
    entry.issued_by_role = "Reception"
    entry.appointment    = patient_appointment
    if notes:
        entry.notes = notes
    if complaint:
        entry.complaint = complaint
    if age_at_visit:
        entry.age_at_visit = age_at_visit
    if weight is not None:
        try:
            entry.weight_recorded    = float(weight)
            entry.weight_recorded_at = now_datetime()
        except (ValueError, TypeError):
            pass
    entry.save(ignore_permissions=True)

    # Update session counters
    update_fields: dict = {}

    if channel == "phone":
        update_fields["phone_booked_count"] = (session_doc.phone_booked_count or 0) + 1
    elif channel == "walkin":
        update_fields["walkin_count"] = (session_doc.walkin_count or 0) + 1

    if load_class == "review_load":
        update_fields["review_load_count"] = (session_doc.review_load_count or 0) + 1
        review_min = config.default_review_consult_min or 2.0
        update_fields["weighted_load_total"] = (session_doc.weighted_load_total or 0.0) + review_min
    else:
        update_fields["non_review_load_count"] = (session_doc.non_review_load_count or 0) + 1
        new_min = config.default_non_review_consult_min or 5.0
        update_fields["weighted_load_total"] = (session_doc.weighted_load_total or 0.0) + new_min

    if update_fields:
        frappe.db.set_value("Queue Session", queue_session, update_fields)
        frappe.db.commit()

    # Calculate and persist ETA for this entry, then refresh the whole session
    from clinic_flow.api.eta import estimate, recalculate_downstream_etas

    eta = estimate(queue_session, token_number, load_class)
    frappe.db.set_value("Queue Entry", entry.name, {
        "predicted_doctor_time": eta["predicted_doctor_time"],
        "report_by_time": eta["report_by_time"],
    })

    # Refresh downstream ETAs (new booking shifts everyone after it)
    recalculate_downstream_etas(queue_session)

    return {
        "queue_entry":           entry.name,
        "token_number":          token_number,
        "token":                 token_label,
        "queue_position":        queue_position,
        "load_class":            load_class,
        "channel":               channel,
        "is_special":            is_special,
        "predicted_doctor_time": eta["predicted_doctor_time"],
        "report_by_time":        eta["report_by_time"],
        "estimated_window_end":  eta["estimated_window_end"],
    }


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _parse_special_positions(raw: str | None) -> list[int]:
    """Parse the JSON vip_buffer_positions field (DB name kept). Returns sorted list."""
    if not raw:
        return []
    try:
        positions = json.loads(raw)
        return sorted(int(p) for p in positions)
    except Exception:
        return []


def _canonical_patient_type(load_class: str) -> str:
    """Translate v2 load_class into the canonical patient type."""
    return "review" if (load_class or "").strip() == "review_load" else "new"


def _canonical_priority(is_special: bool = False, emergency: bool = False) -> str:
    """
    Canonical priority model used by the refactor:
      normal | special | emergency
    Phase 1 only dual-writes this alongside legacy queue_type semantics.
    """
    if emergency:
        return "emergency"
    if is_special:
        return "special"
    return "normal"


def _legacy_queue_type(channel: str, patient_type: str, priority: str) -> str:
    """
    Transitional mapping into the legacy queue_type enum.

    Notes:
    - Emergency still maps to legacy EMERGENCY because live dequeue semantics
      depend on it today.
    - Special no longer maps to EMERGENCY. It inherits the channel-backed legacy
      queue type and uses canonical `priority` for its distinct behavior.
    - `patient_type` is accepted here to keep the mapping boundary explicit even
      though Phase 1 does not use it to derive FOLLOW_UP anymore.
    """
    if priority == "emergency":
        return "EMERGENCY"
    if (channel or "").strip().lower() == "phone":
        return "PRE_BOOKED"
    return "WALK_IN"


def _set_canonical_queue_entry_fields(entry, channel: str, load_class: str, priority: str) -> None:
    """
    Best-effort dual-write of canonical queue semantics.

    The guards keep runtime safe before DocType migration/reload has happened.
    Once the Queue Entry schema includes these fields, the values will start
    persisting automatically without further behavior changes.
    """
    meta = frappe.get_meta("Queue Entry")
    field_map = {
        "channel": channel,
        "patient_type": _canonical_patient_type(load_class),
        "priority": priority,
    }
    for fieldname, value in field_map.items():
        if meta.has_field(fieldname):
            setattr(entry, fieldname, value)


def _set_special_queue_entry_fields(entry, is_special: bool = False, reason: str = "") -> None:
    """Best-effort special audit metadata for Queue Entry during the transition."""
    if not is_special:
        return
    meta = frappe.get_meta("Queue Entry")
    field_map = {
        "marked_special_by": frappe.session.user,
        "marked_special_at": now_datetime(),
        "special_reason": reason or "",
    }
    for fieldname, value in field_map.items():
        if meta.has_field(fieldname):
            setattr(entry, fieldname, value)


def _next_normal_token(used_tokens: set) -> int:
    """Return the lowest positive integer that is not already used."""
    candidate = 1
    while candidate in used_tokens:
        candidate += 1
    return candidate


def _next_special_token(buffer_positions: list[int], used_tokens: set) -> int:
    """
    Return the lowest buffer position that has not yet been used.
    Raises if none available.
    """
    for pos in buffer_positions:
        if pos not in used_tokens:
            return pos
    frappe.throw(_("No Special buffer positions are available."))


def _load_ratio(session: dict) -> float:
    """
    Return a 0-1 float representing how loaded this session is.
    Used to steer new bookings toward the lighter session.
    """
    planned = session.get("planned_capacity") or 1
    review = session.get("review_load_count") or 0
    non_review = session.get("non_review_load_count") or 0
    return round((review + non_review) / planned, 2)


def _create_patient_appointment(
    patient: str,
    session_doc,
    queue_type: str,
    token_number: int,
) -> str | None:
    """
    Create a Patient Appointment linked to this booking so that Marley Healthcare's
    standard workflows (fee validity, check-in, sales invoice) remain functional.

    Returns the new Patient Appointment name, or None on failure (non-blocking).
    """
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

    if not appointment_type:
        frappe.log_error(
            "No Appointment Type found — Patient Appointment not created for booking.",
            "clinic_flow: confirm_booking"
        )
        return None

    # Calculate a unique appointment_time within the session so Healthcare's
    # overlap validator (appointment_based_on_check_in=1) doesn't reject duplicates.
    session_date_str = str(session_doc.session_date)
    appt_time = str(session_doc.start_time)
    try:
        start_dt = get_datetime(f"{session_date_str} {session_doc.start_time}")
        end_dt   = get_datetime(f"{session_date_str} {session_doc.end_time}")
        total_mins = int((end_dt - start_dt).total_seconds() // 60)
        cap        = int(session_doc.planned_capacity or 20)
        slot_mins  = max(1, total_mins // cap)
        appt_time  = str(add_to_date(start_dt, minutes=(token_number - 1) * slot_mins).time())
    except Exception:
        pass  # Fall back to session start_time

    company = frappe.db.get_single_value("Global Defaults", "default_company")
    dept    = frappe.db.get_value(
        "Healthcare Practitioner", session_doc.practitioner, "department"
    )

    try:
        appt = frappe.get_doc({
            "doctype":                       "Patient Appointment",
            "patient":                       patient,
            "practitioner":                  session_doc.practitioner,
            "appointment_for":               "Healthcare Practitioner",
            "appointment_type":              appointment_type,
            "appointment_date":              session_doc.session_date,
            "appointment_time":              appt_time,
            "department":                    dept,
            "company":                       company,
            "custom_queue_type":             queue_type,
            "duration":                      1,
            # Tells Healthcare to skip strict time-range overlap check
            "appointment_based_on_check_in": 1,
        })
        appt.insert(ignore_permissions=True)
        return appt.name
    except Exception:
        frappe.log_error(frappe.get_traceback(), "clinic_flow: Patient Appointment creation failed")
        return None
