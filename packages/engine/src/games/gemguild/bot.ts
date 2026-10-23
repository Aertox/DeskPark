import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import { payment, shortfall, takeError } from './rules';
import type { Gem, GemMap, GgAction, GgCard, GgView, Level, TokenMap } from './shared';
import { GEMS, MAX_RESERVED, MAX_TOKENS, emptyTokens, tokenTotal } from './shared';

interface Me {
  tokens: TokenMap;
  cards: GgCard[];
  bonuses: GemMap;
}

/** 某种颜色的折扣对我有多大用：离贵族还差多少、桌上的牌要多少 */
function bonusUtility(view: GgView, me: Me, g: Gem): number {
  let u = 0;
  for (const n of view.nobles) {
    const gap = GEMS.reduce((a, c) => a + Math.max(0, n.need[c] - me.bonuses[c]), 0);
    if (n.need[g] > me.bonuses[g]) u += 2.2 / Math.max(1, gap);
  }
  for (const row of view.market)
    for (const c of row) if (c && c.cost[g] > me.bonuses[g]) u += 0.12 * c.level;
  return u;
}

export interface CardValue {
  card: GgCard;
  reserved: boolean;
  value: number;
  missing: GemMap;
  short: number;
  score: number;
}

export function rateCards(view: GgView, seat: Seat): CardValue[] {
  const p = view.players[seat];
  const me: Me = { tokens: p.tokens, cards: p.cards, bonuses: p.bonuses };
  const late = p.points >= view.options.target - 6;
  const list: { card: GgCard; reserved: boolean }[] = [
    ...view.market
      .flat()
      .filter((c): c is GgCard => !!c)
      .map((card) => ({ card, reserved: false })),
    ...p.reserved.filter((c): c is GgCard => !!c).map((card) => ({ card, reserved: true })),
  ];
  return list.map(({ card, reserved }) => {
    const { missing, total } = shortfall(me, card);
    // 后期更看重声望，前期更看重便宜的折扣牌
    const value =
      card.points * (late ? 3.2 : 2.2) +
      bonusUtility(view, me, card.bonus) * (late ? 0.6 : 1.4) +
      (p.cards.length < 6 && card.level === 1 ? 0.8 : 0);
    const turns = Math.ceil(total / 2.6);
    return { card, reserved, value, missing, short: total, score: value / (turns + 1) };
  });
}

/** 拿哪些宝石：优先补目标牌缺的颜色，再补其他候选牌 */
function pickTake(view: GgView, seat: Seat, ranked: CardValue[], rng: Rng): Gem[] | null {
  const bank = view.bank;
  const need = new Map<Gem, number>(GEMS.map((g) => [g, 0]));
  ranked.slice(0, 3).forEach((c, i) => {
    for (const g of GEMS) need.set(g, need.get(g)! + c.missing[g] * (i === 0 ? 3 : 1));
  });
  const available = GEMS.filter((g) => bank[g] > 0);
  if (!available.length) return null;
  const order = [...available].sort((a, b) => need.get(b)! - need.get(a)! || rng.next() - 0.5);
  // 只缺一种颜色、缺 2 颗以上：拿 2 颗同色
  const top = ranked[0];
  if (top) {
    const lacking = GEMS.filter((g) => top.missing[g] > 0);
    if (lacking.length === 1 && top.missing[lacking[0]] >= 2 && bank[lacking[0]] >= 4)
      return [lacking[0], lacking[0]];
  }
  const room = MAX_TOKENS - tokenTotal(view.players[seat].tokens);
  const take = order.slice(0, Math.min(3, available.length));
  // 手里宝石快满时，拿 2 颗同色比拿 3 颗再退回强
  if (room < take.length && room >= 2) {
    const g = order.find((x) => bank[x] >= 4);
    if (g) return [g, g];
  }
  return takeError(bank, take) ? null : take;
}

function discardAction(view: GgView, seat: Seat, ranked: CardValue[]): GgAction {
  const tokens = { ...view.players[seat].tokens };
  const keep = new Map<Gem, number>(GEMS.map((g) => [g, 0]));
  for (const c of ranked.slice(0, 2))
    for (const g of GEMS) keep.set(g, keep.get(g)! + c.card.cost[g]);
  const out = emptyTokens();
  for (let i = 0; i < view.discard; i++) {
    const g = [...GEMS]
      .filter((x) => tokens[x] > 0)
      .sort((a, b) => tokens[b] - keep.get(b)! - (tokens[a] - keep.get(a)!))[0];
    const t = g ?? 'gold';
    tokens[t]--;
    out[t]++;
  }
  return { type: 'discard', gems: out };
}

export function ggBot(view: GgView, seat: Seat, rng: Rng): GgAction {
  const p = view.players[seat];
  if (view.phase === 'noble') return { type: 'noble', id: view.nobleChoices[0] };
  const ranked = rateCards(view, seat)
    .map((c) => ({ ...c, score: c.score + rng.next() * 0.15 }))
    .sort((a, b) => b.score - a.score);
  if (view.phase === 'discard') return discardAction(view, seat, ranked);

  const me = { tokens: p.tokens, cards: p.cards };
  const buyable = ranked.filter((c) => payment(me, c.card)).sort((a, b) => b.value - a.value);
  const target = ranked.find((c) => c.short > 0);
  // 最后一轮：能拿分就拿分
  if (buyable.length && view.lastRound) {
    const best = [...buyable].sort((a, b) => b.card.points - a.card.points)[0];
    if (best.card.points > 0) return { type: 'buy', card: best.card.id };
  }
  if (
    buyable.length &&
    (!target || buyable[0].value >= target.value * 0.55 || tokenTotal(p.tokens) >= 8)
  )
    return { type: 'buy', card: buyable[0].card.id };

  // 预留：高价值的牌快凑齐了，且黄金还有
  const canReserve = p.reserved.length < MAX_RESERVED;
  if (
    canReserve &&
    target &&
    !target.reserved &&
    target.card.points >= 3 &&
    target.short <= 4 &&
    view.bank.gold > 0 &&
    tokenTotal(p.tokens) <= MAX_TOKENS - 1 &&
    rng.next() < 0.35
  )
    return { type: 'reserve', card: target.card.id };

  const take = pickTake(
    view,
    seat,
    ranked.filter((c) => c.short > 0),
    rng,
  );
  if (take) return { type: 'take', gems: take };
  if (buyable.length) return { type: 'buy', card: buyable[0].card.id };
  if (canReserve) {
    const card = target && !target.reserved ? target.card : view.market.flat().find(Boolean);
    if (card) return { type: 'reserve', card: card.id };
    const level = ([3, 2, 1] as Level[]).find((l) => view.deckCounts[l - 1] > 0);
    if (level) return { type: 'reserve', level };
  }
  return { type: 'pass' };
}
