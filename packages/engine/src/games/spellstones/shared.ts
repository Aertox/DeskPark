import type { Seat } from '../../core/types';

export type Spell = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const SPELLS: readonly Spell[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const SPELL_NAME: Record<Spell, string> = {
  1: '火龙',
  2: '暗黑幽灵',
  3: '甜蜜的梦',
  4: '猫头鹰',
  5: '闪电暴风雨',
  6: '暴风雪',
  7: '火球',
  8: '魔法药水',
};

export const SPELL_EFFECT: Record<Spell, string> = {
  1: '掷一次骰子（1–3），其他所有玩家各失去该点数的生命。喊错时「火龙反噬」：掷骰扣血，再加 1 点魔法反噬',
  2: '其他所有玩家各失去 1 点生命，你回复 1 点',
  3: '掷一次骰子（1–3），回复该点数的生命',
  4: '私下查看城堡里的 1 块猫头鹰魔法石，盖在自己面前；本轮结束时存活，每块额外前进 1 层',
  5: '左手边和右手边的玩家各失去 1 点生命（两人局对手失去 1 点）',
  6: '左手边的玩家失去 1 点生命',
  7: '右手边的玩家失去 1 点生命',
  8: '回复 1 点生命',
};

export const MAX_LIFE = 6;
export const RACK_SIZE = 5;
/** 城堡里备用的猫头鹰魔法石 */
export const SECRET_COUNT = 4;
/** 每回合最多连续施放次数 */
export const MAX_CHAIN = 5;
/** 计分轨道的终点：最先到达第 8 层的玩家获胜 */
export const TARGET = 8;

/** 没有可调选项：计分轨道固定 8 层，与实体版一致 */
export type SsOptions = Record<string, never>;

export interface SsStone {
  id: number;
  spell: Spell;
}

export interface SsPlayer {
  life: number;
  rack: SsStone[];
  /** 通过猫头鹰拿到的猫头鹰魔法石（盖在面前，只有自己能看） */
  secrets: SsStone[];
  /** 计分轨道上的层数 */
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
      /** 猫头鹰：是否拿到了猫头鹰魔法石 */
      secret?: boolean;
    }
  /** 喊错：失去 1 点生命；火龙反噬为掷骰点数 + 1 */
  | { seq: number; type: 'fail'; seat: Seat; spell: Spell; roll?: number; loss: number }
  | { seq: number; type: 'end'; seat: Seat; drew: number };

export type SsRoundReason = 'empty' | 'knockout' | 'self';

export interface SsRoundResult {
  round: number;
  reason: SsRoundReason;
  winner: Seat | null;
  knocked: Seat[];
  /** 本轮各家前进的层数（含猫头鹰魔法石） */
  points: number[];
  /** 本轮各家通过猫头鹰魔法石前进的层数 */
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
  /** 整场的赢家（同时到达且本轮前进层数相同则共同获胜） */
  winners: Seat[] | null;
}

export type SsAction = { type: 'cast'; spell: Spell } | { type: 'stop' } | { type: 'ready' };

export interface SsPlayerView {
  life: number;
  score: number;
  rackCount: number;
  /** 别人的石头（自己的为 null） */
  rack: SsStone[] | null;
  secretCount: number;
  /** 自己的猫头鹰魔法石 */
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
  winners: Seat[] | null;
}

/** 顺时针行动：左手边 = 下一位行动的玩家，右手边 = 上一位 */
export const leftOf = (seat: Seat, n: number) => (seat + 1) % n;
export const rightOf = (seat: Seat, n: number) => (seat + n - 1) % n;
