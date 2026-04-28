# Arrival Counter Drift Fixes — Implementation Plan

Date: 2026-04-28
Scope: 3 confirmed low-severity spec drifts
Files affected: 5 backend, 5 frontend

---

## Drift 1: Fix `has_active` Semantics

### Root cause

`get_arrival_session_context` (`arrival.py:317`) sets `has_active: True` whenever ANY arrival-eligible sessions exist, including Scheduled-only ones. The spec implies `has_active` should reflect whether an Active or Paused session is running.

### Backend change — `clinic_flow/api/arrival.py`

In `get_arrival_session_context`, compute `has_active` from statuses instead of `bool(sessions)`:

```python
# Before (line 317):
"has_active": True,

# After:
"has_active": has_active,
```

And compute `has_active` right after `resolve_arrival_sessions`:

```python
sessions = resolve_arrival_sessions(dept_abbr)
has_active = any(s["status"] in ("Active", "Paused") for s in sessions)
```

The early-return at line 271 already has `"has_active": False` — this stays correct since `any([])` is `False`.

### Test — `clinic_flow/tests/test_arrival_frontend_contract.py`

Add one test case:

```python
def test_has_active_false_when_only_scheduled_sessions_exist(self):
    """has_active must be False when no Active/Paused session exists."""
    from frappe.utils import now_datetime

    sp = self.make_service_point()
    current_time = now_datetime().strftime("%H:%M:%S")
    self.make_queue_session(status="Scheduled", start_time=current_time, service_point=sp)

    result = frappe.get_attr("clinic_flow.api.arrival.get_arrival_session_context")(
        dept_abbr=sp.queue_code
    )

    self.assertFalse(result["has_active"], "has_active should be False for Scheduled-only sessions")
    self.assertIsNone(result["current_session"])
    self.assertIsNotNone(result["next_session"])
```

---

## Drift 2: Make `print_context` Conditional

### Root cause

`_candidate_summary` (`arrival.py:82-95`) always generates a QR SVG and includes `print_context` for every candidate, regardless of status. The spec says "print context only when safe and needed" — meaning only for Arrived candidates where printing is valid.

### Backend change — `clinic_flow/api/arrival.py`

In `_candidate_summary`, only include `print_context` when status is `"Arrived"`:

```python
def _candidate_summary(row: dict) -> dict:
    display_token = row.get("token") or row.get("name")
    state_label = "Already Arrived" if row.get("status") == "Arrived" else "Ready to Confirm"
    visit_label = "Review Patient" if row.get("load_class") == "review_load" else "New Patient"

    result = {
        **dict(row),
        "queue_entry": row.get("name"),
        "display_token": display_token,
        "state_label": state_label,
        "visit_label": visit_label,
    }

    if row.get("status") == "Arrived":
        from clinic_flow.utils import get_token_qr_svg
        result["print_context"] = {
            "queue_entry": row.get("name"),
            "display_token": display_token,
            "patient_name": row.get("patient_name"),
            "qr_svg": get_token_qr_svg(row.get("name")),
        }

    return result
```

**Why this works:** `mark_arrived` always returns `result_card` with status `"Arrived"` → `print_context` is always present in success/already-arrived states. `lookup_arrival_candidate` returns `print_context` only for candidates already `"Arrived"` → the frontend's already-arrived state still has print capability. Booked/Waiting candidates go to pre-confirm state where print is not rendered.

### Test — `clinic_flow/tests/test_arrival_frontend_contract.py`

Add two new tests:

```python
def test_print_context_absent_for_non_arrived_candidates(self):
    """print_context must not be included for Booked/Waiting candidates."""
    session = self.make_queue_session(status="Active")
    entry = self.make_queue_entry(session, status="Booked", token_number=8)

    result = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(
        qr_code=entry.name
    )

    self.assertEqual(len(result["candidates"]), 1)
    self.assertNotIn("print_context", result["candidates"][0])

def test_print_context_present_for_arrived_candidates(self):
    """print_context must be included for Arrived candidates (reprint support)."""
    session = self.make_queue_session(status="Active")
    entry = self.make_queue_entry(session, status="Arrived", token_number=9)

    result = frappe.get_attr("clinic_flow.api.arrival.lookup_arrival_candidate")(
        qr_code=entry.name
    )

    self.assertEqual(len(result["candidates"]), 1)
    self.assertIn("print_context", result["candidates"][0])
    self.assertIn("qr_svg", result["candidates"][0]["print_context"])
```

### Frontend type — `frontend/head-app/src/lib/arrival-counter/types.ts`

