# Arrival-Gated Special Reception SLA Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-owned special reception SLA alerts and reception-call audit support for arrived special patients without changing token assignment, emergency behavior, doctor dequeue behavior, or the unified queue lifecycle.

**Architecture:** Extend the active queue/reception authority in `clinic_flow/api/queue.py` and native DocType JSON. `Queue Entry` remains the operational source of truth; special reception is a recommendation layer over `status = "Arrived"` and `priority = "special"`, not a new queue or automatic state transition. Config lives on the existing `Slot Partition Config` Single DocType and is returned in `get_live_session_state()` so the frontend can render the policy without duplicating backend rules.

**Tech Stack:** Frappe v16, Python 3.11, native DocType JSON, whitelisted APIs with full type annotations, `IntegrationTestCase`, `bench --site site1.localhost run-tests`, git worktrees, docs sync notes, `graphify update .`

---

## Source Inputs

- Spec: `docs/superpowers/specs/2026-04-26-arrival-gated-special-reception-sla-design.md`
- Required context: `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CONTEXT_INDEX.md`
- Focused policy docs: `docs/receptionist-backend-policy.md`, `docs/service-point-policy.md`, `docs/token-display-policy.md`, `docs/healthcare-compatibility-audit.md`
- Process docs: `docs/git-workflow-guide.md`, `docs/notes/README.md`, `docs/runbooks/local-setup-and-verification.md`
- Graph context: `graphify-out/GRAPH_REPORT.md`
- Runtime files inspected for this plan: `clinic_flow/api/queue.py`, `clinic_flow/api/admission.py`, `clinic_flow/queue/engine.py`, `clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json`, `clinic_flow/clinic_flow/doctype/slot_partition_config/slot_partition_config.json`, `clinic_flow/tests/test_slice3_checkin_boundary.py`, `clinic_flow/tests/test_special_overflow_admission.py`, `clinic_flow/tests/test_healthcare_compatibility.py`

## Scope

In scope:

- Add backend configuration fields to `Slot Partition Config` under `Live Queue - v2`.
- Add generic reception-call audit fields to `Queue Entry`.
- Extend `get_live_session_state(queue_session)` with `special_reception_policy`, `special_reception_alerts`, and `recommended_reception_call`.
- Extend `call_to_reception()` with public/private call mode, private reason validation, and persisted audit metadata.
- Add backend tests for eligibility, SLA thresholds, gap opportunity, guardrail blocking, public/private persistence, and doctor special override isolation.
- Update implementation notes and core/policy docs after behavior changes.

Out of scope:

- No fixed special token bands.
- No reserved token buckets.
- No token renumbering.
- No ETA rewrite.
- No automatic transition from `Arrived` to `Called`.
- No automatic transition from `Ready Near Doctor` to `With Doctor`.
- No emergency behavior changes.
- No doctor workspace behavior changes.
- No public special label.
- No frontend implementation for the receptionist alert rail.
- No base app edits under `apps/healthcare/`.

## File Structure

- Modify: `clinic_flow/clinic_flow/doctype/slot_partition_config/slot_partition_config.json`
  - Add Single DocType config fields for warning, escalation, target, gap lookahead, and max consecutive special reception calls.
- Modify: `clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json`
  - Add backend-owned reception-call audit fields inside the existing reception stage section.
- Modify: `clinic_flow/api/queue.py`
  - Add pure helper functions for special reception policy and recommendations.
  - Extend `call_to_reception()` signature and persistence.
  - Extend `get_live_session_state()` payload and entry fields.
- Create: `clinic_flow/tests/test_special_reception_sla.py`
  - Focused integration tests for this backend slice.
- Modify: `ARCHITECTURE.md`
  - Document special reception as a third special boundary after admission and before doctor-side special override.
- Modify: `docs/receptionist-backend-policy.md`
  - Add reception-stage special SLA rules and backend/frontend ownership split.
- Modify: `docs/token-display-policy.md`
  - Document public/private reception call display policy and no public special label.
- Create: `docs/notes/special-reception-sla-backend.md`
  - Implementation summary note with changed behavior, verification, out-of-scope items, and next integration step.
- Do not modify: `clinic_flow/queue/engine.py`
  - Existing doctor-side `get_next_special_token()` already restricts `Call Next Special` to `Ready Near Doctor` entries.
- Do not modify: `clinic_flow/api/admission.py`
  - Special overflow admission is already landed; this slice starts after arrival.
- Do not modify: `clinic_flow/patches.txt`
  - Native DocType JSON migration is sufficient because the new fields belong to Clinic Flow DocTypes, not upstream Healthcare DocTypes.

---

### Task 1: Create Isolated Backend Worktree and Baseline

**Files:**

- Verify: `/home/raghu/frappe-bench/apps/clinic_flow`
- Create worktree: `.worktrees/backend-special-reception-sla`

- [ ] **Step 1: Verify current branch and ignored worktree directory**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git status --short --branch
```

Expected:

```text
## backend/receptionist-queue-refactor
```

The `git check-ignore` command should exit 0 with no output. If it fails, stop and add `.worktrees/` to `.gitignore` in a separate `docs` or `ops` hygiene commit before creating a project-local worktree.

- [ ] **Step 2: Create the backend branch worktree**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
```

Expected:

```text
Preparing worktree (new branch 'backend/special-reception-sla')
```

