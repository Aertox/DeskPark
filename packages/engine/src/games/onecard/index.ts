import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { SYSTEM_SEAT } from '../../core/types';
import { ocAiPrompt } from './ai';
import { ocBot } from './bot';
import type { OcAction, OcCard, OcDrawReason, OcEvent, OcOptions, OcState, OcView } from './shared';
import {
  COLORS,
  HAND_SIZE,
  UNO_PENALTY,
  cardPoints,
  isWild,
  matches,
  stacksOn,
  stepSeat,
} from './shared';

export * from './shared';

/**
 * 喊一张：四色接龙出牌，规则参考经典的四色牌玩法（官方规则）。
 *
 * - 108 张牌：红黄绿蓝各 0 一张、1–9 / 跳过 / 反转 / +2 各两张，另有万能牌、万能 +4 各四张。
 * - 每人 7 张。出与弃牌堆顶同色、同号或同符号的牌；万能牌任何时候都能出并指定颜色。
 * - 出不了（或不想出）就摸一张，摸到能出的可以马上打出。
 * - 万能 +4 只能在手里没有当前颜色的牌时出，下一位可以质疑。
 * - 打到只剩一张时要喊「一张」，没喊被其他人抓到要罚摸 2 张。
 * - 先出完手牌的人赢下本局，拿走其他人手牌的分值。
 */

export const WINDOW_MS = 2600;

function createDeck(): OcCard[] {
  const out: OcCard[] = [];
  const add = (c: Omit<OcCard, 'id'>) => out.push({ ...c, id: out.length });
  for (const color of COLORS) {
    add({ color, kind: 'num', n: 0 });
    for (let n = 1; n <= 9; n++) {
      add({ color, kind: 'num', n });
      add({ color, kind: 'num', n });
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      add({ color, kind });
      add({ color, kind });
    }
  }
  for (let i = 0; i < 4; i++) {
    add({ color: null, kind: 'wild' });
    add({ color: null, kind: 'wild4' });
  }
  return out;
}

type EventInput = OcEvent extends infer E ? (E extends unknown ? Omit<E, 'seq'> : never) : never;

function pushEvent(state: OcState, e: EventInput): void {
  state.events.push({ ...e, seq: ++state.eventSeq } as OcEvent);
  if (state.events.length > 16) state.events.shift();
}

const n = (state: OcState) => state.hands.length;
const step = (state: OcState, seat: Seat, k: number) => stepSeat(seat, k, state.dir, n(state));

/** 从牌堆摸牌；牌堆空了就把弃牌堆（除了最上面一张）洗进来 */
function drawCards(state: OcState, seat: Seat, count: number, reason: OcDrawReason): number {
  let got = 0;
  for (let i = 0; i < count; i++) {
    if (state.pile.length === 0) {
      if (state.discard.length <= 1) break;
      const top = state.discard.pop()!;
      const rng = new Rng(state.rng);
      state.pile = rng.shuffle(state.discard);
      state.rng = rng.state;
      state.discard = [top];
    }
    state.hands[seat].push(state.pile.pop()!);
    got++;
  }
  if (got > 0) {
    state.called[seat] = false;
    pushEvent(state, { type: 'draw', seat, count: got, reason });
  }
  return got;
}

function deal(state: OcState): void {
  const rng = new Rng(state.rng);
  // 洗牌后重新编号：id 只代表位置，不会泄露是哪张牌
  const deck = rng.shuffle(createDeck()).map((c, i) => ({ ...c, id: i }));
  state.hands = state.hands.map(() => deck.splice(0, HAND_SIZE));
  // 开局翻出万能 +4：放回牌堆重新洗，再翻一张
  let first = deck.pop()!;
  while (first.kind === 'wild4') {
    deck.splice(rng.int(deck.length + 1), 0, first);
    first = deck.pop()!;
  }
  state.rng = rng.state;
  state.pile = deck;
  state.discard = [first];
  state.dir = 1;
  state.pending = null;
  state.drawn = null;
  state.window = null;
  state.called = state.hands.map(() => false);
  state.phase = 'play';
  state.result = null;
  state.ready = state.hands.map(() => false);

  const firstSeat = step(state, state.dealer, 1);
  state.color = first.color;
  state.turn = firstSeat;
  pushEvent(state, { type: 'start', card: first, first: firstSeat });
  switch (first.kind) {
    case 'skip':
      pushEvent(state, { type: 'skip', seat: firstSeat });
      state.turn = step(state, firstSeat, 1);
      break;
    case 'reverse':
      // 庄家先出，方向反过来
      state.dir = -1;
      state.turn = state.dealer;
      pushEvent(state, { type: 'reverse', seat: state.dealer });
      break;
    case 'draw2':
      drawCards(state, firstSeat, 2, 'start');
      pushEvent(state, { type: 'skip', seat: firstSeat });
      state.turn = step(state, firstSeat, 1);
      break;
    default:
      break;
  }
}

