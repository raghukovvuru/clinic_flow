# Local Setup And Verification

This is a human/operator runbook for local Clinic Flow setup and verification.

It is not an agent authority document. For agent context, start with `CONTEXT_INDEX.md`.

## Bench Context

- App: `clinic_flow`
- Framework: Frappe v16
- Base app: `healthcare`
- Default local site: `site1.localhost`
- Python: 3.11+

## Prerequisites

- A working Frappe bench
- `healthcare` installed on the target site
- Development services available via `bench start`

## Install Into An Existing Bench

```bash
cd /home/raghu/frappe-bench
bench get-app clinic_flow /path/to/repo
bench --site site1.localhost install-app clinic_flow
bench --site site1.localhost migrate
```

## Verify Installation

```bash
cd /home/raghu/frappe-bench
bench --site site1.localhost list-apps
```

Expected app list includes:

- `frappe`
- `healthcare`
- `clinic_flow`

## Common Verification Commands

```bash
cd /home/raghu/frappe-bench
bench --site site1.localhost run-tests --app clinic_flow
```

## Active Local Routes

- `/clinic/arrival-counter` - canonical Arrival Counter head-app route
- `receptionist_dashboard` - active receptionist Desk page direction
- `doctor_workspace_v2` - active doctor Desk page direction
- `arrival_counter`, `receptionist_workspace`, and `doctor_workspace` remain available according to current architecture and compatibility rules.

## Setup Ownership Checks

This codebase uses both fixtures and patches. Do not assume `export fixtures` is enough to reproduce a working site.

Read these before changing Healthcare-facing setup behavior:

- `clinic_flow/hooks.py`
- `clinic_flow/patches.txt`
- `docs/healthcare-compatibility-audit.md`

## Core Desk Configuration To Verify

| Where | What to verify |
|---|---|
| `Healthcare Practitioner` | `user_id` linkage for doctor login |
| `Practitioner Schedule` | time slots and `maximum_appointments` |
| `Medical Department` | `custom_dept_abbr` fallback values still present where needed |
| `Appointment Type` | `custom_queue_code` values still present for compatibility paths |
| `Slot Partition Config` | queue percentages and newer operational defaults |

## Authority Reminder

This runbook may contain operational shortcuts. Runtime behavior and agent rules are governed by `CONTEXT_INDEX.md`, `AGENTS.md`, `ARCHITECTURE.md`, and focused policy docs.
