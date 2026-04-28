import frappe
from frappe.tests import IntegrationTestCase


class TestArrivalCounterShell(IntegrationTestCase):
    def test_shell_context_includes_typed_boot_and_no_cache(self):
        from clinic_flow.www.clinic.arrival_counter import get_context

        context = frappe._dict()
        get_context(context)

        self.assertEqual(context.no_cache, 1)
        self.assertEqual(context.no_header, 1)
        self.assertEqual(context.no_breadcrumbs, 1)
        self.assertEqual(context.boot["app"], "clinic_flow")
        self.assertEqual(context.boot["slice"], "arrival-counter")
        self.assertEqual(context.boot["route"], "/clinic/arrival-counter")
        self.assertTrue(context.boot["csrfToken"])
        self.assertTrue(context.boot["permissions"]["canUseArrivalCounter"])
        self.assertNotIn("iframe", context.shell_html.lower())

    def test_shell_rejects_non_staff_user(self):
        from clinic_flow.www.clinic.arrival_counter import get_context

        user = self.make_queue_viewer_user()
        try:
            frappe.set_user(user.name)
            with self.assertRaises(frappe.PermissionError):
                get_context(frappe._dict())
        finally:
            frappe.set_user("Administrator")

    def make_queue_viewer_user(self):
        email = f"arrival-shell-{frappe.generate_hash(length=8)}@example.com"
        return frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Arrival",
            "last_name": "ShellViewer",
            "user_type": "System User",
            "enabled": 1,
            "send_welcome_email": 0,
            "roles": [{"role": "Queue Viewer"}],
        }).insert(ignore_permissions=True)