- [ ] **Step 3: Continue all implementation inside the worktree**

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow/.worktrees/backend-special-reception-sla
```

Expected:

```text
## backend/special-reception-sla
```

- [ ] **Step 4: Read the authority and focused docs before editing**

Run:

```bash
grep -n "receptionist_dashboard\|Service Point\|Documentation Update Policy" CLAUDE.md AGENTS.md ARCHITECTURE.md CONTEXT_INDEX.md docs/receptionist-backend-policy.md docs/token-display-policy.md docs/service-point-policy.md docs/healthcare-compatibility-audit.md docs/git-workflow-guide.md docs/notes/README.md
```

Expected: matching lines confirming active receptionist direction, service-point/token policy, git scope guidance, and docs sync requirements.

- [ ] **Step 5: Run the existing boundary tests as baseline**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_healthcare_compatibility --test test_call_next_special_uses_oldest_ready_special_without_reordering
```

Expected: all listed tests pass. If they fail before edits, stop and record the failure as pre-existing before continuing.

---

### Task 2: Add Failing Schema and API Shape Tests

**Files:**

- Create: `clinic_flow/tests/test_special_reception_sla.py`
- No implementation changes in this task.

- [ ] **Step 1: Create the initial failing tests**

Create `clinic_flow/tests/test_special_reception_sla.py` with this content:

```python
import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime, today


class TestSpecialReceptionSLA(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self._ensure_gender("Male")
        config = frappe.get_single("Slot Partition Config")
        config.special_reception_warning_minutes = 10
        config.special_reception_escalation_minutes = 12
        config.special_reception_target_minutes = 15
        config.special_gap_lookahead_tokens = 3
        config.max_consecutive_special_reception_calls = 2
        config.save(ignore_permissions=True)

    def test_slot_partition_config_has_special_reception_fields(self):
        meta = frappe.get_meta("Slot Partition Config")

        self.assertTrue(meta.has_field("special_reception_warning_minutes"))
        self.assertTrue(meta.has_field("special_reception_escalation_minutes"))
        self.assertTrue(meta.has_field("special_reception_target_minutes"))
        self.assertTrue(meta.has_field("special_gap_lookahead_tokens"))
        self.assertTrue(meta.has_field("max_consecutive_special_reception_calls"))

    def test_queue_entry_has_reception_call_audit_fields(self):
        meta = frappe.get_meta("Queue Entry")

        self.assertTrue(meta.has_field("called_to_reception_by"))
        self.assertTrue(meta.has_field("reception_call_mode"))
        self.assertTrue(meta.has_field("private_reception_call_reason"))
        self.assertTrue(meta.has_field("reception_recommendation_reason"))

    def test_live_state_returns_policy_shape(self):
        session = self.make_queue_session()

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["special_reception_policy"]["warning_minutes"], 10)
        self.assertEqual(payload["special_reception_policy"]["escalation_minutes"], 12)
        self.assertEqual(payload["special_reception_policy"]["target_minutes"], 15)
        self.assertEqual(payload["special_reception_policy"]["gap_lookahead_tokens"], 3)
        self.assertEqual(payload["special_reception_policy"]["max_consecutive_special_calls"], 2)
        self.assertEqual(payload["special_reception_alerts"], [])
        self.assertIsNone(payload["recommended_reception_call"])

    def _ensure_gender(self, gender_name: str) -> str:
        if frappe.db.exists("Gender", gender_name):
            return gender_name
        return frappe.get_doc({"doctype": "Gender", "gender": gender_name}).insert().name

    def make_service_point(self):
        code = f"SR{frappe.generate_hash(length=5).upper()}"
        return frappe.get_doc({
            "doctype": "Service Point",
            "queue_code": code,
            "display_label": f"Special Reception {code}",
            "category": "consult",
            "is_active": 1,
        }).insert(ignore_permissions=True)

    def make_practitioner(self):
        return frappe.get_doc({
            "doctype": "Healthcare Practitioner",
            "first_name": f"SLA Prac {frappe.generate_hash(length=4)}",
            "gender": "Male",
        }).insert(ignore_permissions=True)

    def make_patient(self):
        return frappe.get_doc({
            "doctype": "Patient",
            "first_name": "Special",
            "last_name": f"Reception {frappe.generate_hash(length=4)}",
            "sex": "Male",
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_queue_session(self):
        sp = self.make_service_point()
        practitioner = self.make_practitioner()
        return frappe.get_doc({
            "doctype": "Queue Session",
            "session_name": f"Special Reception Session {frappe.generate_hash(length=4)}",
            "practitioner": practitioner.name,
            "session_date": today(),
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "service_point": sp.name,
            "dept_abbr": sp.queue_code,
            "session_capacity": 20,
            "planned_capacity": 20,
            "stretch_capacity": 20,
            "status": "Active",
        }).insert(ignore_permissions=True)

    def make_entry(
        self,
        session,
        token_number: int,
        status: str = "Booked",
        priority: str = "normal",
        arrived_minutes_ago: int | None = None,
        called_minutes_ago: int | None = None,
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
            "channel": "walkin",
            "load_class": "non_review_load",
            "patient_type": "new",
            "priority": priority,
            "queue_type": "WALK_IN",
            "status": status,
            "issued_by": frappe.session.user,
            "issued_by_role": "Queue Manager",
        }).insert(ignore_permissions=True)

        updates = {}
        if arrived_minutes_ago is not None:
            updates["arrived_at"] = add_to_date(now_datetime(), minutes=-arrived_minutes_ago)
        if called_minutes_ago is not None:
            updates["called_to_reception_at"] = add_to_date(now_datetime(), minutes=-called_minutes_ago)
        if updates:
            frappe.db.set_value("Queue Entry", entry.name, updates)
            entry = frappe.get_doc("Queue Entry", entry.name)
        return entry
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_slot_partition_config_has_special_reception_fields
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_queue_entry_has_reception_call_audit_fields
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_live_state_returns_policy_shape
```

Expected: each test fails because the new config fields, Queue Entry audit fields, and live payload keys do not exist yet.

