#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DIR/.." && pwd)"

echo "==> [agent-ci-dashboard] Starting verification suite..."
cd "$REPO_ROOT"

echo "==> Running Playbook: Usage Page..."
"$DIR/playbooks/verify_usage_page.sh"

echo "==> Running Playbook: Full Suite..."
"$DIR/playbooks/verify_full_suite.sh"

echo "==> [agent-ci-dashboard] All verification playbooks passed cleanly (exit 0)."
