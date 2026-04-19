app_name = "clinic_flow"
app_title = "Clinic Flow"
app_publisher = "Raghu"
app_description = "Queue management and doctor workspace for Marley Health"
app_email = "raghudevop9@gmail.com"
app_license = "MIT"

required_apps = ["frappe", "healthcare"]

# ── v16: extend_doctype_class (preferred over doc_events for controller logic) ──
# Adds on_update mixin to Patient Appointment without replacing Marley's controller.
# Multiple apps can safely extend the same DocType this way.
extend_doctype_class = {
	"Patient Appointment": [
		"clinic_flow.queue.appointment_mixin.QueueMixin"
	]
}

# ── Scheduled jobs ───────────────────────────────────────────────────────────
scheduler_events = {
	"cron": {
		# Runs every 5 minutes — checks if any session needs pre-booked slots released
		"*/5 * * * *": [
			"clinic_flow.queue.scheduler.release_prebooked_slots"
		]
	}
}

# ── Jinja template methods (available in print formats) ──────────────────────
jinja = {
	"methods": [
		"clinic_flow.utils.get_token_qr_svg",
	],
}

# ── Static assets injected into desk ────────────────────────────────────────
app_include_css = []
app_include_js = []

# ── Fixtures ─────────────────────────────────────────────────────────────────
# Note: load-bearing customizations on upstream Healthcare doctypes are currently
# patch-managed, not reliably fixture-managed, because live site Custom Field rows
# may not carry module = "Clinic Flow".
fixtures = [
	{
		"dt": "Custom Field",
		"filters": [["module", "=", "Clinic Flow"]]
	},
	{
		"dt": "Property Setter",
		"filters": [["module", "=", "Clinic Flow"]]
	},
	{
		"dt": "Role",
		"filters": [["name", "in", ["Queue Manager", "Queue Viewer", "Lab Queue Trigger"]]]
	},
	{
		"dt": "Workspace",
		"filters": [["name", "=", "Clinic Flow"]]
	},
	{
		"dt": "Print Format",
		"filters": [["doc_type", "=", "Queue Entry"], ["module", "=", "Clinic Flow"]]
	},
]

# ── Boot session: redirect doctors to their workspace ────────────────────────
boot_session = "clinic_flow.api.boot.extend_boot"

# ── v16: enforce type annotations on all whitelisted API methods ─────────────
require_type_annotated_api_methods = 1

# ── Web pages ────────────────────────────────────────────────────────────────
website_route_rules = [
	{"from_route": "/queue-dashboard", "to_route": "queue-dashboard"},
]
