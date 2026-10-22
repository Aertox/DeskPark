import { cardsText, seatName, withRecommended } from '../../core/ai';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { txBot } from './bot';
import { bestFive, handName } from './evaluator';
import type { TxAction, TxView } from './index';

const STREET_NAME = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
} as const;

export function txAiPrompt(view: TxView, seat: Seat, rng: Rng): AiPrompt<TxAction> | null {
  if (view.phase !== 'betting' || view.turn !== seat || !view.me) return null;
  const me = view.players[seat];
  if (!me.hole) return null;
  const rec = txBot(view, seat, rng);
  const n = view.players.length;
  const { toCall, canCheck, canRaise, minRaiseTo, maxRaiseTo } = view.me;
  const lines = [
    `德州扑克，${STREET_NAME[view.street]}。盲注 ${view.sb}/${view.bb}。`,
    `你的底牌：${cardsText(me.hole)}；公共牌：${cardsText(view.board)}`,
  ];
  if (view.board.length >= 3)
    lines.push(`你当前的最好牌型：${handName(bestFive([...me.hole, ...view.board]).score)}`);
  lines.push(
    `底池 ${view.totalPot}，当前最高下注 ${view.currentBet}，你已下 ${me.bet}，筹码 ${me.stack}，需跟 ${toCall}。`,
  );
  for (let d = 1; d < n; d++) {
    const s = (seat + d) % n;
    const p = view.players[s];
    if (p.out) continue;
    const pos =
      s === view.dealer ? '庄位' : s === view.sbSeat ? '小盲' : s === view.bbSeat ? '大盲' : '';
    const state = p.folded ? '已弃牌' : p.allIn ? '已全下' : `本轮下注 ${p.bet}`;
    lines.push(`${seatName(seat, s, n)}${pos ? `（${pos}）` : ''}：筹码 ${p.stack}，${state}`);
  }
  const options: AiOption<TxAction>[] = [];
  if (canCheck) options.push({ label: '过牌', action: { type: 'check' } });
  else {
    options.push({ label: '弃牌', action: { type: 'fold' } });
    options.push({ label: `跟注 ${toCall}`, action: { type: 'call' } });
  }
  if (canRaise) {
    const pot = view.totalPot;
    const targets = [
      minRaiseTo,
      view.currentBet + Math.round(pot / 2),
      view.currentBet + pot,
      view.currentBet + pot * 2,
    ];
    for (const raw of targets) {
      const to = Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(raw / view.sb) * view.sb));
      if (to < maxRaiseTo) options.push({ label: `加注到 ${to}`, action: { type: 'raise', to } });
    }
  }
  // 不能加注时，只有筹码不够跟注才能全下（等于跟注全部筹码）
  if (canRaise || me.bet + me.stack <= view.currentBet) {
    options.push({ label: `全下（${me.stack + me.bet}）`, action: { type: 'allin' } });
  }
  return { situation: lines.join('\n'), options: withRecommended(rec, options) };
}
