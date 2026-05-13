# npm Installable CLI Distribution Design

> Worker note: this historical design was used to implement npm-first distribution.

## Goal

Make `ai-agent-switch` installable through `npm install` and `npm install -g` on all supported platforms. After installation, users can run `ai-agent-switch` and `as` without installing Bun.

## Architecture

Use one root package plus four platform-specific binary packages.

The root package `ai-agent-switch` contains only Node.js wrappers and npm metadata. Platform packages are installed through `optionalDependencies` and contain standalone executables. GitHub Actions builds platform packages on matching runners, publishes platform packages first, then publishes the root package.

## Technology

- npm
- Node.js ESM
- Bun standalone executables
- GitHub Actions
- TypeScript
- `spawnSync`
- `npm publish`

## Context

The CLI source depends on the Bun runtime. A plain npm package containing source code would not provide a directly runnable global command. The distribution model must publish prebuilt standalone binaries while preserving npm-native installation.

## Confirmed Decisions

- Root package name: `ai-agent-switch`.
- Platform packages:
  - `ai-agent-switch-linux-x64`
  - `ai-agent-switch-darwin-arm64`
  - `ai-agent-switch-darwin-x64`
  - `ai-agent-switch-windows-x64`
- The root package uses `optionalDependencies` for platform packages.
- Root package `bin` entries point to Node.js wrappers.
- Platform packages publish standalone executables only.
- No postinstall download.
- No fallback download path.
- npm registry is the primary installation path.

## Options

### Option A: GitHub Release binaries only

Pros:

- Simple build flow.
- Downloaded files are complete executables.

Cons:

- Does not satisfy npm installation.
- Requires manual user download steps.

### Option B: Root wrapper package plus optional platform packages

Pros:

- `npm install` and `npm install -g` work directly.
- Each platform installs only its matching binary package.
- No extra network download logic is needed.
- This matches common npm native binary distribution patterns.

Cons:

- Requires wrapper code.
- CI must publish platform packages before the root package.

### Option C: postinstall binary download

Pros:

- Only one npm package is needed.

Cons:

- Requires custom download logic.
- Installation depends on extra network access.
- Encourages fallback behavior that the project intentionally avoids.

## Decision

Choose Option B. It satisfies global npm installation without introducing download fallback logic.

## Package Structure

### Root Package

Root package contents:

- `bin/launcher.js`
- `bin/ai-agent-switch.js`
- `bin/as.js`
- `README.md`
- `README_CN.md`
- `package.json`

Root wrapper responsibilities:

- Detect the current `process.platform` / `process.arch`.
- Map the runtime to the matching platform package.
- Resolve the installed platform package path.
- Execute the platform binary with `spawnSync`.
- Forward argv, stdio, and exit status.

Root wrapper non-goals:

- No network download.
- No fallback installation.
- No local rebuild.
- No implicit platform guessing beyond an explicit map.

### Platform Packages

Each platform package contains:

- `ai-agent-switch`
- `as`

Windows packages use `.exe` suffixes. Platform package manifests include:

- `os`
- `cpu`
- `bin`
- `files`
- `publishConfig.access = "public"`

## Build and Publish Flow

### Build

GitHub Actions builds platform packages in a matrix:

- `linux-x64`
- `darwin-arm64`
- `darwin-x64`
- `windows-x64`

Each build:

1. Checks out the target tag.
2. Installs dependencies.
3. Runs tests and typecheck.
4. Compiles `src/cli/main.ts` into a standalone executable.
5. Assembles the platform package directory.
6. Writes package manifest and binaries.

### Publish

Publish order:

1. Publish all platform packages.
2. Publish the root `ai-agent-switch` package.

This ensures npm can resolve root package `optionalDependencies` during installation.

## Wrapper Files

- `bin/launcher.js`: platform mapping, package path resolution, and process spawning.
- `bin/ai-agent-switch.js`: command entry point for `ai-agent-switch`.
- `bin/as.js`: command entry point for `as`.

Implementation requirements:

- Use ESM.
- Use `createRequire(import.meta.url)` to resolve platform packages.
- Use `spawnSync` or equivalent process spawning.
- Preserve stdin/stdout/stderr.
- Return the platform binary exit code.
- Keep command and platform package mapping explicit.

## Build Script Responsibilities

`scripts/build-npm-package.ts` builds one platform package:

- Accept platform, output directory, version, and optional entry point.
- Compile a standalone executable with Bun.
- Copy the executable to the `as` alias.
- Add `.exe` suffix for Windows.
- Write platform package `package.json`.

The root wrapper does not need compilation and is published as JavaScript source.

## README Requirements

README must document:

```bash
npm install -g ai-agent-switch
```

It must also explain:

- Run `ai-agent-switch` after installation.
- `as` is an alias.
- npm installs the matching platform binary automatically.
- Manual GitHub Release download is not required for npm users.

## Non-Goals

- No postinstall download from GitHub or elsewhere.
- No automatic upgrade system.
- No code signing or notarization.
- No CLI business logic changes.
- No database, cache, or telemetry.

## Acceptance Criteria

1. `npm install ai-agent-switch` installs the matching platform binary package on supported platforms.
2. `npm install -g ai-agent-switch` exposes `ai-agent-switch` and `as`.
3. Platform binaries are standalone executables and do not require Bun.
4. The workflow publishes platform packages before the root package.
5. The repository adds no download fallback or postinstall fetch logic.
6. README documents npm installation and supported command usage.
