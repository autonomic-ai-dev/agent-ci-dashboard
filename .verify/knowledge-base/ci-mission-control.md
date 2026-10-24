# CI mission control

## What it does

agent-ci-dashboard is the web console for the Autonomic repositories. It shows build status and pull requests across the organ repos, runs workflow and merge actions for signed-in users, and sends a push notification when a build fails.

## How it works

1. **Status.** `telemetry.ts` batches repository status requests into one GraphQL query. The overview page and `api/status` read the result.
2. **Pull requests.** The `api/pulls` routes list open pull requests. Merge and branch-update actions are separate routes and need a signed-in user.
3. **Logs.** A repository page fetches run logs through `api/repo/[name]/logs` and renders the ANSI colour codes in the browser.
4. **Failure alerts.** GitHub sends `workflow_run` events to `api/webhook/github`. The handler checks the HMAC signature, then `push.ts` notifies the subscribers stored by `api/push/subscribe`.

## Where the code is

- `src/routes/` holds the pages and API routes.
- `src/lib/server/` holds `telemetry.ts`, `push.ts`, and `formula.ts`.
- `src/sw.ts` is the service worker for push.

## How to use it

- `bun install`, copy `.env.example` to `.env`, then `bun run dev`.
- Sign in with GitHub to trigger workflows or merge pull requests.

## How it is verified

- `sh .verify/playbooks/verify_usage_page.sh` runs the type and Svelte checks for `/usage`. No automated test covers the other routes on master.

## Known limits

- The status and merge paths were not exercised against live GitHub in this pass.
- `GITHUB_TOKEN` needs `repo` and `workflow` scopes, or the status queries fail.

## Related

- Feature map: `.verify/features/ci-mission-control.md`
- Telemetry source: agent-tui, for the terminal view of the same workflow data
