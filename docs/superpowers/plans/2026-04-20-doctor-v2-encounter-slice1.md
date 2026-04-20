# Doctor Workspace V2 — Encounter Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the core encounter save + submit loop work correctly by fixing field mapping bugs against the live Healthcare v16 schema, owning the medication lookup boundary, and adding a minimal prescription print path.

**Architecture:** Three backend fixes in `workspace.py` (drug prescription field map, lab prescription field map, medication lookup wrapper) are tested with an integration test. Two minimal frontend additions in `doctor_workspace_v2.js` (field key rename for labs, print link, open orders render) are verified manually against the running site.

**Tech Stack:** Frappe v16, Marley Healthcare v16, Python 3.11, Frappe `IntegrationTestCase`, bench CLI

---

## Schema Facts (read before touching anything)

These were verified from the live Healthcare v16 DocType JSON. Do not assume — refer back here.

**Drug Prescription child (`tabDrug Prescription`):**

| Field | Type | Notes |
|---|---|---|
| `medication` | Link → Medication | Optional |
| `drug_code` | Link → Item | Mandatory **only when** `medication` is set |
| `drug_name` | Data | **Read-only. Auto-fetched from `drug_code.item_name`.** Never set this from Python. |
| `dosage` | Link → Prescription Dosage | Mandatory when not `dosage_by_interval` |
| `period` | Link → Prescription Duration | **`reqd: 1` — always mandatory** |
| `dosage_form` | Link → Dosage Form | **`reqd: 1` — always mandatory** |
| `comment` | Small Text | Optional |

**Lab Prescription child (`tabLab Prescription`):**

| Field | Type | Notes |
|---|---|---|
| `observation_template` | Link → Observation Template | V16 ordering field |
| `lab_test_code` | Link → Lab Test Template | Legacy, optional |
| `lab_test_name` | Data | **Read-only. Auto-fetched from `lab_test_code`.** Never set this from Python. |
| `lab_test_comment` | Small Text | Optional |
| `service_request` | Data | Read-only, filled after fulfillment |

---

## File Map

| File | Role | Change |
|---|---|---|
| `clinic_flow/api/workspace.py` | Backend encounter save/submit | Fix `_get_encounter_data` and `save_encounter_draft` field mapping; add `get_drug_items` |
| `clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js` | Doctor workspace UI | Fix lab row state key; add validation; call new `get_drug_items`; add print link; render open orders |
| `clinic_flow/tests/test_workspace.py` | Integration tests (new file) | Tests for field mapping correctness and `get_drug_items` |

---

## Task 1: Fix Drug Prescription field mapping in workspace.py

**Files:**
- Modify: `clinic_flow/api/workspace.py`
- Create: `clinic_flow/tests/test_workspace.py`

The current code sets `drug_name` in drug rows (read-only field — ignored or wrong) and passes arbitrary keys through to `enc.set()`. Fix: explicitly allow only writable fields per row, in both the read path (`_get_encounter_data`) and write path (`save_encounter_draft`).

- [ ] **Step 1: Write the failing test**

Create `clinic_flow/tests/test_workspace.py`:

```python
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

    def _make_dosage(self) -> str:
        name = frappe.db.get_value("Prescription Dosage", {}, "name")
        if name:
            return name
        return frappe.get_doc(
            {"doctype": "Prescription Dosage", "dosage": "1-0-1"}
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/raghu/frappe-bench && source env/bin/activate && bench run-tests \
  --app clinic_flow \
  --module clinic_flow.tests.test_workspace \
  --verbose 2>&1 | tail -30
```

Expected: `FAIL` — `test_workspace` module does not exist yet.

- [ ] **Step 3: Fix `_get_encounter_data` — return only writable fields in drug rows**

In `clinic_flow/api/workspace.py`, replace the `_get_encounter_data` function:

```python
def _get_encounter_data(encounter: str) -> dict:
    enc = frappe.get_doc("Patient Encounter", encounter)
    return {
        "name": enc.name,
        "docstatus": enc.docstatus,
        "patient": enc.patient,
        "practitioner": enc.practitioner,
        "encounter_date": enc.encounter_date,
        "symptoms": enc.get("custom_chief_complaint") or "",
        "diagnosis": enc.get("diagnosis"),
        "patient_note": enc.get("encounter_comment") or "",
        "drug_prescription": [
            {
                "medication": r.medication or "",
                "drug_code": r.drug_code or "",
                "dosage": r.dosage or "",
                "period": r.period or "",
                "dosage_form": r.dosage_form or "",
                "comment": r.comment or "",
            }
            for r in (enc.drug_prescription or [])
        ],
        "lab_test_prescription": [
            {
                "observation_template": r.observation_template or "",
                "lab_test_comment": r.lab_test_comment or "",
            }
            for r in (enc.lab_test_prescription or [])
        ],
        "procedure_prescription": [r.as_dict() for r in (enc.procedure_prescription or [])],
    }
```

