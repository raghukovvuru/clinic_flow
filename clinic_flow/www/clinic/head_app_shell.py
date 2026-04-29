from __future__ import annotations

from pathlib import Path

import frappe


def json_for_script(data: dict) -> str:
    return frappe.as_json(data).replace("</", "<\\/")


def load_head_app_shell(page_name: str, boot_json: str) -> str:
    path = Path(frappe.get_app_path("clinic_flow", "public", "head-app", f"{page_name}.html"))
    if not path.exists():
        frappe.throw(
            f"Head-app frontend build is missing: {page_name}.html. Run `npm run build` in frontend/head-app.",
            frappe.ValidationError,
        )

    html = path.read_text(encoding="utf-8")
    html = html.replace('href="./_app/', 'href="/assets/clinic_flow/head-app/_app/')
    html = html.replace('src="./_app/', 'src="/assets/clinic_flow/head-app/_app/')
    html = html.replace('import("./_app/', 'import("/assets/clinic_flow/head-app/_app/')

    body_index = html.find("<body")
    if body_index == -1:
        frappe.throw(f"Head-app build for {page_name} is malformed: missing body tag.", frappe.ValidationError)
    body_open_end = html.find(">", body_index)
    if body_open_end == -1:
        frappe.throw(f"Head-app build for {page_name} is malformed: incomplete body tag.", frappe.ValidationError)

    boot_script = f"\n<script>window.clinicFlowBoot = {boot_json};</script>\n"
    return html[: body_open_end + 1] + boot_script + html[body_open_end + 1 :]


def build_shell_context(
    *,
    title: str,
    no_cache: int = 1,
    no_header: int = 1,
    no_breadcrumbs: int = 1,
    no_sidebar: int = 1,
    sitemap: int = 0,
    boot: dict | None = None,
) -> dict:
    context = frappe._dict()
    context.no_cache = no_cache
    context.no_header = no_header
    context.no_breadcrumbs = no_breadcrumbs
    context.no_sidebar = no_sidebar
    context.sitemap = sitemap
    context.title = title
    if boot is not None:
        context.boot = boot
        context.boot_json = json_for_script(boot)
    return context
