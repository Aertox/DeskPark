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
import { MAX_LIFE, RACK_SIZE, SECRET_COUNT, SPELLS, leftOf, rightOf } from './shared';

export * from './shared';

/**
 * 魔法出包：猜自己面前的魔法石。规则参考《出包魔法师》（Abracada...What?）。
 *
 * - 共 36 块魔法石：1 号咒语 1 块、2 号 2 块……8 号 8 块；号码越小越稀有、威力越大。
 * - 每人面前 5 块石头朝外摆放：看得到别人的，看不到自己的；另有 4 块秘密石不公开。
 * - 轮到你时宣告一个咒语：手里有就施放成功（石头移到法阵上），没有就失败掉血并结束回合。
 *   成功后可以继续宣告号码「不小于」刚才的咒语，或者结束回合补满 5 块。
 * - 有人生命归零或有人打空面前的石头，本轮结束并计分；先到目标分（默认 8 分）的人获胜。
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

function endRound(state: SsState, reason: SsRoundReason, winner: Seat | null): void {
  const n = state.players.length;
  const knocked = state.players.map((p, s) => (p.life <= 0 ? s : -1)).filter((s) => s >= 0);
  const points = state.players.map(() => 0);
  const secretPoints = state.players.map(() => 0);
  state.players.forEach((p, s) => {
    if (p.life <= 0) return;
    points[s] += s === winner ? 3 : 1;
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
  const top = Math.max(...state.players.map((p) => p.score));
  if (top >= state.options.target) {
    state.phase = 'matchOver';
    // 同分：本轮得分多者优先，再看剩余生命
    state.ranking = state.players
      .map((_, s) => s)
      .sort(
        (a, b) =>
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
  if (p.rack.length === 0) {
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
      '共 36 块魔法石：1 号咒语 1 块、2 号 2 块……8 号 8 块。号码越小越稀有、威力越大。',
      '每人面前 5 块石头朝外摆：你能看到所有对手的石头，却看不到自己的。另有 4 块秘密石不公开。',
      '轮到你时宣告一个咒语：面前有这块石头就施放成功，没有就失败——失去 1 点生命（远古巨龙失败则掷骰扣血）并结束回合。',
      '施放成功后可以结束回合，也可以继续宣告；继续时号码必须大于或等于刚才施放的咒语。',
      '回合结束时从牌库补满 5 块。牌库用完就不再补。',
      '咒语：①远古巨龙 掷骰，其他人各扣点数 ②暗影游魂 其他人各扣 1、自己回 1 ③甜梦术 掷骰回血 ④夜歌鸮 拿 1 块秘密石 ⑤雷霆风暴 左右邻座各扣 1 ⑥暴风雪 下家扣 1 ⑦火球术 上家扣 1 ⑧魔力药水 回 1。生命上限 6，骰子为 1–3 点。',
      '有人生命归零或有人打空面前的石头，本轮结束：打空石头或把别人打到 0 的人得 3 分，其他存活者各得 1 分，存活者每块秘密石再 +1 分；自己把自己打到 0 时没有赢家。',
      '2 人局开局公开移出 12 块、3 人局移出 6 块。先达到目标分（默认 8 分）的人获胜。',
    ],
    botDelayMs: [800, 1400],
  },
  defaultOptions: { target: 8 },
  optionFields: [
    {
      key: 'target',
      label: '目标分',
      hint: '先达到的人获胜',
      type: 'select',
      choices: [
        { value: 5, label: '5 分' },
        { value: 8, label: '8 分' },
        { value: 12, label: '12 分' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const n = players.length;
    const state: SsState = {
      options: { target: [5, 8, 12].includes(options.target) ? options.target : 8 },
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
        if (state.chainMin !== null && action.spell < state.chainMin)
          return `接下来只能宣告 ${state.chainMin} 号或更大的咒语`;
        return null;
      case 'stop':
        if (state.phase !== 'play') return '现在不能操作';
        return state.castThisTurn > 0 ? null : '至少要宣告一个咒语';
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
      // 施法失败：扣血并结束回合
      const r = spell === 1 ? roll(state) : undefined;
      const loss = Math.min(p.life, r ?? 1);
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
    // 打空了面前的石头：回合自动结束，赢下本轮
    if (p.rack.length === 0) endTurn(state);
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
    };
  },

  isOver: (state) => state.phase === 'matchOver',
  bot: ssBot,
  aiPrompt: ssAiPrompt,
};

export { rackOdds } from './odds';
export type { SpellOdds } from './odds';
export { evaluateSpells } from './bot';
