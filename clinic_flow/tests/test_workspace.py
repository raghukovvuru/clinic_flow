import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import nowdate

from clinic_flow.api.workspace import _get_encounter_data, save_encounter_draft


class TestWorkspaceFieldMapping(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")

    # ------------------------------------------------------------------ helpers

    def _ensure_gender(self, name: str) -> str:
        if not frappe.db.exists("Gender", name):
            frappe.get_doc({"doctype": "Gender", "gender": name}).insert()
        return name

    def _make_patient(self) -> str:
        return frappe.get_doc(
            {"doctype": "Patient", "first_name": "WS Test", "sex": "Male"}
        ).insert().name

    def _make_practitioner(self) -> str:
        return frappe.get_doc(
            {
                "doctype": "Healthcare Practitioner",
                "first_name": "WS Doctor",
                "gender": "Male",
            }
        ).insert().name

    def _make_appointment_type(self) -> str:
        existing = frappe.db.get_value("Appointment Type", {}, "name")
        if existing:
            return existing
        return frappe.get_doc(
            {"doctype": "Appointment Type", "appointment_type": "WS Test Type"}
        ).insert().name

    def _make_encounter(self, patient: str, practitioner: str) -> str:
        appt_type = self._make_appointment_type()
        return frappe.get_doc(
            {
                "doctype": "Patient Encounter",
                "patient": patient,
                "practitioner": practitioner,
                "encounter_date": nowdate(),
                "appointment_type": appt_type,
            }
        ).insert().name

    def _make_duration(self) -> str:
        name = frappe.db.get_value("Prescription Duration", {}, "name")
        if name:
            return name
        return frappe.get_doc(
            {"doctype": "Prescription Duration", "period": "5 Days", "number": 5, "period_type": "Day(s)"}
        ).insert().name

    def _make_dosage_form(self) -> str:
        name = frappe.db.get_value("Dosage Form", {}, "name")
        if name:
            return name
        return frappe.get_doc(
            {"doctype": "Dosage Form", "dosage_form": "Tablet"}
        ).insert().name

    # ------------------------------------------------------------------ tests

    def test_save_encounter_draft_accepts_valid_drug_row(self):
        """save_encounter_draft must succeed when drug rows have period and dosage_form."""
        patient = self._make_patient()
        practitioner = self._make_practitioner()
        encounter = self._make_encounter(patient, practitioner)
        period = self._make_duration()
        dosage_form = self._make_dosage_form()

        import json
        result = save_encounter_draft(
            encounter=encounter,
            data=json.dumps({
                "symptoms": "fever",
                "patient_note": "rest advised",
                "diagnosis": [],
                "drug_prescription": [
                    {
                        "medication": "",
                        "drug_code": "",
                        "dosage": "",
                        "period": period,
                        "dosage_form": dosage_form,
                        "comment": "test",
                    }
                ],
                "lab_test_prescription": [],
            }),
        )

        self.assertEqual(result["status"], "saved")
        enc = frappe.get_doc("Patient Encounter", encounter)
        self.assertEqual(len(enc.drug_prescription), 1)
        self.assertEqual(enc.drug_prescription[0].period, period)
        self.assertEqual(enc.drug_prescription[0].dosage_form, dosage_form)

    def test_get_encounter_data_does_not_include_drug_name(self):
        """_get_encounter_data must not include drug_name in drug rows (it is read-only/fetched)."""
        patient = self._make_patient()
        practitioner = self._make_practitioner()
        encounter = self._make_encounter(patient, practitioner)

        data = _get_encounter_data(encounter)

        for row in data.get("drug_prescription", []):
            self.assertNotIn("drug_name", row, "drug_name is read-only; do not expose it to the workspace")
