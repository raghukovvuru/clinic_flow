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

    def test_shell_redirects_non_staff_user(self):
        from clinic_flow.www.clinic.arrival_counter import get_context

        user = self.make_queue_viewer_user()
        try:
            frappe.set_user(user.name)
            context = frappe._dict()
            with self.assertRaises(frappe.Redirect):
                get_context(context)
            redirect_location = frappe.local.flags.redirect_location
            self.assertIn("/clinic/login", redirect_location)
            self.assertIn("access-denied", redirect_location)
        finally:
            frappe.set_user("Administrator")

    def test_shell_redirects_guest_user(self):
        from clinic_flow.www.clinic.arrival_counter import get_context

        frappe.set_user("Guest")
        try:
            context = frappe._dict()
            with self.assertRaises(frappe.Redirect):
                get_context(context)
            redirect_location = frappe.local.flags.redirect_location
            self.assertIn("/clinic/login", redirect_location)
            self.assertIn("redirect-to=/clinic/arrival-counter", redirect_location)
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
