import type { Card } from '../../core/cards';
import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import type { DdzAction, DdzView } from './index';
import type { Combo, Counts } from './moves';
import { beatingCombos, countValues, splitHand, valuesToCards } from './moves';

/**
 * 斗地主电脑玩家：基于"手牌拆分 + 代价评估"的启发式策略。
 * - 叫分：按大牌、炸弹与手数估算牌力；
 * - 出牌：领出时优先甩掉小而多的组合；跟牌时选择对拆牌影响最小的压法；
 * - 合作：农民不压队友，危急时（对手快出完）不惜用炸弹。
 */

function strength(cnt: Counts): number {
  let s = 0;
  s += (cnt.get(17) ?? 0) * 4;
  s += (cnt.get(16) ?? 0) * 3;
  s += (cnt.get(15) ?? 0) * 2;
  s += (cnt.get(14) ?? 0) * 0.7;
  for (const [v, c] of cnt) if (c === 4 && v < 16) s += 4;
  const { turns } = splitHand(cnt);
  s += Math.max(0, 9 - turns) * 0.6;
  return s;
}

function sub(cnt: Counts, values: readonly number[]): Counts {
  const m = new Map(cnt);
  for (const v of values) {
    const c = (m.get(v) ?? 0) - 1;
    if (c <= 0) m.delete(v);
    else m.set(v, c);
  }
  return m;
}

const isBomb = (c: Combo) => c.kind === 'bomb' || c.kind === 'rocket';

function play(hand: Card[], combo: Combo): DdzAction {
  return { type: 'play', cards: valuesToCards(hand, combo.values).map((c) => c.id) };
}

export function ddzBot(view: DdzView, seat: Seat, rng: Rng): DdzAction {
  if (view.phase === 'roundOver') return { type: 'ready' };
  const hand = view.hand;
  const cnt = countValues(hand);

  if (view.phase === 'bidding') {
    const s = strength(cnt) + (rng.next() - 0.5) * 1.5;
    const want = s >= 11 ? 3 : s >= 8.5 ? 2 : s >= 6.5 ? 1 : 0;
    return { type: 'bid', score: (want > view.currentBid ? want : 0) as 0 | 1 | 2 | 3 };
  }

  const landlord = view.landlord!;
  const isLandlord = seat === landlord;
  const nextSeat = (seat + 1) % 3;
  const counts = view.handCounts;
  const opponents = isLandlord ? [0, 1, 2].filter((s) => s !== seat) : [landlord];
  const minOpp = Math.min(...opponents.map((s) => counts[s]));
  const leading = !view.lastPlay || view.lastPlay.seat === seat;

  // 能一手出完就直接出
  const all = beatingCombos(cnt, leading ? null : view.lastPlay!.pattern);
  const finisher = all.find((c) => c.values.length === hand.length);
  if (finisher) return play(hand, finisher);

  if (leading) return lead(hand, cnt, { isLandlord, nextSeat, landlord, counts, minOpp, rng });

  const last = view.lastPlay!;
  const teammatePlayed = !isLandlord && last.seat !== landlord;
  const candidates = all;
  if (candidates.length === 0) return { type: 'pass' };

  const baseTurns = splitHand(cnt).turns;
  const threat = minOpp <= 2 ? 100 : minOpp <= 4 ? 18 : minOpp <= 6 ? 6 : 0;

  if (teammatePlayed) {
    // 队友出的牌：一般不压；除非队友出的很小、且地主即将出牌并快出完
    const landlordNext = nextSeat === landlord;
    const small = last.pattern.main <= 11 && last.pattern.kind === 'single';
    if (!(landlordNext && counts[landlord] <= 2 && small)) return { type: 'pass' };
  }

  let best: { combo: Combo | null; cost: number } = { combo: null, cost: baseTurns * 10 + threat };
  for (const c of candidates) {
    const rest = sub(cnt, c.values);
    let cost = splitHand(rest).turns * 10;
    if (isBomb(c)) cost += threat >= 18 ? 4 : 22;
    if (c.main >= 15 && c.kind === 'single') cost += 3;
    if (c.main >= 14 && c.kind === 'pair') cost += 3;
    // 同伴快走完时不要乱抢
    cost += rng.next() * 2;
    if (cost < best.cost) best = { combo: c, cost };
  }
  if (!best.combo) return { type: 'pass' };
  return play(hand, best.combo);
}

function lead(
  hand: Card[],
  cnt: Counts,
  ctx: {
    isLandlord: boolean;
    nextSeat: Seat;
    landlord: Seat;
    counts: number[];
    minOpp: number;
    rng: Rng;
  },
): DdzAction {
  const { combos } = splitHand(cnt);
  const normal = combos.filter((c) => !isBomb(c));
  const bombs = combos.filter(isBomb);

  // 只剩一手普通牌 + 炸弹：先炸再走
  if (normal.length <= 1 && bombs.length > 0 && normal.length + bombs.length >= 2) {
    return play(hand, bombs[0]);
  }
  if (normal.length === 0) return play(hand, combos[0]);

  // 队友（下家）只剩一张：送一张最小的单牌
  if (!ctx.isLandlord && ctx.nextSeat !== ctx.landlord && ctx.counts[ctx.nextSeat] === 1) {
    const vals = [...cnt.keys()].sort((a, b) => a - b);
    return play(hand, { kind: 'single', values: [vals[0]], main: vals[0], len: 1 });
  }

  // 两手牌：先出更大的那手抢牌权
  if (normal.length === 2) {
    const sorted = [...normal].sort((a, b) => b.main - a.main);
    return play(hand, sorted[0]);
  }

  let pool = normal;
  // 对手只剩 1–2 张时避开单张 / 对子
  if (ctx.minOpp === 1) {
    const nonSingle = pool.filter((c) => c.kind !== 'single');
    if (nonSingle.length) pool = nonSingle;
    else {
      // 只能出单，就出最大的
      const sorted = [...pool].sort((a, b) => b.main - a.main);
      return play(hand, sorted[0]);
    }
  } else if (ctx.minOpp === 2) {
    const nonPair = pool.filter((c) => c.kind !== 'pair');
    if (nonPair.length) pool = nonPair;
  }

  const score = (c: Combo) => c.main - Math.min(c.values.length, 8) * 0.45 + ctx.rng.next() * 0.6;
  const chosen = [...pool].sort((a, b) => score(a) - score(b))[0];
  return play(hand, chosen);
}
