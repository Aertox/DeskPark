import { withRecommended } from '../../core/ai';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { ggBot, rateCards } from './bot';
import { payment, takeError } from './rules';
import type { Gem, GgAction, GgView, TokenMap } from './shared';
import { GEMS, GEM_NAME, MAX_RESERVED, TOKENS, cardLabel, costText } from './shared';

const tokText = (m: TokenMap) =>
  TOKENS.filter((t) => m[t])
    .map((t) => `${GEM_NAME[t]}${m[t]}`)
    .join(' ') || '无';

export function ggAiPrompt(view: GgView, seat: Seat, rng: Rng): AiPrompt<GgAction> | null {
  // 退宝石、选贵族交给规则电脑
  if (view.phase !== 'play' || view.turn !== seat) return null;
  const me = view.players[seat];
  const lines = [
    '宝石商会：每回合四选一——拿 3 颗不同颜色的宝石、拿 2 颗同色宝石（那种至少剩 4 颗）、预留一张牌并拿 1 颗黄金、或买一张牌。' +
      `买下的牌永久提供对应颜色的折扣；凑够折扣会有贵族来拜访（+3）。先到 ${view.options.target} 声望后打完这一轮，声望最高者胜。宝石最多持有 10 颗。`,
    `你：${me.points} 声望；宝石 ${tokText(me.tokens)}；折扣 ${
      GEMS.filter((g) => me.bonuses[g])
        .map((g) => `${GEM_NAME[g]}${me.bonuses[g]}`)
        .join(' ') || '无'
    }；预留 ${me.reserved.length} 张。`,
  ];
  view.players.forEach((p, s) => {
    if (s !== seat)
      lines.push(
        `${s + 1} 号玩家：${p.points} 声望，宝石 ${tokText(p.tokens)}，折扣 ${
          GEMS.filter((g) => p.bonuses[g])
            .map((g) => `${GEM_NAME[g]}${p.bonuses[g]}`)
            .join(' ') || '无'
        }，预留 ${p.reserved.length} 张`,
      );
  });
  lines.push(
    `贵族：${view.nobles.map((n) => `${n.name}（${costText(n.need)}）`).join('；')}`,
    `供应区：${tokText(view.bank)}`,
  );
  if (view.lastRound) lines.push('这是最后一轮！');

  const options: AiOption<GgAction>[] = [];
  const ranked = rateCards(view, seat).sort((a, b) => b.score - a.score);
  const holder = { tokens: me.tokens, cards: me.cards };
  for (const c of ranked)
    if (payment(holder, c.card))
      options.push({
        label: `买下${c.reserved ? '预留的' : ''} ${cardLabel(c.card)}`,
        action: { type: 'buy', card: c.card.id },
      });
  // 拿宝石：按目标牌缺的颜色组合几种
  const avail = GEMS.filter((g) => view.bank[g] > 0);
  const combos: Gem[][] = [];
  const top = ranked.filter((c) => c.short > 0).slice(0, 3);
  for (const c of top) {
    const lack = [...avail].sort((a, b) => c.missing[b] - c.missing[a]);
    combos.push(lack.slice(0, Math.min(3, avail.length)));
    const g = lack[0];
    if (g && view.bank[g] >= 4) combos.push([g, g]);
  }
  for (const gems of combos)
    if (!takeError(view.bank, gems))
      options.push({
        label: `拿宝石：${gems.map((g) => GEM_NAME[g]).join('、')}`,
        action: { type: 'take', gems },
      });
  if (me.reserved.length < MAX_RESERVED)
    for (const c of ranked.filter((x) => !x.reserved).slice(0, 3))
      options.push({
        label: `预留 ${cardLabel(c.card)}${view.bank.gold ? '，并拿 1 颗黄金' : ''}`,
        action: { type: 'reserve', card: c.card.id },
      });
  const rec = ggBot(view, seat, rng);
  if (!options.length) return null;
  return { situation: lines.join('\n'), options: withRecommended(rec, options) };
}
