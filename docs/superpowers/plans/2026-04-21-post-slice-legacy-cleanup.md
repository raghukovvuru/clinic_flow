# Post-Slice Legacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove or quarantine legacy code that became obsolete after Slices 1–3 without breaking the active receptionist, arrival, and doctor-facing runtime.

**Architecture:** Treat this as a cleanup slice, not a behavior-redesign slice. Remove the old prebooked-slot release runtime, align project docs with the new authority model, and isolate or retire the appointment-centric receptionist compatibility stack only after verifying no active callers remain. Defer doctor-side `queue_type` removal and encounter fallback changes until the dedicated queue-movement redesign.

**Tech Stack:** Frappe v16, Python 3.11, desk page JS, pytest/Frappe IntegrationTestCase, Clinic Flow scheduler/APIs/pages

---

## File Map for This Cleanup

- Modify: `clinic_flow/hooks.py`
  Purpose: remove the obsolete prebooked-slot cron hook so only the Slice 3 midnight rollover remains active.

- Modify: `clinic_flow/queue/scheduler.py`
  Purpose: delete the old prebooked-slot release function and keep only the midnight phone quota release logic.

- Modify: `AGENTS.md`
  Purpose: remove stale instructions that still describe QueueMixin and `record_payment_and_checkin()` as active runtime authority.

- Modify: `ARCHITECTURE.md`
  Purpose: align the system-design reference with the post-Slice-3 runtime truth.

- Modify: `docs/healthcare-compatibility-audit.md`
  Purpose: update the Healthcare-boundary doc if it still implies appointment-driven queue creation or old queue custom-field ownership.

- Modify: `clinic_flow/api/appointments.py`
  Purpose: quarantine or retire legacy receptionist APIs that are no longer part of the active product direction.

- Modify: `clinic_flow/clinic_flow/page/receptionist_workspace/receptionist_workspace.js`
  Purpose: either hard-mark the page as compatibility-only or retire it if no supported callers remain.

- Delete or tombstone: `clinic_flow/queue/appointment_mixin.py`
  Purpose: remove the dead QueueMixin body after verifying no imports still require it.

- Add: `clinic_flow/tests/test_post_slice_legacy_cleanup.py`
  Purpose: lock the intended cleanup invariants so the branch does not regress back into the old runtime model.

---

## Scope Buckets

### Remove Now

- obsolete `release_prebooked_slots` scheduler runtime
- stale documentation that still claims QueueMixin or appointment check-in drives queue entry creation
- dead QueueMixin code, once import/caller verification is complete

### Quarantine Next

- `receptionist_workspace`
- `clinic_flow/api/appointments.py` booking/check-in APIs that still depend on `queue_type`, `custom_queue_type`, `custom_queue_token`, and `Appointment Type.custom_queue_code`

### Defer

- `clinic_flow/api/queue.py` doctor/runtime payload migration away from `queue_type`
- doctor and TV-display compatibility code
- encounter creation fallback via `Appointment Type.custom_queue_code`
- full removal of `dept_abbr` fallback
- removal of legacy session counters and `rr_state`

This plan implements only the first two buckets. The defer bucket belongs to the future doctor/live-queue redesign slice.

---

### Task 1: Lock the Cleanup Boundaries with Tests

**Files:**
- Create: `clinic_flow/tests/test_post_slice_legacy_cleanup.py`
- Test: `clinic_flow/tests/test_post_slice_legacy_cleanup.py`

- [ ] **Step 1: Write the failing cleanup-boundary tests**

