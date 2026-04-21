# Healthcare Compatibility Audit

Date: 2026-04-18

## Scope

This note audits how `clinic_flow` extends upstream `healthcare`, with focus on:

- custom fields added on Healthcare doctypes
- whether those fields are still required or now debt
- upgrade/compatibility risks against newer Frappe / ERPNext / Healthcare versions
- immediate hardening actions

## High-Level Assessment

`clinic_flow` is no longer just a thin UI layer. It has real behavioral coupling to `healthcare`, especially around:

- `Patient Appointment`
- `Appointment Type`
- `Medical Department`
- `Patient Encounter`

The app is partly modernized:

- backend recommendation and queue logic are increasingly owned by `clinic_flow`

But compatibility is still weaker than it should be because:

1. required upstream custom fields are not properly version-controlled
2. legacy appointment/queue paths still depend on old `custom_queue_type` semantics
3. some site-level custom fields appear to be unused debt
4. fixture configuration does not currently capture the live Healthcare custom fields

## Immediate Structural Risks

### 1. Live custom fields are unmanaged

`hooks.py` exports fixtures only for records with `module = "Clinic Flow"`:

- [hooks.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/hooks.py)

But the live Healthcare custom fields currently present on the site have `module = null`.

That means:

- the app depends on them
- but the repo does not reliably own them
- a fresh site or upgrade can drift from working state

### 2. Legacy appointment path is still load-bearing

Several core flows still read/write:

- `Patient Appointment.custom_queue_type`
- `Patient Appointment.custom_queue_token`
- `Appointment Type.custom_queue_code`
- `Medical Department.custom_dept_abbr`

Key files:

- [appointment_mixin.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/queue/appointment_mixin.py)
- [appointments.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/appointments.py)
- [admission.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/admission.py)
- [queue.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/queue.py)

### 3. Some legacy fields appear orphaned

The live site still contains custom fields that are not referenced in `clinic_flow` anymore.

These are likely debt unless another app still relies on them.

### 4. Old prebooked-release knobs are orphaned runtime debt

The older prebooked-release model left behind admin/schema state that is not part of the active post-Slice-3 runtime.

The active runtime now uses midnight phone-quota release via `release_phone_quota_at_midnight`, with `release_minutes_before` and `phone_quota_released` as the live controls.

Legacy/orphaned knobs to treat as debt:

- `Slot Partition Config.release_hours_before`
- `Queue Session.prebooked_released`

These fields may still exist on a site from earlier transitions, but they should not be treated as active queue or booking controls.

## Live Custom Field Inventory

The following upstream custom fields exist on the current site:

### Appointment Type

| Field | Status | Why |
| --- | --- | --- |
| `custom_queue_code` | Keep for now | Still used to resolve appointment types from legacy queue codes in `admission.py`, `appointments.py`, `queue.py`, and documented in `engine.py`. |
| `custom_queue_type` | Review / likely debt | Present on site, but no active code references found in `clinic_flow`. Looks like leftover v1 modeling. |

### Medical Department

| Field | Status | Why |
| --- | --- | --- |
| `custom_dept_abbr` | Keep for now | Still used in queue/admission logic to resolve department abbreviations. This remains load-bearing while old token/appointment compatibility exists. |

### Patient Appointment

| Field | Status | Why |
| --- | --- | --- |
| `custom_queue_type` | Keep for now | Still central to appointment check-in, slot accounting, legacy compatibility, and receptionist legacy paths. |
| `custom_queue_token` | Keep for now | Still written back by appointment check-in flow and read by appointment APIs and legacy workspace. |
| `custom_dept_abbr` | Review | Still referenced in `appointment_mixin.py` as a fallback dept abbreviation source. May become removable once department resolution is fully session-based. |
| `custom_original_encounter` | Review / likely debt | Present on site, but no active code references found in `clinic_flow`. |

### Patient Encounter

| Field | Status | Why |
| --- | --- | --- |
| `custom_chief_complaint` | Keep for now | Still used by doctor workspace APIs and encounter save/load mapping. |
| `custom_awaiting_lab_return` | Review / likely debt | Present on site, but no active code references found in `clinic_flow`. |
| `custom_lab_return_queued` | Review / likely debt | Present on site, but no active code references found in `clinic_flow`. |

### Patient

The site also has ABHA-related custom fields on `Patient`:

- `abha_address`
- `abha_card`
- `abha_number`
- `consent_for_aadhaar_use`

These do not appear to be owned by `clinic_flow` and should not be treated as its debt unless this app starts reading/writing them.

## Field-by-Field Evidence

### Clearly load-bearing today

#### `Patient Appointment.custom_queue_type`

Used by:

- [appointment_mixin.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/queue/appointment_mixin.py)
- [appointments.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/appointments.py)
- [queue.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/queue.py)
- legacy [receptionist_workspace.js](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/clinic_flow/page/receptionist_workspace/receptionist_workspace.js)

Current role:

- appointment-path queue classification
- slot release logic
- queue token generation compatibility
- receptionist legacy views

#### `Patient Appointment.custom_queue_token`

Used by:

- [appointment_mixin.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/queue/appointment_mixin.py)
- [appointments.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/appointments.py)
- legacy [receptionist_workspace.js](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/clinic_flow/page/receptionist_workspace/receptionist_workspace.js)

