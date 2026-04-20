### Clinic Flow

Queue, admission, arrival, and doctor-workspace workflows for Marley Healthcare on Frappe v16.

This repository is currently a mixed-mode codebase:

- active direction:
  - `receptionist_dashboard`
  - `arrival_counter`
  - `doctor_workspace_v2`
- compatibility paths that still remain load-bearing:
  - legacy appointment/check-in flow
  - `receptionist_workspace`
  - `doctor_workspace`

Read the active docs before making changes:

- `CLAUDE.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `CONTEXT_INDEX.md`

### Installation

Install into an existing Frappe bench with `healthcare` already present:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO
bench --site site1.localhost install-app clinic_flow
bench --site site1.localhost migrate
```

For project-specific setup and verification, read `ONBOARDING.md`.

### Contributing

This repo uses `pre-commit` for code formatting and linting:

```bash
cd apps/clinic_flow
pre-commit install
```

Configured tools:

- `ruff`
- `eslint`
- `prettier`
- `pyupgrade`

### License

MIT
