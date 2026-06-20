# Agent CI Dashboard

A centralized, "Mission Control" dashboard for tracking GitHub workflows across the `autonomic-ai-dev` agent ecosystem.

## Features

- **Hybrid Auth Model:** Publicly viewable dashboard, but secure actions (triggering workflows, viewing logs) require GitHub OAuth.
- **In-App Terminal:** View raw build logs with ANSI color parsing without leaving the dashboard.
- **PWA Ready:** Installable on mobile and desktop as a native app.
- **True Web Push:** Receive background push notifications instantly when a build fails (powered by Vercel KV and Webhooks).
- **GraphQL Optimized:** Batches 10 API requests into 1 for maximum rate-limit efficiency.

## Local Setup

### 1. Install Dependencies
This project uses Bun for package management.
```sh
bun install
```

### 2. Environment Variables
Create a `.env` file in the root directory:

```env
# GitHub PAT with `repo` and `workflow` scopes
GITHUB_TOKEN=github_pat_...

# Auth.js Secrets
AUTH_SECRET="generated-base64-secret"
AUTH_URL="http://localhost:5173"

# GitHub OAuth App (For Local Dev: Callback URL = http://localhost:5173/auth/callback/github)
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."

# VAPID Keys for Push Notifications
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."

# Webhook Secret for Push Notifications
WEBHOOK_SECRET="..."
```

### 3. Run Locally
```sh
bun run dev
```

## Vercel Production Setup

To deploy this project to Vercel, you need to configure the following pieces of infrastructure:

### 1. Vercel KV (Redis)
Push Notifications require a database to store subscriptions.
1. Go to your Vercel Project Dashboard -> **Storage**.
2. Create a new **KV Database**.
3. Link it to this project (this will automatically inject `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your environments).

### 2. Vercel Environment Variables
Ensure all variables from your `.env` are mirrored in Vercel's **Settings -> Environment Variables** tab.
Make sure the `AUTH_URL` is set to your live domain (e.g., `https://agent-ci-dashboard.vercel.app`).
Make sure the `GITHUB_CLIENT_ID` and `SECRET` belong to your *Production* GitHub OAuth App.

### 3. GitHub Webhook (Push Notifications)
To receive push notifications the second a build fails:
1. Go to your GitHub Organization -> **Settings** -> **Webhooks**.
2. Click **Add webhook**.
3. Payload URL: `https://agent-ci-dashboard.vercel.app/api/webhook/github`
4. Content type: `application/json`
5. Secret: The value of your `WEBHOOK_SECRET`.
6. Select **Let me select individual events**, and check **Workflow runs**.
7. Save webhook.

## Continuous Integration
This repository uses GitHub Actions (`.github/workflows/deploy.yml`) to automatically build and deploy to Vercel on pushes to `master`.

Required GitHub Secrets for CI:
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`
