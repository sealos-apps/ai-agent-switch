# npm 全平台可安装 CLI 设计

> **面向 AI 代理的工作者：** 本规格通过后，下一步应使用 `writing-plans` 生成实现计划，再按计划实现。

**目标：** 让 `agent-switch` 可以直接通过 `npm install` / `npm install -g` 在所有支持的平台上安装，并且安装后可直接运行 `agent-switch` 和 `as`，不再依赖 Bun 作为运行时。

**架构：** 采用“一个根包 + 四个按平台拆分的二进制包”的 npm 分发结构。根包 `agent-switch` 只负责 Node 包装器和命令入口，按平台二进制包通过 `optionalDependencies` 自动安装对应平台的 standalone executable。GitHub Actions 负责在对应平台上构建二进制包、发布 npm 包，发布顺序是先平台包，后根包。

**技术栈：** npm、Node.js ESM、Bun standalone executable、GitHub Actions、TypeScript、`spawnSync`、`npm publish`。

---

## 背景

当前仓库里的 CLI 入口是 Bun-only：

- `src/cli/main.ts` 直接依赖 Bun 运行时。
- 现有本地构建和测试都围绕 Bun 展开。
- 之前的发布方案是 GitHub Release 二进制下载。

这意味着用户如果只执行 `npm install agent-switch`，拿到的仍然只是开发源码包装，不能直接作为命令运行。为了满足“直接 npm 安装全平台可用”的目标，需要把发布形态切换成 npm 原生分发。

## 已确认决策

- 根包名保持为 `agent-switch`。
- 平台二进制包使用 scoped package：
  - `@agent-switch/linux-x64`
  - `@agent-switch/darwin-arm64`
  - `@agent-switch/darwin-x64`
  - `@agent-switch/windows-x64`
- 根包使用 `optionalDependencies` 依赖上述平台包。
- 根包的 `bin` 只提供 Node 包装器，不再直接指向 Bun 编译产物。
- 平台包只发布 standalone executable，不再发布源码 bundle。
- 不添加任何“下载失败再去别处拉取”的 fallback 或 postinstall 下载逻辑。
- 发布目标是 npm registry，不再把 GitHub Release 作为主要安装入口。

## 方案取舍

### 方案 A：只保留 GitHub Release 二进制

优点：

- 构建链路简单。
- 下载物是完整可执行文件。

缺点：

- 不能满足 `npm install` 直接安装。
- 用户路径更长，和当前需求冲突。

### 方案 B：根包包装器 + `optionalDependencies` 平台二进制包

优点：

- `npm install` 和 `npm install -g` 都能直接得到命令。
- 仍然保持每个平台只安装自己的二进制。
- 不需要额外的网络下载逻辑。
- 结构和 esbuild、swc 这类 npm 原生分发方式一致。

缺点：

- 需要新增根包包装器和平台包发布流程。
- CI 需要先发布平台包，再发布根包。

### 方案 C：postinstall 下载二进制

优点：

- 仓库里只保留一个包。

缺点：

- 需要额外的下载逻辑和环境判断。
- 安装过程依赖外部网络，不稳定。
- 容易引入用户不想要的 fallback。

### 结论

采用 **方案 B**。它最直接满足“npm 全平台安装”这个目标，同时不引入 fallback 下载链路。

## 包结构

### 根包 `agent-switch`

根包只保留 Node 包装器和 npm 元数据：

- `bin/agent-switch.js`
- `bin/as.js`
- `optionalDependencies` 指向四个平台包
- `files` 只包含 `bin/`

包装器职责：

- 根据当前 `process.platform` / `process.arch` 选出对应的平台包。
- 解析平台包安装路径。
- 直接 `spawnSync` 执行平台二进制。
- 把参数、标准输入输出和退出码透传给目标二进制。

包装器不做：

- 不做网络下载。
- 不做降级安装。
- 不做本地重编译。
- 不在缺包时尝试任何 fallback。

### 平台包

每个平台包都只包含当前平台的 standalone executable：

- `agent-switch`
- `as`

Windows 包对应文件使用 `.exe` 后缀。平台包的 `package.json` 会包含：

- `os` / `cpu` 限定
- `bin` 映射
- `files` 只包含可执行文件
- `publishConfig.access = public`

## 构建与发布流程

### 构建阶段

GitHub Actions 使用矩阵在四个平台上构建二进制包：

- `linux-x64`
- `darwin-arm64`
- `darwin-x64`
- `windows-x64`

每个平台的构建步骤：

1. 检出指定 tag。
2. 安装依赖。
3. 跑测试和类型检查。
4. 用 Bun 把 `src/cli/main.ts` 编译成 standalone executable。
5. 组装平台包目录。
6. 生成该平台的 `package.json` 和二进制文件。

### 发布阶段

发布顺序必须是：

1. 先发布四个平台包。
2. 再发布根包 `agent-switch`。

这样根包安装时，npm 才能顺利解析它的 `optionalDependencies`。

发布时使用 npm registry token，不再依赖 GitHub Release 资产。Workflow 只负责构建和发布 npm 包。

## 包装器实现

根包包装器建议拆成三个小文件：

- `bin/launcher.js`：共享逻辑，负责平台映射、包路径解析和进程拉起。
- `bin/agent-switch.js`：入口文件，调用共享逻辑并传入 `agent-switch`。
- `bin/as.js`：入口文件，调用共享逻辑并传入 `as`。

实现要求：

- 使用 ESM。
- 通过 `createRequire(import.meta.url)` 解析平台包安装目录。
- 用 `spawnSync` 或等价方式执行目标二进制。
- 保持 stdin/stdout/stderr 透传。
- 退出码直接跟随目标进程。
- 命令名和平台包名映射写成显式表，不做隐式猜测。

## 构建脚本职责

`scripts/build-npm-package.ts` 负责单个平台二进制包的生成：

- 接收平台、输出目录、版本号等参数。
- 调用 Bun 生成 standalone executable。
- 复制 `agent-switch` 和 `as` 两个二进制文件。
- Windows 目标生成 `.exe`。
- 写出平台包 `package.json`。

这个脚本只负责“单个平台包”。

根包包装器不需要复杂构建，直接以源码形式发布即可。

## README 更新

README 需要补充 npm 安装方式：

```bash
npm install -g agent-switch
```

并说明：

- 安装后直接运行 `agent-switch`。
- 也可以使用 `as`。
- 支持平台由 npm 自动安装对应二进制包。
- 这个安装方式不需要再手动下载 GitHub Release 资产。

## 非目标

本次不做这些事：

- 不保留“npm 安装后自动从 GitHub 下载二进制”的 fallback。
- 不做自动升级。
- 不做代码签名或 notarization。
- 不改 CLI 业务逻辑。
- 不新增数据库、缓存或遥测。

## 验收标准

满足以下条件时，设计完成：

1. `npm install agent-switch` 在四个平台上都会安装对应的二进制包。
2. `npm install -g agent-switch` 后可直接运行 `agent-switch` 和 `as`。
3. 平台二进制包仍然是 standalone executable，运行时不需要 Bun。
4. Workflow 会先发布四个平台包，再发布根包。
5. 仓库里没有新增任何下载 fallback 或 postinstall 拉取逻辑。
6. README 明确写出 npm 安装命令和支持平台。
