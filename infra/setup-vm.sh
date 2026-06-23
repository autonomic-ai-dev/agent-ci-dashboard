#!/usr/bin/env bash
set -euo pipefail

# ============================================
# VM provisioning script
# Run via: gcloud compute ssh agent-ci-backend --tunnel-through-iap
# ============================================

DIR="$(dirname "$0")"

echo "=== Creating service user ==="
sudo useradd --system --no-create-home --shell /usr/sbin/nologin agent-ci 2>/dev/null || true

echo "=== Creating directories ==="
sudo mkdir -p /var/log/agent-ci /etc/nginx /usr/local/bin
sudo chown agent-ci:agent-ci /var/log/agent-ci

echo "=== Installing systemd services ==="
sudo cp "$DIR/nginx-agent-ci.conf" /etc/nginx/
sudo cp "$DIR/github-ingestor.service" /etc/systemd/system/
sudo cp "$DIR/insights-api.service" /etc/systemd/system/
sudo cp "$DIR/nginx.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable github-ingestor insights-api nginx

echo "=== Installing env file ==="
if [ ! -f /etc/agent-ci.env ]; then
  sudo cp "$DIR/agent-ci.env" /etc/agent-ci.env
  sudo chmod 600 /etc/agent-ci.env
  echo "WARNING: Edit /etc/agent-ci.env with real secrets!"
fi

echo ""
echo "=== VM setup complete ==="
echo "Next:"
echo "  1. Place github-ingestor + insights-api in /usr/local/bin/"
echo "  2. Place nginx static binary in /usr/local/bin/"
echo "  3. Set real secrets in /etc/agent-ci.env"
echo "  4. sudo systemctl start github-ingestor insights-api nginx"