- [ ] **Step 4: Fix `save_encounter_draft` — whitelist fields per child table**

In `clinic_flow/api/workspace.py`, replace the `save_encounter_draft` function:

```python
@frappe.whitelist()
def save_encounter_draft(encounter: str, data: str) -> dict:
    """
    Saves edits from the workspace into the Patient Encounter (Draft).
    `data` is a JSON string with partial encounter fields.
    Only Draft (docstatus=0) encounters can be saved here.
    """
    frappe.has_permission("Patient Encounter", "write", encounter, throw=True)

    if isinstance(data, str):
        data = frappe.parse_json(data)

    enc = frappe.get_doc("Patient Encounter", encounter)
    if enc.docstatus != 0:
        frappe.throw(_("Cannot edit a submitted encounter."), frappe.ValidationError)

    FIELD_MAP = {
        "symptoms":     "custom_chief_complaint",
        "patient_note": "encounter_comment",
    }

    # Only these fields are writable on each child row — matches Healthcare v16 schema.
    # drug_name and lab_test_name are read-only fetch fields; never set them directly.
    CHILD_ALLOWED: dict[str, list[str]] = {
        "drug_prescription": ["medication", "drug_code", "dosage", "period", "dosage_form", "comment"],
        "lab_test_prescription": ["observation_template", "lab_test_comment"],
    }

    for ws_key, enc_field in FIELD_MAP.items():
        if ws_key in data:
            enc.set(enc_field, data[ws_key])

    for table_field, allowed_fields in CHILD_ALLOWED.items():
        if table_field not in data:
            continue
        rows = [
            {k: v for k, v in row.items() if k in allowed_fields}
            for row in (data[table_field] or [])
        ]
        enc.set(table_field, rows)

    if "diagnosis" in data:
        enc.set("diagnosis", data["diagnosis"])

    enc.save(ignore_permissions=False)
    return {"status": "saved", "name": enc.name}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/raghu/frappe-bench && source env/bin/activate && bench run-tests \
  --app clinic_flow \
  --module clinic_flow.tests.test_workspace \
  --verbose 2>&1 | tail -30
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow && git add \
  clinic_flow/api/workspace.py \
  clinic_flow/tests/test_workspace.py && \
git commit -m "fix: harden encounter field mapping against Healthcare v16 Drug Prescription schema"
```

---

## Task 2: Fix Lab Prescription — use observation_template throughout