- [ ] **Step 3: Commit only the failing test scaffold if the branch policy allows red commits**

Preferred for this repo: do not commit red tests alone. Keep the file unstaged until Task 3 makes schema tests pass.

---

### Task 3: Add Config and Queue Entry Audit Fields

**Files:**

- Modify: `clinic_flow/clinic_flow/doctype/slot_partition_config/slot_partition_config.json`
- Modify: `clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json`
- Test: `clinic_flow/tests/test_special_reception_sla.py`

- [ ] **Step 1: Add Slot Partition Config field order entries**

In `clinic_flow/clinic_flow/doctype/slot_partition_config/slot_partition_config.json`, update `field_order` after `no_response_hold_count`:

```json
   "live_queue_section",
   "no_response_hold_count",
   "special_reception_warning_minutes",
   "special_reception_escalation_minutes",
   "special_reception_target_minutes",
   "special_gap_lookahead_tokens",
   "max_consecutive_special_reception_calls"
```

- [ ] **Step 2: Add Slot Partition Config field definitions**

In the same file, add these field objects immediately after the existing `no_response_hold_count` object:

```json
  {
   "default": "10",
   "fieldname": "special_reception_warning_minutes",
   "fieldtype": "Int",
   "label": "Special Reception Warning (minutes)",
   "description": "Elapsed arrival time before an arrived special patient enters warning state."
  },
  {
   "default": "12",
   "fieldname": "special_reception_escalation_minutes",
   "fieldtype": "Int",
   "label": "Special Reception Escalation (minutes)",
   "description": "Elapsed arrival time before an arrived special patient enters escalation state."
  },
  {
   "default": "15",
   "fieldname": "special_reception_target_minutes",
   "fieldtype": "Int",
   "label": "Special Reception Target (minutes)",
   "description": "Target maximum elapsed arrival time for special reception handling."
  },
  {
   "default": "3",
   "fieldname": "special_gap_lookahead_tokens",
   "fieldtype": "Int",
   "label": "Special Gap Lookahead Tokens",
   "description": "How many upcoming normal tokens to inspect for one non-arrival gap."
  },
  {
   "default": "2",
   "fieldname": "max_consecutive_special_reception_calls",
   "fieldtype": "Int",
   "label": "Max Consecutive Special Reception Calls",
   "description": "Maximum special reception calls in a row while normal arrived patients are waiting."
  }
```

- [ ] **Step 3: Add Queue Entry audit field order entries**

In `clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json`, update `field_order` inside the reception stage section after `called_to_reception_at`:

```json
   "called_to_reception_at",
   "called_to_reception_by",
   "reception_call_mode",
   "private_reception_call_reason",
   "reception_recommendation_reason",
   "no_response_at",
```

- [ ] **Step 4: Add Queue Entry audit field definitions**

In the same file, add these field objects immediately after the existing `called_to_reception_at` field object:

```json
  {
   "fieldname": "called_to_reception_by",
   "fieldtype": "Link",
   "label": "Called to Reception By",
   "options": "User",
   "read_only": 1
  },
  {
   "default": "Public",
   "fieldname": "reception_call_mode",
   "fieldtype": "Select",
   "label": "Reception Call Mode",
   "options": "\nPublic\nPrivate",
   "read_only": 1,
   "description": "Public calls may be announced; private calls are operational only and should be suppressed on public displays."
  },
  {
   "fieldname": "private_reception_call_reason",
   "fieldtype": "Small Text",
   "label": "Private Reception Call Reason",
   "read_only": 1
  },
  {
   "fieldname": "reception_recommendation_reason",
   "fieldtype": "Select",
   "label": "Reception Recommendation Reason",
   "options": "\ngap\nwarning\nescalation\ntarget_breach\nmanual",
   "read_only": 1,
   "description": "Backend recommendation reason snapshot captured when the patient was called to reception."
  }
```

- [ ] **Step 5: Reload DocType schema**

Run:

```bash
bench --site site1.localhost migrate
```

Expected: migration completes without DocType JSON errors.

- [ ] **Step 6: Run schema tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_slot_partition_config_has_special_reception_fields
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_queue_entry_has_reception_call_audit_fields
```

Expected: both tests pass.

- [ ] **Step 7: Commit schema changes**

Run:

```bash
git status --short
```

---

### Task 4: Add Live State Recommendation Tests

**Files:**

- Modify: `clinic_flow/tests/test_special_reception_sla.py`
- No implementation changes in this task.

- [ ] **Step 1: Add eligibility and SLA alert tests**

Append these test methods to `TestSpecialReceptionSLA` before the helper methods:

```python
    def test_booked_special_is_ignored_by_special_reception_sla(self):
        session = self.make_queue_session()
        special = self.make_entry(session, token_number=5, status="Booked", priority="special")

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["special_reception_alerts"], [])
        self.assertIsNone(payload["recommended_reception_call"])
        self.assertEqual(frappe.db.get_value("Queue Entry", special.name, "status"), "Booked")

    def test_arrived_normal_is_not_included_in_special_reception_alerts(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=14)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["special_reception_alerts"], [])
        self.assertIsNone(payload["recommended_reception_call"])

    def test_arrived_special_appears_in_alert_payload(self):
        session = self.make_queue_session()
        special = self.make_entry(session, token_number=9, status="Arrived", priority="special", arrived_minutes_ago=5)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        alert = payload["special_reception_alerts"][0]

        self.assertEqual(alert["queue_entry"], special.name)
        self.assertEqual(alert["token_number"], 9)
        self.assertEqual(alert["token"], special.token)
        self.assertEqual(alert["patient"], special.patient)
        self.assertEqual(alert["patient_name"], special.patient_name)
        self.assertEqual(alert["sla_state"], "normal")
        self.assertEqual(alert["recommendation_reason"], "manual")
        self.assertTrue(alert["can_call_now"])
        self.assertFalse(alert["guardrail_blocked"])

    def test_sla_warning_escalation_and_target_breach_are_computed_from_arrived_at(self):
        session = self.make_queue_session()
        warning = self.make_entry(session, token_number=10, status="Arrived", priority="special", arrived_minutes_ago=10)
        escalation = self.make_entry(session, token_number=11, status="Arrived", priority="special", arrived_minutes_ago=12)
        target = self.make_entry(session, token_number=12, status="Arrived", priority="special", arrived_minutes_ago=16)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)
        states = {row["queue_entry"]: row["sla_state"] for row in payload["special_reception_alerts"]}
        reasons = {row["queue_entry"]: row["recommendation_reason"] for row in payload["special_reception_alerts"]}

        self.assertEqual(states[warning.name], "warning")
        self.assertEqual(states[escalation.name], "escalation")
        self.assertEqual(states[target.name], "target_breach")
        self.assertEqual(reasons[warning.name], "warning")
        self.assertEqual(reasons[escalation.name], "escalation")
        self.assertEqual(reasons[target.name], "target_breach")
