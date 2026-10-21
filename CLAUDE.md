# 牌苑 Card Park — 开发备忘

- 单仓库（npm workspaces）：`packages/engine`（纯 TS 规则与 AI，禁止 DOM/Node API）、`packages/protocol`、`apps/server`（ws 联机，服务端权威）、`apps/web`（React + Vite）。
- 提交前：`npm run check`（lint + typecheck + test）；格式：`npm run format`。
- 新玩法：实现 `GameDefinition` 并在 `packages/engine/src/index.ts` 注册，界面在 `apps/web/src/games/index.ts` 注册。详见 `docs/ADDING_A_GAME.md`。
- 信息隐藏只在 `view()` 中处理；`bot()` 只能读 view；`apply()` 不得修改入参。
- 界面使用 `apps/web/src/styles/tokens.css` 的设计令牌；平台能力放在 `apps/web/src/lib/platform.ts`。
- 提交信息遵循 Conventional Commits（中文描述），scope 如 engine / doudizhu / guandan / texas / web / server。
