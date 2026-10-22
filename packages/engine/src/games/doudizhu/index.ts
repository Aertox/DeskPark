import { clone } from '../../core/clone';
import type { Card } from '../../core/cards';
import { createDeck, pickCards, removeCards, sortCards } from '../../core/cards';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { ddzAiPrompt } from './ai';
import { ddzBot } from './bot';
import type { DdzKind, DdzPattern } from './patterns';
import { ddzValue, resolvePlay } from './patterns';

export * from './patterns';
export { beatingCombos, countValues, valuesToCards, splitHand } from './moves';

export interface DdzOptions {
  /** 底分 */
  baseScore: number;
  /** 局数，0 表示不限 */
  rounds: number;
}

export type DdzAction =
  | { type: 'bid'; score: 0 | 1 | 2 | 3 }
  | { type: 'play'; cards: number[] }
  | { type: 'pass' }
  | { type: 'ready' };

export type DdzMove = { type: 'play'; cards: Card[]; kind: DdzKind } | { type: 'pass' };

export interface DdzPlay {
  seat: Seat;
  cards: Card[];
  pattern: DdzPattern;
}

export interface DdzRoundResult {
  round: number;
  landlord: Seat;
  landlordWin: boolean;
  bid: number;
  bombs: number;
  spring: boolean;
  multiplier: number;
  deltas: number[];
}

export type DdzPhase = 'bidding' | 'playing' | 'roundOver' | 'matchOver';

export interface DdzState {
  options: DdzOptions;
  rng: number;
  round: number;
  phase: DdzPhase;
  hands: Card[][];
  bottom: Card[];
  firstBidder: Seat;
  bids: (number | null)[];
  currentBid: number;
  bidWinner: Seat | null;
  redeals: number;
  landlord: Seat | null;
  turn: Seat;
  lastPlay: DdzPlay | null;
  passes: number;
  lastMoves: (DdzMove | null)[];
  playCounts: number[];
  played: Card[];
  bombs: number;
  scores: number[];
  ready: boolean[];
  result: DdzRoundResult | null;
  history: DdzRoundResult[];
}

export interface DdzView {
  seat: Seat | null;
  phase: DdzPhase;
  round: number;
  options: DdzOptions;
  hand: Card[];
  handCounts: number[];
  /** 底牌：叫完地主后公开 */
  bottom: Card[] | null;
  bids: (number | null)[];
  currentBid: number;
  landlord: Seat | null;
  turn: Seat | null;
  lastPlay: DdzPlay | null;
  lastMoves: (DdzMove | null)[];
  /** 本局已打出的所有牌（公开信息，可用于记牌） */
  played: Card[];
  multiplier: number;
  bombs: number;
  scores: number[];
  ready: boolean[];
  result: DdzRoundResult | null;
  /** 局末亮牌 */
  revealed: Card[][] | null;
  redeals: number;
  history: DdzRoundResult[];
}

const N = 3;
const next = (s: Seat) => (s + 1) % N;
const sortHand = (cards: Card[]) => sortCards(cards, ddzValue);

function deal(state: DdzState): void {
  const rng = new Rng(state.rng);
  const deck = rng.shuffle(createDeck(1, true));
  state.rng = rng.state;
  state.hands = [0, 1, 2].map((i) => sortHand(deck.slice(i * 17, i * 17 + 17)));
  state.bottom = deck.slice(51);
  state.phase = 'bidding';
  state.bids = [null, null, null];
  state.currentBid = 0;
  state.bidWinner = null;
  state.landlord = null;
  state.turn = state.firstBidder;
  state.lastPlay = null;
  state.passes = 0;
  state.lastMoves = [null, null, null];
  state.playCounts = [0, 0, 0];
  state.played = [];
  state.bombs = 0;
  state.ready = [false, false, false];
  state.result = null;
}

function multiplierOf(state: DdzState, spring = false): number {
  return 2 ** state.bombs * (spring ? 2 : 1);
}