```

- [ ] **Step 2: Add gap recommendation test**

Append this test method:

```python
    def test_one_missing_normal_token_in_lookahead_creates_gap_recommendation(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=66, status="Booked", priority="normal")
        self.make_entry(session, token_number=67, status="Arrived", priority="normal", arrived_minutes_ago=2)
        self.make_entry(session, token_number=68, status="Arrived", priority="normal", arrived_minutes_ago=2)
        special = self.make_entry(session, token_number=89, status="Arrived", priority="special", arrived_minutes_ago=5)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["recommended_reception_call"]["queue_entry"], special.name)
        self.assertEqual(payload["recommended_reception_call"]["kind"], "special")
        self.assertEqual(payload["recommended_reception_call"]["reason"], "gap")
        self.assertIn("token 66", payload["recommended_reception_call"]["message"])
        alert = payload["special_reception_alerts"][0]
        self.assertEqual(alert["recommendation_reason"], "gap")
        self.assertTrue(alert["can_call_now"])
```

- [ ] **Step 3: Add consecutive special guardrail tests**

Append these test methods:

```python
    def test_max_consecutive_special_calls_blocks_when_normal_arrived_patients_are_available(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=3)
        self.make_entry(session, token_number=20, status="Called", priority="special", called_minutes_ago=2)
        self.make_entry(session, token_number=21, status="Called", priority="special", called_minutes_ago=1)
        candidate = self.make_entry(session, token_number=22, status="Arrived", priority="special", arrived_minutes_ago=13)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)
        alert = next(row for row in payload["special_reception_alerts"] if row["queue_entry"] == candidate.name)

        self.assertFalse(alert["can_call_now"])
        self.assertTrue(alert["guardrail_blocked"])
        self.assertIsNone(payload["recommended_reception_call"])

    def test_max_consecutive_special_calls_does_not_block_when_no_normal_arrived_patient_is_available(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=1, status="Booked", priority="normal")
        self.make_entry(session, token_number=20, status="Called", priority="special", called_minutes_ago=2)
        self.make_entry(session, token_number=21, status="Called", priority="special", called_minutes_ago=1)
        candidate = self.make_entry(session, token_number=22, status="Arrived", priority="special", arrived_minutes_ago=13)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)
        alert = next(row for row in payload["special_reception_alerts"] if row["queue_entry"] == candidate.name)

        self.assertTrue(alert["can_call_now"])
        self.assertFalse(alert["guardrail_blocked"])
        self.assertEqual(payload["recommended_reception_call"]["queue_entry"], candidate.name)
```

- [ ] **Step 4: Run the new live-state tests and verify they fail**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_booked_special_is_ignored_by_special_reception_sla
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_arrived_normal_is_not_included_in_special_reception_alerts
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_arrived_special_appears_in_alert_payload
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_sla_warning_escalation_and_target_breach_are_computed_from_arrived_at
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_one_missing_normal_token_in_lookahead_creates_gap_recommendation
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_max_consecutive_special_calls_blocks_when_normal_arrived_patients_are_available
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_max_consecutive_special_calls_does_not_block_when_no_normal_arrived_patient_is_available
```

Expected: tests fail because `get_live_session_state()` does not compute special reception state yet.

---

### Task 5: Implement Backend Recommendation Helpers

**Files:**

- Modify: `clinic_flow/api/queue.py`
- Test: `clinic_flow/tests/test_special_reception_sla.py`

- [ ] **Step 1: Add special reception helper functions**

In `clinic_flow/api/queue.py`, add these helpers after `_emergency_count()` and before the first whitelisted function:

```python
def _special_reception_policy() -> dict:
	config = frappe.get_single("Slot Partition Config")
	return {
		"warning_minutes": int(config.special_reception_warning_minutes or 10),
		"escalation_minutes": int(config.special_reception_escalation_minutes or 12),
		"target_minutes": int(config.special_reception_target_minutes or 15),
		"gap_lookahead_tokens": int(config.special_gap_lookahead_tokens or 3),
		"max_consecutive_special_calls": int(config.max_consecutive_special_reception_calls or 2),
	}


def _special_reception_sla_state(elapsed_minutes: int, policy: dict) -> str:
	if elapsed_minutes >= policy["target_minutes"]:
		return "target_breach"
	if elapsed_minutes >= policy["escalation_minutes"]:
		return "escalation"
	if elapsed_minutes >= policy["warning_minutes"]:
		return "warning"
	return "normal"


def _special_reception_gap(queue_session: str, lookahead_tokens: int) -> dict | None:
	rows = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": queue_session,
			"priority": ["in", ["", "normal"]],
			"status": ["in", ["Booked", "Waiting", "Arrived"]],
		},
		fields=["name", "token", "token_number", "status"],
		order_by="token_number asc",
		limit=max(1, int(lookahead_tokens or 3)),
	)
	for row in rows:
		if row.status != "Arrived":
			return dict(row)
	return None


def _normal_arrived_patient_available(queue_session: str) -> bool:
	return bool(
		frappe.db.count(
			"Queue Entry",
			{
				"queue_session": queue_session,
				"priority": ["in", ["", "normal"]],
				"status": "Arrived",
			},
		)
	)


def _consecutive_special_reception_calls(queue_session: str) -> int:
	rows = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": queue_session,
			"called_to_reception_at": ["is", "set"],
		},
		fields=["name", "priority", "called_to_reception_at"],
		order_by="called_to_reception_at desc",
		limit=20,
	)
	count = 0
	for row in rows:
		if row.priority == "special":
			count += 1
		else:
			break
	return count


def _special_reception_state(queue_session: str) -> dict:
	policy = _special_reception_policy()
	gap = _special_reception_gap(queue_session, policy["gap_lookahead_tokens"])
	guardrail_blocked = (
		_consecutive_special_reception_calls(queue_session) >= policy["max_consecutive_special_calls"]
		and _normal_arrived_patient_available(queue_session)
	)

	rows = frappe.get_all(
		"Queue Entry",
		filters={
			"queue_session": queue_session,
			"priority": "special",
			"status": "Arrived",
		},
		fields=[
			"name", "token", "token_number", "patient", "patient_name",
			"arrived_at", "creation",
		],
		order_by="arrived_at asc, creation asc",
	)

	now = now_datetime()
	alerts = []
	for row in rows:
		arrived_at = get_datetime(row.arrived_at) if row.arrived_at else get_datetime(row.creation)
		elapsed = max(0, int((now - arrived_at).total_seconds() // 60))
		sla_state = _special_reception_sla_state(elapsed, policy)
		reason = "manual"
		if gap:
			reason = "gap"
		elif sla_state != "normal":
			reason = sla_state

		alerts.append({
			"queue_entry": row.name,
			"token": row.token,
			"token_number": row.token_number,
			"patient": row.patient,
			"patient_name": row.patient_name,
			"arrived_at": str(row.arrived_at) if row.arrived_at else None,
			"elapsed_minutes": elapsed,
			"sla_state": sla_state,
			"recommendation_reason": reason,
			"can_call_now": not guardrail_blocked,
			"guardrail_blocked": guardrail_blocked,
		})

	recommended = None
	callable_alerts = [row for row in alerts if row["can_call_now"]]
	if callable_alerts:
		candidate = callable_alerts[0]
		if candidate["recommendation_reason"] != "manual":
			message = _special_reception_recommendation_message(candidate, gap)
			recommended = {
				"queue_entry": candidate["queue_entry"],
				"kind": "special",
				"reason": candidate["recommendation_reason"],
				"message": message,
			}

	return {
		"special_reception_policy": policy,
		"special_reception_alerts": alerts,
		"recommended_reception_call": recommended,
	}


def _special_reception_recommendation_message(candidate: dict, gap: dict | None) -> str:
	if candidate["recommendation_reason"] == "gap" and gap:
		return _("Special patient can fill a non-arrival gap at token {0}.").format(
			gap.get("token_number") or gap.get("token")
		)
	if candidate["recommendation_reason"] == "target_breach":
		return _("Special patient has breached the reception target time.")
	if candidate["recommendation_reason"] == "escalation":
		return _("Special patient has reached reception escalation time.")
	if candidate["recommendation_reason"] == "warning":
		return _("Special patient has reached reception warning time.")
	return _("Special patient is waiting at reception.")
```

- [ ] **Step 2: Extend `get_live_session_state()` return payload**

In `get_live_session_state(queue_session)`, compute special reception state after `emergency_pending`:

```python
	special_reception = _special_reception_state(queue_session)
```

Then add these keys to the returned dict immediately before `counts`:

```python
		"special_reception_policy": special_reception["special_reception_policy"],
		"special_reception_alerts": special_reception["special_reception_alerts"],
		"recommended_reception_call": special_reception["recommended_reception_call"],
```

- [ ] **Step 3: Run live-state recommendation tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_live_state_returns_policy_shape
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_booked_special_is_ignored_by_special_reception_sla
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_arrived_normal_is_not_included_in_special_reception_alerts
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_arrived_special_appears_in_alert_payload
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_sla_warning_escalation_and_target_breach_are_computed_from_arrived_at
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_one_missing_normal_token_in_lookahead_creates_gap_recommendation
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_max_consecutive_special_calls_blocks_when_normal_arrived_patients_are_available
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_max_consecutive_special_calls_does_not_block_when_no_normal_arrived_patient_is_available
```

Expected: all listed tests pass.

- [ ] **Step 4: Run adjacent boundary tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission --test test_call_next_special_does_not_call_arrived_special_overflow_before_reception
```

Expected: both tests pass, proving arrival still does not make special patients doctor-callable.

- [ ] **Step 5: Commit recommendation implementation**

Run:

```bash
git status --short
```

---

### Task 6: Extend Call To Reception Audit and Private Mode

**Files:**

- Modify: `clinic_flow/tests/test_special_reception_sla.py`
- Modify: `clinic_flow/api/queue.py`

- [ ] **Step 1: Add failing call-mode tests**

Append these test methods to `TestSpecialReceptionSLA` before the helper methods:

