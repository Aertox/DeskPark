import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import type { Spell, SsAction, SsView } from './shared';
import { MAX_LIFE, leftOf, rightOf } from './shared';
import { rackOdds } from './odds';

/**
 * 魔法出包电脑玩家：按「推算概率 × 收益 − 失败概率 × 代价」估算每个可喊咒语的期望，
 * 第一次必须喊；之后期望不够高就收手。
 */

const KILL = 6; // 把人打到 0 = 上 3 层，价值很高
const DEATH = 6; // 出包把自己打到 0 = 本轮不动，别人还各上 1 层

/** 掷 1–3 点时至少 k 点的概率 */
const atLeast = (k: number) => (k <= 1 ? 1 : k === 2 ? 2 / 3 : k === 3 ? 1 / 3 : 0);

export interface SpellValue {
  spell: Spell;
  chance: number;
  gain: number;
  cost: number;
  ev: number;
}

export function evaluateSpells(view: SsView, seat: Seat): SpellValue[] {
  const n = view.players.length;
  const me = view.players[seat];
  const life = me.life;
  const opp = view.players.map((_, s) => s).filter((s) => s !== seat);
  const hit = (s: Seat, dmg: number) => dmg + (view.players[s].life <= dmg ? KILL : 0);
  const heal = (h: number) => Math.min(h, MAX_LIFE - life);
  const odds = rackOdds(view, seat);
  const lastStone = me.rackCount === 1;
  // 只有牌库用完后，打空面前的石头才能赢下本轮
  const finalStretch = view.poolCount === 0;

  return odds.map(({ spell, chance }) => {
    let gain = 0;
    switch (spell) {
      case 1:
        // 平均 2 点；按每位对手被一击打倒的概率加成
        gain = opp.reduce((sum, s) => sum + 2 + atLeast(view.players[s].life) * KILL, 0);
        break;
      case 2:
        gain = opp.reduce((sum, s) => sum + hit(s, 1), 0) + heal(1);
        break;
      case 3:
        gain = (heal(1) + heal(2) + heal(3)) / 3 + 0.1;
        break;
      case 4:
        gain = view.secretCount > 0 ? 1.3 : 0.1;
        break;
      case 5:
        gain =
          n === 2 ? hit(leftOf(seat, n), 1) : hit(leftOf(seat, n), 1) + hit(rightOf(seat, n), 1);
        break;
      case 6:
        gain = hit(leftOf(seat, n), 1);
        break;
      case 7:
        gain = hit(rightOf(seat, n), 1);
        break;
      case 8:
        gain = heal(1) > 0 ? 1 : 0.1;
        break;
    }
    // 牌库空了以后，每施放一块都更接近打空（打空 = 上 3 层）
    gain += finalStretch ? (lastStone ? KILL : 0.6) : 0.15;
    // 火龙出包：掷骰点数 + 1
    const cost =
      spell === 1
        ? (Math.min(2, life) + Math.min(3, life) + Math.min(4, life)) / 3 +
          atLeast(life - 1) * DEATH
        : 1 + (life <= 1 ? DEATH : 0);
    return { spell, chance, gain, cost, ev: chance * gain - (1 - chance) * cost };
  });
}

export function ssBot(view: SsView, seat: Seat, rng: Rng): SsAction {
  if (view.phase === 'roundOver') return { type: 'ready' };
  const options = evaluateSpells(view, seat)
    .filter((o) => view.chainMin === null || o.spell >= view.chainMin)
    .filter((o) => o.chance > 0)
    .map((o) => ({ ...o, ev: o.ev + (rng.next() - 0.5) * 0.3 }))
    .sort((a, b) => b.ev - a.ev);
  const best = options[0];
  // 血少时更谨慎：只有把握很大才继续
  const threshold = view.players[seat].life <= 2 ? 1.2 : 0.25;
  if (view.castThisTurn > 0 && (!best || best.ev < threshold)) return { type: 'stop' };
  if (!best) {
    // 理论上不会发生（第一次宣告时总有可能的咒语）：宣告最常见的
    return { type: 'cast', spell: (view.chainMin ?? 8) as Spell };
  }
  return { type: 'cast', spell: best.spell };
}
