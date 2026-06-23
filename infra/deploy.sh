#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Manual deploy script for local testing
# Builds Rust binaries and deploys to GCP
# ============================================

PROJECT_ID="${GCP_PROJECT_ID?Set GCP_PROJECT_ID}"
ZONE="${GCP_ZONE?Set GCP_ZONE}"
INSTANCE="${GCP_INSTANCE?Set GCP_INSTANCE}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Building Rust release ==="
cd "$ROOT"
cargo build --release --workspace

echo "=== Copying binaries to GCP ==="
gcloud compute scp \
  target/release/github-ingestor \
  target/release/insights-api \
  "$INSTANCE":~/ \
  --zone="$ZONE" \
  --ssh-key-expire-after=10m

echo "=== Restarting services ==="
gcloud compute ssh "$INSTANCE" \
  --zone="$ZONE" \
  --ssh-key-expire-after=10m \
  --command="
    sudo systemctl stop github-ingestor insights-api
    sudo cp ~/github-ingestor /usr/local/bin/
    sudo cp ~/insights-api /usr/local/bin/
    sudo systemctl daemon-reload
    sudo systemctl start github-ingestor insights-api
    echo '=== Service status ==='
    sudo systemctl status github-ingestor insights-api --no-pager
  "

echo "=== Deploy complete ==="
