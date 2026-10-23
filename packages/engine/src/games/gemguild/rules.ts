import type { Gem, GemMap, GgCard, GgNoble, GgPlayer, Level, TokenMap } from './shared';
import { GEMS, MAX_RESERVED, TOKENS, emptyGems, emptyTokens } from './shared';

type Holder = Pick<GgPlayer, 'tokens' | 'cards'>;

export function bonusesOf(cards: readonly GgCard[]): GemMap {
  const m = emptyGems();
  for (const c of cards) m[c.bonus]++;
  return m;
}
export function pointsOf(p: Pick<GgPlayer, 'cards' | 'nobles'>): number {
  return p.cards.reduce((a, c) => a + c.points, 0) + p.nobles.reduce((a, n) => a + n.points, 0);
}

/** 买这张牌要付的宝石（先用折扣，再用同色宝石，不够的用黄金）；付不起返回 null */
export function payment(p: Holder, card: GgCard): TokenMap | null {
  const bonus = bonusesOf(p.cards);
  const pay = emptyTokens();
  let gold = 0;
  for (const g of GEMS) {
    const need = Math.max(0, card.cost[g] - bonus[g]);
    const use = Math.min(need, p.tokens[g]);
    pay[g] = use;
    gold += need - use;
  }
  if (gold > p.tokens.gold) return null;
  pay.gold = gold;
  return pay;
}

/** 还差几颗宝石（黄金抵扣之后） */
export function shortfall(p: Holder, card: GgCard): { missing: GemMap; total: number } {
  const bonus = bonusesOf(p.cards);
  const missing = emptyGems();
  let total = 0;
  for (const g of GEMS) {
    missing[g] = Math.max(0, card.cost[g] - bonus[g] - p.tokens[g]);
    total += missing[g];
  }
  return { missing, total: Math.max(0, total - p.tokens.gold) };
}

/** 拿宝石是否合法：3 种不同颜色；或同色 2 颗（供应区至少剩 4 颗）；颜色不够 3 种时可以少拿 */
export function takeError(bank: TokenMap, gems: unknown): string | null {
  if (!Array.isArray(gems) || gems.length < 1 || gems.length > 3) return '请选择要拿的宝石';
  if (!gems.every((g) => GEMS.includes(g as Gem))) return '黄金只能通过预留获得';
  const list = gems as Gem[];
  if (list.length === 2 && list[0] === list[1]) {
    return bank[list[0]] >= 4 ? null : '同色拿 2 颗时，那种宝石至少要剩 4 颗';
  }
  if (new Set(list).size !== list.length) return '同色只能一次拿 2 颗，或者拿 3 种不同颜色';
  if (list.some((g) => bank[g] < 1)) return '这种宝石已经拿光了';
  const available = GEMS.filter((g) => bank[g] > 0).length;
  if (list.length < Math.min(3, available)) return '要拿 3 种不同颜色（剩下的颜色不够时才能少拿）';
  return null;
}

/** 贵族是否会来拜访 */
export const nobleOk = (bonus: GemMap, n: GgNoble) => GEMS.every((g) => bonus[g] >= n.need[g]);

export function canReserve(
  p: Pick<GgPlayer, 'reserved'>,
  market: readonly (readonly (GgCard | null)[])[],
  deckCounts: readonly number[],
): boolean {
  if (p.reserved.length >= MAX_RESERVED) return false;
  return market.some((row) => row.some(Boolean)) || deckCounts.some((c) => c > 0);
}

export function anyTake(bank: TokenMap): boolean {
  return GEMS.some((g) => bank[g] > 0);
}

export function findInMarket(
  market: readonly (readonly (GgCard | null)[])[],
  id: number,
): { level: Level; slot: number; card: GgCard } | null {
  for (let l = 0; l < 3; l++) {
    const slot = market[l].findIndex((c) => c?.id === id);
    if (slot >= 0) return { level: (l + 1) as Level, slot, card: market[l][slot]! };
  }
  return null;
}

export function addTokens(to: TokenMap, from: TokenMap, sign = 1): void {
  for (const t of TOKENS) to[t] += from[t] * sign;
}
