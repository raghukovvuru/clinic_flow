# Doctor Workspace V2 — Encounter Flow

## Goal

Make the core outpatient consultation loop (call patient → complaints → diagnosis → Rx → labs → complete → print) work reliably end-to-end for a 3-4 minute slot, with a scribe-friendly "review and approve" interaction model.

## Current Slice

Audit and harden the prescription save + submit path; add prescription print; render open orders panel.

## In Scope

- Verify `save_encounter_draft` field mapping against live Healthcare v16 `Drug Prescription` child schema
- Verify lab ordering path: `Observation Template` datalist is correct for v16; confirm whether `lab_test_prescription` child table is still the right vehicle or if `Service Request` is the v16 path
- Wrap `healthcare.…get_medications` in a clinic_flow whitelisted API
- Add Print Prescription action after Complete Visit
- Render `open_orders` in the side panel (data already in the payload; zero new backend work)
- Add a completeness indicator so the doctor can see at a glance whether the assistant has filled all sections

## Out of Scope

- Session lifecycle (start/pause/resume/end) in v2 — deferred to Slice 3
- Procedure ordering UI
- Follow-up / referral booking
- Allergy entry from within the encounter
- Requeue patient action
- SOAP / structured clinical notes
- ICD-10 code assignment, billing integration

## Likely Files

- `clinic_flow/api/workspace.py` — field mapping hardening, `get_medications` wrapper
- `clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js` — print button, open orders panel, completeness indicator
- New API: `@frappe.whitelist()` medication lookup in `workspace.py` or a new `medications.py`
- Print format fixture (new) — encounter prescription print format

## Constraints

- Never modify `apps/healthcare/`
- All new `@frappe.whitelist()` methods require type annotations
- DOM lookups must be scoped to the page wrapper
- `custom_chief_complaint` is patch-managed; verify patch is applied before testing the save path

## Risks

| Risk | Severity |
|---|---|
| Healthcare v16 `Drug Prescription` child may require `medication` (Link) to be non-null — `drug_name` alone may not satisfy save/submit validation | High |
| Lab ordering in v16 may need `Service Request` rather than `lab_test_prescription` child table — confirm before implementing the lab order path | Medium |
| `get_medications` upstream method signature may drift across Healthcare versions; currently called directly with no clinic_flow boundary | Medium |
| `custom_chief_complaint` absent on fresh installs without the patch; symptoms won't save | Medium |

## Decisions So Far

**What already exists and is usable:**
- Full consultation sheet HTML/JS: complaints (chip-tag + `Complaint` DocType lookup), diagnosis (chip-tag + `Diagnosis` DocType lookup), Rx rows (medication lookup, dosage/period/form datalists, Enter-to-next nav), lab test rows (`Observation Template` datalist), advice textarea
- Backend: `get_workspace_payload`, `save_encounter_draft`, `submit_encounter`, `get_suggested_treatment_plans`, `apply_treatment_plan`, `get_medication_form_data`, `get_observation_templates`
- Patient summary: demographics, vitals, allergies, active_medications (last 3 enc proxy), recent_diagnoses, fee_validity, open_orders (fetched but not rendered in UI)
- Treatment plan strip: live and wired — suggestions refresh on complaint/diagnosis change, apply is implemented

**What is incomplete or risky:**
- Rx save → submit reliability: field mapping between `drug_code`, `drug_name`, `medication` is ambiguous; Healthcare validation behavior on save/submit is unverified
- Lab prescription currently saves `lab_test_name` as a string; v16 path unsettled (see below)
- `open_orders` and `recent_lab_results` are fetched but not rendered; two backend queries fire per Call Next with no consumer
- No print prescription path in v2

**What is missing entirely:**
- Print prescription (critical path — the physical end of "done" in a consultation)
- Session lifecycle controls in v2 (must use legacy workspace to start/pause/resume/end)
- Completeness indicator
- Procedure ordering UI
- Open orders panel (data present, UI absent)

**Lab ordering — v16 path:**
- `Observation Template` datalist is correct for Healthcare v16; `Lab Test Template` is deprecated
- Unsettled: whether `lab_test_prescription` child table on `Patient Encounter` is the correct v16 ordering vehicle, or whether the doctor should create `Service Request` records that then produce `Observation` records when fulfilled
- Do not assume the legacy child table path is correct until verified against v16 Healthcare behavior
- `patient_data.py` already attempts to fetch `Service Request` in `_get_open_orders` — the newer model is at least partially anticipated

**Design principles from operational context:**
- This is a **scribe workflow**: assistant enters data while the doctor reads a mirrored screen. The doctor's primary interaction is review + approve, not data entry.
- Consequence: treatment plan apply and "Repeat Rx" should be faster to reach than blank-field entry. They are the primary actions; the blank form is the fallback.
- A **completeness indicator** matters: the doctor needs to confirm in 2 seconds that all sections are filled before signing off. Currently there is no such signal.
- **Problem list vs. encounter diagnosis**: the side panel currently shows diagnoses as a date-indexed history list. For chronic-disease patients, consider surfacing a distinct "active problems" view alongside the per-encounter diagnosis — it changes how the doctor reads context in 10 seconds on the mirrored screen. This is deferred but should inform how the history panel is evolved in Slice 2.
- Inspiration from high-throughput operational UIs (not just EMRs): the doctor's final interaction should be: read sheet → confirm corrections → sign → print. The print step is the natural end of the loop; its absence makes the workspace feel incomplete regardless of everything else working.

**Next 2 slices (after this one):**
- Slice 2: Side panel completeness + treatment plan hardening — render `open_orders`, `recent_lab_results`; surface problem-list view; add UI feedback when no treatment plans match
- Slice 3: Session lifecycle self-containment — start/pause/resume/end from within v2 so the legacy workspace is no longer required

## Verification

- Planned: test `save_encounter_draft` + `submit_encounter` with a real encounter carrying medications and lab orders
- Planned: verify lab ordering against v16 Healthcare (`lab_test_prescription` child vs. `Service Request`)
- Completed: none (pre-implementation)
- Remaining: full encounter loop from `call_next` → complete → print

## Next Session Start

Read:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `ARCHITECTURE.md`
4. `CONTEXT_INDEX.md`
5. this note

Then verify:

- `clinic_flow/api/workspace.py`
- `clinic_flow/clinic_flow/page/doctor_workspace_v2/doctor_workspace_v2.js`
- `clinic_flow/api/patient_data.py`
- Healthcare v16 `Patient Encounter` schema for `drug_prescription` and `lab_test_prescription` child fields
