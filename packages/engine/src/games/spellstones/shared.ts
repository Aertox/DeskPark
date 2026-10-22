import type { Seat } from '../../core/types';

export type Spell = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const SPELLS: readonly Spell[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const SPELL_NAME: Record<Spell, string> = {
  1: '远古巨龙',
  2: '暗影游魂',
  3: '甜梦术',
  4: '夜歌鸮',
  5: '雷霆风暴',
  6: '暴风雪',
  7: '火球术',
  8: '魔力药水',
};

export const SPELL_EFFECT: Record<Spell, string> = {
  1: '掷骰（1–3），其他每位玩家失去该点数的生命；失败时自己失去掷出的点数',
  2: '其他每位玩家失去 1 点生命，你回复 1 点',
  3: '掷骰（1–3），回复该点数的生命',
  4: '拿走 1 块秘密石（只有你能看），本轮存活时每块 +1 分',
  5: '左右两位邻座各失去 1 点生命（两人局只扣 1 点）',
  6: '左边的玩家（下家）失去 1 点生命',
  7: '右边的玩家（上家）失去 1 点生命',
  8: '回复 1 点生命',
};

export const MAX_LIFE = 6;
export const RACK_SIZE = 5;
export const SECRET_COUNT = 4;

export interface SsOptions {
  /** 目标分数 */
  target: number;
}

export interface SsStone {
  id: number;
  spell: Spell;
}

export interface SsPlayer {
  life: number;
  rack: SsStone[];
  /** 通过夜歌鸮拿到的秘密石 */
  secrets: SsStone[];
  score: number;
}

export type SsEvent =
  | {
      seq: number;
      type: 'cast';
      seat: Seat;
      spell: Spell;
      roll?: number;
      /** 生命变化（只记录实际变化的座位） */
      deltas: { seat: Seat; delta: number }[];
      /** 夜歌鸮：是否拿到了秘密石 */
      secret?: boolean;
    }
  | { seq: number; type: 'fail'; seat: Seat; spell: Spell; roll?: number; loss: number }
  | { seq: number; type: 'end'; seat: Seat; drew: number };

export type SsRoundReason = 'empty' | 'knockout' | 'self';

export interface SsRoundResult {
  round: number;
  reason: SsRoundReason;
  winner: Seat | null;
  knocked: Seat[];
  points: number[];
  /** 本轮各家通过秘密石得到的分 */
  secretPoints: number[];
}

export type SsPhase = 'play' | 'roundOver' | 'matchOver';

export interface SsState {
  options: SsOptions;
  rng: number;
  round: number;
  phase: SsPhase;
  players: SsPlayer[];
  pool: SsStone[];
  secret: SsStone[];
  /** 已施放的石头（公开） */
  board: SsStone[];
  /** 2–3 人局开局时公开移出的石头 */
  removed: SsStone[];
  turn: Seat;
  /** 本回合上一次成功施放的咒语（下一次宣告不能更小） */
  chainMin: Spell | null;
  castThisTurn: number;
  /** 下一轮由谁先手 */
  starter: Seat;
  events: SsEvent[];
  eventSeq: number;
  result: SsRoundResult | null;
  history: SsRoundResult[];
  ready: boolean[];
  /** 整场结束时的名次 */
  ranking: Seat[] | null;
}

export type SsAction = { type: 'cast'; spell: Spell } | { type: 'stop' } | { type: 'ready' };

export interface SsPlayerView {
  life: number;
  score: number;
  rackCount: number;
  /** 别人的石头（自己的为 null） */
  rack: SsStone[] | null;
  secretCount: number;
  /** 自己的秘密石 */
  secrets: SsStone[] | null;
}

export interface SsView {
  seat: Seat | null;
  phase: SsPhase;
  round: number;
  options: SsOptions;
  players: SsPlayerView[];
  /** 自己面前石头的 id（看不到号码） */
  myRack: number[];
  board: SsStone[];
  removed: SsStone[];
  poolCount: number;
  secretCount: number;
  turn: Seat | null;
  chainMin: Spell | null;
  castThisTurn: number;
  events: SsEvent[];
  result: SsRoundResult | null;
  history: SsRoundResult[];
  ready: boolean[];
  ranking: Seat[] | null;
}

/** 左边 = 下家（出牌顺序的下一位），右边 = 上家 */
export const leftOf = (seat: Seat, n: number) => (seat + 1) % n;
export const rightOf = (seat: Seat, n: number) => (seat + n - 1) % n;
