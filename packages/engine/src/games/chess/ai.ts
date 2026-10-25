import { withRecommended } from '../../core/ai';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { mFrom, mPromo, mTo, san, toFen } from './board';
import { chBot, thinkChess } from './bot';
import type { ChAction, ChPromo, ChView } from './shared';
import { COLOR_NAME, TYPE_NAME, squareName } from './shared';

const PROMO: ChPromo[] = ['q', 'q', 'n', 'b', 'r', 'q'];

export function chAiPrompt(view: ChView, seat: Seat, rng: Rng): AiPrompt<ChAction> | null {
  if (view.phase !== 'play' || view.turn !== seat) return null;
  const { b, res } = thinkChess(view, rng);
  const me = view.colors[seat];
  const lines = [
    `国际象棋，你执${COLOR_NAME[me]}。当前局面（FEN）：${toFen(b, Math.floor(view.moves.length / 2) + 1)}`,
    `最近的着法：${
      view.moves
        .slice(-10)
        .map((m) => m.san)
        .join(' ') || '（开局）'
    }`,
  ];
  if (view.check !== null) lines.push('你正被将军！');
  const legal = b.legal();
  // 候选：按电脑的估分从高到低
  const ranked = [...legal].sort(
    (x, y) => (res.scores.get(y) ?? -1e9) - (res.scores.get(x) ?? -1e9),
  );
  const options: AiOption<ChAction>[] = ranked.slice(0, 24).map((m) => {
    const piece = b.sq[mFrom(m)];
    const t = ['', 'p', 'n', 'b', 'r', 'q', 'k'][Math.abs(piece)] as keyof typeof TYPE_NAME;
    const promo = mPromo(m) ? PROMO[mPromo(m)] : undefined;
    return {
      label: `${san(b, m, legal)}（${TYPE_NAME[t]} ${squareName(mFrom(m))}→${squareName(mTo(m))}）`,
      action: { type: 'move', from: mFrom(m), to: mTo(m), ...(promo ? { promo } : {}) },
    };
  });
  return { situation: lines.join('\n'), options: withRecommended(chBot(view, seat, rng), options) };
}
