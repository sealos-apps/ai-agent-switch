# GitHub Actions Release Build Implementation Plan

> Worker note: this historical plan was created before the npm-first distribution path. It is kept for project context.

## Goal

Build standalone CLI assets automatically after pushing a version tag, publish them to GitHub Releases, and support manual release reruns. Initial targets were `linux-x64`, `darwin-arm64`, `darwin-x64`, and `windows-x64`.

## Architecture

Move single-platform build, packaging, and checksum generation into a reusable Bun script. Let GitHub Actions handle verification, matrix builds, checksum collection, and Release creation. Windows outputs use `.exe`; other platforms use suffixless executables.

## Planned Files

- `scripts/build-release.ts`
- `tests/build-release.test.ts`
- `.github/workflows/release.yml`
- `package.json`
- `README.md`

## Planned Tasks

- [x] Define platform naming and archive naming tests.
- [x] Implement a release build script for one platform.
- [x] Build both `ai-agent-switch` and `as`.
- [x] Package platform directories as `tar.gz`.
- [x] Generate `SHA256SUMS`.
- [x] Add GitHub Actions verification steps.
- [x] Add matrix builds for supported platforms.
- [x] Upload release assets.
- [x] Document release download usage.

## Later Direction

The project later moved to npm-first distribution using a root package plus platform-specific optional dependencies. GitHub Release assets can still be useful, but npm install is the preferred global installation path.
