import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { ssAiPrompt } from './ai';
import { ssBot } from './bot';
import type {
  SsAction,
  SsEvent,
  SsOptions,
  SsRoundReason,
  SsRoundResult,
  SsState,
  SsStone,
  SsView,
  Spell,
} from './shared';
import {
  MAX_CHAIN,
  MAX_LIFE,
  RACK_SIZE,
  SECRET_COUNT,
  SPELLS,
  SPELL_NAME,
  TARGET,
  leftOf,
  rightOf,
} from './shared';

export * from './shared';

/**
 * 魔法出包：猜自己面前的魔法石。规则参考《出包魔法师》（Abracada...What?）。
 *
 * - 共 36 块魔法石：1 号咒语 1 块、2 号 2 块……8 号 8 块；号码越小越稀有、威力越大。
 * - 每人面前 5 块石头朝外立着：看得到别人的，看不到自己的；城堡里另有 4 块备用的猫头鹰魔法石。
 * - 轮到你时喊出一个咒语：面前有就施放成功（石头摆到图版上对应的一行），没有就「出包」扣血并结束回合。
 *   成功后可以继续喊号码「不小于」刚才的咒语（每回合最多 5 次），或者结束回合补满 5 块。
 * - 有人生命归零，或牌库用完后有人打空面前的石头，本轮结束；玩家沿计分轨道向上爬，最先到第 8 层的获胜。
 */

const isSpell = (x: unknown): x is Spell => typeof x === 'number' && SPELLS.includes(x as Spell);

/** 2–3 人局开局公开移出的石头数 */
export function removedCount(players: number): number {
  return players === 2 ? 12 : players === 3 ? 6 : 0;
}

function createStones(): SsStone[] {
  const out: SsStone[] = [];
  for (const s of SPELLS) for (let i = 0; i < s; i++) out.push({ id: out.length, spell: s });
  return out;
}

const byId = (a: SsStone, b: SsStone) => a.id - b.id;

function deal(state: SsState): void {
  const rng = new Rng(state.rng);
  const stones = rng.shuffle(createStones());
  state.rng = rng.state;
  const n = state.players.length;
  state.removed = stones.splice(0, removedCount(n)).sort(byId);
  for (const p of state.players) {
    p.life = MAX_LIFE;
    p.rack = stones.splice(0, RACK_SIZE);
    p.secrets = [];
  }
  state.secret = stones.splice(0, SECRET_COUNT);
  state.pool = stones;
  state.board = [];
  state.phase = 'play';
  state.turn = state.starter;
  state.chainMin = null;
  state.castThisTurn = 0;
  state.result = null;
  state.ready = state.players.map(() => false);
}

type EventInput = SsEvent extends infer E ? (E extends unknown ? Omit<E, 'seq'> : never) : never;

function pushEvent(state: SsState, e: EventInput): void {
  state.events.push({ ...e, seq: ++state.eventSeq } as SsEvent);
  if (state.events.length > 12) state.events.shift();
}

function roll(state: SsState): number {
  const rng = new Rng(state.rng);
  const r = 1 + rng.int(3);
  state.rng = rng.state;
  return r;
}

function changeLife(
  state: SsState,
  seat: Seat,
  delta: number,
  out: { seat: Seat; delta: number }[],
) {
  const p = state.players[seat];
  const next = Math.max(0, Math.min(MAX_LIFE, p.life + delta));
  const real = next - p.life;
  if (real === 0) return;
  p.life = next;
  const hit = out.find((d) => d.seat === seat);
  if (hit) hit.delta += real;
  else out.push({ seat, delta: real });
}

function others(state: SsState, seat: Seat): Seat[] {
  return state.players.map((_, s) => s).filter((s) => s !== seat);
}

function applySpell(state: SsState, seat: Seat, spell: Spell): EventInput {
  const n = state.players.length;
  const deltas: { seat: Seat; delta: number }[] = [];
  let r: number | undefined;
  let secret: boolean | undefined;
  switch (spell) {
    case 1:
      r = roll(state);
      for (const s of others(state, seat)) changeLife(state, s, -r, deltas);
      break;
    case 2:
      for (const s of others(state, seat)) changeLife(state, s, -1, deltas);
      changeLife(state, seat, 1, deltas);
      break;
    case 3:
      r = roll(state);
      changeLife(state, seat, r, deltas);
      break;
    case 4: {
      const stone = state.secret.shift();
      secret = !!stone;
      if (stone) state.players[seat].secrets.push(stone);
      break;
    }
    case 5:
      if (n === 2) changeLife(state, leftOf(seat, n), -1, deltas);
      else {
        changeLife(state, leftOf(seat, n), -1, deltas);
        changeLife(state, rightOf(seat, n), -1, deltas);
      }
      break;
    case 6:
      changeLife(state, leftOf(seat, n), -1, deltas);
      break;
    case 7:
      changeLife(state, rightOf(seat, n), -1, deltas);
      break;
    case 8:
      changeLife(state, seat, 1, deltas);
      break;
  }
  return { type: 'cast', seat, spell, roll: r, deltas, secret };
}

