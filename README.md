# Agent CI Dashboard

A centralized, "Mission Control" dashboard for tracking GitHub Actions workflows across a GitHub Organization or set of repositories.

## Features

- **Hybrid Auth Model:** Publicly viewable dashboard — secure actions (triggering workflows, viewing logs) require GitHub OAuth sign-in.
- **In-App Terminal:** View raw build logs with ANSI color parsing without leaving the dashboard.
- **PWA Ready:** Installable on mobile and desktop as a native app.
- **True Web Push:** Receive background push notifications the moment a build fails (powered by Vercel KV and GitHub Webhooks).
- **GraphQL Optimized:** Batches all repository status requests into a single API call for maximum rate-limit efficiency.
- **Concurrency-Safe Deploys:** GitHub Actions concurrency groups prevent overlapping deployments.

## Local Setup

### 1. Clone & Install Dependencies

This project uses [Bun](https://bun.sh) for package management.

```sh
git clone https://github.com/<your-org>/<your-fork>.git
cd agent-ci-dashboard
bun install
```

### 2. Environment Variables

Copy the example file and fill in your values:

```sh
cp .env.example .env
```

See [`.env.example`](.env.example) for a description of every required variable.

**Key steps:**
- **`GITHUB_TOKEN`** — Create a Personal Access Token with `repo` and `workflow` scopes at [github.com/settings/tokens](https://github.com/settings/tokens).
- **`AUTH_SECRET`** — Generate with `openssl rand -base64 32`.
- **`AUTH_URL`** — Set to `http://localhost:5173` for local dev.
- **`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`** — Create a GitHub OAuth App at [github.com/settings/applications/new](https://github.com/settings/applications/new). Set the callback URL to `http://localhost:5173/auth/callback/github` for local dev.
- **`PUBLIC_VAPID_KEY` / `VAPID_PRIVATE_KEY`** — Generate with `npx web-push generate-vapid-keys`.
- **`WEBHOOK_SECRET`** — Generate with `openssl rand -hex 32`.

### 3. Run Locally

```sh
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

> **Note:** Push notifications require Vercel KV and a publicly reachable webhook URL. They will not work in local dev without a tunnel (e.g. `ngrok`).

---

## Production Deployment (Vercel)

### 1. Vercel KV (Redis)

Push notifications store subscriptions in a Redis-compatible KV store.

1. Go to your Vercel Project → **Storage**.
2. Create a new **KV Database** and link it to this project.
3. Vercel will automatically inject `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your environments.

### 2. Environment Variables

Mirror all variables from `.env.example` in Vercel's **Settings → Environment Variables**.

- Set `AUTH_URL` to your deployed domain.
- Create a **separate** GitHub OAuth App for production with its callback URL pointing to your deployed domain: `https://<your-domain>/auth/callback/github`.

### 3. GitHub Webhook (Push Notifications)

1. Go to your GitHub Organization → **Settings** → **Webhooks** → **Add webhook**.
2. Set **Payload URL** to `https://<your-domain>/api/webhook/github`.
3. Set **Content type** to `application/json`.
4. Set **Secret** to the value of your `WEBHOOK_SECRET`.
5. Under events, select **Let me select individual events** and check **Workflow runs**.
6. Save.

### 4. GitHub Actions Secrets (for CI/CD)

Add the following secrets to your repository under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `VERCEL_ORG_ID` | Your Vercel organization ID |
| `VERCEL_PROJECT_ID` | Your Vercel project ID |
| `VERCEL_TOKEN` | Your Vercel personal access token |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [SvelteKit](https://kit.svelte.dev) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Auth | [Auth.js (SvelteKit)](https://authjs.dev) |
| Deployment | [Vercel](https://vercel.com) |
| Storage | [Vercel KV](https://vercel.com/storage/kv) |
| Push | [web-push](https://github.com/web-push-libs/web-push) + Service Worker |
| CI/CD | GitHub Actions |
