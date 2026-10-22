import { cardsText, seatName, withRecommended } from '../../core/ai';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { ddzBot } from './bot';
import type { DdzAction, DdzView } from './index';
import type { Combo } from './moves';
import { beatingCombos, countValues, valuesToCards } from './moves';
import { DDZ_KIND_NAME } from './patterns';

/** 领出时出法太多：每种牌型保留最小的几手和最大的一手 */
function curate(all: Combo[], perKind = 4): Combo[] {
  const byKind = new Map<string, Combo[]>();
  for (const c of all) {
    const key = `${c.kind}:${c.len}`;
    const list = byKind.get(key) ?? [];
    list.push(c);
    byKind.set(key, list);
  }
  const out: Combo[] = [];
  for (const list of byKind.values()) {
    list.sort((a, b) => a.main - b.main);
    out.push(...list.slice(0, perKind));
    if (list.length > perKind) out.push(list[list.length - 1]);
  }
  return out;
}

export function ddzAiPrompt(view: DdzView, seat: Seat, rng: Rng): AiPrompt<DdzAction> | null {
  if (view.phase !== 'bidding' && view.phase !== 'playing') return null;
  const rec = ddzBot(view, seat, rng);
  const lines = [`你的手牌（${view.hand.length} 张）：${cardsText(view.hand)}`];

  if (view.phase === 'bidding') {
    lines.unshift('阶段：叫地主（叫分 1~3，分高者当地主，地主多拿 3 张底牌，一打二）。');
    lines.push(`当前最高叫分：${view.currentBid}`);
    const options: AiOption<DdzAction>[] = [{ label: '不叫', action: { type: 'bid', score: 0 } }];
    for (const s of [1, 2, 3] as const) {
      if (s > view.currentBid)
        options.push({ label: `叫 ${s} 分`, action: { type: 'bid', score: s } });
    }
    return { situation: lines.join('\n'), options: withRecommended(rec, options) };
  }

  const landlord = view.landlord!;
  lines.unshift(
    `阶段：出牌。你是${seat === landlord ? '地主' : '农民'}（倍数 ×${view.multiplier}，已出炸弹 ${view.bombs} 个）。`,
  );
  for (const s of [1, 2].map((d) => (seat + d) % 3)) {
    lines.push(
      `${seatName(seat, s, 3)}（${s === landlord ? '地主' : '农民'}）剩 ${view.handCounts[s]} 张`,
    );
  }
  const leading = !view.lastPlay || view.lastPlay.seat === seat;
  if (view.lastPlay && !leading) {
    const lp = view.lastPlay;
    lines.push(
      `当前要压的牌：${seatName(seat, lp.seat, 3)}（${lp.seat === landlord ? '地主' : '农民'}）出的 ${DDZ_KIND_NAME[lp.pattern.kind]} ${cardsText(lp.cards)}`,
    );
  } else {
    lines.push('现在轮到你自由出牌（领出）。');
  }
  const big = view.played.filter((c) => c.rank >= 15);
  if (big.length) lines.push(`已经打出的大牌：${cardsText(big)}`);

  const cnt = countValues(view.hand);
  const combos = beatingCombos(cnt, leading ? null : view.lastPlay!.pattern);
  const picked = leading ? curate(combos) : combos;
  const options: AiOption<DdzAction>[] = picked.map((c) => {
    const cards = valuesToCards(view.hand, c.values);
    return {
      label: `出 ${DDZ_KIND_NAME[c.kind]}：${cardsText(cards)}`,
      action: { type: 'play', cards: cards.map((x) => x.id) },
    };
  });
  if (!leading) options.unshift({ label: '不出', action: { type: 'pass' } });
  const label = (a: DdzAction) => {
    if (a.type !== 'play') return a;
    return { type: 'play' as const, cards: [...a.cards].sort((x, y) => x - y) };
  };
  // 推荐动作的牌 id 顺序可能不同，统一排序后再比较
  const norm = options.map((o) => ({ ...o, action: label(o.action) }));
  return { situation: lines.join('\n'), options: withRecommended(label(rec), norm) };
}
