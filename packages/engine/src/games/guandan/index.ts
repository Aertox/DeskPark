import { clone } from '../../core/clone';
import type { Card } from '../../core/cards';
import { BIG_JOKER, createDeck, pickCards, removeCards, sortCards } from '../../core/cards';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { gdBot } from './bot';
import type { GdKind, GdPattern } from './patterns';
import { gdValue, isWild, resolveGd } from './patterns';

export * from './patterns';
export { gdCandidates, planHand } from './moves';

export interface GdOptions {
  /** 起始级牌 */
  startLevel: number;
  /** 是否进贡 */
  tribute: boolean;
}

export type GdAction =
  | { type: 'play'; cards: number[] }
  | { type: 'pass' }
  | { type: 'return'; card: number }
  | { type: 'ready' };

export type GdMove = { type: 'play'; cards: Card[]; kind: GdKind } | { type: 'pass' };

export interface GdPlay {
  seat: Seat;
  cards: Card[];
  pattern: GdPattern;
}

export interface GdTributeInfo {
  anti: boolean;
  pays: { from: Seat; to: Seat; card: Card }[];
  returns: { from: Seat; to: Seat; card: Card | null }[];
}

export interface GdRoundResult {
  round: number;
  level: number;
  /** 完整名次：头游、二游、三游、末游 */
  order: Seat[];
  winTeam: 0 | 1;
  /** 升几级 */
  up: number;
  levelsBefore: [number, number];
  levelsAfter: [number, number];
  matchWon: boolean;
}

export type GdPhase = 'tribute' | 'playing' | 'roundOver' | 'matchOver';

export interface GdState {
  options: GdOptions;
  rng: number;
  round: number;
  phase: GdPhase;
  levels: [number, number];
  levelTeam: 0 | 1;
  level: number;
  hands: Card[][];
  turn: Seat;
  lastPlay: GdPlay | null;
  passes: number;
  lastMoves: (GdMove | null)[];
  finished: Seat[];
  tribute: GdTributeInfo | null;
  ready: boolean[];
  result: GdRoundResult | null;
  history: GdRoundResult[];
  winnerTeam: 0 | 1 | null;
  /** 刚刚发生接风的座位（用于界面提示） */
  jiefeng: Seat | null;
}

export interface GdView {
  seat: Seat | null;
  phase: GdPhase;
  round: number;
  options: GdOptions;
  level: number;
  levels: [number, number];
  levelTeam: 0 | 1;
  hand: Card[];
  handCounts: number[];
  turn: Seat | null;
  lastPlay: GdPlay | null;
  lastMoves: (GdMove | null)[];
  finished: Seat[];
  tribute: GdTributeInfo | null;
  ready: boolean[];
  result: GdRoundResult | null;
  revealed: Card[][] | null;
  history: GdRoundResult[];
  winnerTeam: 0 | 1 | null;
  jiefeng: Seat | null;
}

const N = 4;
export const teamOf = (s: Seat): 0 | 1 => (s % 2) as 0 | 1;
export const partnerOf = (s: Seat): Seat => (s + 2) % N;
export const LEVEL_LABEL = (lv: number) =>
  (({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }) as Record<number, string>)[lv] ?? String(lv);

function sortHand(cards: Card[], level: number): Card[] {
  // 万能牌排在最前（最大），其余按掼蛋大小
  return sortCards(cards, (c) => (isWild(c, level) ? 15.5 : gdValue(c, level)));
}

function nextActive(state: GdState, seat: Seat): Seat {
  for (let i = 1; i <= N; i++) {
    const s = (seat + i) % N;
    if (!state.finished.includes(s)) return s;
  }
  return seat;
}

function tributeCard(hand: Card[], level: number): Card {
  const candidates = hand.filter((c) => !isWild(c, level));
  return sortCards(candidates.length ? candidates : hand, (c) => gdValue(c, level))[0];
}

function canReturn(card: Card): boolean {
  return card.suit !== 'J' && card.rank <= 10;
}

