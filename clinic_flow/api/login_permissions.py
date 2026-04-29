from __future__ import annotations

import frappe


CLINIC_FLOW_ROLES: tuple[str, ...] = (
    "Healthcare Administrator",
    "Queue Manager",
    "System Manager",
)


def get_clinic_flow_roles() -> tuple[str, ...]:
    return CLINIC_FLOW_ROLES


def resolve_login_required_roles(redirect_to: str | None) -> tuple[str, ...]:
    if redirect_to and "/arrival-counter" in redirect_to:
        from clinic_flow.api.arrival_permissions import ARRIVAL_COUNTER_ROLES
        return ARRIVAL_COUNTER_ROLES
    return get_clinic_flow_roles()
