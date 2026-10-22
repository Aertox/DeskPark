import { seatName, withRecommended } from '../../core/ai';
import type { Card } from '../../core/cards';
import { cardLabel } from '../../core/cards';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { gdBot } from './bot';
import type { GdAction, GdView } from './index';
import type { GdCandidate } from './moves';
import { gdCandidates } from './moves';
import { GD_KIND_NAME, isWild } from './patterns';

const lvLabel = (lv: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[lv] ?? String(lv);

function curate(all: GdCandidate[], perKind = 3): GdCandidate[] {
  const byKind = new Map<string, GdCandidate[]>();
  for (const c of all) {
    const key = `${c.pattern.kind}:${c.cards.length}`;
    const list = byKind.get(key) ?? [];
    list.push(c);
    byKind.set(key, list);
  }
  const out: GdCandidate[] = [];
  for (const list of byKind.values()) {
    // 少用万能牌、点数小的优先
    list.sort((a, b) => a.wilds - b.wilds || a.pattern.main - b.pattern.main);
    out.push(...list.slice(0, perKind));
  }
  return out;
}

export function gdAiPrompt(view: GdView, seat: Seat, rng: Rng): AiPrompt<GdAction> | null {
  if (view.phase !== 'playing' || view.turn !== seat) return null;
  const rec = gdBot(view, seat, rng);
  const level = view.level;
  const label = (cards: readonly Card[]) =>
    cards.map((c) => (isWild(c, level) ? `${cardLabel(c)}(配)` : cardLabel(c))).join(' ');
  const partner = (seat + 2) % 4;
  const lines = [
    `阶段：出牌。本局打 ${lvLabel(level)}（红桃 ${lvLabel(level)} 是可以当任意牌的「配」）。你和${seatName(seat, partner, 4)}是一队。`,
    `你的手牌（${view.hand.length} 张）：${label(view.hand)}`,
  ];
  for (const d of [1, 2, 3]) {
    const s = (seat + d) % 4;
    const done = view.finished.indexOf(s);
    lines.push(
      `${seatName(seat, s, 4)}${s === partner ? '（队友）' : '（对手）'}：${done >= 0 ? `已出完（第 ${done + 1} 名）` : `剩 ${view.handCounts[s]} 张`}`,
    );
  }
  const leading = !view.lastPlay;
  if (!leading && view.lastPlay) {
    const lp = view.lastPlay;
    lines.push(
      `当前要压的牌：${seatName(seat, lp.seat, 4)}${lp.seat === partner ? '（队友）' : '（对手）'}出的 ${GD_KIND_NAME[lp.pattern.kind]} ${label(lp.cards)}`,
    );
  } else {
    lines.push('现在轮到你自由出牌（领出）。');
  }
  const all = gdCandidates(view.hand, level, leading ? null : view.lastPlay!.pattern);
  const picked = leading ? curate(all) : all;
  const options: AiOption<GdAction>[] = picked.map((c) => ({
    label: `出 ${GD_KIND_NAME[c.pattern.kind]}：${label(c.cards)}`,
    action: { type: 'play', cards: c.cards.map((x) => x.id).sort((a, b) => a - b) },
  }));
  if (!leading) options.unshift({ label: '不出', action: { type: 'pass' } });
  const norm = (a: GdAction): GdAction =>
    a.type === 'play' ? { type: 'play', cards: [...a.cards].sort((x, y) => x - y) } : a;
  return { situation: lines.join('\n'), options: withRecommended(norm(rec), options) };
}