Make `print_context` optional in `ArrivalCardRecord`:

```typescript
export interface ArrivalCardRecord {
  // ... existing fields ...
  print_context?: {    // was: print_context:
    queue_entry: string;
    display_token: string;
    patient_name: string;
    qr_svg: string;
  };
}
```

### Frontend guard — `frontend/head-app/src/lib/arrival-counter/print-slip.ts`

Add a null check at the top of `buildTokenSlipDocument` and `printTokenSlip`:

```typescript
export function buildTokenSlipDocument(doc: Document, record: ArrivalCardRecord) {
  if (!record.print_context) return;
  // ... existing code ...
}

export function printTokenSlip(record: ArrivalCardRecord): PrintSlipResult {
  if (!record.print_context) return { ok: false, reason: "popup-blocked" };
  // ... existing code ...
}
```

### Frontend test fix — `frontend/head-app/src/lib/arrival-counter/state.test.ts`

The mock `mockCard` has `status: "Waiting"` but includes `print_context`. Change mock to match new contract:

```typescript
const mockCard = {
  // ... same fields ...
  status: "Booked",
  // Remove print_context entirely (not needed for pre-confirm scenario)
  // print_context: { ... },  // DELETE this block
};
```

Then in tests that need `print_context` (the already-arrived flow), use a separate mock with `status: "Arrived"` + `print_context`.

Note: the tests at lines 98-125 explicitly construct mock cards with `print_context` for pre-confirm and multiple states — those test fixtures need `print_context` removed since status is `"Booked"`. The fixture at line 100 sets `status: "Booked"` → no print_context needed (these tests verify pre-confirm and multiple-selection flows, not print).

---

## Drift 3: Document Shell Test as Required Verification

### Change — `frontend/head-app/tests/arrival-counter-frappe-shell.spec.ts`

Add a JSDoc comment to make the manual verification gate explicit:

```typescript
/**
 * Frappe-served shell integration test.
 *
 * REQUIRED MANUAL VERIFICATION before merge:
 *   FRAPPE_BASE_URL=http://site1.localhost:8000 \
 *   FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json \
 *   npx playwright test tests/arrival-counter-frappe-shell.spec.ts
 *
 * This test is skipped in CI because it requires a running Frappe instance
 * with authenticated session storage state.
 */
```

### Change — `docs/notes/arrival-counter-standalone-shell.md`

Append a new section documenting the three drift fixes:

```markdown
## Drift Fixes — 2026-04-28

### `has_active` Semantics
- `get_arrival_session_context.has_active` now reflects only Active/Paused sessions,
  not Scheduled-only ones. Scheduled-only sessions within the 30-min window still
  appear in `sessions` and `next_session`, but `has_active` is `False`.

### Conditional `print_context`
- `_candidate_summary` now includes `print_context` only when `status === "Arrived"`.
  Booked/Waiting candidates no longer carry a print context. `mark_arrived` responses
  always include it (all results are Arrived).
- Frontend `ArrivalCardRecord.print_context` is now optional; `printTokenSlip` guards
  against missing context.

### Shell Smoke Test Documentation
- `arrival-counter-frappe-shell.spec.ts` now documents the required manual run command
  explicitly in a header JSDoc comment.
```

---

## Execution Order

```
1. Backend: arrival.py (has_active fix + print_context conditional)
2. Backend: test_arrival_frontend_contract.py (3 new tests)
3. Backend: run tests — verify 8/8 OK
4. Frontend: types.ts (print_context → optional)
5. Frontend: print-slip.ts (null guards)
6. Frontend: state.test.ts (removed print_context from Booked mocks)
7. Frontend: arrival-counter-frappe-shell.spec.ts (JSDoc)
8. Frontend: npm run check && npm run test && npm run build
9. Docs: arrival-counter-standalone-shell.md (drift fixes section)
10. Full verification: all 3 backend modules + bench migrate
```

## Verification Commands

```bash
# Backend
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_frontend_contract
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_arrival_counter_shell
bench --site site1.localhost run-tests --app clinic_flow --module clinic_flow.tests.test_slice3_checkin_boundary
bench --site site1.localhost migrate

# Frontend
cd frontend/head-app && npm run check && npm run test && npm run build

# Manual shell smoke (required)
FRAPPE_BASE_URL=http://site1.localhost:8000 FRAPPE_STORAGE_STATE=/tmp/clinic-flow-staff-storage.json npx playwright test tests/arrival-counter-frappe-shell.spec.ts
```

Expected after fix: `test_arrival_frontend_contract` runs **8 tests** (was 5), all OK.
