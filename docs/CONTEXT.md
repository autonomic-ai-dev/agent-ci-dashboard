# agent-ci-dashboard — Context for agents

Mission-control UI for GitHub Actions across Autonomic (and org) repos.

| Field | Value |
|-------|-------|
| Role | CI observability / trigger UI |
| Stack | SvelteKit (Bun) + Rust workspace |
| Version | 0.1.0+ |

## When to use

View workflow status, logs, push notifications; trigger Actions with OAuth. Not a substitute for organ daemons.

## Verification

Frontend/backend checks:

```bash
bun run check && bun run build
cargo test --workspace
# preferred wrapped:
agent-brain verify -- bun run check
```

## CI

PR path filter skips jobs when only non-runtime paths change. Push paths limited to `src/`, `crates/`, `proto/`, `migrations/`, lockfiles, `.github/`.

## Related

Organs' `.github/workflows/ci.yml` (pipeline-compose / path filters) · agent-body (cluster)
