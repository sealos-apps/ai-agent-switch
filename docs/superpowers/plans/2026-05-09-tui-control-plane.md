# TUI Control Plane Implementation Plan

> Worker note: this historical plan was used to implement the TUI control plane. It is kept for project context.

## Goal

Change the default TUI into a menu-based control plane with only three home entries: `Clients`, `Providers`, and `Models`. Support the core flow from provider preset, to model selection, to applying the selected target to a client.

## Architecture

Keep `AiAgentSwitchApp` as the only business entry point. Split the TUI into:

- `state`
- `render`
- `input`
- `controller`
- `app`

State and rendering stay pure. Side effects go through the controller and existing app services.

## Confirmed Design

- The entry point is a main menu, not a three-column table.
- The main menu contains only `Clients`, `Providers`, and `Models`.
- Primary navigation uses `↑` / `↓`.
- `Enter` opens or runs the current item.
- `Esc` goes back.
- `h` opens help.
- `q` quits.

## Scope

- `Providers` supports `Add from preset`.
- `Clients` supports client detection and current-state inspection.
- `Providers` supports custom provider add, provider edit, provider test, and provider removal.
- `Models` lists all provider/model pairs.
- `Models` supports provider default model, route primary, and fallback actions.
- `Models` supports adding and removing models.
- The Clients home screen only lists configurable clients.
- Client details offer `Use current config` and `Use ai-agent-switch proxy`.
- Route and Proxy do not become top-level menu entries.

## Completed Tasks

- [x] Added failing tests for main menu, arrow keys, help, provider preset, and client apply.
- [x] Added failing tests for custom provider, provider test/remove, model add/remove/default.
- [x] Added failing tests for client detect/show and provider edit.
- [x] Implemented `src/tui/types.ts`, `src/tui/state.ts`, `src/tui/input.ts`, `src/tui/render.ts`, and `src/tui/controller.ts`.
- [x] Reworked `src/tui/app.ts` to use the new state machine and controller.
- [x] Updated README, product scope, and architecture docs.
- [x] Ran `bun test`.
- [x] Ran `bun run typecheck`.
- [x] Ran `bun run build`.
