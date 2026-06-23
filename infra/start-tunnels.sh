#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Local tunnel launcher — $0 architecture
# Requires: gcloud, ngrok, and env vars below
#
# Traffic flow:
#   Internet → ngrok → localhost:8080 → IAP → VM:8080 → Nginx → Rust
#
# For VM outbound internet (Supabase, Aiven):
#   Run before this script: python3 -m http.server 1080 &
#   Then the IAP tunnel reverse-forwards SOCKS5 to the VM.
#   On VM: export http_proxy=socks5://localhost:1080
# ============================================

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
ZONE="${GCP_ZONE:?Set GCP_ZONE}"
INSTANCE="${GCP_INSTANCE:-agent-ci-backend}"
NGROK_DOMAIN="${NGROK_DOMAIN:?Set NGROK_DOMAIN (your-name.ngrok-free.app)}"
LOCAL_PORT="${LOCAL_PORT:-8080}"

cleanup() {
  echo "=== Shutting down ==="
  kill %1 %2 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=== Starting $0 architecture tunnels ==="
echo "1/2: IAP tunnel → $INSTANCE (port $LOCAL_PORT -> VM:$LOCAL_PORT)..."
gcloud compute ssh "$INSTANCE" \
  --project="$PROJECT_ID" \
  --zone="$ZONE" \
  --tunnel-through-iap \
  --ssh-flag="-L $LOCAL_PORT:localhost:$LOCAL_PORT" \
  --ssh-key-expire-after=8h \
  -- -N &
sleep 5

echo "2/2: ngrok → localhost:$LOCAL_PORT..."
ngrok http "$LOCAL_PORT" --domain="$NGROK_DOMAIN"

echo ""
echo "=== Active ==="
echo "  Public:  https://$NGROK_DOMAIN"
echo "  Webhook: https://${NGROK_DOMAIN}/webhook"
echo "  API:     https://${NGROK_DOMAIN}/api"
echo "  Health:  https://${NGROK_DOMAIN}/health"
echo "  Ctrl+C to stop"
wait
