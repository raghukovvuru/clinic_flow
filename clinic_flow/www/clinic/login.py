from __future__ import annotations

import frappe
from frappe import _

from clinic_flow.api.login_permissions import get_clinic_flow_roles, resolve_login_required_roles
from clinic_flow.www.clinic.head_app_shell import build_shell_context, load_head_app_shell


def _sanitize_redirect(redirect_to: str | None) -> str:
    default = "/clinic/arrival-counter"
    if not redirect_to:
        return default

    from urllib.parse import urlparse

    redirect_to = redirect_to.strip()
    if not redirect_to:
        return default

    parsed = urlparse(redirect_to)

    if parsed.scheme:
        if parsed.scheme not in {"http", "https"}:
            return default

        request_url = getattr(frappe.local.request, "url", "") if frappe.local.request else ""
        request_host = urlparse(request_url).netloc
        if parsed.netloc != request_host:
            return default

        normalized_path = parsed.path or "/"
        if not normalized_path.startswith("/clinic/"):
            return default

        normalized = normalized_path
        if parsed.query:
            normalized = f"{normalized}?{parsed.query}"
        if parsed.fragment:
            normalized = f"{normalized}#{parsed.fragment}"
        return normalized

    if parsed.netloc:
        return default
    if not redirect_to.startswith("/clinic/"):
        return default
    return redirect_to


def get_context(context):
    redirect_to_raw = frappe.local.request.args.get("redirect-to") if frappe.local.request else None
    redirect_to = _sanitize_redirect(redirect_to_raw)
    mode_raw = frappe.local.request.args.get("mode") if frappe.local.request else None

    if frappe.session.user != "Guest":
        user_roles = set(frappe.get_roles(frappe.session.user))
        if user_roles.intersection(get_clinic_flow_roles()):
            frappe.local.flags.redirect_location = redirect_to
            raise frappe.Redirect
        mode = "access-denied"
    else:
        mode = "login"

    if mode_raw == "access-denied" and frappe.session.user != "Guest":
        mode = "access-denied"

    required_roles = resolve_login_required_roles(redirect_to)

    boot = {
        "app": "clinic_flow",
        "slice": "login",
        "route": "/clinic/login",
        "siteName": frappe.local.site,
        "csrfToken": frappe.sessions.get_csrf_token(),
        "redirectUrl": redirect_to,
        "mode": mode,
        "requiredRoles": list(required_roles),
        "currentUser": frappe.session.user if frappe.session.user != "Guest" else None,
    }

    ctx = build_shell_context(title="Clinic Flow", boot=boot)
    ctx.shell_html = load_head_app_shell("login", ctx.boot_json)
    context.update(ctx)
