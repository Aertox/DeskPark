# 新增 / 自定义一个卡牌玩法

牌苑的每个玩法都是一个插件：**一份规则定义（引擎）+ 一个牌桌界面（Web）**。
规则写好后，单人模式、联机房间、设置表单、电脑玩家、测试工具会自动可用。

下面以内置示例「比大小」为例（源码：`packages/engine/src/games/highcard/index.ts` 与 `apps/web/src/games/highcard/HighcardBoard.tsx`）。

## 1. 设计状态、动作与视图

先回答三个问题：

| 问题                            | 比大小的答案                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| 完整的对局状态有哪些？（State） | 手牌、本墩各人出的牌、分数、第几局第几墩、随机数状态                 |
| 玩家能做什么？（Action）        | `{ type: 'choose', card }` 选一张牌；系统动作 `{ type: 'continue' }` |
| 每个人能看到什么？（View）      | 自己的手牌、别人是否已出牌（但看不到是哪张）、上一墩亮出的牌、分数   |

State 必须是可 JSON 序列化的纯数据。随机数请使用 `Rng`，并把 `rng.state` 存回 State，这样对局可以保存与复现。

## 2. 实现 GameDefinition

```ts
import { clone } from '../../core/clone';
import { createDeck, sortCards } from '../../core/cards';
import { Rng } from '../../core/rng';
import type { GameDefinition } from '../../core/types';

export const highcard: GameDefinition<HcState, HcAction, HcView, HcOptions> = {
  meta: {
    id: 'highcard', // 全局唯一，也用于网址 #/play/highcard
    name: '比大小',
    nameEn: 'High Card',
    tagline: '同时出牌，点大者得分',
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 4,
    rules: ['……'], // 显示在牌桌「规则」面板
  },
  defaultOptions: { rounds: 3 },
  optionFields: [
    // 设置表单自动生成
    {
      key: 'rounds',
      label: '局数',
      type: 'select',
      choices: [
        { value: 1, label: '1 局' },
        { value: 3, label: '3 局' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    /* 洗牌发牌，返回初始 State */
  },
  activeSeats(state) {
    /* 还没出牌的人都可以行动 → 返回多个座位 */
  },
  validate(state, seat, action) {
    /* 不合法时返回中文提示 */
  },
  apply(prev, seat, action) {
    const state = clone(prev); // 不要修改 prev
    /* … */
    return state;
  },
  view(state, seat) {
    /* 只暴露该座位能看到的信息 */
  },
  isOver: (state) => state.phase === 'matchOver',
  autoAdvance(state) {
    // 可选：亮牌 1.8 秒后系统自动进入下一墩
    return state.phase === 'reveal' ? { delayMs: 1800, action: { type: 'continue' } } : null;
  },
  bot(view, seat, rng) {
    /* 只根据 view 做决策 */
  },
};
```

要点：

- **轮次/阶段**用 `phase` 字段表达（如 `bidding → playing → roundOver`）。「准备下一局」这类所有人都要确认的步骤，让 `activeSeats` 返回所有未准备的座位，电脑会自动准备。
- **系统动作**的 seat 为 `SYSTEM_SEAT (-1)`，在 `validate` 里注意只允许系统发出。
- **view 是防作弊的唯一关口**：联机时服务器只发送 view。凡是别人不该看到的（他人手牌、牌堆、暗出的牌），都不要放进 view。
- **bot 必须总是返回合法动作**。下一步的模拟测试会检验这一点。

## 3. 注册

在 `packages/engine/src/index.ts` 中导出并加入注册表：

```ts
import { highcard } from './games/highcard';
export * as hc from './games/highcard';
for (const g of [doudizhu, guandan, texas, highcard]) registerGame(g);
```

服务器会自动识别新玩法，无需改动。

## 4. 编写测试

用 `simulate` 让电脑打完整局，这是最有效的冒烟测试：

```ts
import { simulate, highcard } from '../src';

it('可以完整模拟', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { state } = simulate(highcard, 4, { rounds: 3 }, seed);
    expect(state.phase).toBe('matchOver');
  }
});
```

再为关键规则写单元测试（牌型判断、计分、边界情况）。

## 5. 牌桌界面

在 `apps/web/src/games/<id>/` 新建 Board 组件，签名固定：

```tsx
export default function MyBoard({ ctl }: { ctl: GameController<MyView, MyAction> }) {
  const v = ctl.view!; // 当前座位的视图
  ctl.players; // 座位信息（名字、是否电脑、是否在线、是否托管）
  ctl.act({ type: '…' }); // 发出动作（单机同步返回错误，联机错误以 toast 显示）
}
```

可复用的组件：`PlayingCard`（卡面）、`Hand`（手牌，支持点选/拖选、扇形或按点数叠放）、`CardRow`（出牌区）、`Seat`（头像、倒计时、身份标签、气泡）、`Button`、`Sheet`（结算面板）。
样式请使用 `styles/tokens.css` 中的设计令牌，保持视觉统一。

最后在 `apps/web/src/games/index.ts` 注册界面：

```ts
{
  id: 'highcard',
  Board: lazy(() => import('./highcard/HighcardBoard')),
  tint: ['#6a6158', '#3f3933'],      // 大厅卡片配色
  showcase: [c(1, 'D', 7), c(2, 'C', 12), c(3, 'H', 10)],
  people: '2–6 人',
  badge: '示例',                     // 有 badge 的玩法显示在「更多玩法」
}
```

## 检查清单

- [ ] State 可序列化，随机数存在 State 中
- [ ] `apply` 不修改入参
- [ ] `view` 不泄露隐藏信息（联机时用两个浏览器验证）
- [ ] `bot` 在模拟测试中从不产生非法动作
- [ ] 有结束条件，`simulate` 能在合理步数内结束
- [ ] 界面在桌面、横屏手机、竖屏手机下可用
- [ ] `npm run check` 通过

## 后续：无代码自定义

路线图中计划提供「规则配置 + 通用牌桌」的方式，让不写代码的用户也能组合出简单玩法（如调整牌堆、手牌数、比较规则、计分方式），详见 [ROADMAP](ROADMAP.md)。
