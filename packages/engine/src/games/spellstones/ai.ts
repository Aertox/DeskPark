import { seatName, withRecommended } from '../../core/ai';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { ssBot } from './bot';
import { rackOdds } from './odds';
import type { SsAction, SsView, Spell } from './shared';
import { SPELL_EFFECT, SPELL_NAME, SPELLS } from './shared';

const stonesText = (spells: Spell[]) =>
  spells.length ? spells.map((s) => `${s}号${SPELL_NAME[s]}`).join('、') : '（无）';

export function ssAiPrompt(view: SsView, seat: Seat, rng: Rng): AiPrompt<SsAction> | null {
  if (view.phase !== 'play' || view.turn !== seat) return null;
  const n = view.players.length;
  const me = view.players[seat];
  const lines = [
    '魔法出包：你看得见所有对手面前的魔法石，却看不到自己面前的 ' +
      `${me.rackCount} 块。宣告一个咒语，面前有就施放成功，没有就失败扣血并结束回合。`,
    '咒语一览：' +
      SPELLS.map((s) => `${s}号${SPELL_NAME[s]}（共 ${s} 块）：${SPELL_EFFECT[s]}`).join('；'),
    `你：生命 ${me.life}/6，${me.score} 分${me.secrets?.length ? `，秘密石 ${me.secrets.length} 块` : ''}。目标 ${view.options.target} 分。`,
  ];
  for (let d = 1; d < n; d++) {
    const s = (seat + d) % n;
    const p = view.players[s];
    const where =
      n === 2
        ? '对手'
        : d === 1
          ? '下家（你的左边）'
          : d === n - 1
            ? '上家（你的右边）'
            : seatName(seat, s, n);
    lines.push(
      `${where}：生命 ${p.life}/6，${p.score} 分，面前的石头：${stonesText((p.rack ?? []).map((x) => x.spell))}`,
    );
  }
  lines.push(`法阵上已施放：${stonesText(view.board.map((x) => x.spell).sort((a, b) => a - b))}`);
  if (view.removed.length) lines.push(`开局移出：${stonesText(view.removed.map((x) => x.spell))}`);
  lines.push(`牌库剩 ${view.poolCount} 块，未被拿走的秘密石 ${view.secretCount} 块。`);
  if (view.chainMin !== null) {
    lines.push(
      `本回合你已成功施放 ${view.castThisTurn} 次，接下来只能宣告 ${view.chainMin} 号或更大的咒语，也可以结束回合。`,
    );
  }

  const odds = rackOdds(view, seat);
  const options: AiOption<SsAction>[] = [];
  for (const o of odds) {
    if (view.chainMin !== null && o.spell < view.chainMin) continue;
    if (o.unknown === 0) continue; // 一块都不可能有
    options.push({
      label: `宣告 ${o.spell} 号${SPELL_NAME[o.spell]}（推算你面前有的概率约 ${Math.round(o.chance * 100)}%）`,
      action: { type: 'cast', spell: o.spell },
    });
  }
  if (view.castThisTurn > 0)
    options.push({ label: '结束回合（补满石头）', action: { type: 'stop' } });
  if (!options.length) return null;
  return { situation: lines.join('\n'), options: withRecommended(ssBot(view, seat, rng), options) };
}
