import type { Seat } from '../../core/types';

/** 五种宝石：钻石（白）、蓝宝石、祖母绿、红宝石、黑曜石；黄金是万能的 */
export type Gem = 'white' | 'blue' | 'green' | 'red' | 'black';
export type Token = Gem | 'gold';
export const GEMS: readonly Gem[] = ['white', 'blue', 'green', 'red', 'black'];
export const TOKENS: readonly Token[] = [...GEMS, 'gold'];
export const GEM_NAME: Record<Token, string> = {
  white: '钻石',
  blue: '蓝宝石',
  green: '祖母绿',
  red: '红宝石',
  black: '黑曜石',
  gold: '黄金',
};

export type GemMap = Record<Gem, number>;
export type TokenMap = Record<Token, number>;
export const emptyGems = (): GemMap => ({ white: 0, blue: 0, green: 0, red: 0, black: 0 });
export const emptyTokens = (): TokenMap => ({ ...emptyGems(), gold: 0 });
export const tokenTotal = (m: TokenMap) => TOKENS.reduce((a, t) => a + m[t], 0);

export type Level = 1 | 2 | 3;
export const LEVELS: readonly Level[] = [1, 2, 3];
export const LEVEL_NAME: Record<Level, string> = { 1: '矿脉', 2: '工坊', 3: '王冠' };

export interface GgCard {
  id: number;
  level: Level;
  /** 买下后永久提供的宝石折扣 */
  bonus: Gem;
  /** 声望 */
  points: number;
  cost: GemMap;
}

export interface GgNoble {
  id: number;
  name: string;
  points: number;
  /** 需要的宝石折扣（发展卡数量） */
  need: GemMap;
}

export interface GgReserved {
  card: GgCard;
  /** 从牌堆顶盲抽预留的：别人看不到是哪张 */
  blind: boolean;
}

export interface GgPlayer {
  tokens: TokenMap;
  cards: GgCard[];
  reserved: GgReserved[];
  nobles: GgNoble[];
}

export interface GgOptions {
  /** 触发最后一轮的声望 */
  target: number;
}

export type GgPhase = 'play' | 'discard' | 'noble' | 'over';

export const MAX_TOKENS = 10;
export const MAX_RESERVED = 3;
export const GOLD = 5;
/** 2 / 3 / 4 人局每种宝石的数量 */
export const GEM_SUPPLY: Record<number, number> = { 2: 4, 3: 5, 4: 7 };

export type GgEvent =
  | { seq: number; type: 'take'; seat: Seat; gems: TokenMap }
  /** 盲抽预留时，card 只对预留的人可见 */
  | {
      seq: number;
      type: 'reserve';
      seat: Seat;
      level: Level;
      card?: GgCard;
      blind: boolean;
      gold: boolean;
    }
  | { seq: number; type: 'buy'; seat: Seat; card: GgCard; paid: TokenMap; reserved: boolean }
  | { seq: number; type: 'discard'; seat: Seat; gems: TokenMap }
  | { seq: number; type: 'noble'; seat: Seat; noble: GgNoble }
  | { seq: number; type: 'pass'; seat: Seat }
  /** 有人达到目标声望：本轮打完就结束 */
  | { seq: number; type: 'final'; seat: Seat };

export interface GgState {
  options: GgOptions;
  rng: number;
  decks: [GgCard[], GgCard[], GgCard[]];
  /** 三排公开的发展卡，每排 4 个位置（牌堆用完后可能空着） */
  market: [(GgCard | null)[], (GgCard | null)[], (GgCard | null)[]];
  nobles: GgNoble[];
  bank: TokenMap;
  players: GgPlayer[];
  starter: Seat;
  turn: Seat;
  turnNo: number;
  phase: GgPhase;
  /** 需要退回的宝石数 */
  discard: number;
  /** 同时满足多位贵族时可以选的 */
  nobleChoices: number[];
  lastRound: boolean;
  events: GgEvent[];
  eventSeq: number;
  winners: Seat[] | null;
  ranking: Seat[] | null;
}

export type GgAction =
  | { type: 'take'; gems: Gem[] }
  /** card：预留公开的牌；level：从该等级牌堆顶盲抽 */
  | { type: 'reserve'; card?: number; level?: Level }
  | { type: 'buy'; card: number }
  | { type: 'discard'; gems: TokenMap }
  | { type: 'noble'; id: number }
  | { type: 'pass' };

export interface GgPlayerView {
  tokens: TokenMap;
  cards: GgCard[];
  bonuses: GemMap;
  points: number;
  /** 别人盲抽预留的牌为 null */
  reserved: (GgCard | null)[];
  nobles: GgNoble[];
}

export interface GgView {
  seat: Seat | null;
  options: GgOptions;
  phase: GgPhase;
  market: (GgCard | null)[][];
  deckCounts: number[];
  nobles: GgNoble[];
  bank: TokenMap;
  players: GgPlayerView[];
  starter: Seat;
  turn: Seat;
  turnNo: number;
  discard: number;
  nobleChoices: number[];
  lastRound: boolean;
  events: GgEvent[];
  winners: Seat[] | null;
  ranking: Seat[] | null;
}

const COST_ORDER: readonly Gem[] = GEMS;
export function costText(cost: GemMap): string {
  return COST_ORDER.filter((g) => cost[g])
    .map((g) => `${GEM_NAME[g]}${cost[g]}`)
    .join(' ');
}
export function cardLabel(c: GgCard): string {
  return `${['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][c.level]}级 ${GEM_NAME[c.bonus]}${c.points ? ` ${c.points} 声望` : ''}（${costText(c.cost)}）`;
}
