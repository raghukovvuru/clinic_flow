from __future__ import annotations

from pathlib import Path

import frappe

from clinic_flow.api.arrival_permissions import (
    ARRIVAL_COUNTER_ROLES,
    enforce_arrival_counter_access,
    get_arrival_counter_permissions,
)


def _json_for_script(data: dict) -> str:
    return frappe.as_json(data).replace("</", "<\\/")


def _load_head_app_shell(boot_json: str) -> str:
    path = Path(frappe.get_app_path("clinic_flow", "public", "head-app", "arrival-counter.html"))
    if not path.exists():
        frappe.throw(
            "Arrival Counter frontend build is missing. Run `npm run build` in frontend/head-app.",
            frappe.ValidationError,
        )

    html = path.read_text(encoding="utf-8")
    html = html.replace('href="./_app/', 'href="/assets/clinic_flow/head-app/_app/')
    html = html.replace('src="./_app/', 'src="/assets/clinic_flow/head-app/_app/')
    html = html.replace('import("./_app/', 'import("/assets/clinic_flow/head-app/_app/')
    body_index = html.find("<body")
    if body_index == -1:
        frappe.throw("Arrival Counter frontend build is malformed: missing body tag.", frappe.ValidationError)
    body_open_end = html.find(">", body_index)
    if body_open_end == -1:
        frappe.throw("Arrival Counter frontend build is malformed: incomplete body tag.", frappe.ValidationError)
    boot_script = f"\n<script>window.clinicFlowBoot = {boot_json};</script>\n"
    return html[: body_open_end + 1] + boot_script + html[body_open_end + 1 :]


def _build_boot() -> dict:
    return {
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


def get_context(context):
    enforce_arrival_counter_access()
    boot = _build_boot()

    context.no_cache = 1
    context.no_header = 1
    context.no_breadcrumbs = 1
    context.no_sidebar = 1
    context.sitemap = 0
    context.title = "Arrival Counter"
    context.allowed_roles = ARRIVAL_COUNTER_ROLES
    context.boot = boot
    context.boot_json = _json_for_script(boot)
    context.shell_html = _load_head_app_shell(context.boot_json)
