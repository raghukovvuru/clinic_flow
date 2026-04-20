import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import date_diff, getdate, today


class PatientGuardian(Document):
    def before_save(self) -> None:
        self._update_child_ages()

    def _update_child_ages(self) -> None:
        """Refresh the age_display field on each Guardian Child row."""
        for row in self.children or []:
            if row.dob:
                row.age_display = _calculate_age_display(getdate(row.dob))
            else:
                row.age_display = ""


def _calculate_age_display(dob) -> str:
    """Return a human-readable age string like '4y 3m' or '8 months'."""
    today_date = getdate(today())
    total_months = (today_date.year - dob.year) * 12 + (today_date.month - dob.month)
    if today_date.day < dob.day:
        total_months -= 1
    total_months = max(total_months, 0)

    years = total_months // 12
    months = total_months % 12

    if years == 0:
        return f"{months}m"
    if months == 0:
        return f"{years}y"
    return f"{years}y {months}m"