```python
from pathlib import Path

import frappe
from frappe.model.base_document import get_controller
from frappe.tests import IntegrationTestCase


class TestPostSliceLegacyCleanup(IntegrationTestCase):
    def test_patient_appointment_controller_is_not_extended(self):
        controller = get_controller("Patient Appointment")
        mro_names = {cls.__name__ for cls in controller.__mro__}
        self.assertNotIn("QueueMixin", mro_names)

    def test_scheduler_keeps_only_midnight_phone_rollover_hook(self):
        hooks = frappe.get_hooks("scheduler_events")[0]
        cron = hooks.get("cron", {})
        self.assertIn("0 0 * * *", cron)
        self.assertNotIn("*/5 * * * *", cron)

    def test_legacy_record_payment_and_checkin_is_not_active_runtime(self):
        source = Path(frappe.get_app_path("clinic_flow")) / "clinic_flow" / "api" / "appointments.py"
        content = source.read_text()
        self.assertIn("Legacy compatibility path only", content)
```

- [ ] **Step 2: Run the cleanup-boundary tests**

Run:

```bash
pytest clinic_flow/tests/test_post_slice_legacy_cleanup.py -v
```

Expected:

- FAIL because the old scheduler hook is still present and any stale cleanup assumptions are not yet enforced

- [ ] **Step 3: Keep the tests narrow**

Do not add assertions that require the doctor-side runtime to stop using `queue_type` yet. This file should only lock what this cleanup slice actually changes.

- [ ] **Step 4: Re-run the test file to confirm only intended failures remain**

Run:

```bash
pytest clinic_flow/tests/test_post_slice_legacy_cleanup.py -v
```

Expected:

- failures point only to cleanup work in the scheduler/docs/legacy receptionist stack

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/tests/test_post_slice_legacy_cleanup.py
git commit -m "test: lock post-slice legacy cleanup boundaries"
```

---

### Task 2: Remove the Obsolete Prebooked Release Runtime

**Files:**
- Modify: `clinic_flow/hooks.py`
- Modify: `clinic_flow/queue/scheduler.py`
- Test: `clinic_flow/tests/test_post_slice_legacy_cleanup.py`
- Test: `clinic_flow/tests/test_slice3_midnight_rollover.py`

- [ ] **Step 1: Remove the old cron hook from `clinic_flow/hooks.py`**

Keep only the midnight rollover cron entry:

```python
scheduler_events = {
	"cron": {
		"0 0 * * *": [
			"clinic_flow.queue.scheduler.release_phone_quota_at_midnight"
		],
	}
}
```

- [ ] **Step 2: Delete `release_prebooked_slots()` from `clinic_flow/queue/scheduler.py`**

The file should keep only the midnight rollover helper and its imports:

```python
import frappe
from frappe.utils import today


def release_phone_quota_at_midnight() -> None:
	...
```

Do not leave the old function commented out or tombstoned in-place.

- [ ] **Step 3: Remove stale comments that still describe near-session prebooked release**

Target comments and docstrings in:

- `clinic_flow/hooks.py`
- `clinic_flow/queue/scheduler.py`

The remaining scheduler narrative should only describe midnight phone-to-walkin release.

- [ ] **Step 4: Run targeted scheduler tests**

Run:

```bash
pytest clinic_flow/tests/test_post_slice_legacy_cleanup.py -v
pytest clinic_flow/tests/test_slice3_midnight_rollover.py -v
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/hooks.py clinic_flow/queue/scheduler.py clinic_flow/tests/test_post_slice_legacy_cleanup.py
git commit -m "refactor: remove obsolete prebooked slot release runtime"
```

---

### Task 3: Correct Stale Project Instructions and Architecture Docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/healthcare-compatibility-audit.md`

- [ ] **Step 1: Remove stale QueueMixin instructions from `AGENTS.md`**

Delete or rewrite statements that say:

- use `extend_doctype_class` for `Patient Appointment` behavior
- `record_payment_and_checkin()` must preserve `QueueMixin.on_update()` side effects
- `QueueMixin.on_update()` is a current high-risk queue-entry creation path

Replace them with statements consistent with Slices 1–3:

- `Patient Appointment` is an integration anchor
- Queue Entry creation belongs to Clinic Flow admission
- `record_payment_and_checkin()` is compatibility-only

