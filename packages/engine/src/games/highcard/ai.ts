import { cardsText, seatName, withRecommended } from '../../core/ai';
import { cardLabel } from '../../core/cards';
import type { Rng } from '../../core/rng';
import type { AiPrompt, Seat } from '../../core/types';
import type { HcAction, HcView } from './index';

export function hcAiPrompt(
  view: HcView,
  seat: Seat,
  rng: Rng,
  bot: (v: HcView, s: Seat, r: Rng) => HcAction,
): AiPrompt<HcAction> | null {
  if (view.phase !== 'choose' || view.hasChosen[seat]) return null;
  const n = view.handCounts.length;
  const lines = [
    `比大小：每墩所有人同时暗出一张牌，点数最大者得 1 分（A 最大）。现在是第 ${view.trick} 墩，你还剩 ${view.hand.length} 张牌。`,
    `你的手牌：${cardsText(view.hand)}`,
    `比分：${view.scores.map((sc, s) => `${seatName(seat, s, n)} ${sc}`).join('，')}`,
  ];
  if (view.lastTrick)
    lines.push(
      `上一墩：${view.lastTrick.cards.map((c, s) => `${seatName(seat, s, n)} ${cardLabel(c)}`).join('，')}`,
    );
  const options = view.hand.map((c) => ({
    label: `出 ${cardLabel(c)}`,
    action: { type: 'choose' as const, card: c.id },
  }));
  return { situation: lines.join('\n'), options: withRecommended(bot(view, seat, rng), options) };
}
