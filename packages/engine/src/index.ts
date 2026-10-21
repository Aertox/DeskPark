export * from './core/cards';
export * from './core/rng';
export * from './core/types';
export * from './core/table';
export * from './core/registry';

import { registerGame } from './core/registry';
import { doudizhu } from './games/doudizhu';
import { guandan } from './games/guandan';
import { highcard } from './games/highcard';
import { texas } from './games/texas';

export * as ddz from './games/doudizhu';
export * as gd from './games/guandan';
export * as tx from './games/texas';
export * as hc from './games/highcard';

export { doudizhu, guandan, texas, highcard };

// 内置玩法（顺序即大厅展示顺序）
for (const g of [doudizhu, guandan, texas, highcard]) registerGame(g);
