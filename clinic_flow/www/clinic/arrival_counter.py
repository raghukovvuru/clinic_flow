from __future__ import annotations

import frappe
from frappe import _

from clinic_flow.api.arrival_permissions import (
    ARRIVAL_COUNTER_ROLES,
    enforce_arrival_counter_access,
    get_arrival_counter_permissions,
)
from clinic_flow.www.clinic.head_app_shell import build_shell_context, json_for_script, load_head_app_shell


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/clinic/login?redirect-to=/clinic/arrival-counter"
        raise frappe.Redirect

    user_roles = set(frappe.get_roles(frappe.session.user))
    if not user_roles.intersection(ARRIVAL_COUNTER_ROLES):
        frappe.local.flags.redirect_location = "/clinic/login?redirect-to=/clinic/arrival-counter&mode=access-denied"
        raise frappe.Redirect

    enforce_arrival_counter_access()

    boot = {
        "app": "clinic_flow",
        "slice": "arrival-counter",
        "route": "/clinic/arrival-counter",
        "siteName": frappe.local.site,
        "user": frappe.session.user,
        "roles": frappe.get_roles(frappe.session.user),
        "csrfToken": frappe.sessions.get_csrf_token(),
        "realtime": {
            "enabled": False,
            "mode": "polling",
        },
        "permissions": get_arrival_counter_permissions(),
    }

    ctx = build_shell_context(title="Arrival Counter", boot=boot)
    ctx.allowed_roles = ARRIVAL_COUNTER_ROLES
    ctx.shell_html = load_head_app_shell("arrival-counter", ctx.boot_json)
    context.update(ctx)
