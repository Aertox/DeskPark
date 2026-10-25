import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import type { Board } from './board';
import { mFrom, mPromo, mTo } from './board';
import { toBoard } from './convert';
import { search } from './search';
import type { ChAction, ChPromo, ChView } from './shared';

const PROMO: ChPromo[] = ['q', 'q', 'n', 'b', 'r', 'q'];

/** 三档强度：搜索深度、节点上限与随机幅度（分） */
export const LEVELS = {
  1: { maxDepth: 1, nodes: 4000, noise: 140 },
  2: { maxDepth: 4, nodes: 30000, noise: 24 },
  3: { maxDepth: 8, nodes: 110000, noise: 6 },
} as const;

/** 走完这步会不会形成已经出现过两次的局面（再出现就判和） */
export function repeats(b: Board, keys: readonly string[]) {
  return (m: number) => {
    b.make(m);
    const k = b.key();
    b.unmake();
    return keys.filter((x) => x === k).length >= 2;
  };
}

export function thinkChess(view: ChView, rng: Rng) {
  const b = toBoard(view);
  const lv = LEVELS[(view.options.level as 1 | 2 | 3) ?? 2] ?? LEVELS[2];
  return { b, res: search(b, { ...lv, rng, avoid: repeats(b, view.keys) }) };
}

export function chBot(view: ChView, _seat: Seat, rng: Rng): ChAction {
  const { res } = thinkChess(view, rng);
  const m = res.move;
  const promo = mPromo(m) ? PROMO[mPromo(m)] : undefined;
  return { type: 'move', from: mFrom(m), to: mTo(m), ...(promo ? { promo } : {}) };
}