```python
    def test_public_call_persists_public_mode(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=1)

        result = frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
            queue_entry=entry.name,
            call_mode="Public",
            recommendation_reason="manual",
        )

        refreshed = frappe.get_doc("Queue Entry", entry.name)
        self.assertEqual(result["status"], "Called")
        self.assertEqual(result["call_mode"], "Public")
        self.assertFalse(result["suppress_public_display"])
        self.assertEqual(refreshed.status, "Called")
        self.assertEqual(refreshed.reception_call_mode, "Public")
        self.assertEqual(refreshed.called_to_reception_by, frappe.session.user)
        self.assertEqual(refreshed.reception_recommendation_reason, "manual")
        self.assertFalse(refreshed.private_reception_call_reason)

    def test_private_call_requires_reason(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="special", arrived_minutes_ago=11)

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
                queue_entry=entry.name,
                call_mode="Private",
            )

    def test_private_call_persists_reason_and_still_sets_called_status(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="special", arrived_minutes_ago=11)

        result = frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
            queue_entry=entry.name,
            call_mode="Private",
            private_reason="parent contacted by phone",
            recommendation_reason="warning",
        )

        refreshed = frappe.get_doc("Queue Entry", entry.name)
        self.assertEqual(result["status"], "Called")
        self.assertEqual(result["call_mode"], "Private")
        self.assertTrue(result["suppress_public_display"])
        self.assertEqual(refreshed.status, "Called")
        self.assertEqual(refreshed.reception_call_mode, "Private")
        self.assertEqual(refreshed.private_reception_call_reason, "parent contacted by phone")
        self.assertEqual(refreshed.reception_recommendation_reason, "warning")
        self.assertIsNotNone(refreshed.called_to_reception_at)
        self.assertEqual(refreshed.called_to_reception_by, frappe.session.user)

    def test_invalid_call_mode_is_rejected(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=1)

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
                queue_entry=entry.name,
                call_mode="Silent",
            )

    def test_invalid_recommendation_reason_is_rejected(self):
        session = self.make_queue_session()
        entry = self.make_entry(session, token_number=1, status="Arrived", priority="normal", arrived_minutes_ago=1)

        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("clinic_flow.api.queue.call_to_reception")(
                queue_entry=entry.name,
                recommendation_reason="vip",
            )
```

- [ ] **Step 2: Run call-mode tests and verify they fail**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_public_call_persists_public_mode
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_private_call_requires_reason
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_private_call_persists_reason_and_still_sets_called_status
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_invalid_call_mode_is_rejected
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_invalid_recommendation_reason_is_rejected
```

Expected: failures because `call_to_reception()` does not yet accept or persist these arguments.

- [ ] **Step 3: Replace the `call_to_reception()` signature and validation**

In `clinic_flow/api/queue.py`, replace the current function definition and body up to its return with:

```python
@frappe.whitelist()
def call_to_reception(
	queue_entry: str,
	call_mode: str = "Public",
	private_reason: str = "",
	recommendation_reason: str = "",
) -> dict:
	"""
	Receptionist calls a patient to the desk.
	Valid from: Waiting, Booked, Arrived, Pushed to End.
	Sets status -> Called and records reception-call audit fields.
	"""
	frappe.only_for(["Queue Manager", "System Manager"])

	call_mode = (call_mode or "Public").strip().title()
	private_reason = (private_reason or "").strip()
	recommendation_reason = (recommendation_reason or "manual").strip().lower()

	if call_mode not in ("Public", "Private"):
		frappe.throw(_("call_mode must be Public or Private."), frappe.ValidationError)
	if call_mode == "Private" and not private_reason:
		frappe.throw(_("private_reason is required for private reception calls."), frappe.ValidationError)
	if recommendation_reason not in ("gap", "warning", "escalation", "target_breach", "manual"):
		frappe.throw(_("Invalid reception recommendation reason."), frappe.ValidationError)

	entry = frappe.db.get_value(
		"Queue Entry", queue_entry,
		["name", "status", "queue_session", "token", "patient_name"],
		as_dict=True,
	)
	if not entry:
		frappe.throw(_("Queue Entry {0} not found.").format(queue_entry))

	if entry.status not in ("Waiting", "Booked", "Arrived", "Pushed to End"):
		frappe.throw(
			_("Cannot call to reception: patient status is '{0}' (expected Waiting, Booked, Arrived, or Pushed to End).").format(
				entry.status
			),
			frappe.ValidationError,
		)

	frappe.db.set_value("Queue Entry", queue_entry, {
		"status": "Called",
		"called_to_reception_at": now_datetime(),
		"called_to_reception_by": frappe.session.user,
		"reception_call_mode": call_mode,
		"private_reception_call_reason": private_reason if call_mode == "Private" else "",
		"reception_recommendation_reason": recommendation_reason,
	})

	from clinic_flow.api.eta import recalculate_downstream_etas
	recalculate_downstream_etas(entry.queue_session)

	_broadcast_queue_update(entry.queue_session)

	return {
		"status": "Called",
		"token": entry.token,
		"patient_name": entry.patient_name,
		"call_mode": call_mode,
		"suppress_public_display": call_mode == "Private",
		"recommendation_reason": recommendation_reason,
	}
```

- [ ] **Step 4: Return reception-call audit fields in live state buckets**

In `get_live_session_state(queue_session)`, extend `_ENTRY_FIELDS` so operational dashboards can see the persisted reception-call mode without another API call:

```python
	_ENTRY_FIELDS = [
		"name", "token_number", "token", "patient", "patient_name",
		"load_class", "queue_type", "status", "queue_position",
		"arrived_at", "called_to_reception_at", "called_to_reception_by",
		"reception_call_mode", "private_reception_call_reason",
		"reception_recommendation_reason", "no_response_at", "hold_patients_count",
		"reception_done_at", "weight_recorded",
		"report_by_time", "predicted_doctor_time",
		"seen_at", "creation",
	]
