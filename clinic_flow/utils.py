from __future__ import annotations

import frappe


def get_token_qr_svg(queue_entry_name: str) -> str:
	"""
	Generate a QR code SVG for a Queue Entry docname.
	Registered as a Jinja method so print format templates can call it directly.
	The QR code encodes the docname, which the arrival counter scans to mark_arrived.
	"""
	try:
		from io import BytesIO
		from pyqrcode import create as qrcreate

		qr = qrcreate(queue_entry_name, error="M")
		stream = BytesIO()
		qr.svg(stream, scale=5, background="#ffffff", module_color="#1e293b")
		svg = stream.getvalue().decode("utf-8")
		stream.close()
		return svg
	except Exception:
		frappe.log_error(frappe.get_traceback(), "clinic_flow: QR generation failed")
		return ""