- [ ] **Step 2: Correct contradictory architecture statements in `ARCHITECTURE.md`**

Remove statements that still claim:

```text
Patient Appointment.status = "Checked In" -> QueueMixin.on_update() -> create queue entry
```

Replace with language consistent with the active runtime:

```text
Admission creates Queue Entry directly.
Arrival is operational-only.
Receptionist check-in is the only eligibility gate to Ready Near Doctor.
Patient Appointment is synced downstream as an integration anchor.
```

- [ ] **Step 3: Update `docs/healthcare-compatibility-audit.md` if it still implies old ownership**

Specifically remove or rewrite any section that still presents these as active authority:

- `Appointment Type.custom_queue_code`
- `Patient Appointment.custom_queue_type`
- `Patient Appointment.custom_queue_token`
- QueueMixin-driven check-in behavior

Retain compatibility-history notes only where they are still true for existing sites.

- [ ] **Step 4: Verify docs do not contradict the code anymore**

Run:

```bash
rg -n "QueueMixin.on_update|extend_doctype_class|record_payment_and_checkin|custom_queue_type|custom_queue_token" AGENTS.md ARCHITECTURE.md docs/healthcare-compatibility-audit.md
```

Expected:

- either no hits for stale authority claims, or only compatibility-history wording that is clearly marked as legacy

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md ARCHITECTURE.md docs/healthcare-compatibility-audit.md
git commit -m "docs: align project instructions with post-slice runtime"
```

---

### Task 4: Verify Whether the Legacy Receptionist Stack Can Be Retired

**Files:**
- Modify: `clinic_flow/api/appointments.py`
- Modify: `clinic_flow/clinic_flow/page/receptionist_workspace/receptionist_workspace.js`
- Test: `clinic_flow/tests/test_post_slice_legacy_cleanup.py`

- [ ] **Step 1: Find all remaining callers of the legacy receptionist APIs**

Run:

```bash
rg -n "clinic_flow\\.api\\.appointments\\.(get_availability|book_appointment|record_payment_and_checkin|get_patient_appointments|get_todays_appointments)" clinic_flow
```

Expected:

- exact list of pages/modules that still depend on those APIs

- [ ] **Step 2: If the only remaining product caller is `receptionist_workspace`, mark it compatibility-only in code comments**

Add a top-level comment in `clinic_flow/clinic_flow/page/receptionist_workspace/receptionist_workspace.js`:

```javascript
// Legacy compatibility page.
// Active receptionist operations live in receptionist_dashboard.
// Do not extend this page for new product work.
```

Do not redesign the page here.

- [ ] **Step 3: Reduce `clinic_flow/api/appointments.py` to the minimal compatibility surface**

If caller verification confirms only the legacy workspace still uses the following functions, keep them but clearly quarantine them in a compatibility section:

- `get_availability()`
- `book_appointment()`
- `record_payment_and_checkin()`
- `get_patient_appointments()`
- `get_todays_appointments()`

Add a module comment like:

```python
"""
Legacy appointment-centric receptionist compatibility APIs.

Active receptionist flow lives in admission.py, arrival.py, and queue.complete_reception().
Do not add new product behavior here.
"""
```

If caller verification shows zero supported callers, remove the unused functions instead of just labeling them.

- [ ] **Step 4: Re-run caller scan and smoke tests**

Run:

```bash
rg -n "clinic_flow\\.api\\.appointments\\.(get_availability|book_appointment|record_payment_and_checkin|get_patient_appointments|get_todays_appointments)" clinic_flow
pytest clinic_flow/tests/test_post_slice_legacy_cleanup.py -v
```

Expected:

- remaining callers, if any, are intentional compatibility-only references
- tests PASS

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/api/appointments.py clinic_flow/clinic_flow/page/receptionist_workspace/receptionist_workspace.js clinic_flow/tests/test_post_slice_legacy_cleanup.py
git commit -m "refactor: quarantine legacy receptionist appointment stack"
```

