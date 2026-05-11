# npm 全平台安装实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 `agent-switch` 可以通过 `npm install` 或 `npm install -g` 在四个平台上直接获得可运行的 CLI 命令 `agent-switch` / `as`，并把发布流程切换为 npm 包发布。

**架构：** 根包 `agent-switch` 只保留 Node 包装器和 npm 元数据，实际 CLI 由四个 scoped 平台包提供 standalone executable。GitHub Actions 先在对应平台构建并发布平台包，最后发布根包；包装器只做本地进程拉起，不做任何下载或 fallback。

**技术栈：** npm、Node.js ESM、Bun standalone executable、GitHub Actions、TypeScript、`spawnSync`。

---

## 需要修改的文件

- 创建：`bin/launcher.js`，根包共享包装器逻辑。
- 创建：`bin/agent-switch.js`，`agent-switch` 命令入口。
- 创建：`bin/as.js`，`as` 命令入口。
- 创建：`scripts/build-npm-package.ts`，单个平台二进制包构建与包目录组装。
- 创建：`tests/npm-launcher.test.ts`，覆盖包装器平台映射与进程启动参数。
- 创建：`tests/build-npm-package.test.ts`，覆盖平台包名、二进制命名和 manifest 生成。
- 修改：`.github/workflows/release.yml`，切换成 npm 构建与发布流程。
- 修改：`package.json`，更新 `bin`、`optionalDependencies`、`files` 和发布脚本。
- 修改：`README.md`，补充 npm 安装与运行说明。
- 删除：`scripts/build-release.ts` 和 `tests/build-release.test.ts`，它们会被 npm 包构建脚本替代。

## 任务 1：实现根包包装器

**文件：**
- 创建：`bin/launcher.js`
- 创建：`bin/agent-switch.js`
- 创建：`bin/as.js`
- 创建：`tests/npm-launcher.test.ts`

- [ ] **步骤 1：先写包装器纯函数测试**

```ts
import { describe, expect, test } from "bun:test";
import { platformPackageName, binaryPathForCommand } from "../bin/launcher.js";

describe("npm launcher", () => {
  test("maps linux x64 to the linux scoped package", () => {
    expect(platformPackageName({ platform: "linux", arch: "x64" })).toBe("@agent-switch/linux-x64");
  });

  test("builds the unix binary path from the command name", () => {
    expect(binaryPathForCommand("/tmp/pkg", "agent-switch", false)).toBe("/tmp/pkg/agent-switch");
  });
});
```

- [ ] **步骤 2：实现最少包装器逻辑**

```js
export function runCommand(commandName, runtime = { platform: process.platform, arch: process.arch }) {
  const packageName = platformPackageName(runtime);
  const packageRoot = dirname(createRequire(import.meta.url).resolve(`${packageName}/package.json`));
  const binaryPath = binaryPathForCommand(packageRoot, commandName, runtime.platform === "win32");
  const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
```

- [ ] **步骤 3：运行包装器测试**

运行：`bun test tests/npm-launcher.test.ts`
预期：通过，且平台包名与二进制路径断言成立。

## 任务 2：实现平台包构建脚本

**文件：**
- 创建：`scripts/build-npm-package.ts`
- 创建：`tests/build-npm-package.test.ts`

- [ ] **步骤 1：先写 manifest 生成测试**

```ts
import { describe, expect, test } from "bun:test";
import { platformPackageConfig, renderPackageManifest } from "../scripts/build-npm-package";

describe("npm package builder", () => {
  test("windows package uses exe suffix and public scope", () => {
    const config = platformPackageConfig("windows-x64", "0.1.0");
    const manifest = renderPackageManifest(config);
    expect(manifest.name).toBe("@agent-switch/windows-x64");
    expect(manifest.bin["agent-switch"]).toBe("./agent-switch.exe");
  });
});
```

- [ ] **步骤 2：实现单平台构建与组装**

```ts
export async function buildNpmPackage(options: BuildNpmPackageOptions): Promise<BuildNpmPackageResult> {
  const config = platformPackageConfig(options.platform, options.version);
  const packageRoot = path.resolve(options.outDir, config.packageName);
  const entrypoint = options.entrypoint ?? path.resolve(repoRoot(), "src/cli/main.ts");
  await mkdir(packageRoot, { recursive: true });
  execFileSync(process.execPath, ["build", "--compile", "--outfile", path.join(packageRoot, config.binaryName("agent-switch")), entrypoint], { stdio: "inherit" });
  await copyFile(path.join(packageRoot, config.binaryName("agent-switch")), path.join(packageRoot, config.binaryName("as")));
  await writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify(renderPackageManifest(config), null, 2)}\n`);
}
```

- [ ] **步骤 3：运行脚本测试**

运行：`bun test tests/build-npm-package.test.ts`
预期：通过，manifest 里应包含 `os` / `cpu` / `files` / `publishConfig.access`。

## 任务 3：切换发布 workflow

**文件：**
- 修改：`.github/workflows/release.yml`
- 修改：`package.json`

- [ ] **步骤 1：把发布流程改成“先平台包，后根包”**

```yml
- name: Publish platform package
  run: npm publish --access public

- name: Publish root package
  run: npm publish
```

- [ ] **步骤 2：给根包加 npm 元数据**

```json
{
  "bin": {
    "agent-switch": "./bin/agent-switch.js",
    "as": "./bin/as.js"
  },
  "optionalDependencies": {
    "@agent-switch/linux-x64": "0.1.0",
    "@agent-switch/darwin-arm64": "0.1.0",
    "@agent-switch/darwin-x64": "0.1.0",
    "@agent-switch/windows-x64": "0.1.0"
  },
  "files": [
    "bin"
  ]
}
```

- [ ] **步骤 3：把 workflow 的验证步骤保留下来**

```yml
- uses: oven-sh/setup-bun@v2
- run: bun install --frozen-lockfile
- run: bun test
- run: bun run typecheck
```

## 任务 4：更新 README

**文件：**
- 修改：`README.md`

- [ ] **步骤 1：补 npm 安装说明**

~~~md
## 安装

```bash
npm install -g agent-switch
```
~~~

- [ ] **步骤 2：说明命令和平台包关系**

```md
安装后可直接运行 `agent-switch` 或 `as`。npm 会根据当前平台自动安装对应的二进制包，无需手动下载 release 资产。
```

## 自检

1. 规格覆盖度：根包包装器、四个平台包、npm 发布顺序、README 安装说明都对应到了任务。
2. 占位符扫描：没有使用“待定”“后续实现”之类的占位表述。
3. 类型一致性：`platformPackageName()`、`binaryPathForCommand()`、`platformPackageConfig()`、`renderPackageManifest()` 的命名在所有任务中保持一致。

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-05-11-npm-installable-cli-distribution.md`。两种执行方式：

1. 子代理驱动（推荐）
2. 内联执行

选哪种方式？
