"""
Guardian / family lookup and registration APIs.

All endpoints are whitelisted for the receptionist dashboard.
"""
import frappe
from frappe import _
from frappe.utils import getdate, today


@frappe.whitelist()
def search_guardian(mobile: str) -> dict:
    """
    Look up a guardian by mobile number.

    Returns the guardian doc with their children list, or None if not found.
    Each child entry includes patient name, dob, age_display, and the patient id.
    """
    mobile = (mobile or "").strip()
    if not mobile:
        frappe.throw(_("Mobile number is required."))

    guardian = frappe.db.get_value(
        "Patient Guardian",
        {"mobile": mobile},
        ["name", "guardian_name", "mobile", "relationship", "notes"],
        as_dict=True,
    )
    if not guardian:
        return {"found": False}

    children = frappe.get_all(
        "Guardian Child",
        filters={"parent": guardian.name, "parenttype": "Patient Guardian"},
        fields=["patient", "patient_name", "dob", "age_display"],
        order_by="idx asc",
    )

    return {
        "found": True,
        "guardian": guardian,
        "children": children,
    }


@frappe.whitelist()
def register_guardian_and_child(
    guardian_name: str,
    mobile: str,
    relationship: str,
    patient_name: str,
    dob: str | None = None,
    sex: str = "Male",
    notes: str = "",
) -> dict:
    """
    Create a new Patient record for the child, then create a new Patient Guardian
    record linking them together.

    Returns the new guardian name and patient name.
    Throws if a guardian with this mobile already exists.
    """
    mobile = (mobile or "").strip()
    guardian_name = (guardian_name or "").strip()
    patient_name = (patient_name or "").strip()

    if not mobile:
        frappe.throw(_("Mobile number is required."))
    if not guardian_name:
        frappe.throw(_("Guardian name is required."))
    if not patient_name:
        frappe.throw(_("Patient (child) name is required."))

    if frappe.db.exists("Patient Guardian", {"mobile": mobile}):
        frappe.throw(
            _("A guardian with mobile {0} already exists. Use add_child_to_guardian to add a child.").format(mobile)
        )

    # Create patient
    patient = frappe.new_doc("Patient")
    patient.patient_name = patient_name
    patient.sex = sex
    if dob:
        patient.dob = getdate(dob)
    patient.save(ignore_permissions=True)

    # Create guardian with child row
    guardian = frappe.new_doc("Patient Guardian")
    guardian.guardian_name = guardian_name
    guardian.mobile = mobile
    guardian.relationship = relationship or "Guardian"
    guardian.notes = notes
    guardian.append("children", {"patient": patient.name})
    guardian.save(ignore_permissions=True)

    return {
        "guardian": guardian.name,
        "patient": patient.name,
        "patient_name": patient_name,
    }


@frappe.whitelist()
def add_child_to_guardian(
    guardian: str,
    patient_name: str,
    dob: str | None = None,
    sex: str = "Male",
) -> dict:
    """
    Create a new Patient record and append it to an existing guardian's children table.

    Returns the new patient name.
    """
    guardian_name_input = (patient_name or "").strip()
    if not guardian:
        frappe.throw(_("Guardian is required."))
    if not guardian_name_input:
        frappe.throw(_("Patient (child) name is required."))

    if not frappe.db.exists("Patient Guardian", guardian):
        frappe.throw(_("Guardian {0} not found.").format(guardian))

    # Create patient
    patient = frappe.new_doc("Patient")
    patient.patient_name = patient_name
    patient.sex = sex
    if dob:
        patient.dob = getdate(dob)
    patient.save(ignore_permissions=True)

    # Append to guardian
    guardian_doc = frappe.get_doc("Patient Guardian", guardian)
    guardian_doc.append("children", {"patient": patient.name})
    guardian_doc.save(ignore_permissions=True)

    return {
        "guardian": guardian,
        "patient": patient.name,
        "patient_name": patient_name,
    }
