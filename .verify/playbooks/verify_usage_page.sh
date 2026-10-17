#!/usr/bin/env bash
set -euo pipefail

echo "==> Verifying /usage route TypeScript types and Svelte compiler diagnostics..."
npm run check
echo "==> /usage route verification passed."