function becomeLandlord(state: DdzState, seat: Seat): void {
  state.landlord = seat;
  state.hands[seat] = sortHand([...state.hands[seat], ...state.bottom]);
  state.phase = 'playing';
  state.turn = seat;
  state.lastMoves = [null, null, null];
}

function finishRound(state: DdzState, winner: Seat): void {
  const landlord = state.landlord!;
  const landlordWin = winner === landlord;
  const farmers = [0, 1, 2].filter((s) => s !== landlord);
  const spring = landlordWin
    ? farmers.every((s) => state.playCounts[s] === 0)
    : state.playCounts[landlord] === 1;
  const multiplier = multiplierOf(state, spring);
  const unit = state.currentBid * multiplier * state.options.baseScore;
  const deltas = [0, 0, 0];
  for (const f of farmers) deltas[f] = landlordWin ? -unit : unit;
  deltas[landlord] = landlordWin ? unit * 2 : -unit * 2;
  for (let s = 0; s < N; s++) state.scores[s] += deltas[s];
  const result: DdzRoundResult = {
    round: state.round,
    landlord,
    landlordWin,
    bid: state.currentBid,
    bombs: state.bombs,
    spring,
    multiplier,
    deltas,
  };
  state.result = result;
  state.history.push(result);
  state.phase =
    state.options.rounds > 0 && state.round >= state.options.rounds ? 'matchOver' : 'roundOver';
  state.ready = [false, false, false];
}

