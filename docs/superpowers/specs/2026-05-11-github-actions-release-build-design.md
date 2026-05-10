# GitHub Actions 自动构建与发布设计

> **面向 AI 代理的工作者：** 本规格通过后，下一步应使用 `writing-plans` 生成实现计划，再按计划实现。

**目标：** 在推送版本 tag 时自动构建 `agent-switch` 的可下载 CLI 二进制，并发布到 GitHub Release；同时保留手动触发入口，方便维护者重跑发布。

**架构：** 采用单一发布 workflow 串联「校验 → 构建 → 打包 → 发布」。构建逻辑收敛到一个可复用的脚本里，workflow 只负责触发、权限、产物收集和 release 上传。二进制使用 Bun 的 standalone executable 能力生成，下载后不需要再安装 Bun 就能直接运行。

**技术栈：** GitHub Actions、Bun、TypeScript、GitHub Release、sha256、tar.gz。

---

## 背景

当前仓库已经具备本地构建能力：

- `package.json` 里有 `build`、`prepack`、`chmod` 和 `check`。
- `bin` 已经指向 `dist/agent-switch.js` 和 `dist/as.js`。
- `README.md` 只说明了本地 `bun run build`、`bun link` 和 `bun pm pack`。

这意味着现在的“发布”仍然偏向开发环境：用户拿到的不是开箱即用的二进制，而是需要本地 Bun 支持的构建产物。为了让 release 可以直接下载和分发，需要增加 GitHub Actions 自动构建与发布链路。

## 已确认决策

- 发布对象是 **standalone executable**，不是只上传 `dist/` 下的 JS bundle。
- 发布触发分为两类：推送 `v*.*.*` tag 自动发布，`workflow_dispatch` 手动重跑。
- 初期支持 `linux-x64`、`darwin-arm64`、`darwin-x64` 和 `windows-x64`。
- 每个平台同时提供 `agent-switch` 和 `as` 两个可执行文件；Windows 产物使用 `.exe` 后缀。
- 发布前必须先跑 `bun test` 和 `bun run typecheck`。
- 每次发布都生成 `SHA256SUMS`，便于校验下载完整性。
- 发布时只使用仓库自带的 `GITHUB_TOKEN`，不引入个人访问令牌。

## 方案取舍

### 方案 A：只上传 `dist/` JS bundle

优点：

- 改动最少。
- 和当前本地构建完全一致。

缺点：

- 用户下载后仍然需要安装 Bun。
- 不符合“下载安装即用”的目标。

### 方案 B：Bun 直接编译 standalone executable，再发布 Release 资产

优点：

- 下载后可以直接运行。
- 和当前 CLI 入口一致，适合分发给开发者和测试环境。
- 只需要一个 GitHub Actions workflow，就能覆盖构建、校验和发布。

缺点：

- 需要新增一个打包脚本和 release workflow。
- 需要同时处理 Windows 的可执行文件后缀。

### 方案 C：做 npm / Bun 包发布，再额外维护 release

优点：

- 兼容包管理器安装。

缺点：

- 发布链路更复杂。
- 和“直接下载二进制”相比，用户路径更长。

### 结论

采用 **方案 B**。它最符合“release 可下载、可安装、可直接运行”的目标，同时实现复杂度仍然可控。

## 变更范围

这次只补发布链路，不改运行时业务逻辑。预计会改这些文件：

- `.github/workflows/release.yml`：GitHub Actions 发布 workflow。
- `scripts/build-release.ts`：本地与 CI 共用的二进制构建和打包脚本。
- `package.json`：新增发布相关脚本。
- `README.md`：补充 release 下载和安装方式。

## 工作流设计

### 触发规则

- `push` 到 tag `v*.*.*` 时自动发布。
- `workflow_dispatch` 允许维护者手动重跑发布，但必须显式提供目标 `tag_name`，避免把分支名误当成版本号。

### 权限与并发

- workflow 只申请 `contents: write`，用于创建或更新 Release 和上传资产。
- 同一个 tag 使用固定 concurrency group，避免重复发布互相覆盖。

### 校验阶段

发布前先执行：

1. `actions/checkout` 拉取代码。
2. `bun install --frozen-lockfile` 安装依赖。
3. `bun test` 运行测试。
4. `bun run typecheck` 运行类型检查。

如果任一校验失败，后续构建和发布都不执行。

### 构建阶段

构建脚本负责：

- 为 `linux-x64`、`darwin-arm64`、`darwin-x64`、`windows-x64` 生成 standalone executable。
- 每个平台输出一个独立目录，目录内包含 `agent-switch` 和 `as`；Windows 目标输出 `agent-switch.exe` 和 `as.exe`。
- 将目录打包成 `tar.gz`。
- 对所有产物生成 `SHA256SUMS`。

建议的产物命名如下：

- `agent-switch-linux-x64.tar.gz`
- `agent-switch-darwin-arm64.tar.gz`
- `agent-switch-darwin-x64.tar.gz`
- `agent-switch-windows-x64.tar.gz`
- `SHA256SUMS`

### 发布阶段

发布阶段使用 GitHub Release 作为分发入口：

- tag push 时，workflow 以 tag 名作为 release 版本号。
- 手动触发时，workflow 使用输入的 `tag_name` 作为 release 版本号。
- Release 资产包含所有平台的压缩包和校验文件。
- Release 标题与 tag 保持一致，方便后续查找和下载。

## 构建脚本职责

`scripts/build-release.ts` 只做构建和打包，不直接负责发布。它应当：

- 接收单个平台和输出目录。
- 调用 Bun 的 `--compile` 能力构建可执行文件。
- 为每个平台复制 `as`。
- 打包生成 `tar.gz`。
- 生成 `SHA256SUMS`。
- 返回一个清晰的产物清单，供 workflow 上传 Release 使用。

这样做的好处是：

- 本地可以单独复跑打包逻辑。
- workflow YAML 保持短且稳定。
- 以后如果要补更多平台，只需要扩展脚本和目标列表。

## README 更新

README 需要补一段“如何从 Release 安装”：

- 从 GitHub Release 下载对应平台的压缩包。
- 解压后把 `agent-switch` 和 `as` 放进 `PATH`。
- 说明 `tar.gz` 里的二进制已经带执行权限，不需要再本地编译。

## 非目标

本次不做这些事：

- 不发布到 npm registry。
- 不做代码签名或 notarization。
- 不做自动打 tag 或自动发版号。
- 不改现有 CLI 运行时行为。

## 验收标准

满足以下条件时，设计算完成：

1. 推送 `v*.*.*` tag 后，GitHub Actions 会自动完成校验、构建、打包和 Release 上传。
2. 手动触发 workflow 可以重跑同一套发布流程。
3. Release 页面能下载到四个平台的二进制压缩包和 `SHA256SUMS`。
4. 用户只需要解压就能直接运行 `agent-switch` 或 `as`，不需要安装 Bun。
5. 仓库现有本地构建路径仍然保留，可继续用于开发和测试。