function endRound(state: OcState, winner: Seat): void {
  const handPoints = state.hands.map((h) => h.reduce((a, c) => a + cardPoints(c), 0));
  const gained = handPoints.reduce((a, p, s) => (s === winner ? a : a + p), 0);
  const points = state.hands.map((_, s) => (s === winner ? gained : 0));
  state.scores[winner] += gained;
  const result = { round: state.round, winner, points, handPoints, hands: clone(state.hands) };
  state.result = result;
  state.history.push(result);
  state.pending = null;
  state.drawn = null;
  state.window = null;
  state.dealer = (state.dealer + 1) % n(state);
  const target = state.options.target;
  if (target === 0 || state.scores[winner] >= target) {
    state.phase = 'matchOver';
    state.ranking = state.hands
      .map((_, s) => s)
      .sort(
        (a, b) =>
          (b === winner ? 1 : 0) - (a === winner ? 1 : 0) ||
          state.scores[b] - state.scores[a] ||
          handPoints[a] - handPoints[b],
      );
  } else {
    state.phase = 'roundOver';
  }
  state.ready = state.hands.map(() => false);
}

/** 当前行动者的常规动作会关掉抓人的窗口 */
const TURN_ACTIONS = new Set(['play', 'draw', 'keep', 'challenge']);

function closeWindowIfDone(state: OcState): void {
  const w = state.window;
  if (!w) return;
  if (state.hands[w.seat].length !== 1) state.window = null;
  else if (state.hands.every((_, s) => s === state.turn || w.passed.includes(s)))
    state.window = null;
}

