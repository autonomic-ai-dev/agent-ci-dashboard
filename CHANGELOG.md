# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
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