```

- [ ] **Step 5: Keep whitelisted method type annotations intact**

Run:

```bash
grep -n "def call_to_reception" -A6 clinic_flow/api/queue.py
```

Expected:

```text
def call_to_reception(
    queue_entry: str,
    call_mode: str = "Public",
    private_reason: str = "",
    recommendation_reason: str = "",
) -> dict:
```

- [ ] **Step 6: Run call-mode tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_public_call_persists_public_mode
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_private_call_requires_reason
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_private_call_persists_reason_and_still_sets_called_status
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_invalid_call_mode_is_rejected
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_invalid_recommendation_reason_is_rejected
```

Expected: all listed tests pass.

- [ ] **Step 7: Run existing reception boundary tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
```

Expected: existing `complete_reception()` and arrival-boundary tests still pass.

- [ ] **Step 8: Commit call audit implementation**

Run:

```bash
git status --short
```

---

### Task 7: Lock Doctor and Emergency Isolation

**Files:**

- Modify: `clinic_flow/tests/test_special_reception_sla.py`
- No implementation changes expected.

- [ ] **Step 1: Add isolation tests**

Append these methods to `TestSpecialReceptionSLA` before helper methods:

```python
    def test_doctor_call_next_special_remains_unaffected_by_reception_recommendation(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=1, status="Booked", priority="normal")
        self.make_entry(session, token_number=89, status="Arrived", priority="special", arrived_minutes_ago=16)

        live_state = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)
        result = frappe.get_attr("clinic_flow.api.queue.call_next_special")(session.name)

        self.assertIsNotNone(live_state["recommended_reception_call"])
        self.assertEqual(result["status"], "empty")

    def test_emergency_patient_is_excluded_from_special_reception_sla(self):
        session = self.make_queue_session()
        self.make_entry(session, token_number=1, status="Arrived", priority="emergency", arrived_minutes_ago=16)

        payload = frappe.get_attr("clinic_flow.api.queue.get_live_session_state")(session.name)

        self.assertEqual(payload["special_reception_alerts"], [])
        self.assertIsNone(payload["recommended_reception_call"])
```

- [ ] **Step 2: Run isolation tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_doctor_call_next_special_remains_unaffected_by_reception_recommendation
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla --test test_emergency_patient_is_excluded_from_special_reception_sla
```

Expected: both tests pass without additional implementation changes. If either fails, fix only `clinic_flow/api/queue.py` recommendation eligibility; do not edit `clinic_flow/queue/engine.py`.

- [ ] **Step 3: Run healthcare compatibility special override test**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_healthcare_compatibility --test test_call_next_special_uses_oldest_ready_special_without_reordering
```

Expected: pass.

- [ ] **Step 4: Commit isolation tests**

Run:

```bash
git status --short
```

---

### Task 8: Run Full Backend Verification

**Files:**

- Verify only.

- [ ] **Step 1: Run the new test module**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla
```

Expected: all tests in `TestSpecialReceptionSLA` pass.

- [ ] **Step 2: Run adjacent receptionist and special tests**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_healthcare_compatibility --test test_call_next_special_uses_oldest_ready_special_without_reordering
```

Expected: all listed tests pass.

- [ ] **Step 3: Run migration verification**

Run:

```bash
bench --site site1.localhost migrate
```

Expected: migration completes and DocType schema remains valid.

- [ ] **Step 4: Run formatting/linting hooks if installed**

Run:

```bash
pre-commit run --all-files
```

Expected: hooks pass. If hooks modify files, review the modifications and commit them in the relevant code commit or a follow-up style commit.

---

### Task 9: Sync Documentation and Implementation Notes

**Files:**

- Modify: `ARCHITECTURE.md`
- Modify: `docs/receptionist-backend-policy.md`
- Modify: `docs/token-display-policy.md`
- Create: `docs/notes/special-reception-sla-backend.md`

- [ ] **Step 1: Update architecture special policy**

In `ARCHITECTURE.md`, under `## 5. Token and Priority Model`, extend the special behavior text so it reads:

```md
Special behavior now has three distinct concerns:

- admission-side overflow authorization at capacity boundary
- reception-side SLA recommendation for arrived special patients
- doctor-side explicit pull (`Call Next Special`) for eligible ready patients

Reception-side special handling is backend-owned recommendation state. It starts only after `Queue Entry.status = "Arrived"` and `Queue Entry.priority = "special"`, and it never moves a patient to `Called` automatically. The receptionist remains the actor who calls the patient to reception.

This does not create a separate persisted special queue and does not reuse emergency semantics.
```

- [ ] **Step 2: Update Queue Entry model section**

In `ARCHITECTURE.md`, under `### Queue entry`, add:

```md
Reception-call audit fields are active for the v2 reception boundary:

- `called_to_reception_by`
- `reception_call_mode`
- `private_reception_call_reason`
- `reception_recommendation_reason`

These fields are reception-stage audit fields. They are separate from special-overflow audit fields and do not change doctor dequeue behavior.
```

- [ ] **Step 3: Update receptionist backend policy**

In `docs/receptionist-backend-policy.md`, under `## 6. Special Policy`, add:

```md
### Special reception SLA

Special reception handling starts only after physical arrival:

- `Queue Entry.status = "Arrived"`
- `Queue Entry.priority = "special"`

Backend owns:

- SLA thresholds from `Slot Partition Config`
- arrived-special eligibility
- gap-opportunity detection over the next configured normal-token lookahead window
- max-consecutive-special reception guardrail
- `special_reception_alerts` and `recommended_reception_call` in `get_live_session_state()`

Frontend owns:

- rendering alerts and recommendations
- collecting public/private call mode and private reason
- refreshing the live session state after a receptionist action

Frontend must not recalculate SLA thresholds, gap opportunity, or consecutive-call guardrails.

Private reception calls still set `Queue Entry.status = "Called"`, but public displays should suppress private calls and must not expose special status.
```

