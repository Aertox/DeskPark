import type { Card } from '../../core/cards';

/**
 * 德州扑克牌力评估：返回一个可直接比较大小的整数（越大越好）。
 * score = 类别 * 16^5 + 5 个关键点数（每个占 4 bit）
 */

export const HAND_CATEGORY = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
] as const;

const B = 16;

function pack(cat: number, ranks: number[]): number {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * B + (ranks[i] ?? 0);
  return s;
}

/** 从点数位图中找最大顺子的顶张（含 A2345），没有则返回 0 */
function straightTop(mask: number): number {
  for (let top = 14; top >= 5; top--) {
    let ok = true;
    for (let r = top; r > top - 5; r--) {
      const rr = r === 1 ? 14 : r;
      if (!(mask & (1 << rr))) {
        ok = false;
        break;
      }
    }
    if (ok) return top;
  }
  return 0;
}

/** 评估 5~7 张牌的最佳牌力 */
export function scoreHand(cards: readonly Card[]): number {
  const rankCount = new Array<number>(15).fill(0);
  const suitCards: Record<string, number[]> = { S: [], H: [], C: [], D: [] };
  let mask = 0;
  for (const c of cards) {
    rankCount[c.rank]++;
    suitCards[c.suit].push(c.rank);
    mask |= 1 << c.rank;
  }
  // 同花 / 同花顺
  for (const s of ['S', 'H', 'C', 'D']) {
    const rs = suitCards[s];
    if (rs.length >= 5) {
      let m = 0;
      for (const r of rs) m |= 1 << r;
      const sf = straightTop(m);
      if (sf) return pack(8, [sf]);
      const top5 = [...rs].sort((a, b) => b - a).slice(0, 5);
      // 不能直接返回：四条/葫芦更大（7 张牌时同花与四条/葫芦可能共存）
      const flush = pack(5, top5);
      const better = nonFlush(rankCount, mask);
      return better > flush ? better : flush;
    }
  }
  return nonFlush(rankCount, mask);
}

function nonFlush(rankCount: number[], mask: number): number {
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const c = rankCount[r];
    if (c === 4) quads.push(r);
    else if (c === 3) trips.push(r);
    else if (c === 2) pairs.push(r);
    else if (c === 1) singles.push(r);
  }
  if (quads.length) {
    const kicker = Math.max(...[...trips, ...pairs, ...singles, ...quads.slice(1)], 0);
    return pack(7, [quads[0], kicker]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pair = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return pack(6, [trips[0], pair]);
  }
  const st = straightTop(mask);
  if (st) return pack(4, [st]);
  if (trips.length) {
    const k = [...pairs, ...singles].sort((a, b) => b - a);
    return pack(3, [trips[0], k[0], k[1]]);
  }
  if (pairs.length >= 2) {
    const k = [...pairs.slice(2), ...singles].sort((a, b) => b - a);
    return pack(2, [pairs[0], pairs[1], k[0] ?? 0]);
  }
  if (pairs.length === 1) return pack(1, [pairs[0], ...singles.slice(0, 3)]);
  return pack(0, singles.slice(0, 5));
}

export function categoryOf(score: number): number {
  return Math.floor(score / B ** 5);
}

export function handName(score: number): string {
  const cat = categoryOf(score);
  if (cat === 8 && Math.floor(score / B ** 4) % B === 14) return '皇家同花顺';
  return HAND_CATEGORY[cat];
}

/** 找出构成最佳牌力的 5 张牌（用于高亮显示） */
export function bestFive(cards: readonly Card[]): { score: number; cards: Card[] } {
  if (cards.length <= 5) return { score: scoreHand(cards), cards: [...cards] };
  let best = { score: -1, cards: [] as Card[] };
  const n = cards.length;
  const pick: Card[] = [];
  const rec = (start: number) => {
    if (pick.length === 5) {
      const s = scoreHand(pick);
      if (s > best.score) best = { score: s, cards: [...pick] };
      return;
    }
    for (let i = start; i <= n - (5 - pick.length); i++) {
      pick.push(cards[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best;
}
