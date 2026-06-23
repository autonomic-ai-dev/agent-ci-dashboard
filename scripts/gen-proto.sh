#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="src/lib/gen"
mkdir -p "$OUT_DIR"

PATH="./node_modules/.bin:$PATH" protoc \
  --es_out="$OUT_DIR" --es_opt=target=ts \
  --connect-es_out="$OUT_DIR" --connect-es_opt=target=ts \
  -I proto \
  proto/insights/v1/types.proto \
  proto/insights/v1/insights_service.proto