**Files:**
- Modify: `clinic_flow/api/workspace.py` (already fixed in Task 1's `_get_encounter_data` — verify)
- Modify: `clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js`
- Modify: `clinic_flow/tests/test_workspace.py`

The JS currently stores lab rows as `{lab_test_name: ''}`. This key must change to `observation_template` everywhere in the JS, and `save_encounter_draft` must receive `observation_template` (which Task 1 already handles on the Python side).

- [ ] **Step 1: Add a test for observation_template round-trip**

Append to the `TestWorkspaceFieldMapping` class in `clinic_flow/tests/test_workspace.py`:

```python
    def test_save_encounter_draft_stores_observation_template(self):
        """Lab rows must save observation_template, not lab_test_name."""
        patient = self._make_patient()
        practitioner = self._make_practitioner()
        encounter = self._make_encounter(patient, practitioner)

        template = frappe.db.get_value("Observation Template", {}, "name")
        if not template:
            self.skipTest("No Observation Template on this site — cannot run")

        import json
        save_encounter_draft(
            encounter=encounter,
            data=json.dumps({
                "symptoms": "",
                "patient_note": "",
                "diagnosis": [],
                "drug_prescription": [],
                "lab_test_prescription": [{"observation_template": template}],
            }),
        )

        enc = frappe.get_doc("Patient Encounter", encounter)
        self.assertEqual(len(enc.lab_test_prescription), 1)
        self.assertEqual(enc.lab_test_prescription[0].observation_template, template)

    def test_get_encounter_data_returns_observation_template(self):
        """_get_encounter_data must return observation_template, not lab_test_name."""
        patient = self._make_patient()
        practitioner = self._make_practitioner()
        encounter = self._make_encounter(patient, practitioner)

        data = _get_encounter_data(encounter)

        for row in data.get("lab_test_prescription", []):
            self.assertIn("observation_template", row)
            self.assertNotIn("lab_test_name", row)
```

- [ ] **Step 2: Run tests to verify the new tests pass (they should — Task 1 already fixed Python side)**

```bash
cd /home/raghu/frappe-bench && source env/bin/activate && bench run-tests \
  --app clinic_flow \
  --module clinic_flow.tests.test_workspace \
  --verbose 2>&1 | tail -30
```

Expected: all 4 tests pass. If `test_save_encounter_draft_stores_observation_template` skips (no Observation Template on site), that is acceptable.

- [ ] **Step 3: Fix the JS — rename all `lab_test_name` to `observation_template` in state and rendering**

In `clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js`, make these changes:

**3a. Initial state — `lab_rows` items**

Find in the `state` object initializer and any push that creates a blank lab row:
```javascript
// Old — change this:
this.state.lab_rows.push({ lab_test_name: '' });
// New:
this.state.lab_rows.push({ observation_template: '' });
```

There are three places that push blank lab rows:
- `#dw2-add-test` click handler
- `_handle_test_keydown` (when Enter adds a new row)
- `_render_patient` where `labs` is mapped

**3b. `_render_patient` — lab row hydration**

Find:
```javascript
this.state.lab_rows = labs.map((t) => ({ lab_test_name: t.lab_test_name || t.template || '' }));
```
Replace with:
```javascript
this.state.lab_rows = labs.map((t) => ({ observation_template: t.observation_template || '' }));
```

**3c. `_hydrate_encounter_state` — lab row hydration**

Find:
```javascript
this.state.lab_rows = labs.map((t) => ({ lab_test_name: t.lab_test_name || t.template || '' }));
```
Replace with:
```javascript
this.state.lab_rows = labs.map((t) => ({ observation_template: t.observation_template || '' }));
```

**3d. `_render_lab_rows` — rendering**

Find:
```javascript
<input class="dw2-test-input" list="dw2-test-list" data-idx="${idx}" placeholder="Test / Observation" value="${frappe.utils.escape_html(row.lab_test_name || '')}">
```
Replace with:
```javascript
<input class="dw2-test-input" list="dw2-test-list" data-idx="${idx}" placeholder="Test / Observation" value="${frappe.utils.escape_html(row.observation_template || '')}">
```

**3e. `_update_test_row` — state update on input**

Find:
```javascript
_update_test_row(e) {
    const idx = parseInt($(e.currentTarget).data('idx'), 10);
    if (!this.state.lab_rows[idx]) return;
    this.state.lab_rows[idx].lab_test_name = $(e.currentTarget).val();
}
```
Replace with:
```javascript
_update_test_row(e) {
    const idx = parseInt($(e.currentTarget).data('idx'), 10);
    if (!this.state.lab_rows[idx]) return;
    this.state.lab_rows[idx].observation_template = $(e.currentTarget).val();
}
```

**3f. `_collect_data_from_state` — collect for save**

Find:
```javascript
lab_test_prescription: this.state.lab_rows
    .filter((r) => (r.lab_test_name || '').trim())
    .map((r) => ({ lab_test_name: r.lab_test_name || '' })),
```
Replace with:
```javascript
lab_test_prescription: this.state.lab_rows
    .filter((r) => (r.observation_template || '').trim())
    .map((r) => ({ observation_template: r.observation_template || '' })),
```

- [ ] **Step 4: Add client-side validation for required Drug Prescription fields**

In `_collect_data_from_state`, replace the existing validation block:

```javascript
_collect_data_from_state() {
    // Validate: drug rows with a medication must have period and dosage_form (reqd in Healthcare schema)
    const filledDrugRows = this.state.drug_rows.filter(
        (r) => (r.medication || r.drug_code || '').trim()
    );
    const missingPeriodOrForm = filledDrugRows.find(
        (r) => !(r.period || '').trim() || !(r.dosage_form || '').trim()
    );
    if (missingPeriodOrForm) {
        throw new Error('Each medicine needs a Period and Dosage Form before saving.');
    }
    const invalidRow = filledDrugRows.find((r) => !(r.drug_code || '').trim());
    if (invalidRow) {
        throw new Error('Select a valid medicine from lookup before saving the prescription.');
    }
    return {
        symptoms: this.state.complaint_list.join(', '),
        patient_note: this.$root.find('#dw2-advice-input').val() || '',
        diagnosis: this.state.diagnosis_list.map((d) => ({ diagnosis: d.diagnosis })),
        drug_prescription: filledDrugRows.map((r) => ({
            medication: r.medication || '',
            drug_code: r.drug_code || '',
            dosage: r.dosage || '',
            period: r.period || '',
            dosage_form: r.dosage_form || '',
            comment: r.comment || '',
        })),
        lab_test_prescription: this.state.lab_rows
            .filter((r) => (r.observation_template || '').trim())
            .map((r) => ({ observation_template: r.observation_template || '' })),
    };
}
```

- [ ] **Step 5: Manually verify lab ordering in browser**

Start bench: `bench start` (or confirm it is running).

1. Open `http://site1.localhost:8000/app/doctor-workspace-v2`
2. With an active session, call a patient.
3. In Tests section, type 2 characters — the Observation Template datalist should offer completions.
4. Select one and click Save Draft — confirm no console errors.
5. Reload the page / call the same patient — confirm the ordered test is pre-populated.

- [ ] **Step 6: Commit**

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow && git add \
  clinic_flow/tests/test_workspace.py \
  clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js && \
git commit -m "fix: use observation_template for lab orders; rename lab_test_name throughout v2 workspace"
```

---

## Task 3: Own the medication lookup boundary

**Files:**
- Modify: `clinic_flow/api/workspace.py`
- Modify: `clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js`
- Modify: `clinic_flow/tests/test_workspace.py`

Currently the JS calls `healthcare.healthcare.doctype.patient_encounter.patient_encounter.get_medications` directly. This is a Healthcare-internal path. Wrap it in a clinic_flow whitelisted function so any future Healthcare refactor doesn't break silently.

`get_medications` in Healthcare:
```python
def get_medications(medication):
    return frappe.get_all("Medication Linked Item", {"parent": medication}, ["item"])
```

It is not decorated with `@frappe.whitelist()` in Healthcare (the JS call works because Frappe allows calling any function through a custom mechanism, or it may be implicitly allowed — either way, owning the boundary is safer).

- [ ] **Step 1: Write a test for the new function**

Append to `TestWorkspaceFieldMapping` in `clinic_flow/tests/test_workspace.py`:

```python
    def test_get_drug_items_returns_list(self):
        """get_drug_items must return a list (empty is fine if no medication exists)."""
        from clinic_flow.api.workspace import get_drug_items

        med = frappe.db.get_value("Medication", {}, "name")
        if not med:
            self.skipTest("No Medication on this site")

        result = get_drug_items(medication=med)

        self.assertIsInstance(result, list)
        for row in result:
            self.assertIn("item", row)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/raghu/frappe-bench && source env/bin/activate && bench run-tests \
  --app clinic_flow \
  --module clinic_flow.tests.test_workspace \
  --verbose 2>&1 | tail -20
```

Expected: `FAIL` — `get_drug_items` not found in `clinic_flow.api.workspace`.

- [ ] **Step 3: Add `get_drug_items` to workspace.py**

Add this function after `get_medication_form_data` in `clinic_flow/api/workspace.py`:

```python
@frappe.whitelist()
def get_drug_items(medication: str) -> list[dict]:
    """
    Returns Item codes linked to a Medication.
    Owns the Healthcare boundary — wraps Medication Linked Item lookup.
    """
    return frappe.get_all("Medication Linked Item", {"parent": medication}, ["item"])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/raghu/frappe-bench && source env/bin/activate && bench run-tests \
  --app clinic_flow \
  --module clinic_flow.tests.test_workspace \
  --verbose 2>&1 | tail -20
```

Expected: all tests pass (or skip if no Medication exists on site).

- [ ] **Step 5: Update JS to call the clinic_flow endpoint**

In `doctor_workspace_v2.js`, find `_resolve_medication_item`:

```javascript
async _resolve_medication_item(idx, medication) {
    if (!this.state.drug_rows[idx] || !medication) return;
    try {
        const r = await frappe.call({
            method: 'healthcare.healthcare.doctype.patient_encounter.patient_encounter.get_medications',
            args: { medication },
        });
```

Replace the `method` value:

```javascript
async _resolve_medication_item(idx, medication) {
    if (!this.state.drug_rows[idx] || !medication) return;
    try {
        const r = await frappe.call({
            method: 'clinic_flow.api.workspace.get_drug_items',
            args: { medication },
        });
```

- [ ] **Step 6: Commit**

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow && git add \
  clinic_flow/api/workspace.py \
  clinic_flow/tests/test_workspace.py \
  clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js && \
git commit -m "feat: own medication item lookup in clinic_flow; remove direct call to Healthcare internal"
```

---

## Task 4: Add prescription print link after Complete Visit (minimal)

**Files:**
- Modify: `clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js`

After `submit_encounter` succeeds, open the Frappe print view for the submitted encounter in a new tab. No new button — triggered immediately on success so the doctor doesn't have to find it.

- [ ] **Step 1: Update `_complete_visit` to open print after submit**

In `doctor_workspace_v2.js`, find the `_complete_visit` method. The current success block is:

```javascript
frappe.show_alert({ message: 'Visit completed', indicator: 'green' });
this.state.current_entry = null;
this.state.current_encounter = null;
this.$shell.hide();
this.$empty.show();
this._set_action_state();
this._load_queue();
```

Replace with:

```javascript
const encName = this.state.current_encounter.name;
frappe.show_alert({ message: 'Visit completed', indicator: 'green' });
this.state.current_entry = null;
this.state.current_encounter = null;
this.$shell.hide();
this.$empty.show();
this._set_action_state();
this._load_queue();
// Open prescription print in background tab
const printUrl = frappe.urllib.get_url(
    `/printview?doctype=Patient%20Encounter&name=${encodeURIComponent(encName)}&format=Patient%20Encounter`
);
window.open(printUrl, '_blank');
```

- [ ] **Step 2: Manually verify print opens correctly**

1. Complete a consultation via the workspace.
2. Confirm a new tab opens with the Patient Encounter print view.
3. Confirm the encounter data (Rx, diagnosis) appears in the print.
4. If the print format is blank/missing, note the format name used and configure the default in Healthcare settings or use `&format=` with an existing format name from `frappe.db.get_value("Print Format", {"doc_type": "Patient Encounter"}, "name")`.

- [ ] **Step 3: Commit**

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow && git add \
  clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js && \
git commit -m "feat: open prescription print view after completing consultation in v2 workspace"
```

---

## Task 5: Render open orders in side panel (minimal)

**Files:**
- Modify: `clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js`

`open_orders` is already fetched in `get_workspace_payload` → `get_patient_summary` → `_get_open_orders`. It is passed in `payload.patient_summary.open_orders` but never rendered. Add a simple side card using existing CSS classes.

- [ ] **Step 1: Add an open orders side card to the HTML**

In the `get_workspace_v2_html` function, find the sidepanel section. After the `dw2-side-card` for `dw2-ready-queue`, add:

```html
<div class="dw2-side-card">
    <div class="dw2-side-label">Open Orders</div>
    <div id="dw2-open-orders" class="dw2-side-body">No open orders</div>
</div>
```

- [ ] **Step 2: Render open orders in `_render_patient`**

In `_render_patient`, after the vitals rendering block, add:

```javascript
const orders = summary.open_orders || [];
const ordersHtml = orders.length
    ? orders.slice(0, 6).map((o) => `
        <div class="dw2-side-line">
            <div class="dw2-side-line-title">${frappe.utils.escape_html(o.template_dn || o.name || '')}</div>
            <div class="dw2-side-line-sub">${frappe.utils.escape_html(o.status || '')} · ${frappe.utils.escape_html(String(o.order_date || ''))}</div>
        </div>
    `).join('')
    : '<div>No open orders</div>';
this.$root.find('#dw2-open-orders').html(ordersHtml);
```

- [ ] **Step 3: Manually verify open orders appear**

1. On a patient who has pending `Service Request` records, call next in the workspace.
2. Confirm the Open Orders side card shows the pending orders.
3. On a patient with no open orders, confirm the card shows "No open orders".

- [ ] **Step 4: Commit**

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow && git add \
  clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js && \
git commit -m "feat: render open orders side card in v2 workspace using existing payload data"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Fix drug prescription field mapping (`save_encounter_draft` + `_get_encounter_data`) — Tasks 1 + 2
- [x] Fix lab prescription to use `observation_template` — Task 2
- [x] Wrap `get_medications` in clinic_flow API — Task 3
- [x] Add prescription print — Task 4
- [x] Render `open_orders` in side panel — Task 5
- [x] Completeness indicator — **deliberately deferred** (user confirmed "minimal frontend work"; the validation in `_collect_data_from_state` added in Task 2 covers the correctness concern; a visual indicator is a UX concern for a later slice)

**Placeholder scan:** None.

**Type consistency:**
- `get_drug_items(medication: str) -> list[dict]` — used in Task 3 test as `get_drug_items(medication=med)` ✓
- `save_encounter_draft(encounter: str, data: str) -> dict` — used in Task 1 test as `save_encounter_draft(encounter=encounter, data=json.dumps(...))` ✓
- `_get_encounter_data(encounter: str) -> dict` — used in Task 1 test directly ✓

**Field name consistency:**
- `observation_template` used in Python (`_get_encounter_data`, `save_encounter_draft` allowed fields), JS state, JS collect, and test — consistent ✓
- `drug_code`, `medication`, `period`, `dosage_form` used identically in Python allowed list and JS collect — consistent ✓
