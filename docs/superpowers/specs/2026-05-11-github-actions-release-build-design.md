# GitHub Actions Release Build Design

> Worker note: this historical design predates the npm-first distribution path. It is kept for project context.

## Goal

When a version tag is pushed, build downloadable standalone CLI binaries for `ai-agent-switch`, publish them to GitHub Releases, and keep a manual rerun path for maintainers.

## Architecture

Use one release workflow with these phases:

1. Verify.
2. Build.
3. Package.
4. Publish.

Build logic lives in a reusable script. The workflow handles triggers, permissions, artifact collection, and Release uploads. Binaries are generated with Bun standalone executable support, so users can run them without installing Bun.

## Technology

- GitHub Actions
- Bun
- TypeScript
- GitHub Releases
- SHA256 checksums
- `tar.gz`

## Context

The repository already had local build support, but that build path was developer-oriented. Users still needed a local runtime or build environment. Release assets should instead be directly executable after download.

## Confirmed Decisions

- Publish standalone executables, not only JS bundles from `dist/`.
- Trigger automatically on `v*.*.*` tags.
- Support `workflow_dispatch` with an explicit `tag_name`.
- Initial platforms:
  - `linux-x64`
  - `darwin-arm64`
  - `darwin-x64`
  - `windows-x64`
- Each platform includes both `ai-agent-switch` and `as`.
- Windows assets use `.exe`.
- Run `bun test` and `bun run typecheck` before publishing.
- Generate `SHA256SUMS`.
- Use the repository `GITHUB_TOKEN`; no personal token is needed.

## Options

### Option A: Upload JS bundles only

Pros:

- Smallest change.
- Matches the local build output.

Cons:

- Users still need Bun.
- Does not meet the direct-download goal.

### Option B: Build standalone executables with Bun

Pros:

- Users can run binaries immediately after extraction.
- The distribution matches the CLI entry points.
- One workflow can handle verification, build, packaging, and release upload.

Cons:

- Requires packaging logic.
- Requires Windows suffix handling.

### Option C: Publish packages and also maintain Release assets

Pros:

- Supports package-manager installation.

Cons:

- More complex release chain.
- Longer user path than direct binary download.

## Decision

Choose Option B for the release-asset path. It best satisfies direct download and execution while keeping implementation complexity manageable.

The project later adopted npm-first distribution for installation. This release design remains useful as historical context and optional asset distribution guidance.

## Workflow Design

### Triggers

- `push` to `v*.*.*` tags.
- `workflow_dispatch` with explicit `tag_name`.

### Permissions and Concurrency

- Request only `contents: write`.
- Use a fixed concurrency group per tag to prevent duplicate release races.

### Verification

Run these before build/publish:

1. `actions/checkout`.
2. `bun install --frozen-lockfile`.
3. `bun test`.
4. `bun run typecheck`.

### Build

The build script should:

- Generate standalone executables for supported platforms.
- Create one output directory per platform.
- Include `ai-agent-switch` and `as`.
- Use `.exe` for Windows.
- Package each platform directory as `tar.gz`.
- Generate `SHA256SUMS`.

Suggested asset names:

- `ai-agent-switch-linux-x64.tar.gz`
- `ai-agent-switch-darwin-arm64.tar.gz`
- `ai-agent-switch-darwin-x64.tar.gz`
- `ai-agent-switch-windows-x64.tar.gz`
- `SHA256SUMS`

### Publish

- Use the tag name as the release version.
- Upload all platform archives and `SHA256SUMS`.
- Keep the release title aligned with the tag.

## Non-Goals

- No npm publishing in this design.
- No code signing or notarization.
- No automatic tag creation.
- No CLI runtime behavior changes.

## Acceptance Criteria

1. Pushing a `v*.*.*` tag runs verification, build, packaging, and Release upload.
2. Manual workflow dispatch can rerun the same release flow.
3. The Release page contains all platform archives and `SHA256SUMS`.
4. Users can extract and run `ai-agent-switch` or `as` without installing Bun.
5. Local development build paths remain available.
