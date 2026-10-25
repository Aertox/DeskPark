import { withRecommended } from '../../core/ai';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { PIECE_CHAR, fileOf, mFrom, mTo, notation, rankOf } from './board';
import { thinkXiangqi, xqBot } from './bot';
import type { XqAction, XqView } from './shared';
import { XQ_COLOR_NAME } from './shared';

/** 文字棋盘：红方在下，大写为红方 */
function diagram(view: XqView): string {
  const rows: string[] = [];
  for (let r = 9; r >= 0; r--) {
    let row = `${r} `;
    for (let f = 0; f < 9; f++) {
      const p = view.pieces[r * 9 + f];
      row += p
        ? PIECE_CHAR[['k', 'a', 'e', 'h', 'r', 'c', 'p'].indexOf(p.t) + 1][p.c === 'r' ? 0 : 1]
        : '·';
    }
    rows.push(row);
    if (r === 5) rows.push('  ～～楚河 汉界～～');
  }
  return rows.join('\n');
}

export function xqAiPrompt(view: XqView, seat: Seat, rng: Rng): AiPrompt<XqAction> | null {
  if (view.phase !== 'play' || view.turn !== seat) return null;
  const { b, res } = thinkXiangqi(view, rng);
  const me = view.colors[seat];
  const lines = [
    `中国象棋，你执${XQ_COLOR_NAME[me]}（红方在棋盘下方，先走）。棋盘（行号 0 是红方底线）：`,
    diagram(view),
    `最近的着法：${
      view.moves
        .slice(-10)
        .map((m) => m.text)
        .join(' ') || '（开局）'
    }`,
  ];
  if (view.check !== null) lines.push('你正被将军！');
  lines.push('提示：长将（一直将军造成重复局面）判负。');
  const legal = b.legal();
  const ranked = [...legal].sort(
    (x, y) => (res.scores.get(y) ?? -1e9) - (res.scores.get(x) ?? -1e9),
  );
  const options: AiOption<XqAction>[] = ranked.slice(0, 24).map((m) => ({
    label: `${notation(b, m)}（${rankOf(mFrom(m))},${fileOf(mFrom(m))} → ${rankOf(mTo(m))},${fileOf(mTo(m))}）`,
    action: { type: 'move', from: mFrom(m), to: mTo(m) },
  }));
  return { situation: lines.join('\n'), options: withRecommended(xqBot(view, seat, rng), options) };
}
