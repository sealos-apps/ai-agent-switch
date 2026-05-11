# GitHub Actions Release Build 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 `agent-switch` 在推送版本 tag 后通过 GitHub Actions 自动构建并发布可下载的 standalone CLI 资产，同时支持手动重跑发布；首版覆盖 `linux-x64`、`darwin-arm64`、`darwin-x64` 和 `windows-x64`。

**架构：** 先把“单平台构建 + 打包 + 校验”收敛到一个可复用的 Bun 脚本，再由一个 GitHub Actions workflow 负责验证、矩阵构建、汇总 checksum 和创建 Release。workflow 只做编排，不承载构建细节；Windows 目标直接输出 `.exe`，其他平台保持无后缀可执行文件。

**技术栈：** Bun、TypeScript、GitHub Actions、GitHub Release、tar.gz、SHA256。

---

## 需要修改的文件

- 创建：`scripts/build-release.ts`，负责单平台编译、目录整理、`tar.gz` 打包和 `SHA256SUMS` 生成。
- 创建：`tests/build-release.test.ts`，覆盖平台命名、产物命名和 checksum 格式等纯函数逻辑。
- 创建：`.github/workflows/release.yml`，负责 `verify -> build matrix -> release`。
- 修改：`package.json`，新增 release 相关脚本入口。
- 修改：`README.md`，补充 Release 下载/安装说明。

## 任务 1：实现单平台 release 构建脚本

**文件：**
- 创建：`scripts/build-release.ts`
- 创建：`tests/build-release.test.ts`

- [ ] **步骤 1：先写纯函数测试**

```ts
import { describe, expect, test } from "bun:test";
import { platformConfig, renderSha256Line } from "../scripts/build-release";

describe("release build helpers", () => {
  test("windows platform uses exe suffix", () => {
    expect(platformConfig("windows-x64").binarySuffix).toBe(".exe");
    expect(platformConfig("windows-x64").archiveName).toBe("agent-switch-windows-x64.tar.gz");
  });

  test("sha256 line matches tarball name", () => {
    expect(renderSha256Line("deadbeef", "agent-switch-linux-x64.tar.gz")).toBe(
      "deadbeef  agent-switch-linux-x64.tar.gz",
    );
  });
});
```

- [ ] **步骤 2：实现最少脚本逻辑**

```ts
export function platformConfig(platform: string) {
  return {
    binarySuffix: platform === "windows-x64" ? ".exe" : "",
    archiveName: `agent-switch-${platform}.tar.gz`,
  };
}
```

- [ ] **步骤 3：运行测试确认通过**

运行：`bun test tests/build-release.test.ts`
预期：通过，且 Windows 断言覆盖 `.exe` 后缀。

## 任务 2：接入 GitHub Actions 发布 workflow

**文件：**
- 创建：`.github/workflows/release.yml`

- [ ] **步骤 1：写出 verify + matrix + release 的 workflow**

```yml
name: release
on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:
    inputs:
      tag_name:
        description: "Release tag name"
        required: true
        type: string
```

- [ ] **步骤 2：让 build job 只管单平台产物**

```yml
strategy:
  matrix:
    include:
      - platform: linux-x64
        runner: ubuntu-latest
      - platform: darwin-arm64
        runner: macos-14
      - platform: darwin-x64
        runner: macos-13
      - platform: windows-x64
        runner: windows-latest
```

- [ ] **步骤 3：让 release job 汇总 archives 和 `SHA256SUMS`**

```yml
- name: Concatenate checksums
  run: find release-assets -name SHA256SUMS -print0 | xargs -0 cat > release-assets/SHA256SUMS
```

- [ ] **步骤 4：用现有仓库 token 发布 Release**

```yml
permissions:
  contents: write
```

## 任务 3：补充 package 脚本

**文件：**
- 修改：`package.json`

- [ ] **步骤 1：新增 release 构建入口**

```json
{
  "scripts": {
    "release:build": "bun run scripts/build-release.ts",
    "release:test": "bun test tests/build-release.test.ts"
  }
}
```

- [ ] **步骤 2：保留现有本地开发脚本不变**

```json
{
  "scripts": {
    "build": "bun build ./src/cli/main.ts --target=bun --outfile=dist/agent-switch.js && cp dist/agent-switch.js dist/as.js"
  }
}
```

## 任务 4：补充 README 下载说明

**文件：**
- 修改：`README.md`

- [ ] **步骤 1：补 Release 下载说明**

```md
## Release 下载

从 GitHub Release 下载对应平台的 `tar.gz`，解压后直接运行：

```bash
./agent-switch status
./as status
```
```

- [ ] **步骤 2：说明 Windows 产物是 `.exe`**

```md
Windows 资产内提供 `agent-switch.exe` 和 `as.exe`，可直接双击或在终端中运行。
```

## 自检

1. 设计覆盖度：确认 `tag push`、`workflow_dispatch`、四平台、`SHA256SUMS`、Release 发布和 README 安装说明都有任务。
2. 占位符扫描：不使用“待定”“后续实现”等占位表述。
3. 类型一致性：`platformConfig()`、`renderSha256Line()`、`release:build` 脚本名在所有任务中保持一致。

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-05-11-github-actions-release-build.md`。两种执行方式：

1. 子代理驱动（推荐）
2. 内联执行

选哪种方式？
