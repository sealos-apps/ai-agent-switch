# TUI Control Plane 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把默认 TUI 改成主菜单式控制台：首页只放 `Clients`、`Providers`、`Models`，并支持从 provider preset 到选择模型再应用到 client 的核心闭环。

**架构：** 保留 `AgentSwitchApp` 作为唯一业务入口；TUI 拆成 `state`、`render`、`input`、`controller` 和 `app`。状态和渲染保持纯函数，副作用统一由 controller 调用现有 app 服务。

**技术栈：** Bun、TypeScript、raw terminal、`bun:test`。

---

## 已确认设计

- 入口是主菜单列表，不是三栏大表格。
- 主菜单只有 `Clients`、`Providers`、`Models`。
- 主路径使用 `↑` / `↓` 移动，不把 `j/k` 作为主操作。
- `Enter` 进入或执行当前项。
- `Esc` 返回上一层。
- `h` 打开帮助。
- `q` 退出。

## 范围

- `Providers` 支持 `Add from preset`，用于第一次初始化 provider。
- `Clients` 支持检测 client、查看 client 当前状态。
- `Providers` 支持 `Add custom provider`、编辑 provider、测试 provider、删除 provider。
- `Models` 展示所有 provider/model，支持设置 provider default、route primary 和 fallback。
- `Models` 支持添加模型、删除模型、设置 provider default model。
- `Clients` 首页只展示可配置 client 列表；进入某个 client 后才读取当前配置，并提供 `Use current config` 与 `Use agent-switch proxy`。
- `Models` 中支持 `r` 设为 route primary，`f` 加入 fallback。
- Route 和 Proxy 不进入第一层主菜单。

## 任务

- [x] 编写 TUI 主菜单、方向键、`h` 帮助、provider preset、client apply 的失败测试。
- [x] 编写 custom provider、provider test/remove、model add/remove/default 的失败测试。
- [x] 编写 client detect/show 和 provider edit 的失败测试。
- [x] 实现 `src/tui/types.ts`、`src/tui/state.ts`、`src/tui/input.ts`、`src/tui/render.ts`、`src/tui/controller.ts`。
- [x] 重写 `src/tui/app.ts`，接入新状态机和 controller。
- [x] 更新 README、产品范围和架构文档。
- [x] 运行 `bun test`。
- [x] 运行 `bun run typecheck`。
- [x] 运行 `bun run build`。
