import type { Card } from '@park/engine';
import type { ComponentType } from 'react';
import { lazy } from 'react';
import type { GameController } from '../lib/controller';

/**
 * 前端玩法注册表：每个玩法 = 引擎中的规则定义（按 id 关联）+ 一个牌桌界面组件 + 大厅展示信息。
 * 新增玩法时，在引擎注册 GameDefinition，并在这里添加对应的界面即可。
 */
export interface GameUI {
  id: string;
  Board: ComponentType<{ ctl: GameController }>;
  /** 大厅卡片的配色（渐变起止色） */
  tint: [string, string];
  /** 大厅卡片上展示的几张牌 */
  showcase: Card[];
  /** 人数说明 */
  people: string;
  /** 额外标签 */
  badge?: string;
  /** showcase 中哪些牌显示为万能牌 */
  wildIds?: number[];
}

const c = (id: number, suit: Card['suit'], rank: number): Card => ({ id, suit, rank });

export const GAME_UIS: GameUI[] = [
  {
    id: 'doudizhu',
    Board: lazy(() => import('./doudizhu/DoudizhuBoard')),
    tint: ['#b8553f', '#7c2f25'],
    showcase: [c(1, 'S', 2), c(2, 'J', 16), c(3, 'J', 17)],
    people: '3 人',
  },
  {
    id: 'guandan',
    Board: lazy(() => import('./guandan/GuandanBoard')),
    tint: ['#3f6f8f', '#22415a'],
    showcase: [c(1, 'S', 14), c(2, 'C', 14), c(3, 'H', 2)],
    wildIds: [3],
    people: '4 人 · 2v2',
  },
  {
    id: 'texas',
    Board: lazy(() => import('./texas/TexasBoard')),
    tint: ['#2f6b55', '#163c30'],
    showcase: [c(1, 'S', 14), c(2, 'H', 14), c(3, 'S', 13)],
    people: '2–8 人',
  },
  {
    id: 'highcard',
    Board: lazy(() => import('./highcard/HighcardBoard')),
    tint: ['#6a6158', '#3f3933'],
    showcase: [c(1, 'D', 7), c(2, 'C', 12), c(3, 'H', 10)],
    people: '2–6 人',
    badge: '示例',
  },
];

export function getGameUI(id: string): GameUI | undefined {
  return GAME_UIS.find((g) => g.id === id);
}
