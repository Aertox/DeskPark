import type { Card } from '../../core/cards';
import { sortCards } from '../../core/cards';
import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import type { GdAction, GdView } from './index';
import type { GdCandidate, GdGroup } from './moves';
import { gdCandidates, planHand } from './moves';
import { classify, gdValue, isBombPattern, isWild, resolveGd } from './patterns';

/**
 * 掼蛋电脑玩家：
 * - 领出：按手牌规划，优先甩掉小而多的组合，避开对手快出完时的单/对；
 * - 跟牌：不压队友；压对手时选择对手牌结构破坏最小的组合，必要时用炸弹；
 * - 还贡：还一张最没用的小牌。
 */

const ids = (cards: Card[]) => cards.map((c) => c.id);

function without(hand: Card[], cards: Card[]): Card[] {
  const s = new Set(cards.map((c) => c.id));
  return hand.filter((c) => !s.has(c.id));
}

export function gdBot(view: GdView, seat: Seat, rng: Rng): GdAction {
  if (view.phase === 'roundOver') return { type: 'ready' };
  const hand = view.hand;
  const level = view.level;

  if (view.phase === 'tribute') return { type: 'return', card: chooseReturn(hand, level).id };

  const partner = (seat + 2) % 4;
  const opponents = [(seat + 1) % 4, (seat + 3) % 4].filter((s) => !view.finished.includes(s));
  const minOpp = opponents.length ? Math.min(...opponents.map((s) => view.handCounts[s])) : 99;

  // 一手出完
  const whole = resolveGd(hand, level, view.lastPlay?.pattern ?? null);
  if (whole) return { type: 'play', cards: ids(hand) };

  if (!view.lastPlay) return lead(hand, level, view, seat, minOpp, rng);

  const last = view.lastPlay;
  const candidates = gdCandidates(hand, level, last.pattern);
  if (candidates.length === 0) return { type: 'pass' };

  // 队友出的牌不压；若队友刚出完，放行还能拿到接风
  if (last.seat === partner) return { type: 'pass' };

  const base = planHand(hand, level).turns;
  const danger = Math.min(minOpp, view.handCounts[last.seat]);
  const threat = danger <= 2 ? 120 : danger <= 5 ? 20 : danger <= 9 ? 6 : 0;

  let best: { c: GdCandidate | null; cost: number } = { c: null, cost: base * 10 + threat };
  for (const c of candidates) {
    const rest = without(hand, c.cards);
    let cost = planHand(rest, level).turns * 10;
    cost += c.wilds * 6;
    if (isBombPattern(c.pattern)) {
      const big = c.pattern.kind === 'jokerbomb' || c.pattern.size >= 6;
      cost += threat >= 20 ? (big ? 8 : 3) : big ? 40 : 24;
    } else if (c.pattern.kind === 'single' && c.pattern.main >= 16) {
      cost += 4;
    }
    cost += rng.next() * 2;
    if (cost < best.cost) best = { c, cost };
  }
  if (!best.c) return { type: 'pass' };
  return { type: 'play', cards: ids(best.c.cards) };
}

function lead(
  hand: Card[],
  level: number,
  view: GdView,
  seat: Seat,
  minOpp: number,
  rng: Rng,
): GdAction {
  const plan = planHand(hand, level);
  const isBombGroup = (g: GdGroup) => g.kind === 'bomb' || g.kind === 'jokerbomb';
  let normal = plan.groups.filter((g) => !isBombGroup(g));
  const bombs = plan.groups.filter(isBombGroup);

  // 剩下只有炸弹 + 万能牌：先出炸弹
  if (normal.length === 0) {
    if (bombs.length) return { type: 'play', cards: ids(bombs[0].cards) };
    return { type: 'play', cards: ids([plan.wilds[0]]) };
  }

  // 万能牌与普通组合合并能一手出完
  if (normal.length === 1 && plan.wilds.length) {
    const merged = [...normal[0].cards, ...plan.wilds];
    if (classify(merged, level).length) return { type: 'play', cards: ids(merged) };
  }

  // 只剩一手普通牌 + 炸弹：先炸再走
  if (normal.length === 1 && bombs.length) return { type: 'play', cards: ids(bombs[0].cards) };

  const partner = (seat + 2) % 4;
  const partnerCount = view.finished.includes(partner) ? 99 : view.handCounts[partner];
  // 队友只剩一张：送小单
  if (partnerCount === 1 && minOpp > 1) {
    const singles = sortCards(
      hand.filter((c) => !isWild(c, level)),
      (c) => -gdValue(c, level),
    );
    if (singles.length) return { type: 'play', cards: [singles[0].id] };
  }

  if (minOpp === 1) {
    const multi = normal.filter((g) => g.kind !== 'single');
    if (multi.length) normal = multi;
    else return { type: 'play', cards: ids([...normal].sort((a, b) => b.main - a.main)[0].cards) };
  } else if (minOpp === 2) {
    const nonPair = normal.filter((g) => g.kind !== 'pair');
    if (nonPair.length) normal = nonPair;
  }

  if (normal.length === 2) {
    const sorted = [...normal].sort((a, b) => b.main - a.main);
    if (sorted[0].main >= 15) return { type: 'play', cards: ids(sorted[0].cards) };
  }

  const score = (g: GdGroup) => g.main - Math.min(g.cards.length, 6) * 0.6 + rng.next() * 0.8;
  const chosen = [...normal].sort((a, b) => score(a) - score(b))[0];
  return { type: 'play', cards: ids(chosen.cards) };
}

function chooseReturn(hand: Card[], level: number): Card {
  const small = hand.filter((c) => c.suit !== 'J' && c.rank <= 10 && !isWild(c, level));
  const pool = small.length ? small : hand.filter((c) => c.suit !== 'J');
  const count = new Map<number, number>();
  for (const c of hand) count.set(c.rank, (count.get(c.rank) ?? 0) + 1);
  // 优先还孤张中最小的
  return [...pool].sort(
    (a, b) =>
      Number(count.get(a.rank)! > 1) - Number(count.get(b.rank)! > 1) ||
      gdValue(a, level) - gdValue(b, level),
  )[0];
}
