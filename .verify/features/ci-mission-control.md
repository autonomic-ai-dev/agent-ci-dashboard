# ci-mission-control

Summary: agent-ci-dashboard is a web console for the Autonomic repositories. It shows GitHub Actions status and pull requests across the organ repos, lets a signed-in user trigger and merge work, and sends push notifications when a build fails.

## Sub-features

- `repo-status-overview`: Shows the build state of every organ repository on one page.
  - Intent: One view of the whole ecosystem.
  - Behaviour: `src/routes/+page.server.ts` and `src/routes/+page.svelte`. The status API is `src/routes/api/status/+server.ts`. Batched GraphQL queries live in `src/lib/server/telemetry.ts`.
  - Outcome: The grid reflects the latest workflow runs. Not verified in this pass.
- `pull-request-queue`: Lists and merges open pull requests.
  - Behaviour: `src/routes/api/pulls/+server.ts`, `api/pulls/batch-merge/+server.ts`, and per-repo routes under `src/routes/api/repo/[name]/pulls/`. Merge and branch update are in `pulls/merge` and `pulls/update-branch`.
  - Outcome: Merges and branch updates run only for signed-in users. Not verified in this pass.
- `repo-detail-and-logs`: Shows one repository's runs, issues, history, and ANSI-coloured logs.
  - Behaviour: `src/routes/repo/[name]/+page.svelte` with `api/repo/[name]/logs`, `history`, `issues`, and `run`.
  - Outcome: Raw build logs render in the browser. Not verified in this pass.
- `usage-view`: Shows usage figures from the telemetry pipeline.
  - Behaviour: `src/routes/usage/+page.svelte`, `src/routes/api/usage/+server.ts`, and `src/lib/server/telemetry.ts`.
  - Outcome: Usage data appears on the page. Not verified in this pass.
- `build-failure-push`: Sends a web push when a build fails.
  - Behaviour: `src/routes/api/webhook/github/+server.ts` receives webhooks. `src/lib/server/push.ts` sends push messages to subscriptions stored by `src/routes/api/push/subscribe/+server.ts`. The service worker is `src/sw.ts`.
  - Outcome: A failed build notifies subscribed devices. Not verified in this pass.

## Code

- `src/`
- `package.json`
- `vite.config.ts`

## How to get to it (user POV)

- Run `bun install`, copy `.env.example` to `.env`, then `bun run dev` and open http://localhost:5173.
- Sign in with GitHub to trigger workflows or merge pull requests.

## Verification Suites (Targeted Test Commands)

- `sh .verify/playbooks/verify_usage_page.sh` runs `npm run check` for the `/usage` route. No automated test covers the other routes on master.

## Gotchas

- Publicly viewable pages do not need sign-in. Triggering workflows, merging, and reading logs do need it.
- A webhook with an invalid HMAC signature is rejected. The shared secret is `WEBHOOK_SECRET`.
- The app needs `GITHUB_TOKEN` with `repo` and `workflow` scopes, or the status queries fail.
