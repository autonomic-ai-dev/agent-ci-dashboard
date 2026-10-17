# agent-ci-dashboard Verification Suite

Verification playbooks and automated build checks for `agent-ci-dashboard` (Autonomic AI web mission control).

## Structure
- `run.sh`: Master entrypoint executing svelte-check, production build, and all modular playbooks.
- `verify.toml`: Machine-readable descriptor of test commands.
- `playbooks/`:
  - `verify_usage_page.sh`: Validates `/usage` route components, API endpoint `/api/usage`, and TypeScript types.
  - `verify_full_suite.sh`: Executes end-to-end linting, typing, and production build checks.
