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
from frappe.utils import getdate, now_datetime, today, add_to_date


# ---------------------------------------------------------------------------
# visit type detection
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_visit_type(patient: str) -> dict:
    """
    Return load_class for this patient: 'review_load' or 'non_review_load'.

    A patient is classified as review_load if they have a completed QueueEntry
    in this clinic within the last 90 days. Otherwise non_review_load (new patient).
    """
    if not patient:
        frappe.throw(_("Patient is required."))

    cutoff = add_to_date(today(), days=-90)
    past = frappe.db.count(
        "Queue Entry",
        filters={
            "patient": patient,
            "status": ["in", ["Completed", "Done", "With Doctor"]],
            "done_at": [">=", cutoff],
        },
    )

    load_class = "review_load" if past else "non_review_load"
    return {"patient": patient, "load_class": load_class, "past_visits_90d": past}


# ---------------------------------------------------------------------------
# session suggestions
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_suggested_sessions(
    load_class: str,
    channel: str = "walkin",
    from_date: str | None = None,
    days_ahead: int = 7,
) -> list:
    """
    Return upcoming sessions that have capacity for the given channel.

    channel: 'phone' | 'walkin' | 'vip'
    load_class: 'review_load' | 'non_review_load'

    Each result includes load summary so the receptionist can choose the
    less-loaded session for load balancing.
    """
    start = getdate(from_date) if from_date else getdate(today())
    end = start + timedelta(days=int(days_ahead))

    config = frappe.get_single("Slot Partition Config")
    phone_pct: int = config.phone_pct or 60

    sessions = frappe.get_all(
        "Queue Session",
        filters={
            "status": ["in", ["Scheduled", "Active"]],
            "session_date": ["between", [start, end]],
        },
        fields=[
            "name", "session_name", "session_date", "start_time", "end_time",
            "practitioner", "dept_abbr",
            "planned_capacity", "stretch_capacity",
            "review_load_count", "non_review_load_count",
            "phone_booked_count", "walkin_count",
            "vip_buffer_positions", "vip_buffer_used",
        ],
        order_by="session_date asc, start_time asc",
    )

    result = []
    for s in sessions:
        planned = s.planned_capacity or 0
        stretch = s.stretch_capacity or planned
        total_booked = (s.phone_booked_count or 0) + (s.walkin_count or 0)

        phone_quota = int(planned * phone_pct / 100)
        walkin_quota = stretch - phone_quota

        if channel == "phone":
            available = phone_quota - (s.phone_booked_count or 0)
        elif channel == "vip":
            buffer_list = _parse_vip_positions(s.vip_buffer_positions)
            available = len(buffer_list) - (s.vip_buffer_used or 0)
        else:  # walkin
            available = stretch - total_booked

        if available <= 0:
            continue

        result.append({
            "queue_session": s.name,
            "session_name": s.session_name,
            "session_date": str(s.session_date),
            "start_time": str(s.start_time),
            "end_time": str(s.end_time),
            "practitioner": s.practitioner,
            "dept_abbr": s.dept_abbr,
            "available_slots": available,
            "review_load_count": s.review_load_count or 0,
            "non_review_load_count": s.non_review_load_count or 0,
            "total_booked": total_booked,
            "load_ratio": _load_ratio(s),
        })

    return result


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
      - vip_buffer_positions (reserved but unassigned buffer slots)
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
        ],
        order_by="token_number asc",
    )

    buffer_list = _parse_vip_positions(session.vip_buffer_positions)
    used_tokens = {e.token_number for e in entries if e.token_number}

    return {
        "session": session,
        "entries": entries,
        "vip_buffer_available": [p for p in buffer_list if p not in used_tokens],
        "vip_buffer_reserved": buffer_list,
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
) -> dict:
    """
    Confirm a booking: assign a token number and create a QueueEntry.

    channel: 'phone' | 'walkin' | 'vip'
    load_class: 'review_load' | 'non_review_load'

    VIP channel takes the nearest unassigned vip_buffer_position.
    Phone/walkin channel skips buffer positions when assigning sequential tokens.

    Returns the new QueueEntry name and token_number.
    """
    queue_session = (queue_session or "").strip()
    patient = (patient or "").strip()
    channel = (channel or "walkin").strip().lower()
    load_class = (load_class or "non_review_load").strip()

    if not queue_session:
        frappe.throw(_("Queue Session is required."))
    if not patient:
        frappe.throw(_("Patient is required."))
    if load_class not in ("review_load", "non_review_load"):
        frappe.throw(_("load_class must be 'review_load' or 'non_review_load'."))
    if channel not in ("phone", "walkin", "vip"):
        frappe.throw(_("channel must be 'phone', 'walkin', or 'vip'."))

    session_doc = frappe.get_doc("Queue Session", queue_session)

    if session_doc.status not in ("Scheduled", "Active"):
        frappe.throw(_("Session {0} is not open for booking (status: {1}).").format(
            queue_session, session_doc.status
        ))

    config = frappe.get_single("Slot Partition Config")
    phone_pct: int = config.phone_pct or 60

    planned = session_doc.planned_capacity or 0
    stretch = session_doc.stretch_capacity or planned
    phone_quota = int(planned * phone_pct / 100)
    total_booked = (session_doc.phone_booked_count or 0) + (session_doc.walkin_count or 0)

    # Capacity check per channel
    if channel == "phone":
        if (session_doc.phone_booked_count or 0) >= phone_quota:
            frappe.throw(_("Phone booking quota ({0}) is full for this session.").format(phone_quota))
    elif channel == "vip":
        buffer_list = _parse_vip_positions(session_doc.vip_buffer_positions)
        if (session_doc.vip_buffer_used or 0) >= len(buffer_list):
            frappe.throw(_("No VIP buffer positions available in this session."))
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
    buffer_list = _parse_vip_positions(session_doc.vip_buffer_positions)

    if channel == "vip":
        token_number = _next_vip_token(buffer_list, existing_tokens)
    else:
        token_number = _next_normal_token(buffer_list, existing_tokens)

    # queue_position = token_number at booking time (ETA engine can reorder later)
    queue_position = token_number

    # Map channel to legacy queue_type
    queue_type_map = {"phone": "PRE_BOOKED", "walkin": "WALK_IN", "vip": "EMERGENCY"}
    queue_type = queue_type_map[channel]

    # Build token label (for display, e.g. PED-042)
    dept_abbr = session_doc.dept_abbr or "TKN"
    token_label = f"{dept_abbr}-{token_number:03d}"

    # Create QueueEntry
    entry = frappe.new_doc("Queue Entry")
    entry.queue_session = queue_session
    entry.patient = patient
    entry.practitioner = session_doc.practitioner
    entry.department = session_doc.department
    entry.dept_abbr = dept_abbr
    entry.token_number = token_number
    entry.token = token_label
    entry.queue_position = queue_position
    entry.queue_type = queue_type
    entry.load_class = load_class
    entry.status = "Booked"
    entry.issued_by = frappe.session.user
    entry.issued_by_role = "Reception"
    if notes:
        entry.notes = notes
    entry.save(ignore_permissions=True)

    # Update session counters
    update_fields: dict = {}

    if channel == "phone":
        update_fields["phone_booked_count"] = (session_doc.phone_booked_count or 0) + 1
    elif channel == "walkin":
        update_fields["walkin_count"] = (session_doc.walkin_count or 0) + 1
    elif channel == "vip":
        update_fields["vip_buffer_used"] = (session_doc.vip_buffer_used or 0) + 1
        update_fields["phone_booked_count"] = (session_doc.phone_booked_count or 0) + 1

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
        "queue_entry": entry.name,
        "token_number": token_number,
        "token": token_label,
        "queue_position": queue_position,
        "load_class": load_class,
        "channel": channel,
        "predicted_doctor_time": eta["predicted_doctor_time"],
        "report_by_time": eta["report_by_time"],
        "estimated_window_end": eta["estimated_window_end"],
    }


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _parse_vip_positions(raw: str | None) -> list[int]:
    """Parse the JSON vip_buffer_positions field. Returns sorted list."""
    if not raw:
        return []
    try:
        positions = json.loads(raw)
        return sorted(int(p) for p in positions)
    except Exception:
        return []


def _next_normal_token(buffer_positions: list[int], used_tokens: set) -> int:
    """
    Return the lowest positive integer that is not in used_tokens
    and not in buffer_positions (reserved for VIP).
    """
    buffer_set = set(buffer_positions)
    candidate = 1
    while candidate in used_tokens or candidate in buffer_set:
        candidate += 1
    return candidate


def _next_vip_token(buffer_positions: list[int], used_tokens: set) -> int:
    """
    Return the lowest buffer position that has not yet been used.
    Raises if none available.
    """
    for pos in buffer_positions:
        if pos not in used_tokens:
            return pos
    frappe.throw(_("No VIP buffer positions are available."))


def _load_ratio(session: dict) -> float:
    """
    Return a 0-1 float representing how loaded this session is.
    Used to steer new bookings toward the lighter session.
    """
    planned = session.get("planned_capacity") or 1
    review = session.get("review_load_count") or 0
    non_review = session.get("non_review_load_count") or 0
    return round((review + non_review) / planned, 2)
