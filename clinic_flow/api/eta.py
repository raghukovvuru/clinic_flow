"""
ETA Engine — Phase 3

All time estimation logic for the v2 receptionist dashboard.

Public surface:
  estimate(queue_session, token_number, load_class)
      → {predicted_doctor_time, report_by_time, estimated_window_end}

  recalculate_downstream_etas(queue_session)
      → writes predicted_doctor_time + report_by_time on all pending entries

  check_pace_deviation(queue_session) → bool

Internal helpers are module-private (leading underscore).

Design principles:
  - No side effects inside estimate() — pure calculation, caller writes to DB.
  - recalculate_downstream_etas() owns all DB writes for ETAs.
  - Rolling averages are per-practitioner, not per-session.
"""

from datetime import datetime, timedelta
from statistics import mean

import frappe
from frappe.utils import get_datetime, now_datetime, today


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@frappe.whitelist()
def estimate(
    queue_session: str,
    token_number: int,
    load_class: str,
) -> dict:
    """
    Estimate when the doctor will see the patient and when they should arrive.

    Returns:
      predicted_doctor_time  (datetime ISO string)
      report_by_time         (datetime ISO string)
      estimated_window_end   (datetime ISO string)
      review_avg_used        (float, minutes)
      non_review_avg_used    (float, minutes)
    """
    token_number = int(token_number)
    config = frappe.get_single("Slot Partition Config")

    session = frappe.db.get_value(
        "Queue Session",
        queue_session,
        ["name", "practitioner", "session_date", "start_time", "status"],
        as_dict=True,
    )
    if not session:
        frappe.throw(f"Queue Session {queue_session} not found.")

    review_avg = _get_rolling_avg("review_load", session.practitioner, config) \
        or (config.default_review_consult_min or 2.0)
    non_review_avg = _get_rolling_avg("non_review_load", session.practitioner, config) \
        or (config.default_non_review_consult_min or 5.0)

    weighted_ahead = _weighted_time_ahead(
        queue_session, token_number, review_avg, non_review_avg
    )

    reference_time = _reference_time(session)
    # Never estimate in the past — floor at now for active sessions.
    if session.status in ("Active", "Paused"):
        reference_time = max(reference_time, now_datetime())

    predicted_doctor_time = reference_time + timedelta(minutes=weighted_ahead)

    # report_by = predicted_doctor_time minus lead times
    pipeline_lead = (config.ready_buffer_count or 2) * (
        (review_avg + non_review_avg) / 2.0
    )
    reception_min = config.reception_processing_min or 3.0
    safety_min = config.reporting_safety_min or 15.0

    report_by_time = predicted_doctor_time - timedelta(
        minutes=reception_min + pipeline_lead + safety_min
    )

    consult_duration = review_avg if load_class == "review_load" else non_review_avg
    estimated_window_end = predicted_doctor_time + timedelta(minutes=consult_duration)

    return {
        "predicted_doctor_time": str(predicted_doctor_time),
        "report_by_time": str(report_by_time),
        "estimated_window_end": str(estimated_window_end),
        "review_avg_used": round(review_avg, 2),
        "non_review_avg_used": round(non_review_avg, 2),
        "weighted_ahead_minutes": round(weighted_ahead, 2),
    }


@frappe.whitelist()
def recalculate_downstream_etas(queue_session: str) -> int:
    """
    Recalculate and persist ETA fields for all pending entries in the session.

    Runs on:
      - Booking confirmed
      - Patient completes reception (moves to Ready Near Doctor)
      - Patient pushed to end
      - Patient moved to No Response
      - Called from call_next (via check_pace_deviation gate)

    Returns the number of entries updated.
    """
    config = frappe.get_single("Slot Partition Config")

    session = frappe.db.get_value(
        "Queue Session",
        queue_session,
        ["name", "practitioner", "session_date", "start_time", "status"],
        as_dict=True,
    )
    if not session:
        return 0

    review_avg = _get_rolling_avg("review_load", session.practitioner, config) \
        or (config.default_review_consult_min or 2.0)
    non_review_avg = _get_rolling_avg("non_review_load", session.practitioner, config) \
        or (config.default_non_review_consult_min or 5.0)

    # Entries still to be processed — ordered by token_number (booking order)
    pending = frappe.get_all(
        "Queue Entry",
        filters={
            "queue_session": queue_session,
            "status": ["in", ["Booked", "Called", "Ready Near Doctor"]],
        },
        fields=["name", "token_number", "load_class"],
        order_by="token_number asc",
    )

    if not pending:
        return 0

    pipeline_lead = (config.ready_buffer_count or 2) * (
        (review_avg + non_review_avg) / 2.0
    )
    reception_min = config.reception_processing_min or 3.0
    safety_min = config.reporting_safety_min or 15.0

    reference_time = _reference_time(session)
    if session.status in ("Active", "Paused"):
        reference_time = max(reference_time, now_datetime())

    updated = 0
    for entry in pending:
        weighted_ahead = _weighted_time_ahead(
            queue_session, entry.token_number, review_avg, non_review_avg
        )

        predicted = reference_time + timedelta(minutes=weighted_ahead)
        report_by = predicted - timedelta(
            minutes=reception_min + pipeline_lead + safety_min
        )

        frappe.db.set_value("Queue Entry", entry.name, {
            "predicted_doctor_time": predicted,
            "report_by_time": report_by,
        })
        updated += 1

    frappe.db.commit()
    return updated


