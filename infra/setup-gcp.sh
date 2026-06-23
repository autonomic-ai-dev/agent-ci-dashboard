#!/usr/bin/env bash
set -euo pipefail

# ============================================
# GCP Infrastructure Setup — $0 blueprint
# Creates e2-micro VM (no external IP), IAP,
# firewall rules, and WIF for GitHub Actions
# Region: us-east1 (free tier)
# ============================================

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
ZONE="${GCP_ZONE:-us-east1-b}"
INSTANCE_NAME="${GCP_INSTANCE:-agent-ci-backend}"
SERVICE_ACCOUNT="github-actions-deployer"

echo "=== Setting up GCP project: $PROJECT_ID ==="

# Enable APIs
gcloud services enable \
  compute.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="$PROJECT_ID"

# Create service account
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" --project="$PROJECT_ID" &>/dev/null; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT" \
    --display-name="GitHub Actions Deployer" \
    --project="$PROJECT_ID"
fi

SA_EMAIL="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"

# Grant minimal permissions
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/compute.instanceAdmin.v1"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iap.tunnelResourceAccessor"

# Enable Private Google Access on the subnet (VM needs this for Google APIs)
gcloud compute networks subnets update default \
  --project="$PROJECT_ID" \
  --region="${ZONE%-*}" \
  --enable-private-ip-google-access

# IAP SSH firewall
if ! gcloud compute firewall-rules describe allow-ssh-iap --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute firewall-rules create allow-ssh-iap \
    --project="$PROJECT_ID" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:22 \
    --source-ranges=35.235.240.0/20
fi

# Create e2-micro VM — no external IP ($0 cost)
gcloud compute instances create "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=10GB \
  --boot-disk-type=pd-standard \
  --no-address \
  --metadata=enable-oslogin=true

echo "=== VM created: $INSTANCE_NAME (no external IP) ==="
echo ""
echo "=== Next steps ==="
echo "1. Set up WIF: gcloud iam service-accounts add-iam-policy-binding ..."
echo "2. SCP infra/setup-vm.sh -> VM: gcloud compute scp ... --tunnel-through-iap"
echo "3. SSH via IAP: gcloud compute ssh $INSTANCE_NAME --tunnel-through-iap"
echo "4. Run local tunnel: infra/start-tunnels.sh"