export const onecard: GameDefinition<OcState, OcAction, OcView, OcOptions> = {
  meta: {
    id: 'onecard',
    category: 'board',
    name: '喊一张',
    nameEn: 'Last One',
    tagline: '同色同号接上去，只剩一张记得喊',
    minPlayers: 2,
    maxPlayers: 8,
    defaultPlayers: 4,
    rules: [
      '108 张牌：红黄绿蓝四色，每色 0 一张，1–9、跳过、反转、+2 各两张；另有万能牌、万能 +4 各四张。每人 7 张，翻开一张开始。',
      '轮到你时，出一张与弃牌堆顶同色、同号或同符号的牌；万能牌任何时候都能出，并指定接下来的颜色。',
      '出不了（或不想出）就摸一张：摸到能出的可以马上打出，否则轮到下一位。',
      '跳过：下一位停一轮。反转：出牌方向反过来（两人局相当于跳过）。+2：下一位摸 2 张并停一轮。',
      '万能 +4：指定颜色，下一位摸 4 张并停一轮。只能在手里没有当前颜色的牌时出——下一位可以质疑：违规则出牌的人摸 4 张，没违规则质疑的人摸 6 张。',
      '打到只剩一张时要点「一张！」。没喊的话，在下一位行动前被其他人抓到，罚摸 2 张。',
      '先出完手牌的人赢下本局，拿走其他人手牌的分值：数字牌按点数，跳过 / 反转 / +2 各 20 分，万能牌 50 分。可选单局决胜或先到 250 / 500 分。',
      '可选「叠加罚牌」：+2 可以接 +2 或 +4，+4 可以接 +4，罚牌累计给下一位。',
    ],
    botDelayMs: [700, 1200],
  },
  defaultOptions: { target: 0, stack: false },
  optionFields: [
    {
      key: 'target',
      label: '计分',
      hint: '单局决胜，或先到目标分的人获胜',
      type: 'select',
      choices: [
        { value: 0, label: '单局' },
        { value: 250, label: '250 分' },
        { value: 500, label: '500 分' },
      ],
    },
    {
      key: 'stack',
      label: '叠加罚牌',
      hint: '+2 可以接 +2 / +4，+4 可以接 +4，累计给下一位',
      type: 'toggle',
    },
  ],

  setup({ players, options, seed }) {
    const count = players.length;
    const state: OcState = {
      options: {
        target: [0, 250, 500].includes(options.target) ? options.target : 0,
        stack: options.stack === true,
      },
      rng: seed,
      round: 1,
      phase: 'play',
      hands: players.map(() => []),
      pile: [],
      discard: [],
      color: null,
      dir: 1,
      turn: 0,
      dealer: new Rng(seed ^ 0x0ca2d).int(count),
      pending: null,
      drawn: null,
      window: null,
      called: players.map(() => false),
      scores: players.map(() => 0),
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
    if (state.phase === 'roundOver')
      return state.ready.map((r, s) => (r ? -1 : s)).filter((s) => s >= 0);
    if (state.phase !== 'play') return [];
    const out = [state.turn];
    const w = state.window;
    if (w) {
      for (let s = 0; s < n(state); s++) if (s !== state.turn && !w.passed.includes(s)) out.push(s);
    }
    return out;
  },

  autoAdvance(state) {
    return state.phase === 'play' && state.window
      ? { delayMs: WINDOW_MS, action: { type: 'close' } }
      : null;
  },

  validate(state, seat, action) {
    if (seat === SYSTEM_SEAT) return action.type === 'close' && state.window ? null : '无效操作';
    if (action.type === 'ready') return state.phase === 'roundOver' ? null : '本局尚未结束';
    if (state.phase !== 'play') return '现在不能出牌';
    const w = state.window;
    switch (action.type) {
      case 'catch':
        return w && seat !== w.seat ? null : '现在没有可以抓的人';
      case 'uno':
        return w && seat === w.seat ? null : '现在不用喊';
      case 'pass':
        return w && seat !== state.turn && !w.passed.includes(seat) ? null : '无效操作';
      case 'close':
        return '无效操作';
      default:
        break;
    }
    if (!TURN_ACTIONS.has(action.type)) return '未知操作';
    if (seat !== state.turn) return '还没轮到你';
    const p = state.pending;
    switch (action.type) {
      case 'play': {
        const card = state.hands[seat].find((c) => c.id === action.card);
        if (!card) return '你没有这张牌';
        if (state.drawn !== null && card.id !== state.drawn) return '只能打出刚摸到的那张牌';
        if (p) {
          if (!state.options.stack) return p.kind === 'wild4' ? '请选择接受或质疑' : '请先摸牌';
          if (!stacksOn(card, p))
            return p.kind === 'draw2' ? '只能接 +2 或万能 +4' : '只能接万能 +4';
        } else if (!matches(card, state.discard.at(-1)!, state.color)) {
          return '要出同色、同号或同符号的牌';
        }
        if (isWild(card) && !COLORS.includes(action.color!)) return '请选择颜色';
        if (action.uno !== undefined && typeof action.uno !== 'boolean') return '无效操作';
        return null;
      }
      case 'draw':
        return state.drawn !== null ? '已经摸过牌了' : null;
      case 'keep':
        return state.drawn !== null ? null : '无效操作';
      case 'challenge':
        return p && p.kind === 'wild4' && p.challengeable ? null : '现在不能质疑';
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
    const w = state.window;
    if (action.type === 'close') {
      state.window = null;
      return state;
    }
    if (action.type === 'catch') {
      pushEvent(state, { type: 'catch', seat, target: w!.seat });
      state.window = null;
      drawCards(state, w!.seat, UNO_PENALTY, 'caught');
      return state;
    }
    if (action.type === 'uno') {
      pushEvent(state, { type: 'uno', seat });
      state.called[seat] = true;
      state.window = null;
      return state;
    }
    if (action.type === 'pass') {
      w!.passed.push(seat);
      closeWindowIfDone(state);
      return state;
    }
    // 下一位开始行动：没被抓到就算躲过去了
    state.window = null;

    const p = state.pending;
    if (action.type === 'challenge') {
      state.pending = null;
      pushEvent(state, { type: 'challenge', seat, target: p!.from, guilty: p!.guilty });
      if (p!.guilty) {
        // 违规出 +4：出牌的人摸 4 张，质疑者照常出牌
        drawCards(state, p!.from, p!.amount, 'challenge');
      } else {
        drawCards(state, seat, p!.amount + 2, 'challenge');
        state.turn = step(state, seat, 1);
      }
      return state;
    }
    if (action.type === 'draw') {
      if (p) {
        state.pending = null;
        drawCards(state, seat, p.amount, 'penalty');
        pushEvent(state, { type: 'skip', seat });
        state.turn = step(state, seat, 1);
        return state;
      }
      const got = drawCards(state, seat, 1, 'draw');
      const card = got ? state.hands[seat].at(-1)! : null;
      if (card && matches(card, state.discard.at(-1)!, state.color)) {
        state.drawn = card.id;
      } else {
        state.turn = step(state, seat, 1);
      }
      return state;
    }
    if (action.type === 'keep') {
      state.drawn = null;
      pushEvent(state, { type: 'keep', seat });
      state.turn = step(state, seat, 1);
      return state;
    }

    // ---- 出牌 ----
    const hand = state.hands[seat];
    const idx = hand.findIndex((c) => c.id === action.card);
    const [card] = hand.splice(idx, 1);
    const prevColor = state.color;
    // +4 是否违规：出牌前手里有当前颜色的牌
    const guilty =
      card.kind === 'wild4' && prevColor !== null && hand.some((c) => c.color === prevColor);
    state.discard.push(card);
    state.color = isWild(card) ? action.color! : card.color;
    state.drawn = null;
    const uno = hand.length === 1 && action.uno === true;
    state.called[seat] = uno;
    pushEvent(state, { type: 'play', seat, card, color: state.color, uno });

    const next = step(state, seat, 1);
    if (hand.length === 0) {
      // 最后一张是 +2 / +4：下一位照样要摸
      const extra =
        (p && stacksOn(card, p) ? p.amount : 0) +
        (card.kind === 'draw2' ? 2 : card.kind === 'wild4' ? 4 : 0);
      if (extra) drawCards(state, next, extra, 'penalty');
      endRound(state, seat);
      return state;
    }

    switch (card.kind) {
      case 'skip':
        pushEvent(state, { type: 'skip', seat: next });
        state.turn = step(state, seat, 2);
        break;
      case 'reverse':
        state.dir = state.dir === 1 ? -1 : 1;
        pushEvent(state, { type: 'reverse', seat });
        // 两人局：反转相当于跳过，还是自己出
        state.turn = n(state) === 2 ? seat : step(state, seat, 1);
        break;
      case 'draw2':
        if (state.options.stack) {
          state.pending = {
            amount: (p?.amount ?? 0) + 2,
            kind: 'draw2',
            from: seat,
            challengeable: false,
            guilty: false,
          };
          state.turn = next;
        } else {
          drawCards(state, next, 2, 'penalty');
          pushEvent(state, { type: 'skip', seat: next });
          state.turn = step(state, seat, 2);
        }
        break;
      case 'wild4':
        state.pending = {
          amount: (p?.amount ?? 0) + 4,
          kind: 'wild4',
          from: seat,
          challengeable: !p,
          guilty,
        };
        state.turn = next;
        break;
      default:
        state.turn = next;
        break;
    }
    // 打到只剩一张却没喊：下一位行动前，其他人都可以抓
    if (hand.length === 1 && !uno) state.window = { seat, passed: [] };
    return state;
  },

  view(state, seat) {
    const me = seat !== null && seat >= 0 ? state.hands[seat] : null;
    const p = state.pending;
    return {
      seat,
      phase: state.phase,
      round: state.round,
      options: state.options,
      hand: me ?? [],
      counts: state.hands.map((h) => h.length),
      top: state.discard.at(-1)!,
      under: state.discard.slice(-4, -1),
      discardCount: state.discard.length,
      pileCount: state.pile.length,
      color: state.color,
      dir: state.dir,
      turn: state.phase === 'play' ? state.turn : null,
      dealer: state.dealer,
      // guilty 是隐藏信息（出牌人手里的牌），不能发给任何人
      pending: p
        ? { amount: p.amount, kind: p.kind, from: p.from, challengeable: p.challengeable }
        : null,
      drawn: seat === state.turn ? state.drawn : null,
      deciding: state.drawn !== null,
      window: state.window ? { seat: state.window.seat, passed: [...state.window.passed] } : null,
      called: state.called,
      scores: state.scores,
      events: state.events,
      result: state.result,
      history: state.history,
      ready: state.ready,
      ranking: state.ranking,
    };
  },

  isOver: (state) => state.phase === 'matchOver',
  bot: ocBot,
  aiPrompt: ocAiPrompt,
};

export { playableIds } from './bot';
