from __future__ import annotations

import frappe

ARRIVAL_COUNTER_ROLES: tuple[str, ...] = (
    "Healthcare Administrator",
    "Queue Manager",
    "System Manager",
)


def enforce_arrival_counter_access() -> None:
    """Require a staff role for Arrival Counter shell and APIs."""
    frappe.only_for(ARRIVAL_COUNTER_ROLES)


def get_arrival_counter_permissions() -> dict:
    roles = set(frappe.get_roles(frappe.session.user))
    can_use = bool(roles.intersection(ARRIVAL_COUNTER_ROLES))
    return {
        "canUseArrivalCounter": can_use,
        "canConfirmArrival": can_use,
        "canPrintTokenSlip": can_use,
    }
