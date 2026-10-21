import type { Card } from '../../core/cards';
import { createDeck } from '../../core/cards';
import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import { scoreHand } from './evaluator';
import type { TxAction, TxView } from './index';

/**
 * 德州电脑玩家：
 * - 翻牌前：Chen 公式评估起手牌；
 * - 翻牌后：蒙特卡洛模拟胜率，结合底池赔率决定弃 / 跟 / 加；
 * - 带少量随机诈唬，避免过于机械。
 */

export function chenScore(hole: Card[]): number {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  const base = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let s = base(a.rank);
  if (a.rank === b.rank) s = Math.max(5, s * 2);
  if (a.suit === b.suit) s += 2;
  const gap = a.rank - b.rank - 1;
  if (a.rank !== b.rank) {
    s -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && a.rank < 12) s += 1;
  }
  return Math.ceil(s);
}

export function estimateEquity(
  hole: Card[],
  board: Card[],
  opponents: number,
  iterations: number,
  rng: Rng,
): number {
  const known = new Set([...hole, ...board].map((c) => `${c.suit}${c.rank}`));
  const deck = createDeck(1, false).filter((c) => !known.has(`${c.suit}${c.rank}`));
  let win = 0;
  const need = 5 - board.length;
  for (let it = 0; it < iterations; it++) {
    // 部分洗牌：只洗需要的张数
    const draw = opponents * 2 + need;
    for (let i = 0; i < draw; i++) {
      const j = i + rng.int(deck.length - i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const fullBoard = [...board, ...deck.slice(opponents * 2, opponents * 2 + need)];
    const mine = scoreHand([...hole, ...fullBoard]);
    let best = true;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const s = scoreHand([deck[o * 2], deck[o * 2 + 1], ...fullBoard]);
      if (s > mine) {
        best = false;
        break;
      }
      if (s === mine) ties++;
    }
    if (best) win += 1 / (ties + 1);
  }
  return win / iterations;
}

export function txBot(view: TxView, seat: Seat, rng: Rng): TxAction {
  if (view.phase === 'handOver') return { type: 'ready' };
  const me = view.players[seat];
  const opts = view.me;
  if (!opts || !me.hole) return { type: 'fold' };

  const opponents = view.players.filter((p, s) => s !== seat && p.inHand).length;
  const pot = view.totalPot;
  const { toCall, canCheck, canRaise, minRaiseTo, maxRaiseTo } = opts;
  const stack = me.stack;
  const bb = view.bb;
  const roll = rng.next();

  const raise = (to: number): TxAction => {
    if (!canRaise) return call();
    const t =
      Math.round(Math.max(minRaiseTo, Math.min(maxRaiseTo, to)) / Math.max(1, view.sb)) *
      Math.max(1, view.sb);
    const clamped = Math.max(minRaiseTo, Math.min(maxRaiseTo, t));
    if (clamped >= maxRaiseTo) return { type: 'allin' };
    return { type: 'raise', to: clamped };
  };
  const passive = (): TxAction => (canCheck ? { type: 'check' } : { type: 'fold' });
  const call = (): TxAction => (canCheck ? { type: 'check' } : { type: 'call' });

  if (view.street === 'preflop') {
    const chen = chenScore(me.hole) - Math.max(0, opponents - 3) * 0.5;
    const cost = toCall / bb;
    if (chen >= 11) {
      if (cost > 8 && roll < 0.5) return raise(maxRaiseTo);
      return raise(view.currentBet + Math.max(bb * 3, view.currentBet * 2));
    }
    if (chen >= 9) {
      if (cost <= 6) return roll < 0.55 ? raise(view.currentBet + bb * 2.5) : call();
      return toCall <= stack * 0.25 ? call() : passive();
    }
    if (chen >= 7) {
      if (canCheck) return roll < 0.2 ? raise(bb * 3) : { type: 'check' };
      return cost <= 3 || toCall <= stack * 0.06 ? call() : passive();
    }
    if (chen >= 5) {
      if (canCheck) return { type: 'check' };
      return cost <= 1.01 && roll < 0.7 ? call() : passive();
    }
    if (canCheck) return { type: 'check' };
    return roll < 0.04 && cost <= 1 ? call() : { type: 'fold' };
  }

  const equity = estimateEquity(me.hole, view.board, Math.max(1, opponents), 220, rng);
  const potOdds = toCall / Math.max(1, pot + toCall);

  if (equity > 0.78) {
    if (roll < 0.15 && canCheck) return { type: 'check' }; // 慢打
    return raise(view.currentBet + pot * (0.6 + roll * 0.5));
  }
  if (equity > 0.58) {
    if (canCheck) return roll < 0.65 ? raise(pot * 0.5) : { type: 'check' };
    if (roll < 0.25 && toCall < pot * 0.5) return raise(view.currentBet + pot * 0.6);
    return call();
  }
  if (equity > potOdds + 0.06) {
    if (canCheck) return roll < 0.12 ? raise(pot * 0.4) : { type: 'check' };
    return call();
  }
  if (canCheck) return roll < 0.07 ? raise(pot * 0.5) : { type: 'check' };
  return { type: 'fold' };
}