function startRound(state: GdState): void {
  const rng = new Rng(state.rng);
  const deck = rng.shuffle(createDeck(2, true));
  state.level = state.levels[state.levelTeam];
  state.hands = [0, 1, 2, 3].map((i) => deck.slice(i * 27, i * 27 + 27));
  state.lastPlay = null;
  state.passes = 0;
  state.lastMoves = [null, null, null, null];
  state.ready = [false, false, false, false];
  state.result = null;
  state.tribute = null;
  state.jiefeng = null;

  const prev = state.history[state.history.length - 1];
  state.finished = [];

  if (!prev || !state.options.tribute) {
    state.turn = prev ? prev.order[0] : rng.int(N);
    state.phase = 'playing';
  } else {
    const order = prev.order;
    const doubleDown = teamOf(order[0]) === teamOf(order[1]);
    const payers = doubleDown ? [order[2], order[3]] : [order[3]];
    const bigJokers = payers.reduce(
      (n, s) => n + state.hands[s].filter((c) => c.rank === BIG_JOKER).length,
      0,
    );
    if (bigJokers >= 2) {
      state.tribute = { anti: true, pays: [], returns: [] };
      state.turn = order[0];
      state.phase = 'playing';
    } else {
      const pays: GdTributeInfo['pays'] = [];
      if (doubleDown) {
        const cards = payers.map((s) => tributeCard(state.hands[s], state.level));
        const v = cards.map((c) => gdValue(c, state.level));
        // 大的贡给头游；相同则头游下家的进贡者贡给头游
        const firstPayer =
          v[0] !== v[1] ? (v[0] > v[1] ? 0 : 1) : payers[0] === (order[0] + 1) % N ? 0 : 1;
        pays.push({ from: payers[firstPayer], to: order[0], card: cards[firstPayer] });
        pays.push({ from: payers[1 - firstPayer], to: order[1], card: cards[1 - firstPayer] });
      } else {
        pays.push({
          from: payers[0],
          to: order[0],
          card: tributeCard(state.hands[payers[0]], state.level),
        });
      }
      for (const p of pays) {
        state.hands[p.from] = removeCards(state.hands[p.from], [p.card.id])!;
        state.hands[p.to] = [...state.hands[p.to], p.card];
      }
      state.tribute = {
        anti: false,
        pays,
        returns: pays.map((p) => ({ from: p.to, to: p.from, card: null })),
      };
      // 进贡（最大）者先出
      state.turn = pays[0].from;
      state.phase = 'tribute';
    }
  }
  state.hands = state.hands.map((h) => sortHand(h, state.level));
  state.rng = rng.state;
}

function finishRound(state: GdState): void {
  const order = [...state.finished];
  for (let s = 0; s < N; s++) if (!order.includes(s)) order.push(s);
  const winTeam = teamOf(order[0]);
  const partnerPos = order.indexOf(partnerOf(order[0]));
  const up = partnerPos === 1 ? 3 : partnerPos === 2 ? 2 : 1;
  const before: [number, number] = [...state.levels];
  const matchWon =
    state.levelTeam === winTeam && state.levels[winTeam] === 14 && state.level === 14 && up >= 2;
  if (!matchWon) state.levels[winTeam] = Math.min(14, state.levels[winTeam] + up);
  const result: GdRoundResult = {
    round: state.round,
    level: state.level,
    order,
    winTeam,
    up: matchWon ? 0 : up,
    levelsBefore: before,
    levelsAfter: [...state.levels],
    matchWon,
  };
  state.levelTeam = winTeam;
  state.result = result;
  state.history.push(result);
  state.finished = order;
  state.ready = [false, false, false, false];
  if (matchWon) {
    state.winnerTeam = winTeam;
    state.phase = 'matchOver';
  } else {
    state.phase = 'roundOver';
  }
}

