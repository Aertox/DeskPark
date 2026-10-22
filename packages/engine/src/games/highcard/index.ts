import { clone } from '../../core/clone';
import type { Card } from '../../core/cards';
import { createDeck, sortCards } from '../../core/cards';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { SYSTEM_SEAT } from '../../core/types';
import { hcAiPrompt } from './ai';

/**
 * 比大小 —— 自定义玩法的参考示例（约 150 行）。
 *
 * 每局每人 5 张牌，共 5 墩。每一墩所有人同时暗出一张，亮牌后点数最大者得 1 分（并列都得分）。
 * 打满设定的局数后总分最高者胜。
 *
 * 演示了插件接口的几个要点：
 * 1. 多个座位同时行动（activeSeats 返回多个座位）；
 * 2. 通过 autoAdvance 让系统定时推进（亮牌停留片刻后自动进入下一墩）；
 * 3. view 隐藏他人信息：别人这一墩出了什么，在亮牌前只能看到"已出牌"。
 */

export interface HcOptions {
  rounds: number;
}

export type HcAction = { type: 'choose'; card: number } | { type: 'continue' };

export interface HcTrick {
  cards: Card[];
  winners: Seat[];
}

export interface HcState {
  options: HcOptions;
  rng: number;
  round: number;
  trick: number;
  phase: 'choose' | 'reveal' | 'matchOver';
  hands: Card[][];
  chosen: (Card | null)[];
  lastTrick: HcTrick | null;
  scores: number[];
}

export interface HcView {
  seat: Seat | null;
  phase: HcState['phase'];
  round: number;
  trick: number;
  options: HcOptions;
  hand: Card[];
  handCounts: number[];
  /** 本墩谁已经出牌（亮牌前看不到具体牌） */
  hasChosen: boolean[];
  myChoice: Card | null;
  lastTrick: HcTrick | null;
  scores: number[];
}

const value = (c: Card) => c.rank; // A 最大

function deal(state: HcState): void {
  const rng = new Rng(state.rng);
  const deck = rng.shuffle(createDeck(1, false));
  state.rng = rng.state;
  state.hands = state.hands.map((_, i) => sortCards(deck.slice(i * 5, i * 5 + 5), value));
  state.chosen = state.hands.map(() => null);
  state.trick = 1;
  state.phase = 'choose';
}

export const highcard: GameDefinition<HcState, HcAction, HcView, HcOptions> = {
  meta: {
    id: 'highcard',
    category: 'casual',
    name: '比大小',
    nameEn: 'High Card',
    tagline: '同时出牌，点大者得分 · 自定义玩法示例',
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 4,
    experimental: true,
    botDelayMs: [400, 900],
    rules: [
      '每局每人 5 张牌，共 5 墩。',
      '每一墩所有人同时暗出一张，亮牌后点数最大者得 1 分，并列最大都得分（A 最大，2 最小，不比花色）。',
      '打满设定局数后，总分最高者获胜。',
      '这是一个演示"自定义玩法"插件接口的示例游戏，源码见 packages/engine/src/games/highcard。',
    ],
  },
  defaultOptions: { rounds: 3 },
  optionFields: [
    {
      key: 'rounds',
      label: '局数',
      type: 'select',
      choices: [
        { value: 1, label: '1 局' },
        { value: 3, label: '3 局' },
        { value: 5, label: '5 局' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const state: HcState = {
      options: { ...options },
      rng: seed >>> 0,
      round: 1,
      trick: 1,
      phase: 'choose',
      hands: players.map(() => []),
      chosen: players.map(() => null),
      lastTrick: null,
      scores: players.map(() => 0),
    };
    deal(state);
    return state;
  },

  activeSeats(state) {
    if (state.phase !== 'choose') return [];
    return state.chosen.map((c, s) => (c ? -1 : s)).filter((s) => s >= 0);
  },

  validate(state, seat, action) {
    if (action.type === 'continue')
      return seat === SYSTEM_SEAT && state.phase === 'reveal' ? null : '无效操作';
    if (action.type !== 'choose') return '未知操作';
    if (state.phase !== 'choose') return '请稍候';
    if (state.chosen[seat]) return '本墩已出牌';
    if (!state.hands[seat].some((c) => c.id === action.card)) return '请选择一张手牌';
    return null;
  },

  apply(prev, seat, action) {
    const state = clone(prev);
    if (action.type === 'choose') {
      const card = state.hands[seat].find((c) => c.id === action.card)!;
      state.hands[seat] = state.hands[seat].filter((c) => c.id !== card.id);
      state.chosen[seat] = card;
      if (state.chosen.every(Boolean)) {
        const cards = state.chosen as Card[];
        const top = Math.max(...cards.map(value));
        const winners = cards.map((c, s) => (value(c) === top ? s : -1)).filter((s) => s >= 0);
        for (const w of winners) state.scores[w]++;
        state.lastTrick = { cards, winners };
        state.phase = 'reveal';
      }
      return state;
    }
    // continue：进入下一墩 / 下一局 / 结束
    state.chosen = state.chosen.map(() => null);
    if (state.trick < 5) {
      state.trick++;
      state.phase = 'choose';
    } else if (state.round < state.options.rounds) {
      state.round++;
      deal(state);
    } else {
      state.phase = 'matchOver';
    }
    return state;
  },

  view(state, seat) {
    return {
      seat,
      phase: state.phase,
      round: state.round,
      trick: state.trick,
      options: state.options,
      hand: seat === null ? [] : state.hands[seat],
      handCounts: state.hands.map((h) => h.length),
      hasChosen: state.chosen.map(Boolean),
      myChoice: seat === null ? null : state.chosen[seat],
      lastTrick: state.phase === 'reveal' || state.phase === 'matchOver' ? state.lastTrick : null,
      scores: state.scores,
    };
  },

  isOver: (state) => state.phase === 'matchOver',

  autoAdvance(state) {
    return state.phase === 'reveal' ? { delayMs: 1800, action: { type: 'continue' } } : null;
  },

  aiPrompt: (view, seat, rng) => hcAiPrompt(view, seat, rng, highcard.bot),
  bot(view, _seat, rng) {
    // 简单策略：随机出一张，略偏向中等牌
    const hand = view.hand;
    const i = Math.min(hand.length - 1, Math.floor(((rng.next() + rng.next()) / 2) * hand.length));
    return { type: 'choose', card: hand[i].id };
  },
};
