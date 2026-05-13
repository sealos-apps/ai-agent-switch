# npm Installable CLI Distribution Implementation Plan

> Worker note: this historical plan was used to implement npm-first distribution.

## Goal

Make `ai-agent-switch` installable through `npm install` and `npm install -g` on all supported platforms. After installation, users can run `ai-agent-switch` or `as` without installing Bun.

## Architecture

Use one root package and four platform packages:

- Root package: `ai-agent-switch`
- Platform packages:
  - `ai-agent-switch-linux-x64`
  - `ai-agent-switch-darwin-arm64`
  - `ai-agent-switch-darwin-x64`
  - `ai-agent-switch-windows-x64`

The root package keeps Node.js wrappers and npm metadata. Platform packages contain standalone executables. The root package depends on platform packages through `optionalDependencies`. GitHub Actions builds and publishes platform packages before publishing the root package.

The wrapper only starts the local platform binary. It does not download, rebuild, or fall back to another installation path.

## Planned Files

- `bin/launcher.js`
- `bin/ai-agent-switch.js`
- `bin/as.js`
- `scripts/build-npm-package.ts`
- `tests/npm-launcher.test.ts`
- `tests/build-npm-package.test.ts`
- `.github/workflows/release.yml`
- `package.json`
- `README.md`

## Task 1: Root Package Wrapper

- [x] Add tests for platform package mapping and binary path generation.
- [x] Implement `platformPackageName()`.
- [x] Implement `binaryPathForCommand()`.
- [x] Implement `resolvePlatformPackageRoot()`.
- [x] Implement `runCommand()`.
- [x] Add command entry points for `ai-agent-switch` and `as`.
- [x] Run `bun test tests/npm-launcher.test.ts`.

## Task 2: Platform Package Builder

- [x] Add manifest generation tests.
- [x] Implement `platformPackageConfig()`.
- [x] Implement `renderPackageManifest()`.
- [x] Implement `runtimePackagePlatform()`.
- [x] Build a standalone executable for the current platform.
- [x] Copy the executable to the `as` alias.
- [x] Write platform package `package.json`.
- [x] Run `bun test tests/build-npm-package.test.ts`.

## Task 3: Release Workflow

- [x] Keep verification with `bun install --frozen-lockfile`, `bun test`, and `bun run typecheck`.
- [x] Build platform packages in a matrix.
- [x] Publish platform packages first.
- [x] Sync root `optionalDependencies` to the package version.
- [x] Publish the root package last.

## Task 4: Documentation

- [x] Document `npm install -g ai-agent-switch`.
- [x] Explain that npm installs the matching platform package automatically.
- [x] Document `ai-agent-switch` and `as`.

## Validation

- [x] Root package tests pass.
- [x] Platform package builder tests pass.
- [x] Manifest optional dependencies match the package version.
- [x] No postinstall download or fallback path was added.
