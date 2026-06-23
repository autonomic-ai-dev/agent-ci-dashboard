#!/usr/bin/env bash
set -euo pipefail

# ============================================
# GCP Infrastructure Setup
# Creates e2-micro VM, firewall rules, and IAM
# Region: us-east1 (keep all services colocated)
# ============================================

PROJECT_ID="${GCP_PROJECT_ID:-autonomic-ai}"
ZONE="${GCP_ZONE:-us-east1-b}"
INSTANCE_NAME="${GCP_INSTANCE:-agent-ci-backend}"
SERVICE_ACCOUNT="github-actions-deployer"

echo "=== Setting up GCP project: $PROJECT_ID ==="

# Ensure required APIs are enabled
gcloud services enable \
  compute.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="$PROJECT_ID"

# Create service account for GitHub Actions
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

# Create service account key for GitHub Actions
gcloud iam service-accounts keys create gcp-sa-key.json \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"

echo "=== Add the contents of gcp-sa-key.json as GCP_SA_KEY in GitHub Secrets ==="
cat gcp-sa-key.json
echo ""
echo "=== Key saved to gcp-sa-key.json (delete after adding to GitHub) ==="

# Create firewall rule for gRPC-web (port 3002)
if ! gcloud compute firewall-rules describe allow-grpc-web --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute firewall-rules create allow-grpc-web \
    --project="$PROJECT_ID" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:3002 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=grpc-server
fi

# Create firewall rule for webhook (port 3001) — GitHub IPs only
if ! gcloud compute firewall-rules describe allow-webhook --project="$PROJECT_ID" &>/dev/null; then
  gcloud compute firewall-rules create allow-webhook \
    --project="$PROJECT_ID" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:3001 \
    --source-ranges=192.30.252.0/22,140.82.112.0/20,143.55.64.0/20 \
    --target-tags=grpc-server
fi

# Create the e2-micro VM
gcloud compute instances create "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=10GB \
  --boot-disk-type=pd-standard \
  --tags=grpc-server \
  --metadata=enable-oslogin=true

echo "=== VM created: $INSTANCE_NAME ==="
echo "Zone: $ZONE"
echo ""
echo "=== Next steps ==="
echo "1. SSH into the VM and run: setup-vm.sh"
echo "2. Add GCP_SA_KEY, SUPABASE_DB_URL, VERCEL_TOKEN to GitHub Secrets"
echo "3. Push to main to trigger deploy"
