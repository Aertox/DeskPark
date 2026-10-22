import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import type { OcAction, OcCard, OcColor, OcView } from './shared';
import { COLORS, cardPoints, isWild, matches, stacksOn, stepSeat } from './shared';

/** 自己现在能打出的牌（id） */
export function playableIds(view: OcView): number[] {
  if (view.seat === null || view.turn !== view.seat || view.phase !== 'play') return [];
  const p = view.pending;
  if (p) return view.options.stack ? view.hand.filter((c) => stacksOn(c, p)).map((c) => c.id) : [];
  if (view.drawn !== null) return [view.drawn];
  return view.hand.filter((c) => matches(c, view.top, view.color)).map((c) => c.id);
}

/** 手里最多的颜色（万能牌不算）；一张有色牌都没有就随机 */
export function bestColor(hand: OcCard[], rng: Rng, except?: number): OcColor {
  const count = new Map<OcColor, number>(COLORS.map((c) => [c, 0]));
  for (const c of hand) if (c.color && c.id !== except) count.set(c.color, count.get(c.color)! + 1);
  const max = Math.max(...count.values());
  const best = COLORS.filter((c) => count.get(c) === max);
  return max === 0 ? rng.pick(COLORS) : rng.pick(best);
}

/** 电脑在打到只剩一张时喊「一张」的概率（偶尔会忘，给玩家抓人的机会） */
const CALL_RATE = 0.85;

function playAction(view: OcView, card: OcCard, rng: Rng): OcAction {
  const action: OcAction = { type: 'play', card: card.id };
  if (isWild(card)) action.color = bestColor(view.hand, rng, card.id);
  if (view.hand.length === 2) action.uno = rng.next() < CALL_RATE;
  return action;
}

/**
 * 给一张能出的牌打分：先出大点数和功能牌，留住万能牌；
 * 下一位快出完时优先用 +2 / 跳过 / +4 拦住他；尽量跟着自己最多的颜色走。
 */
function scoreCard(view: OcView, card: OcCard, seat: Seat): number {
  const n = view.counts.length;
  const next = stepSeat(seat, 1, view.dir, n);
  const danger = view.counts[next] <= 2;
  const sameColor = view.hand.filter((c) => c.id !== card.id && c.color === card.color).length;
  let s = cardPoints(card) / 10 + sameColor * 1.2;
  switch (card.kind) {
    case 'num':
      s += 3;
      break;
    case 'skip':
    case 'reverse':
      s += danger ? 9 : 2;
      if (card.kind === 'reverse' && n === 2) s += danger ? 0 : 1;
      break;
    case 'draw2':
      s += danger ? 12 : 3;
      break;
    case 'wild':
      s = danger ? 6 : 0.5;
      break;
    case 'wild4': {
      // 手里还有当前颜色时出 +4 是违规的，可能被质疑
      const legal = view.color === null || !view.hand.some((c) => c.color === view.color);
      s = legal ? (danger ? 14 : 1) : -8;
      break;
    }
  }
  return s;
}

export function ocBot(view: OcView, seat: Seat, rng: Rng): OcAction {
  if (view.phase === 'roundOver') return { type: 'ready' };
  const w = view.window;
  if (w && seat !== view.turn) {
    // 不在行动的人：抓人或放过；自己忘了喊就看能不能补喊
    if (w.seat === seat) return rng.next() < 0.45 ? { type: 'uno' } : { type: 'pass' };
    return rng.next() < 0.4 ? { type: 'catch' } : { type: 'pass' };
  }
  if (w && w.seat !== seat && rng.next() < 0.5) return { type: 'catch' };

  const p = view.pending;
  if (p) {
    if (view.options.stack) {
      const stack = view.hand.filter((c) => stacksOn(c, p));
      if (stack.length) {
        // 先用 +2 接，留着 +4
        const card = stack.find((c) => c.kind === 'draw2') ?? stack[0];
        return playAction(view, card, rng);
      }
    }
    if (p.kind === 'wild4' && p.challengeable) {
      // 对方手里牌越多，越可能其实有当前颜色
      const chance = Math.min(0.5, Math.max(0, (view.counts[p.from] - 2) * 0.12));
      if (rng.next() < chance) return { type: 'challenge' };
    }
    return { type: 'draw' };
  }

  if (view.drawn !== null) {
    const card = view.hand.find((c) => c.id === view.drawn)!;
    // 摸到的是违规的 +4 就留着
    const bluff =
      card.kind === 'wild4' &&
      view.color !== null &&
      view.hand.some((c) => c.id !== card.id && c.color === view.color);
    return bluff ? { type: 'keep' } : playAction(view, card, rng);
  }

  const ids = new Set(playableIds(view));
  const options = view.hand.filter((c) => ids.has(c.id));
  if (!options.length) return { type: 'draw' };
  const ranked = options
    .map((c) => ({ c, s: scoreCard(view, c, seat) + rng.next() * 0.6 }))
    .sort((a, b) => b.s - a.s);
  // 只剩违规的 +4 可出时，摸牌比冒险好
  if (ranked[0].s < -4) return { type: 'draw' };
  return playAction(view, ranked[0].c, rng);
}