export const guandan: GameDefinition<GdState, GdAction, GdView, GdOptions> = {
  meta: {
    id: 'guandan',
    name: '掼蛋',
    nameEn: 'Guandan',
    tagline: '两副牌四人组队，打过 A 者胜',
    minPlayers: 4,
    maxPlayers: 4,
    defaultPlayers: 4,
    botDelayMs: [700, 1300],
    rules: [
      '两副牌共 108 张，四人每人 27 张，对家为队友（你与上方玩家一队）。',
      '从 2 开始打，本局"级牌"大于 A、小于王；红桃级牌是万能牌（逢人配），可替代除王以外的任意牌。',
      '牌型：单张、对子、三同张、三带二、顺子（5 张）、三连对、钢板（两个连续三张）。',
      '炸弹：4~10 张同点数，张数越多越大；同花顺介于 5 炸与 6 炸之间；四王（天王炸）最大。',
      '先出完的为头游。队友二游升 3 级、三游升 2 级、末游升 1 级。某队在自己打 A 时取胜（队友非末游）即赢得整场。',
      '接风：出完牌的玩家最后一手无人能接时，由其队友获得出牌权。',
      '进贡：下一局末游向头游进贡最大的牌（双下则两人都进贡），收贡者还一张 10 以下的牌；进贡方合计持有两张大王可抗贡。',
    ],
  },
  defaultOptions: { startLevel: 2, tribute: true },
  optionFields: [
    {
      key: 'startLevel',
      label: '起始级牌',
      hint: '从更高的级数开始，对局更快结束',
      type: 'select',
      choices: [
        { value: 2, label: '从 2 打起' },
        { value: 8, label: '从 8 打起' },
        { value: 12, label: '从 Q 打起' },
      ],
    },
    { key: 'tribute', label: '进贡还贡', type: 'toggle' },
  ],

  setup({ options, seed }) {
    const start = Math.min(14, Math.max(2, options.startLevel || 2));
    const state: GdState = {
      options: { ...options, startLevel: start },
      rng: seed >>> 0,
      round: 1,
      phase: 'playing',
      levels: [start, start],
      levelTeam: 0,
      level: start,
      hands: [],
      turn: 0,
      lastPlay: null,
      passes: 0,
      lastMoves: [],
      finished: [],
      tribute: null,
      ready: [false, false, false, false],
      result: null,
      history: [],
      winnerTeam: null,
      jiefeng: null,
    };
    startRound(state);
    return state;
  },

  activeSeats(state) {
    switch (state.phase) {
      case 'tribute':
        return state.tribute!.returns.filter((r) => !r.card).map((r) => r.from);
      case 'playing':
        return [state.turn];
      case 'roundOver':
        return [0, 1, 2, 3].filter((s) => !state.ready[s]);
      default:
        return [];
    }
  },

  validate(state, seat, action) {
    switch (action.type) {
      case 'return': {
        if (state.phase !== 'tribute') return '现在不是还贡阶段';
        const r = state.tribute!.returns.find((x) => x.from === seat && !x.card);
        if (!r) return '你不需要还贡';
        const card = state.hands[seat].find((c) => c.id === action.card);
        if (!card) return '请选择一张牌';
        const hasSmall = state.hands[seat].some(canReturn);
        if (hasSmall && !canReturn(card)) return '还贡须是 10 或以下的牌';
        if (card.suit === 'J') return '不能还王';
        return null;
      }
      case 'play': {
        if (state.phase !== 'playing') return '现在不能出牌';
        const cards = pickCards(state.hands[seat], action.cards);
        if (!cards || cards.length === 0) return '请选择要出的牌';
        const target = state.lastPlay ? state.lastPlay.pattern : null;
        const pattern = resolveGd(cards, state.level, target);
        if (!pattern) return target ? '出的牌没有大过上家' : '不是有效的牌型';
        return null;
      }
      case 'pass':
        if (state.phase !== 'playing') return '现在不能操作';
        if (!state.lastPlay) return '你需要出牌';
        return null;
      case 'ready':
        if (state.phase !== 'roundOver') return '本局尚未结束';
        return null;
      default:
        return '未知操作';
    }
  },

  apply(prev, seat, action) {
    const state = clone(prev);
    switch (action.type) {
      case 'return': {
        const r = state.tribute!.returns.find((x) => x.from === seat && !x.card)!;
        const card = state.hands[seat].find((c) => c.id === action.card)!;
        r.card = card;
        state.hands[seat] = removeCards(state.hands[seat], [card.id])!;
        state.hands[r.to] = sortHand([...state.hands[r.to], card], state.level);
        if (state.tribute!.returns.every((x) => x.card)) state.phase = 'playing';
        break;
      }
      case 'play': {
        const cards = pickCards(state.hands[seat], action.cards)!;
        const pattern = resolveGd(cards, state.level, state.lastPlay?.pattern ?? null)!;
        if (!state.lastPlay) state.lastMoves = [null, null, null, null];
        const sorted = sortHand(cards, state.level);
        state.hands[seat] = removeCards(state.hands[seat], action.cards)!;
        state.lastPlay = { seat, cards: sorted, pattern };
        state.lastMoves[seat] = { type: 'play', cards: sorted, kind: pattern.kind };
        state.passes = 0;
        state.jiefeng = null;
        if (state.hands[seat].length === 0) {
          state.finished.push(seat);
          const f = state.finished;
          if ((f.length === 2 && teamOf(f[0]) === teamOf(f[1])) || f.length === 3) {
            finishRound(state);
            break;
          }
        }
        state.turn = nextActive(state, seat);
        break;
      }
      case 'pass': {
        state.lastMoves[seat] = { type: 'pass' };
        state.passes++;
        const last = state.lastPlay!;
        const activeCount = N - state.finished.length;
        const lastActive = !state.finished.includes(last.seat);
        const needed = lastActive ? activeCount - 1 : activeCount;
        if (state.passes >= needed) {
          let leader = last.seat;
          if (!lastActive) {
            leader = partnerOf(last.seat);
            if (state.finished.includes(leader)) leader = nextActive(state, last.seat);
            state.jiefeng = leader;
          }
          state.turn = leader;
          state.lastPlay = null;
          state.passes = 0;
        } else {
          state.turn = nextActive(state, seat);
        }
        break;
      }
      case 'ready': {
        state.ready[seat] = true;
        if (state.ready.every(Boolean)) {
          state.round++;
          startRound(state);
        }
        break;
      }
    }
    return state;
  },

  view(state, seat) {
    const over = state.phase === 'roundOver' || state.phase === 'matchOver';
    return {
      seat,
      phase: state.phase,
      round: state.round,
      options: state.options,
      level: state.level,
      levels: state.levels,
      levelTeam: state.levelTeam,
      hand: seat === null ? [] : state.hands[seat],
      handCounts: state.hands.map((h) => h.length),
      turn: state.phase === 'playing' ? state.turn : null,
      lastPlay: state.lastPlay,
      lastMoves: state.lastMoves,
      finished: state.finished,
      tribute: state.tribute,
      ready: state.ready,
      result: state.result,
      revealed: over ? state.hands : null,
      history: state.history,
      winnerTeam: state.winnerTeam,
      jiefeng: state.jiefeng,
    };
  },

  isOver(state) {
    return state.phase === 'matchOver';
  },

  bot: gdBot,
};
