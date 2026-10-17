#!/usr/bin/env bash
set -euo pipefail

echo "==> Running agent-ci-dashboard full verification suite (typing & production build)..."
npm run check
npm run build
echo "==> agent-ci-dashboard full suite verification passed."