---

### Task 5: Remove the Dead QueueMixin Module

**Files:**
- Delete or reduce: `clinic_flow/queue/appointment_mixin.py`
- Modify: `clinic_flow/tests/test_post_slice_legacy_cleanup.py`
- Test: `clinic_flow/tests/test_healthcare_compatibility.py`

- [ ] **Step 1: Verify no runtime imports still require `appointment_mixin.py`**

Run:

```bash
rg -n "appointment_mixin|QueueMixin" clinic_flow
```

Expected:

- references exist only in compatibility history, tests, or stale docs

- [ ] **Step 2: Remove the module if nothing imports it**

Delete:

```text
clinic_flow/queue/appointment_mixin.py
```

If a narrow import-compatibility shim is still required, replace the file with a tombstone module containing only:

```python
"""
QueueMixin was retired after Slice 1.

Queue Entry creation no longer hangs off Patient Appointment lifecycle hooks.
"""
```

Do not keep the old slot enforcement, session creation, or queue-entry creation code.

- [ ] **Step 3: Update tests if they reference the old module directly**

Keep assertions focused on behavior:

- Patient Appointment controller is not extended
- legacy hook-driven queue creation is gone

Do not require the file path itself to exist unless you intentionally keep a tombstone module.

- [ ] **Step 4: Run compatibility tests**

Run:

```bash
pytest clinic_flow/tests/test_post_slice_legacy_cleanup.py -v
pytest clinic_flow/tests/test_healthcare_compatibility.py -v
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add clinic_flow/tests/test_post_slice_legacy_cleanup.py clinic_flow/tests/test_healthcare_compatibility.py
git rm -f clinic_flow/queue/appointment_mixin.py
git commit -m "refactor: remove dead queue mixin compatibility code"
```

If you keep a tombstone module instead of deleting the file, use:

```bash
git add clinic_flow/queue/appointment_mixin.py clinic_flow/tests/test_post_slice_legacy_cleanup.py clinic_flow/tests/test_healthcare_compatibility.py
git commit -m "refactor: retire queue mixin implementation"
```

---

## Explicitly Deferred Items

Do **not** include these in this cleanup branch:

- migrating `clinic_flow/api/queue.py` payloads away from `queue_type`
- removing `current_queue_type` from doctor and TV-display payloads
- rewriting `doctor_workspace` or `queue-dashboard`
- removing `Appointment Type.custom_queue_code` fallback in encounter creation
- removing `dept_abbr` fallback from service-point resolution
- removing `prebooked_total`, `followup_total`, `prebooked_used`, `followup_used`, or `rr_state`

Those changes belong to the future live queue movement / doctor-side redesign.

---

## Verification Matrix

Run the full targeted verification set before claiming the cleanup complete:

```bash
pytest clinic_flow/tests/test_post_slice_legacy_cleanup.py -v
pytest clinic_flow/tests/test_slice3_midnight_rollover.py -v
pytest clinic_flow/tests/test_healthcare_compatibility.py -v
```

If the legacy receptionist compatibility stack was changed materially, also run:

```bash
pytest clinic_flow/tests/test_slice1_operational_authority.py -v
pytest clinic_flow/tests/test_slice3_checkin_boundary.py -v
```

---

## Self-Review

- Spec coverage:
  - removes the obsolete scheduler runtime
  - aligns docs with Slices 1–3
  - quarantines or retires the old receptionist appointment stack
  - removes the dead QueueMixin body
  - explicitly defers doctor/runtime redesign debt

- Placeholder scan:
  - no `TODO`/`TBD`
  - each task has exact files, commands, and expected outcomes

- Type consistency:
  - uses the existing post-slice terminology: admission, arrival, complete reception, integration anchor, compatibility-only

Plan complete and saved to `docs/superpowers/plans/2026-04-21-post-slice-legacy-cleanup.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
