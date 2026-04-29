import frappe
from frappe.tests import IntegrationTestCase


class TestLoginShell(IntegrationTestCase):
    def test_guest_sees_login_mode(self):
        frappe.set_user("Guest")
        try:
            from clinic_flow.www.clinic.login import get_context

            context = frappe._dict()
            get_context(context)

            self.assertEqual(context.boot["mode"], "login")
            self.assertEqual(context.boot["slice"], "login")
            self.assertEqual(context.boot["route"], "/clinic/login")
            self.assertTrue(context.boot["csrfToken"])
            self.assertIsNone(context.boot["currentUser"])
            self.assertIn("Healthcare Administrator", context.boot["requiredRoles"])
            self.assertNotIn("iframe", context.shell_html.lower())
        finally:
            frappe.set_user("Administrator")

    def test_authorized_user_redirected_to_target(self):
        from clinic_flow.www.clinic.login import get_context

        frappe.local.request = type("Request", (), {"args": {"redirect-to": "/clinic/arrival-counter"}})()
        context = frappe._dict()
        with self.assertRaises(frappe.Redirect):
            get_context(context)
        self.assertEqual(
            frappe.local.flags.redirect_location,
            "/clinic/arrival-counter",
        )

    def test_wrong_role_user_sees_access_denied(self):
        from clinic_flow.www.clinic.login import get_context

        user = self._make_non_clinic_user()
        try:
            frappe.set_user(user.name)
            frappe.local.request = type("Request", (), {"args": {"redirect-to": "/clinic/arrival-counter"}})()
            context = frappe._dict()
            get_context(context)

            self.assertEqual(context.boot["mode"], "access-denied")
            self.assertEqual(context.boot["currentUser"], user.name)
            self.assertIn("Healthcare Administrator", context.boot["requiredRoles"])
        finally:
            frappe.set_user("Administrator")

    def test_sanitize_redirect_cross_domain(self):
        from clinic_flow.www.clinic.login import _sanitize_redirect

        frappe.local.request = type("Request", (), {"url": "http://site1.localhost:8000/clinic/login"})()

        result = _sanitize_redirect("https://evil.com/clinic/arrival-counter")
        self.assertEqual(result, "/clinic/arrival-counter")

        result = _sanitize_redirect("/clinic/arrival-counter")
        self.assertEqual(result, "/clinic/arrival-counter")

        result = _sanitize_redirect(None)
        self.assertEqual(result, "/clinic/arrival-counter")

    def test_sanitize_redirect_rejects_javascript_scheme(self):
        from clinic_flow.www.clinic.login import _sanitize_redirect

        frappe.local.request = type("Request", (), {"url": "http://site1.localhost:8000/clinic/login"})()
        result = _sanitize_redirect("javascript:alert(1)")
        self.assertEqual(result, "/clinic/arrival-counter")

    def test_sanitize_redirect_rejects_protocol_relative_cross_domain(self):
        from clinic_flow.www.clinic.login import _sanitize_redirect

        frappe.local.request = type("Request", (), {"url": "http://site1.localhost:8000/clinic/login"})()
        result = _sanitize_redirect("//evil.com/clinic/arrival-counter")
        self.assertEqual(result, "/clinic/arrival-counter")

    def test_sanitize_redirect_rejects_non_clinic_relative_path(self):
        from clinic_flow.www.clinic.login import _sanitize_redirect

        result = _sanitize_redirect("/app")
        self.assertEqual(result, "/clinic/arrival-counter")

    def test_shell_html_contains_boot_script(self):
        from clinic_flow.www.clinic.login import get_context

        frappe.local.request = type("Request", (), {"args": {"redirect-to": "/clinic/arrival-counter"}})()
        frappe.set_user("Guest")
        try:
            context = frappe._dict()
            get_context(context)
            self.assertIn("window.clinicFlowBoot", context.shell_html)
            self.assertIn('"slice": "login"', context.shell_html)
        finally:
            frappe.set_user("Administrator")

    def _make_non_clinic_user(self):
        email = f"login-shell-{frappe.generate_hash(length=8)}@example.com"
        return frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Login",
            "last_name": "TestNonClinic",
            "user_type": "System User",
            "enabled": 1,
            "send_welcome_email": 0,
            "roles": [{"role": "Queue Viewer"}],
        }).insert(ignore_permissions=True)
