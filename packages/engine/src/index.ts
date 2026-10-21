export * from './core/cards';
export * from './core/rng';
export * from './core/types';
export * from './core/table';
export * from './core/registry';

import { registerGame } from './core/registry';
import { doudizhu } from './games/doudizhu';
import { guandan } from './games/guandan';
import { highcard } from './games/highcard';
import { sichuan } from './games/sichuan';
import { texas } from './games/texas';

export * as ddz from './games/doudizhu';
export * as gd from './games/guandan';
export * as tx from './games/texas';
export * as hc from './games/highcard';
export * as sc from './games/sichuan';
export * as mj from './mahjong';

export { doudizhu, guandan, texas, sichuan, highcard };

// 内置玩法（顺序即大厅展示顺序）
for (const g of [doudizhu, guandan, texas, sichuan, highcard]) registerGame(g);
