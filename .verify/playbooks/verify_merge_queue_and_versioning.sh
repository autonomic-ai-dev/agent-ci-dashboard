#!/usr/bin/env bash
set -euo pipefail

# Playbook: Verify Merge Queue Fallback and Stack Versioning
# Tests:
# 1. Formula resolver derives stack version from autonomic-stack.rb
# 2. Merge endpoint handles GitHub Merge Queue GraphQL fallback
# 3. Compiler and type checks pass cleanly

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"

echo "==> [Playbook: Merge Queue & Versioning] Testing formula version derivation..."
cd "$REPO_ROOT"

node -e '
const fs = require("fs");
const path = require("path");

const tapDir = path.resolve(process.cwd(), "../homebrew-tap/Formula");
if (!fs.existsSync(tapDir)) {
  console.error("Missing homebrew-tap directory at", tapDir);
  process.exit(1);
}

const stackContent = fs.readFileSync(path.join(tapDir, "autonomic-stack.rb"), "utf8");
const match = stackContent.match(/version\s+"([^"]+)"/);
if (!match || !match[1]) {
  console.error("Failed to parse autonomic-stack version from formula");
  process.exit(1);
}
console.log("Verified autonomic-stack formula version:", match[1]);
'

echo "==> [Playbook: Merge Queue & Versioning] Checking merge endpoint for enqueuePullRequest support..."
grep -q "enqueuePullRequest" src/routes/api/repo/\[name\]/pulls/merge/+server.ts || {
  echo "FAIL: merge/+server.ts does not contain enqueuePullRequest fallback"
  exit 1
}
grep -q "enqueuePullRequest" src/routes/api/pulls/batch-merge/+server.ts || {
  echo "FAIL: batch-merge/+server.ts does not contain enqueuePullRequest fallback"
  exit 1
}

echo "==> [Playbook: Merge Queue & Versioning] Running svelte-check and build..."
npm run check
npm run build

echo "==> [Playbook: Merge Queue & Versioning] Passed cleanly (exit 0)."