Current role:

- appointment check-in writes back queue token
- API reads token for status/printing compatibility

#### `Appointment Type.custom_queue_code`

Used by:

- [admission.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/admission.py)
- [appointments.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/appointments.py)
- [queue.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/queue.py)

Current role:

- maps legacy queue type semantics to Appointment Type records

#### `Medical Department.custom_dept_abbr`

Used by:

- [admission.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/admission.py)
- [queue.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/queue.py)
- [appointment_mixin.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/queue/appointment_mixin.py)

Current role:

- compatibility department abbreviation lookup

#### `Patient Encounter.custom_chief_complaint`

Used by:

- [workspace.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/workspace.py)
- [queue.py](/home/raghu/frappe-bench/apps/clinic_flow/clinic_flow/api/queue.py)

Current role:

- doctor workspace symptom/complaint persistence

### Likely debt or nearing debt

#### `Appointment Type.custom_queue_type`

No active references were found in `clinic_flow`.

Assessment:

- likely old v1 categorization residue
- should be verified against site usage and other apps before removal

#### `Patient Appointment.custom_original_encounter`

No active references were found in `clinic_flow`.

Assessment:

- likely removable after confirming no reporting or external automation depends on it

#### `Patient Encounter.custom_awaiting_lab_return`
#### `Patient Encounter.custom_lab_return_queued`

No active references were found in `clinic_flow`.

Assessment:

- likely orphaned from older lab-return workflow ideas
- should be removed only after confirming no other app or report uses them

## Compatibility Risks Against Future Upgrades

### Frappe / Healthcare schema drift

Risk:

- direct SQL and direct field assumptions can break if upstream doctypes or behaviors change

Examples:

- `Patient Appointment` custom fields assumed in appointment/check-in flow
- Appointment Type lookup by `custom_queue_code`
- department abbreviation assumption on `Medical Department`

### Controller side-effect drift

Risk:

- `clinic_flow` depends on how `Patient Appointment` behaves when saved/checked in
- if upstream Healthcare changes check-in flow or validation order, queue integration can break

### Unmanaged custom fields

Risk:

- new site setup or restore may miss required fields
- upgrade patches may silently conflict with site-local state

### Legacy scheduler behavior

Historical note:

- the old prebooked-release job was removed in the cleanup work and is no longer scheduled
- this section remains only as compatibility history for older site states

Risk:

- older sites may still carry orphaned release-window fields or data
- future upgrades should not reintroduce the removed prebooked-release scheduler path

### Dependency metadata drift

In:

- [pyproject.toml](/home/raghu/frappe-bench/apps/clinic_flow/pyproject.toml)

Current dependency metadata says:

- `frappe = ">=16.0.0,<17.0.0"`
- `health = ">=16.0.0,<17.0.0"`

This should be reviewed, because `health` may not be the correct app key if the app dependency is actually `healthcare`.

## What To Do Next

### Priority 1: Make upstream customizations explicit

Do one of these:

1. reassign required custom fields to module `Clinic Flow` and export them properly
2. or manage them via patches/install code instead of relying on fixtures

Do not keep depending on site-local unmanaged fields.

### Priority 2: Create a required-fields ownership map

For every upstream custom field that remains:

- why it exists
- which code path still uses it
- whether it is transitional or long-term

This audit is the first version of that map.

### Priority 3: Separate required compatibility from removable debt

Candidates to verify for removal:

- `Appointment Type.custom_queue_type`
- `Patient Appointment.custom_original_encounter`
- `Patient Encounter.custom_awaiting_lab_return`
- `Patient Encounter.custom_lab_return_queued`

### Priority 4: Add upgrade smoke coverage

At minimum, smoke-test these on every serious framework/app upgrade:

- receptionist phone booking
- walk-in booking
- appointment check-in
- doctor `Call Next`
- `Call Next Special`
- emergency issuance
- session end/cancel/extend

### Priority 5: Reduce old appointment-path dependence

Longer term, move away from:

- `custom_queue_type`
- `custom_queue_token`
- `custom_queue_code`
- the older prebooked-release knobs (`release_hours_before`, `prebooked_released`)

as the main semantic drivers.

These should become compatibility shims, not primary architecture.

## Recommended Current Classification

### Keep now

- `Medical Department.custom_dept_abbr`
- `Patient Appointment.custom_queue_type`
- `Patient Appointment.custom_queue_token`
- `Appointment Type.custom_queue_code`
- `Patient Encounter.custom_chief_complaint`

### Keep but revisit

- `Patient Appointment.custom_dept_abbr`

### Review for removal

The first low-risk cleanup set has now been removed by patch:

- `Patient Appointment.custom_original_encounter`
- `Patient Encounter.custom_awaiting_lab_return`
- `Patient Encounter.custom_lab_return_queued`

Still pending review:

- `Appointment Type.custom_queue_type`
- `Patient Appointment.custom_dept_abbr`

## Bottom Line

`clinic_flow` is not currently unsafe to run, but it is still too dependent on unmanaged Healthcare customizations and legacy appointment semantics.

The most important hardening move is not another feature change.

It is:

- owning the required upstream custom fields explicitly
- separating truly required compatibility fields from dead custom-field debt
- then progressively shrinking the legacy appointment-path surface
