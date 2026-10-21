# App 移植方案

项目从一开始就按「引擎与界面分离、平台能力集中」的方式组织，移植 App 有两条路线，可以先后进行。

## 为移植做好的准备

| 已就绪                                                                                               | 位置                                   |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 规则引擎与 AI 为纯 TypeScript，无 DOM / Node 依赖（定时器通过 `globalThis` 访问，状态拷贝使用 JSON） | `packages/engine`                      |
| 联机协议独立成包，任何客户端都可复用                                                                 | `packages/protocol`                    |
| 平台能力集中在一个文件（存储、服务器地址、震动、剪贴板、随机 token）                                 | `apps/web/src/lib/platform.ts`         |
| 设计令牌集中定义                                                                                     | `apps/web/src/styles/tokens.css`       |
| 服务器地址可通过 `VITE_SERVER_URL` 配置                                                              | 构建环境变量                           |
| 视口适配：安全区（刘海屏）、横竖屏、触摸拖选、禁止缩放                                               | 全局样式 / `index.html`                |
| PWA manifest：手机浏览器可「添加到主屏幕」                                                           | `apps/web/public/manifest.webmanifest` |

## 路线一：Capacitor 封装（推荐先做，1–2 天）

把现有网页原样打包为 iOS / Android 原生应用，界面与逻辑 100% 复用。

1. 安装：`npm i -w @park/web @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
2. 初始化：`npx cap init 闲亭 com.example.deskpark --web-dir apps/web/dist`
3. 构建时指定线上服务器：`VITE_SERVER_URL=wss://你的域名/ws npm run build -w @park/web`
4. `npx cap add ios && npx cap add android && npx cap sync`
5. 在 `platform.ts` 中替换实现：
   - 存储 → `@capacitor/preferences`
   - 震动 → `@capacitor/haptics`（出牌、轮到你时轻触反馈）
   - 剪贴板 / 分享房间 → `@capacitor/clipboard`、`@capacitor/share`
6. 原生配置：锁定横屏（或允许旋转）、状态栏沉浸、启动图、App 图标。
7. 深链接：`deskpark://room/ABCD` 直接进入房间（使用 `@capacitor/app` 监听 `appUrlOpen` 后调用 `navigate`）。

注意：网页中 hash 路由在 WebView 中天然可用；单人模式完全离线可玩。

## 路线二：React Native / Expo 原生界面（追求极致体验时）

- 直接复用 `@park/engine` 与 `@park/protocol`（纯 TS，Hermes 可运行）。
- 复用 `GameController` 的思路：把 `apps/web/src/lib/controller.ts` 与 `online.ts` 中与 React DOM 无关的部分抽到 `packages/client-core`，Web 与 RN 共用。
- 界面用 RN 重写：卡面可用 `react-native-svg` 复刻（花色路径已在 `components/Suit.tsx` 中），动效用 Reanimated。
- 设计令牌抽成 `packages/design-tokens`（TS 常量），同时生成 Web 的 CSS 变量与 RN 的样式常量。

## 上架前检查

- [ ] 联机服务器部署到 HTTPS/WSS 域名
- [ ] 隐私政策（只存储昵称与随机身份 token，无账号）
- [ ] 中国大陆上架需要游戏版号；仅作为棋牌学习/休闲工具、不含真钱与道具交易，请按当地要求评估
- [ ] 后台切换与断线重连（已支持：重新连接后自动回到座位）