def check_pace_deviation(queue_session: str) -> bool:
    """
    Return True if the actual average consultation pace for today's session has
    deviated more than 20% from the expected blended average.

    Called inside call_next — if True, recalculate_downstream_etas is triggered.
    """
    config = frappe.get_single("Slot Partition Config")
    min_samples: int = config.min_samples_for_live_avg or 5

    completed = frappe.db.sql("""
        SELECT
            TIMESTAMPDIFF(SECOND, seen_at, done_at) / 60.0 AS actual_minutes,
            load_class
        FROM `tabQueue Entry`
        WHERE queue_session = %s
          AND status IN ('Completed', 'Done')
          AND seen_at IS NOT NULL
          AND done_at IS NOT NULL
          AND done_at > seen_at
    """, (queue_session,), as_dict=True)

    if len(completed) < min_samples:
        return False

    actual_avg = mean(r.actual_minutes for r in completed)

    # Expected blended average weighted by load mix in this session
    session = frappe.db.get_value(
        "Queue Session", queue_session,
        ["practitioner", "review_load_count", "non_review_load_count"],
        as_dict=True,
    )
    review_avg = _get_rolling_avg("review_load", session.practitioner, config) \
        or (config.default_review_consult_min or 2.0)
    non_review_avg = _get_rolling_avg("non_review_load", session.practitioner, config) \
        or (config.default_non_review_consult_min or 5.0)

    total = (session.review_load_count or 0) + (session.non_review_load_count or 0)
    if total == 0:
        return False

    review_weight = (session.review_load_count or 0) / total
    non_review_weight = (session.non_review_load_count or 0) / total
    expected_avg = review_weight * review_avg + non_review_weight * non_review_avg

    if expected_avg == 0:
        return False

    deviation = abs(actual_avg - expected_avg) / expected_avg
    return deviation > 0.20


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_rolling_avg(load_class: str, practitioner: str, config) -> float | None:
    """
    Return the rolling average consultation time (minutes) for the given
    load_class and practitioner over the last rolling_avg_window_days days.

    Returns None if fewer than min_samples_for_live_avg samples exist.
    """
    window_days: int = config.rolling_avg_window_days or 7
    min_samples: int = config.min_samples_for_live_avg or 5

    cutoff = frappe.utils.add_to_date(today(), days=-window_days)

    rows = frappe.db.sql("""
        SELECT
            TIMESTAMPDIFF(SECOND, qe.seen_at, qe.done_at) / 60.0 AS actual_minutes
        FROM `tabQueue Entry` qe
        JOIN `tabQueue Session` qs ON qs.name = qe.queue_session
        WHERE qs.practitioner = %s
          AND qe.load_class = %s
          AND qe.status IN ('Completed', 'Done')
          AND qe.seen_at IS NOT NULL
          AND qe.done_at IS NOT NULL
          AND qe.done_at > qe.seen_at
          AND qe.done_at >= %s
    """, (practitioner, load_class, cutoff), as_dict=True)

    if len(rows) < min_samples:
        return None

    return mean(r.actual_minutes for r in rows)


def _weighted_time_ahead(
    queue_session: str,
    token_number: int,
    review_avg: float,
    non_review_avg: float,
) -> float:
    """
    Sum up the expected consultation minutes for all patients with a lower
    token_number who are still pending (not Completed, Pushed to End, or No Response).

    This includes the patient currently With Doctor — their full expected
    consultation time is counted (slight overestimate, safer for scheduling).
    """
    rows = frappe.db.sql("""
        SELECT load_class
        FROM `tabQueue Entry`
        WHERE queue_session = %s
          AND token_number < %s
          AND token_number > 0
          AND status NOT IN ('Completed', 'Done', 'Pushed to End', 'No Response',
                             'Skipped', 'No Show')
    """, (queue_session, token_number), as_dict=True)

    total = 0.0
    for r in rows:
        total += review_avg if r.load_class == "review_load" else non_review_avg

    return total


def _reference_time(session: dict) -> datetime:
    """
    Return the time anchor for ETA calculations.

    For active/paused sessions: the moment the last consultation ended.
    For scheduled (future) sessions: the session's planned start datetime.
    """
    if session.status in ("Active", "Paused"):
        last_done = frappe.db.sql("""
            SELECT MAX(done_at) AS last_done
            FROM `tabQueue Entry`
            WHERE queue_session = %s
              AND done_at IS NOT NULL
        """, (session.name,))

        last_done_dt = last_done[0][0] if (last_done and last_done[0][0]) else None
        if last_done_dt:
            return get_datetime(str(last_done_dt))

    # Scheduled session or no completions yet: use the session start datetime
    session_start_str = f"{session.session_date} {session.start_time}"
    return get_datetime(session_start_str)