/**
 * 本轮结算（层数）：
 * - 打空石头：该玩家上 3 层，其他人不动；
 * - 击倒对手：击杀者上 3 层（一次击倒多人也只有 3 层），其他幸存者各上 1 层，倒下的不动；
 * - 喊错反噬倒下：该玩家不动，其余所有人各上 1 层；
 * - 幸存者面前每块猫头鹰魔法石再上 1 层。
 */
function endRound(state: SsState, reason: SsRoundReason, winner: Seat | null): void {
  const n = state.players.length;
  const knocked = state.players.map((p, s) => (p.life <= 0 ? s : -1)).filter((s) => s >= 0);
  const points = state.players.map(() => 0);
  const secretPoints = state.players.map(() => 0);
  state.players.forEach((p, s) => {
    if (p.life <= 0) return;
    if (s === winner) points[s] += 3;
    else if (reason !== 'empty') points[s] += 1;
    secretPoints[s] = p.secrets.length;
    points[s] += p.secrets.length;
  });
  state.players.forEach((p, s) => (p.score += points[s]));
  const result: SsRoundResult = {
    round: state.round,
    reason,
    winner,
    knocked,
    points,
    secretPoints,
  };
  state.result = result;
  state.history.push(result);
  state.starter = (state.turn + 1) % n;
  state.chainMin = null;
  state.castThisTurn = 0;
  const reached = state.players.map((p) => p.score >= TARGET);
  if (reached.some(Boolean)) {
    state.phase = 'matchOver';
    // 多人同时到达第 8 层：本轮前进层数多的获胜，仍然相同则共同获胜
    const best = Math.max(...points.filter((_, s) => reached[s]));
    state.winners = state.players.map((_, s) => s).filter((s) => reached[s] && points[s] === best);
    // 名次：赢家 → 其他到达者（按本轮前进层数）→ 其余玩家（按层数）
    const rank = (s: Seat) => (reached[s] ? 2 : 0) + (state.winners!.includes(s) ? 1 : 0);
    state.ranking = state.players
      .map((_, s) => s)
      .sort(
        (a, b) =>
          rank(b) - rank(a) ||
          (reached[a] ? points[b] - points[a] : 0) ||
          state.players[b].score - state.players[a].score ||
          points[b] - points[a] ||
          state.players[b].life - state.players[a].life,
      );
  } else {
    state.phase = 'roundOver';
  }
  state.ready = state.players.map(() => false);
}

function endTurn(state: SsState): void {
  const seat = state.turn;
  const p = state.players[seat];
  // 牌库用完、无法再补时，最先打空面前石头的玩家赢下本轮
  if (p.rack.length === 0 && state.pool.length === 0) {
    endRound(state, 'empty', seat);
    return;
  }
  const drew = Math.min(RACK_SIZE - p.rack.length, state.pool.length);
  p.rack.push(...state.pool.splice(0, drew));
  pushEvent(state, { type: 'end', seat, drew });
  state.turn = (seat + 1) % state.players.length;
  state.chainMin = null;
  state.castThisTurn = 0;
}

