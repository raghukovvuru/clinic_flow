import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import today


class TestSpecialOverflowAdmission(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")
        config = frappe.get_single("Slot Partition Config")
        config.phone_pct = 60
        config.save(ignore_permissions=True)

    def test_queue_entry_has_overflow_audit_fields(self):
        meta = frappe.get_meta("Queue Entry")

        self.assertTrue(meta.has_field("is_overflow"))
        self.assertTrue(meta.has_field("overflow_reason"))
        self.assertTrue(meta.has_field("overflow_authorized_by"))
        self.assertTrue(meta.has_field("overflow_authorized_at"))
        self.assertTrue(meta.has_field("overflow_source"))

    def test_normal_walkin_booking_still_rejects_when_stretch_capacity_is_full(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
            )

    def test_normal_phone_booking_still_rejects_when_phone_quota_is_full(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=4)
        self.make_booked_entry(session, token_number=1, channel="phone")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="phone",
                load_class="non_review_load",
            )

    def test_special_walkin_without_overflow_authorization_rejects_when_stretch_capacity_is_full(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
                is_special=True,
            )

    def test_special_walkin_overflow_requires_reason_and_source(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
                is_special=True,
                authorize_overflow=True,
                overflow_source="doctor instructed",
            )

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
                is_special=True,
                authorize_overflow=True,
                overflow_reason="Doctor requested add-on",
            )

    def test_special_overflow_string_zero_is_not_authorized(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="walkin",
                load_class="non_review_load",
                is_special="1",
                authorize_overflow="0",
                overflow_reason="Doctor requested add-on",
                overflow_source="doctor instructed",
            )

    def test_special_overflow_string_one_authorizes_when_reason_and_source_present(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special="1",
            authorize_overflow="1",
            overflow_reason="Doctor requested add-on",
            overflow_source="doctor instructed",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])

        self.assertEqual(entry.priority, "special")
        self.assertEqual(entry.is_overflow, 1)
        self.assertEqual(entry.overflow_reason, "Doctor requested add-on")
        self.assertEqual(entry.overflow_source, "doctor instructed")

    def test_special_walkin_overflow_records_audit_and_assigns_next_numeric_token(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            special_reason="Known special case",
            authorize_overflow=True,
            overflow_reason="Doctor requested add-on",
            overflow_source="doctor instructed",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        refreshed_session = frappe.get_doc("Queue Session", session.name)

        self.assertEqual(result["token_number"], 3)
        self.assertEqual(entry.token_number, 3)
        self.assertEqual(entry.queue_position, 3)
        self.assertEqual(entry.priority, "special")
        self.assertEqual(entry.channel, "walkin")
        self.assertEqual(entry.is_overflow, 1)
        self.assertEqual(entry.overflow_reason, "Doctor requested add-on")
        self.assertEqual(entry.overflow_source, "doctor instructed")
        self.assertEqual(entry.overflow_authorized_by, frappe.session.user)
        self.assertIsNotNone(entry.overflow_authorized_at)
        self.assertEqual(entry.special_reason, "Known special case")
        self.assertEqual(refreshed_session.walkin_count, 3)
        self.assertEqual(refreshed_session.stretch_capacity, 2)

    def test_special_overflow_requires_queue_manager_or_system_manager_role(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()
        user = self.make_basic_user()

        try:
            frappe.set_user(user.name)
            with self.assertRaises(frappe.PermissionError):
                frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                    queue_session=session.name,
                    patient=patient.name,
                    channel="walkin",
                    load_class="non_review_load",
                    is_special=True,
                    authorize_overflow=True,
                    overflow_reason="Unauthorized attempt",
                    overflow_source="other",
                )
        finally:
            frappe.set_user("Administrator")

    def test_special_phone_overflow_keeps_phone_channel_and_records_audit(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=4)
        self.make_booked_entry(session, token_number=1, channel="phone")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="phone",
            load_class="review_load",
            is_special=True,
            special_reason="Management approved phone special",
            authorize_overflow=True,
            overflow_reason="Phone quota already full",
            overflow_source="management approval",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])
        refreshed_session = frappe.get_doc("Queue Session", session.name)

        self.assertEqual(entry.channel, "phone")
        self.assertEqual(entry.queue_type, "PRE_BOOKED")
        self.assertEqual(entry.load_class, "review_load")
        self.assertEqual(entry.priority, "special")
        self.assertEqual(entry.is_overflow, 1)
        self.assertEqual(entry.overflow_reason, "Phone quota already full")
        self.assertEqual(entry.overflow_source, "management approval")
        self.assertEqual(refreshed_session.phone_booked_count, 2)
        self.assertEqual(refreshed_session.walkin_count, 0)

    def test_special_booking_within_stretch_capacity_is_not_overflow(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=3)
        self.make_booked_entry(session, token_number=1, channel="walkin")
        self.make_booked_entry(session, token_number=2, channel="walkin")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            special_reason="Close circle",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])

        self.assertEqual(entry.priority, "special")
        self.assertEqual(entry.is_overflow, 0)
        self.assertFalse(entry.overflow_reason)
        self.assertFalse(entry.overflow_source)
        self.assertEqual(entry.special_reason, "Close circle")

    def test_live_special_walkin_overflow_can_record_arrival_without_readying_patient(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1, status="Active")
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            special_reason="Doctor requested live add-on",
            authorize_overflow=True,
            overflow_reason="Doctor requested live add-on",
            overflow_source="doctor instructed",
            mark_arrived=True,
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])

        self.assertEqual(entry.status, "Arrived")
        self.assertIsNotNone(entry.arrived_at)
        self.assertNotEqual(entry.status, "Ready Near Doctor")
        self.assertFalse(entry.reception_done_at)

    def test_phone_special_overflow_cannot_be_marked_arrived_during_booking(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=4)
        self.make_booked_entry(session, token_number=1, channel="phone")
        patient = self.make_patient()

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
                queue_session=session.name,
                patient=patient.name,
                channel="phone",
                load_class="non_review_load",
                is_special=True,
                authorize_overflow=True,
                overflow_reason="Phone quota full",
                overflow_source="management approval",
                mark_arrived=True,
            )

    def test_mark_arrived_string_zero_keeps_booked_status(self):
        session = self.make_queue_session(planned_capacity=2, stretch_capacity=2, status="Active")
        patient = self.make_patient()

        result = frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            mark_arrived="0",
        )

        entry = frappe.get_doc("Queue Entry", result["queue_entry"])

        self.assertEqual(entry.status, "Booked")
        self.assertFalse(entry.arrived_at)

    def test_call_next_special_does_not_call_booked_special_overflow(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1, status="Active")
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()

        frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            authorize_overflow=True,
            overflow_reason="Doctor requested add-on",
            overflow_source="doctor instructed",
        )

        result = frappe.get_attr("clinic_flow.api.queue.call_next_special")(session.name)

        self.assertEqual(result["status"], "empty")

    def test_call_next_special_does_not_call_arrived_special_overflow_before_reception(self):
        session = self.make_queue_session(planned_capacity=1, stretch_capacity=1, status="Active")
        self.make_booked_entry(session, token_number=1, channel="walkin")
        patient = self.make_patient()

        frappe.get_attr("clinic_flow.api.admission.confirm_booking")(
            queue_session=session.name,
            patient=patient.name,
            channel="walkin",
            load_class="non_review_load",
            is_special=True,
            authorize_overflow=True,
            overflow_reason="Doctor requested live add-on",
            overflow_source="doctor instructed",
            mark_arrived=True,
        )

        result = frappe.get_attr("clinic_flow.api.queue.call_next_special")(session.name)

        self.assertEqual(result["status"], "empty")

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Special",
            "last_name": f"Overflow {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_service_point(self):
        code = f"SO{frappe.generate_hash(length=5).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Special Overflow {code}",
            "category": "consult",
            "is_active": 1,
        }).insert(ignore_permissions=True)

    def make_practitioner(self):
        return frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"Overflow Prac {frappe.generate_hash(length=4)}",
            "gender": "Male",
        }).insert(ignore_permissions=True)

    def make_basic_user(self):
        email = f"overflow-{frappe.generate_hash(length=8)}@example.com"
        return frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Overflow",
            "last_name": "User",
            "user_type": "System User",
            "enabled": 1,
            "send_welcome_email": 0,
            "roles": [{"role": "Queue Viewer"}],
        }).insert(ignore_permissions=True)

    def make_queue_session(self, planned_capacity: int = 2, stretch_capacity: int = 2, status: str = "Scheduled"):
        sp = self.make_service_point()
        practitioner = self.make_practitioner()
        return frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"Special Overflow Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": planned_capacity,
            "planned_capacity": planned_capacity,
            "stretch_capacity": stretch_capacity,
            "status": status,
        }).insert(ignore_permissions=True)

    def make_booked_entry(
        self,
        session,
        token_number: int,
        channel: str = "walkin",
        priority: str = "normal",
        status: str = "Booked",
    ):
        patient = self.make_patient()
        entry = frappe.get_doc({
            "doctype": "Queue Entry",
            "queue_session": session.name,
            "patient": patient.name,
            "practitioner": session.practitioner,
            "dept_abbr": session.dept_abbr,
            "token_number": token_number,
            "token": f"{session.dept_abbr}-{token_number:03d}",
            "queue_position": token_number,
            "channel": channel,
            "load_class": "non_review_load",
            "patient_type": "new",
            "priority": priority,
            "queue_type": "PRE_BOOKED" if channel == "phone" else "WALK_IN",
            "status": status,
            "issued_by": frappe.session.user,
            "issued_by_role": "Queue Manager",
        }).insert(ignore_permissions=True)

        counter_field = "phone_booked_count" if channel == "phone" else "walkin_count"
        current_count = frappe.db.get_value("Queue Session", session.name, counter_field) or 0
        frappe.db.set_value("Queue Session", session.name, counter_field, current_count + 1)
        return entry
