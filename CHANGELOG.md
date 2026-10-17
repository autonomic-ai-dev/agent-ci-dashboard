# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.3.2] - 2026-10-18

### Added
- **Live In-Progress CI Execution Diagnostics (ABH-14)**: Live step and runner tracking for running or queued GitHub Actions workflows via Octokit `listJobsForWorkflowRun`.
- **Terminal Auto-Polling & Live Badge**: 4-second auto-refresh polling with a pulsing `LIVE RUNNING` indicator and manual refresh button.
- **Server-Sent Events (SSE) Telemetry Streaming**: Added `/api/telemetry/stream` and fallback ingestion `/api/telemetry/ingest` with live usage cards on `/usage`.
- **CI Skip Path Optimizations**: Enhanced `.github/workflows/ci.yml` to skip pipeline execution when changes only affect `CHANGELOG.md`, `CONTEXT.md`, and markdown documentation files.

### Changed
- Bumped version to `v1.0.0-beta.3.2`.

## [1.0.0-beta.3.1] - 2026-10-17

### Added
- **Fleet Model Usage & Governance Telemetry View (ABH-11)**: Real-time aggregated token spend, provider breakdown cards, cost velocity indicators, and threshold alert badges.
- **GitHub Merge Queue Enqueue Support**: Automatic fallback to GraphQL `enqueuePullRequest` mutation when standard squash merge encounters repository rule merge queue requirements.
- **Dynamic Formula Version Alignment**: Derive ecosystem version baseline directly from `autonomic-stack.rb` formula without stale hardcoded version fallbacks.
- Comprehensive verify playbook `.verify/run.sh` covering Svelte check, build, and API endpoint verification.

### Changed
- Bumped version to `v1.0.0-beta.3.1`.

## [1.0.0-beta.3] - 2026-10-17

### Fixed
- **Dynamic Release Tags** — Removed hardcoded fallback strings; dynamically resolve real release tags from GitHub API.
- **Ecosystem Baseline Consistency** — Synchronized version badge and telemetry cards across breadcrumb, sidebar, and PR tabs.

### Changed
- Bumped version to `v1.0.0-beta.3`.
- Relocated comprehensive `CONTEXT.md` to repository root.

## [1.0.0-beta.2] - 2026-10-16

### Added
- **Checks Strip & Failure Granularity** — Differentiated checks failed vs checks running with interactive strip.
- **In-App ANSI Terminal** — Colorized build log viewer with automatic ANSI code translation.
- **Stitch Aerospace Design System** — Dark carbon canvas, elevated telemetry panels, and status beacons.

### Fixed
- Resolved Svelte 5 state reactivity warning and initialized lazy VAPID web push.

## [1.0.0-beta.1] - 2026-10-16

### Changed
- Unified ecosystem versioning to 1.0.0-beta.1
- Aligned documentation and CI path filters with agent-brain