export const spellstones: GameDefinition<SsState, SsAction, SsView, SsOptions> = {
  meta: {
    id: 'spellstones',
    category: 'board',
    name: '魔法出包',
    nameEn: 'Spell Slip',
    tagline: '看得见别人的魔法石，猜不到自己的',
    minPlayers: 2,
    maxPlayers: 5,
    defaultPlayers: 4,
    rules: [
      '共 36 块魔法石：1 号咒语 1 块、2 号 2 块……8 号 8 块。号码越小越稀有、威力越大。每人 6 点生命。',
      '每人面前 5 块石头正面朝外立着：你能看到所有对手的石头，却看不到自己的。城堡里放着 4 块备用的猫头鹰魔法石。',
      '轮到你时喊出一个咒语：面前有这块石头就施放成功，石头摆到图版上对应的一行；没有就「出包」——失去 1 点生命，回合结束。喊火龙出包会遭到火龙反噬：掷骰扣血，再加 1 点。',
      '施放成功后可以结束回合，也可以继续喊；继续时号码必须大于或等于刚才的咒语，每回合最多连续施放 5 次。回合结束时从牌库补满 5 块，牌库用完就不再补。',
      '咒语：①火龙 掷骰，其他人各扣点数 ②暗黑幽灵 其他人各扣 1、自己回 1 ③甜蜜的梦 掷骰回血 ④猫头鹰 拿 1 块猫头鹰魔法石 ⑤闪电暴风雨 左右手边各扣 1 ⑥暴风雪 左手边扣 1 ⑦火球 右手边扣 1 ⑧魔法药水 回 1。生命上限 6，骰子为 1–3 点。',
      '本轮结束：有人生命归零时，击杀者上 3 层，其他幸存者各上 1 层；喊错把自己反噬倒下时，其余所有人各上 1 层；牌库用完后最先打空面前石头的玩家上 3 层，其他人不动。幸存者每块猫头鹰魔法石再上 1 层。',
      '2 人局开局公开 12 块、3 人局公开 6 块放到图版上。最先到达第 8 层的玩家获胜；多人同时到达时，本轮前进层数多的获胜，仍然相同则共同获胜。',
    ],
    botDelayMs: [800, 1400],
  },
  defaultOptions: {},
  optionFields: [],

  setup({ players, seed }) {
    const n = players.length;
    const state: SsState = {
      options: {},
      rng: seed,
      round: 1,
      phase: 'play',
      players: players.map(() => ({ life: MAX_LIFE, rack: [], secrets: [], score: 0 })),
      pool: [],
      secret: [],
      board: [],
      removed: [],
      turn: 0,
      chainMin: null,
      castThisTurn: 0,
      starter: new Rng(seed ^ 0x5eed).int(n),
      events: [],
      eventSeq: 0,
      result: null,
      history: [],
      ready: players.map(() => false),
      ranking: null,
      winners: null,
    };
    deal(state);
    return state;
  },

  activeSeats(state) {
    if (state.phase === 'play') return [state.turn];
    if (state.phase === 'roundOver')
      return state.players.map((_, s) => s).filter((s) => !state.ready[s]);
    return [];
  },

  validate(state, seat, action) {
    switch (action.type) {
      case 'cast':
        if (state.phase !== 'play') return '现在不能施法';
        if (!isSpell(action.spell)) return '请选择一个咒语';
        if (state.castThisTurn >= MAX_CHAIN) return `每回合最多连续施放 ${MAX_CHAIN} 次`;
        if (state.chainMin !== null && action.spell < state.chainMin)
          return `接下来只能喊 ${state.chainMin} 号（${SPELL_NAME[state.chainMin]}）或更大的咒语`;
        return null;
      case 'stop':
        if (state.phase !== 'play') return '现在不能操作';
        return state.castThisTurn > 0 ? null : '至少要喊一个咒语';
      case 'ready':
        return state.phase === 'roundOver' ? null : '本轮尚未结束';
      default:
        return '未知操作';
    }
  },

  apply(prev, seat, action) {
    const state = clone(prev);
    if (action.type === 'ready') {
      state.ready[seat] = true;
      if (state.ready.every(Boolean)) {
        state.round++;
        deal(state);
      }
      return state;
    }
    if (action.type === 'stop') {
      endTurn(state);
      return state;
    }
    const spell = action.spell;
    const p = state.players[seat];
    const idx = p.rack.findIndex((s) => s.spell === spell);
    if (idx < 0) {
      // 出包：失去 1 点生命并结束回合；火龙反噬再掷骰扣血
      const r = spell === 1 ? roll(state) : undefined;
      const loss = Math.min(p.life, (r ?? 0) + 1);
      p.life -= loss;
      pushEvent(state, { type: 'fail', seat, spell, roll: r, loss });
      if (p.life <= 0) endRound(state, 'self', null);
      else endTurn(state);
      return state;
    }
    const [stone] = p.rack.splice(idx, 1);
    state.board.push(stone);
    state.chainMin = spell;
    state.castThisTurn++;
    pushEvent(state, applySpell(state, seat, spell));
    if (state.players.some((x) => x.life <= 0)) {
      endRound(state, 'knockout', seat);
      return state;
    }
    // 打空了面前的石头（或已连续施放 5 次）：回合自动结束；牌库也空了就赢下本轮
    if (p.rack.length === 0 || state.castThisTurn >= MAX_CHAIN) endTurn(state);
    return state;
  },

  view(state, seat) {
    const me = seat !== null ? state.players[seat] : null;
    const over = state.phase !== 'play';
    return {
      seat,
      phase: state.phase,
      round: state.round,
      options: state.options,
      players: state.players.map((p, s) => ({
        life: p.life,
        score: p.score,
        rackCount: p.rack.length,
        // 看得到别人的石头；观战者什么都看不到（防止替玩家「报牌」），本轮结束后全部公开
        rack: over || (seat !== null && s !== seat) ? p.rack : null,
        secretCount: p.secrets.length,
        secrets: s === seat || over ? p.secrets : null,
      })),
      myRack: me && !over ? me.rack.map((s) => s.id) : [],
      board: state.board,
      removed: state.removed,
      poolCount: state.pool.length,
      secretCount: state.secret.length,
      turn: state.phase === 'play' ? state.turn : null,
      chainMin: state.chainMin,
      castThisTurn: state.castThisTurn,
      events: state.events,
      result: state.result,
      history: state.history,
      ready: state.ready,
      ranking: state.ranking,
      winners: state.winners,
    };
  },

  isOver: (state) => state.phase === 'matchOver',
  bot: ssBot,
  aiPrompt: ssAiPrompt,
};

export { rackOdds } from './odds';
export type { SpellOdds } from './odds';
export { evaluateSpells } from './bot';
