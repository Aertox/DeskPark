import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import { mFrom, mTo } from './board';
import { repetitionOutcome, toBoard } from './convert';
import { MATE, search } from './search';
import type { XqAction, XqView } from './shared';

export const LEVELS = {
  1: { maxDepth: 1, nodes: 5000, noise: 90 },
  2: { maxDepth: 4, nodes: 40000, noise: 18 },
  3: { maxDepth: 8, nodes: 130000, noise: 5 },
} as const;

export function thinkXiangqi(view: XqView, rng: Rng) {
  const b = toBoard(view);
  const lv = LEVELS[(view.options.level as 1 | 2 | 3) ?? 2] ?? LEVELS[2];
  const color = view.side;
  // 会造成重复局面的着法：按长将 / 和棋的判法直接给分
  const avoid = (m: number) => {
    b.make(m);
    const key = b.key();
    const check = b.inCheck();
    b.unmake();
    const r = repetitionOutcome(view.moves, view.keys, { key, check, color });
    return r === null ? null : r === 'lose' ? -MATE / 2 : r === 'win' ? MATE / 2 : 0;
  };
  return { b, res: search(b, { ...lv, rng, avoid }) };
}

export function xqBot(view: XqView, _seat: Seat, rng: Rng): XqAction {
  const { res } = thinkXiangqi(view, rng);
  return { type: 'move', from: mFrom(res.move), to: mTo(res.move) };
}
