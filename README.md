# Agent CI Dashboard

A web console for the Autonomic repositories. It shows GitHub Actions status and pull requests across the organ repos, lets a signed-in user trigger workflows and merge pull requests, and sends a push notification when a build fails.

Agent context: [CONTEXT.md](CONTEXT.md).

## Local setup

```bash
bun install
cp .env.example .env   # fill in the values listed there
bun run dev
```

Open http://localhost:5173. Push notifications need a public webhook URL, so they don't work in local dev without a tunnel.

## Deploy (Vercel)

1. Create a Vercel KV database and link it to the project. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. Copy the variables from `.env.example` into the project's environment settings. Set `AUTH_URL` to the deployed domain.
3. Create a separate GitHub OAuth app for production. Its callback is `https://<domain>/auth/callback/github`.
4. Add a GitHub organization webhook. Its payload URL is `https://<domain>/api/webhook/github`, its content type is `application/json`, its secret is `WEBHOOK_SECRET`, and it subscribes to workflow runs.
5. Add `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN` as repository secrets for the deploy workflow.

## Develop

```bash
npm run check
npm run build
```

Feature map and knowledge base: `.verify/features/` and `.verify/knowledge-base/`.
