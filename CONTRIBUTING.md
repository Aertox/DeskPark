# 贡献指南

## 开发流程

1. 从 `main` 切出分支：`feat/xxx`、`fix/xxx`、`game/xxx`（新玩法）、`docs/xxx`。
2. 开发并自测：`npm run dev`；提交前运行 `npm run check`（lint + 类型检查 + 测试）。
3. 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

   ```
   feat(guandan): 支持过 A 失败三次回 2 的规则
   fix(server): 房主离开后正确移交房主
   docs: 补充 App 移植说明
   ```

   常用 scope：`engine`、`doudizhu`、`guandan`、`texas`、`web`、`server`、`protocol`、`ci`。

4. 发起 Pull Request，填写模板中的自查清单；CI（格式、lint、类型检查、测试、构建）通过后合并。
5. `main` 分支始终保持可发布状态；版本发布时更新 `CHANGELOG.md` 并打 tag（`v0.2.0`）。

## 代码约定

- TypeScript 严格模式；格式由 Prettier 统一（`npm run format`）。
- 引擎（`packages/engine`）不得引用 DOM 或 Node API，保证可在浏览器、服务器、App 中运行。
- 规则改动必须附带测试；新玩法至少包含一个 `simulate` 整局模拟测试。
- 界面颜色、尺寸使用 `tokens.css` 中的设计令牌；新组件优先复用 `components/` 中已有的组件。
- 面向用户的文案使用简体中文，代码注释说明「为什么」而不是「做了什么」。

## 新增玩法

参见 [docs/ADDING_A_GAME.md](docs/ADDING_A_GAME.md)。建议先开一个「新玩法提案」Issue 讨论规则细节。

## 目录速览

```
packages/engine/src/core      通用：牌、随机数、插件接口、Table 运行器、注册表
packages/engine/src/games     各玩法规则与 AI
packages/engine/test          规则单测与整局模拟
packages/protocol             联机消息协议
apps/server                   联机服务器（含集成测试）
apps/web/src/components       通用界面组件
apps/web/src/games            各玩法牌桌界面
apps/web/src/screens          大厅、房间、牌桌外壳
apps/web/src/lib              控制器、联机客户端、平台适配、存储、音效
```