- [ ] **Step 4: Update token display policy**

In `docs/token-display-policy.md`, before `## Future Cleanup`, add:

```md
## Reception Call Display Policy

Special status is not part of public token display.

For reception calls:

- `reception_call_mode = "Public"` may display or announce the token normally.
- `reception_call_mode = "Private"` is operational state only and should be suppressed on public displays.

Private calls do not hide the patient from operational dashboards. They only prevent public display/announcement of that reception call.
```

- [ ] **Step 5: Create implementation summary note**

Create `docs/notes/special-reception-sla-backend.md`:

```md
# Special Reception SLA Backend

Date: 2026-04-26

## What Changed

- Added `Slot Partition Config` fields for special reception warning, escalation, target, gap lookahead, and max consecutive special reception calls.
- Added `Queue Entry` reception-call audit fields for caller, public/private mode, private reason, and recommendation reason snapshot.
- Extended `get_live_session_state(queue_session)` with backend-computed `special_reception_policy`, `special_reception_alerts`, and `recommended_reception_call`.
- Extended `call_to_reception()` to persist public/private call mode while keeping the existing `Called` state transition.

## What Was Verified

- Special reception eligibility includes only `Arrived + special` Queue Entries.
- Booked, called, ready, with-doctor, normal, and emergency entries are excluded from special reception alerts.
- SLA states are computed from `arrived_at`.
- One missing normal token in the lookahead window creates a gap recommendation.
- Max consecutive special reception calls block recommendations only when normal arrived patients are available.
- Private calls require a reason and still set operational status to `Called`.
- Doctor `Call Next Special` remains limited to `Ready Near Doctor` special entries.

## Out Of Scope

- No receptionist dashboard UI alert rail.
- No public display implementation change.
- No ETA rewrite.
- No emergency behavior change.
- No doctor workspace behavior change.
- No token renumbering or reserved token bands.

## Next Integration Step

- Build the receptionist dashboard frontend slice that consumes the backend payload, renders arrived-special alerts, and sends public/private call mode to `call_to_reception()`.
```

- [ ] **Step 6: Verify docs text exists**

Run:

```bash
grep -n "Special reception SLA\|reception_call_mode\|special_reception_alerts" ARCHITECTURE.md docs/receptionist-backend-policy.md docs/token-display-policy.md docs/notes/special-reception-sla-backend.md
```

Expected: matching lines across the updated docs.

- [ ] **Step 7: Commit docs sync**

Run:

```bash
git status --short
```

---

### Task 10: Update Graphify and Final Branch Verification

**Files:**

- Update generated graph output under `graphify-out/` if changed by command.
- Verify all implementation files.

- [ ] **Step 1: Update graph after code changes**

Run:

```bash
graphify update .
```

Expected: graph update completes. If it modifies files under `graphify-out/`, inspect and include those generated updates in the final commit for this branch.

- [ ] **Step 2: Re-run final focused verification**

Run:

```bash
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_healthcare_compatibility --test test_call_next_special_uses_oldest_ready_special_without_reordering
pre-commit run --all-files
```

Expected: all tests and hooks pass.

- [ ] **Step 3: Review branch diff for scope hygiene**

Run:

```bash
git status --short
```

Expected changes are limited to:

```text
clinic_flow/api/queue.py
clinic_flow/clinic_flow/doctype/queue_entry/queue_entry.json
clinic_flow/clinic_flow/doctype/slot_partition_config/slot_partition_config.json
clinic_flow/tests/test_special_reception_sla.py
ARCHITECTURE.md
```

- [ ] **Step 4: Commit graphify output if changed**

Run only if `git status --short` shows `graphify-out/` changes:

```bash
git add graphify-out
```

- [ ] **Step 5: Prepare handoff summary**

Include this in the final implementation handoff:

```md
Implemented backend special reception SLA support.

Verified:
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_reception_sla`
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary`
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_special_overflow_admission`
- `bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_healthcare_compatibility --test test_call_next_special_uses_oldest_ready_special_without_reordering`
- `pre-commit run --all-files`

Out of scope remains frontend alert rail, public display suppression implementation, ETA rewrite, emergency changes, and doctor workspace changes.
```

---

## Self-Review Notes

Spec coverage:

- Configurable SLA defaults are covered in Tasks 2 and 3.
- Eligibility `Arrived + special` only is covered in Tasks 4 and 5.
- Gap opportunity over any one missing normal token is covered in Tasks 4 and 5.
- Warning, escalation, and target breach from `arrived_at` are covered in Tasks 4 and 5.
- Max consecutive special reception guardrail is covered in Tasks 4 and 5.
- Public/private call mode and audit persistence are covered in Task 6.
- Doctor and emergency isolation are covered in Task 7.
- Documentation sync and implementation note requirements are covered in Task 9.
- Git workflow and worktree isolation are covered in Task 1.
- Graphify update after code changes is covered in Task 10.

Implementation boundaries:

- Do not edit `apps/healthcare/`.
- Do not use `Patient Appointment` lifecycle hooks as queue authority.
- Do not add frontend-side SLA or gap calculation.
- Do not change `token_number`, `queue_position`, `rr_state`, `get_next_token()`, or `get_next_special_token()` unless a failing isolation test proves the recommendation layer broke an existing boundary.
- Do not use `frappe.get_all(..., order_by="FIELD(...)")`.
- Keep all whitelisted functions type annotated.
