import { withRecommended } from '../../core/ai';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { ocBot, playableIds } from './bot';
import type { OcAction, OcCard, OcView } from './shared';
import { COLORS, COLOR_NAME, cardLabel, isWild, stepSeat } from './shared';

const handText = (cards: OcCard[]) => cards.map(cardLabel).join('、') || '（无）';

export function ocAiPrompt(view: OcView, seat: Seat, rng: Rng): AiPrompt<OcAction> | null {
  // 抓人 / 补喊是一瞬间的反应，交给规则电脑
  if (view.phase !== 'play' || view.turn !== seat || view.window) return null;
  const n = view.counts.length;
  const lines = [
    '喊一张（四色接龙）：出与弃牌堆顶同色、同号或同符号的牌，万能牌任何时候都能出并指定颜色；先出完手牌的人获胜。' +
      '跳过让下一位停一轮，反转改变方向，+2 让下一位摸 2 张，万能 +4 让下一位摸 4 张（手里有当前颜色时出 +4 可能被质疑）。',
    `你的手牌（${view.hand.length} 张）：${handText(view.hand)}`,
    `弃牌堆顶：${cardLabel(view.top)}，当前颜色：${view.color ? COLOR_NAME[view.color] : '任意'}。牌堆剩 ${view.pileCount} 张。`,
  ];
  for (let d = 1; d < n; d++) {
    const s = stepSeat(seat, d, view.dir, n);
    const tag = d === 1 ? '下一位' : d === n - 1 ? '上一位' : `之后第 ${d} 位`;
    lines.push(
      `${tag}：${view.counts[s]} 张${view.called[s] ? '（已喊一张）' : ''}，${view.scores[s]} 分`,
    );
  }
  if (view.options.target)
    lines.push(`目标 ${view.options.target} 分，你现在 ${view.scores[seat]} 分。`);

  const options: AiOption<OcAction>[] = [];
  const p = view.pending;
  const willCall = view.hand.length === 2;
  const playOptions = (ids: number[]) => {
    for (const id of ids) {
      const c = view.hand.find((x) => x.id === id)!;
      if (isWild(c)) {
        for (const color of COLORS)
          options.push({
            label: `出 ${cardLabel(c)}，指定${COLOR_NAME[color]}色`,
            action: { type: 'play', card: id, color, uno: willCall },
          });
      } else {
        options.push({
          label: `出 ${cardLabel(c)}`,
          action: { type: 'play', card: id, uno: willCall },
        });
      }
    }
  };
  if (p) {
    lines.push(
      `上一位对你出了 ${p.kind === 'wild4' ? '万能 +4' : '+2'}，累计要摸 ${p.amount} 张。` +
        (p.challengeable ? '可以质疑：对方违规则他摸 4 张，否则你摸 6 张。' : ''),
    );
    playOptions(playableIds(view));
    options.push({ label: `接受，摸 ${p.amount} 张`, action: { type: 'draw' } });
    if (p.kind === 'wild4' && p.challengeable)
      options.push({ label: '质疑这张 +4', action: { type: 'challenge' } });
  } else if (view.drawn !== null) {
    const c = view.hand.find((x) => x.id === view.drawn)!;
    lines.push(`你刚摸到 ${cardLabel(c)}，可以马上打出，也可以留着。`);
    playOptions([c.id]);
    options.push({ label: '留着这张，结束回合', action: { type: 'keep' } });
  } else {
    playOptions(playableIds(view));
    options.push({ label: '摸一张牌', action: { type: 'draw' } });
  }
  // 规则电脑偶尔会「忘记」喊一张，大模型接管时不忘
  const rec = ocBot(view, seat, rng);
  if (rec.type === 'play' && willCall) rec.uno = true;
  return { situation: lines.join('\n'), options: withRecommended(rec, options) };
}