export const doudizhu: GameDefinition<DdzState, DdzAction, DdzView, DdzOptions> = {
  meta: {
    id: 'doudizhu',
    category: 'poker',
    name: '斗地主',
    nameEn: 'Dou Dizhu',
    tagline: '一人地主，两人农民，先出完者胜',
    minPlayers: 3,
    maxPlayers: 3,
    defaultPlayers: 3,
    botDelayMs: [700, 1300],
    rules: [
      '54 张牌，每人 17 张，留 3 张底牌。轮流叫分（1–3 分），叫分最高者成为地主并获得底牌。',
      '地主先出牌，按逆时针出牌，下家必须出同牌型且更大的牌，或选择"不出"。',
      '牌型：单张、对子、三张、三带一、三带二、顺子（≥5）、连对（≥3 对）、飞机（可带单或对）、四带二、炸弹、王炸。',
      '炸弹可以压任何非炸弹牌型，王炸最大。每出一个炸弹或王炸，倍数 ×2。',
      '地主先出完则地主胜，任一农民先出完则农民胜。春天 / 反春额外 ×2。',
    ],
  },
  defaultOptions: { baseScore: 1, rounds: 0 },
  optionFields: [
    {
      key: 'baseScore',
      label: '底分',
      type: 'select',
      choices: [
        { value: 1, label: '1' },
        { value: 5, label: '5' },
        { value: 10, label: '10' },
      ],
    },
    {
      key: 'rounds',
      label: '局数',
      type: 'select',
      choices: [
        { value: 0, label: '不限' },
        { value: 3, label: '3 局' },
        { value: 6, label: '6 局' },
        { value: 10, label: '10 局' },
      ],
    },
  ],

  setup({ options, seed }) {
    const rng = new Rng(seed);
    const state: DdzState = {
      options: { ...options },
      rng: rng.state,
      round: 1,
      phase: 'bidding',
      hands: [],
      bottom: [],
      firstBidder: rng.int(N),
      bids: [],
      currentBid: 0,
      bidWinner: null,
      redeals: 0,
      landlord: null,
      turn: 0,
      lastPlay: null,
      passes: 0,
      lastMoves: [],
      playCounts: [],
      played: [],
      bombs: 0,
      scores: [0, 0, 0],
      ready: [false, false, false],
      result: null,
      history: [],
    };
    state.rng = rng.state;
    deal(state);
    return state;
  },

  activeSeats(state) {
    if (state.phase === 'roundOver') return [0, 1, 2].filter((s) => !state.ready[s]);
    if (state.phase === 'matchOver') return [];
    return [state.turn];
  },

  validate(state, seat, action) {
    switch (action.type) {
      case 'bid':
        if (state.phase !== 'bidding') return '现在不是叫分阶段';
        if (![0, 1, 2, 3].includes(action.score)) return '无效叫分';
        if (action.score !== 0 && action.score <= state.currentBid) return '叫分必须高于当前分数';
        return null;
      case 'play': {
        if (state.phase !== 'playing') return '现在不能出牌';
        const cards = pickCards(state.hands[seat], action.cards);
        if (!cards || cards.length === 0) return '请选择要出的牌';
        const target =
          state.lastPlay && state.lastPlay.seat !== seat ? state.lastPlay.pattern : null;
        const pattern = resolvePlay(cards, target);
        if (!pattern) return target ? '出的牌没有大过上家' : '不是有效的牌型';
        return null;
      }
      case 'pass':
        if (state.phase !== 'playing') return '现在不能操作';
        if (!state.lastPlay || state.lastPlay.seat === seat) return '你需要出牌';
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
      case 'bid': {
        state.bids[seat] = action.score;
        if (action.score > state.currentBid) {
          state.currentBid = action.score;
          state.bidWinner = seat;
        }
        if (action.score === 3) {
          becomeLandlord(state, seat);
          break;
        }
        const done = state.bids.every((b) => b !== null);
        if (done) {
          if (state.bidWinner === null) {
            // 无人叫分：重新发牌，换下家先叫
            state.redeals++;
            state.firstBidder = next(state.firstBidder);
            deal(state);
          } else {
            becomeLandlord(state, state.bidWinner);
          }
        } else {
          state.turn = next(seat);
        }
        break;
      }
      case 'play': {
        const cards = pickCards(state.hands[seat], action.cards)!;
        const target =
          state.lastPlay && state.lastPlay.seat !== seat ? state.lastPlay.pattern : null;
        const pattern = resolvePlay(cards, target)!;
        if (!target) state.lastMoves = [null, null, null];
        state.hands[seat] = removeCards(state.hands[seat], action.cards)!;
        const sorted = sortHand(cards);
        state.lastPlay = { seat, cards: sorted, pattern };
        state.lastMoves[seat] = { type: 'play', cards: sorted, kind: pattern.kind };
        state.passes = 0;
        state.playCounts[seat]++;
        state.played.push(...sorted);
        if (pattern.kind === 'bomb' || pattern.kind === 'rocket') state.bombs++;
        if (state.hands[seat].length === 0) {
          finishRound(state, seat);
        } else {
          state.turn = next(seat);
        }
        break;
      }
      case 'pass': {
        state.lastMoves[seat] = { type: 'pass' };
        state.passes++;
        state.turn = next(seat);
        if (state.passes >= 2) {
          // 一轮结束，最后出牌者重新领出
          state.turn = state.lastPlay!.seat;
          state.lastPlay = null;
          state.passes = 0;
        }
        break;
      }
      case 'ready': {
        state.ready[seat] = true;
        if (state.ready.every(Boolean)) {
          state.round++;
          // 上一局的地主下家先叫
          state.firstBidder = next(state.result?.landlord ?? state.firstBidder);
          deal(state);
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
      hand: seat === null ? [] : state.hands[seat],
      handCounts: state.hands.map((h) => h.length),
      bottom: state.landlord === null ? null : state.bottom,
      bids: state.bids,
      currentBid: state.currentBid,
      landlord: state.landlord,
      turn: over ? null : state.turn,
      lastPlay: state.lastPlay,
      lastMoves: state.lastMoves,
      played: state.played,
      multiplier: multiplierOf(state),
      bombs: state.bombs,
      scores: state.scores,
      ready: state.ready,
      result: state.result,
      revealed: over ? state.hands : null,
      redeals: state.redeals,
      history: state.history,
    };
  },

  isOver(state) {
    return state.phase === 'matchOver';
  },

  bot: ddzBot,
  aiPrompt: ddzAiPrompt,
};
