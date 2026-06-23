#!/usr/bin/env bash
set -euo pipefail

# ============================================
# VM Provisioning Script
# Run once after `gcloud compute instances create`
# via: gcloud compute ssh agent-ci-backend -- < infra/setup-vm.sh
# ============================================

echo "=== Installing system dependencies ==="
sudo apt-get update -qq
sudo apt-get install -y -qq \
  postgresql-client \
  curl \
  ca-certificates

echo "=== Creating service users ==="
sudo useradd --system --no-create-home --shell /usr/sbin/nologin agent-ci 2>/dev/null || true

echo "=== Creating directories ==="
sudo mkdir -p /var/log/agent-ci
sudo chown agent-ci:agent-ci /var/log/agent-ci

echo "=== Installing systemd services ==="
sudo tee /etc/systemd/system/github-ingestor.service > /dev/null <<'SERVICE'
[Unit]
Description=Agent CI GitHub Ingestor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=agent-ci
Group=agent-ci
ExecStart=/usr/local/bin/github-ingestor
Restart=on-failure
RestartSec=5
EnvironmentFile=/etc/agent-ci.env
StandardOutput=append:/var/log/agent-ci/ingestor.log
StandardError=append:/var/log/agent-ci/ingestor.log

[Install]
WantedBy=multi-user.target
SERVICE

sudo tee /etc/systemd/system/insights-api.service > /dev/null <<'SERVICE'
[Unit]
Description=Agent CI Insights gRPC API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=agent-ci
Group=agent-ci
ExecStart=/usr/local/bin/insights-api
Restart=on-failure
RestartSec=5
EnvironmentFile=/etc/agent-ci.env
StandardOutput=append:/var/log/agent-ci/api.log
StandardError=append:/var/log/agent-ci/api.log

[Install]
WantedBy=multi-user.target
SERVICE

echo "=== Creating env file template ==="
if [ ! -f /etc/agent-ci.env ]; then
  sudo tee /etc/agent-ci.env > /dev/null <<'ENV'
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres
GITHUB_TOKEN_BACKEND=github_pat_REPLACE_ME
GITHUB_WEBHOOK_SECRET=REPLACE_ME
INGESTOR_PORT=3001
API_PORT=3002
ENV
  sudo chmod 600 /etc/agent-ci.env
  echo "=== EDIT /etc/agent-ci.env with real values ==="
else
  echo "=== /etc/agent-ci.env already exists ==="
fi

sudo systemctl daemon-reload
sudo systemctl enable github-ingestor insights-api

echo "=== VM setup complete ==="
echo "Edit /etc/agent-ci.env with your secrets, then:"
echo "  sudo systemctl start github-ingestor insights-api"
