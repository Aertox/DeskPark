import type { Seat } from '../../core/types';

/** 五种资源：木材、砖块、羊毛、小麦、矿石 */
export type Res = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export const RESOURCES: readonly Res[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const RES_NAME: Record<Res, string> = {
  wood: '木材',
  brick: '砖块',
  sheep: '羊毛',
  wheat: '小麦',
  ore: '矿石',
};
export type Terrain = Res | 'desert';
export const TERRAIN_NAME: Record<Terrain, string> = {
  wood: '森林',
  brick: '丘陵',
  sheep: '牧场',
  wheat: '麦田',
  ore: '山脉',
  desert: '沙漠',
};

export type ResMap = Record<Res, number>;
export const emptyRes = (): ResMap => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const resTotal = (m: ResMap) => RESOURCES.reduce((a, r) => a + m[r], 0);

export type Build = 'road' | 'settlement' | 'city' | 'dev';
export const COST: Record<Build, Partial<ResMap>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};
export const BUILD_NAME: Record<Build, string> = {
  road: '道路',
  settlement: '村庄',
  city: '城市',
  dev: '发展卡',
};
export const PIECES = { road: 15, settlement: 5, city: 4 } as const;
export const BANK_SIZE = 19;
export const MAX_HAND_SAFE = 7;

export type DevKind = 'knight' | 'vp' | 'road' | 'plenty' | 'monopoly';
export const DEV_DECK: Record<DevKind, number> = {
  knight: 14,
  vp: 5,
  road: 2,
  plenty: 2,
  monopoly: 2,
};
export const DEV_NAME: Record<DevKind, string> = {
  knight: '骑士',
  vp: '分数卡',
  road: '道路建设',
  plenty: '丰收之年',
  monopoly: '垄断',
};
export const DEV_EFFECT: Record<DevKind, string> = {
  knight:
    '移动强盗，并从强盗所在地块旁的一位玩家手里抽一张资源；累计骑士最多（至少 3 张）得「最大军队」',
  vp: '直接算 1 分；只有你自己知道，获胜时亮出',
  road: '免费修 2 条道路',
  plenty: '从银行拿任意 2 张资源',
  monopoly: '指定一种资源，其他所有玩家把这种资源全部交给你',
};

/** 骰子点数出现的「点数」：6、8 最常见 */
export const PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

export interface HiHex {
  terrain: Terrain;
  /** 数字标记；沙漠没有 */
  num: number | null;
}
export interface HiPort {
  edge: number;
  /** 'any' = 3:1 通用港口，否则为该资源 2:1 */
  kind: Res | 'any';
}
export interface HiBuilding {
  owner: Seat;
  city: boolean;
}
export interface HiDev {
  kind: DevKind;
  /** 买到这张牌的回合（当回合不能打出） */
  bought: number;
}

export interface HiPlayer {
  hand: ResMap;
  devs: HiDev[];
  knights: number;
  roads: number;
  settlements: number;
  cities: number;
  roadLength: number;
}

export interface HiOptions {
  /** 获胜分数 */
  target: number;
  /** 友好强盗：强盗不能放到总分不超过 2 分的玩家旁边 */
  friendly: boolean;
}

export interface HiTrade {
  from: Seat;
  give: ResMap;
  want: ResMap;
  /** 还没回应的玩家 */
  waiting: Seat[];
  rejected: Seat[];
}

export type HiPhase = 'setup' | 'roll' | 'discard' | 'robber' | 'main' | 'roadBuilding' | 'over';

export type HiEvent =
  | { seq: number; type: 'place'; seat: Seat; what: 'settlement' | 'road' | 'city'; at: number }
  | { seq: number; type: 'roll'; seat: Seat; dice: [number, number] }
  | { seq: number; type: 'produce'; gains: ResMap[]; blocked: Res[] }
  | { seq: number; type: 'discard'; seat: Seat; cards: ResMap }
  | { seq: number; type: 'robber'; seat: Seat; hex: number }
  /** res 只对抢与被抢的两人可见 */
  | { seq: number; type: 'steal'; seat: Seat; victim: Seat; res?: Res }
  /** kind 只对买的人可见 */
  | { seq: number; type: 'buy'; seat: Seat; kind?: DevKind }
  | {
      seq: number;
      type: 'dev';
      seat: Seat;
      kind: Exclude<DevKind, 'vp'>;
      res?: Res[];
      taken?: number;
    }
  | { seq: number; type: 'bank'; seat: Seat; give: Res; count: number; get: Res }
  | { seq: number; type: 'offer'; seat: Seat; give: ResMap; want: ResMap }
  | { seq: number; type: 'trade'; seat: Seat; partner: Seat | null; give: ResMap; want: ResMap }
  | { seq: number; type: 'award'; seat: Seat | null; what: 'road' | 'army' }
  | { seq: number; type: 'end'; seat: Seat };

export interface HiState {
  options: HiOptions;
  rng: number;
  hexes: HiHex[];
  ports: HiPort[];
  robber: number;
  buildings: (HiBuilding | null)[];
  roads: (Seat | null)[];
  players: HiPlayer[];
  bank: ResMap;
  devDeck: DevKind[];
  phase: HiPhase;
  /** 开局摆放的顺序（蛇形）与进度 */
  setupOrder: Seat[];
  setupStep: number;
  /** 开局刚放下的村庄：接下来的道路要连着它 */
  setupVertex: number | null;
  turn: Seat;
  turnNo: number;
  dice: [number, number] | null;
  /** 掷出 7 时每人要弃的牌数 */
  discard: number[];
  /** 强盗移完回到哪个阶段 */
  afterRobber: 'roll' | 'main';
  devPlayed: boolean;
  freeRoads: number;
  afterRoads: 'roll' | 'main';
  longestRoad: Seat | null;
  largestArmy: Seat | null;
  trade: HiTrade | null;
  offersThisTurn: number;
  events: HiEvent[];
  eventSeq: number;
  winner: Seat | null;
  ranking: Seat[] | null;
}

export type HiAction =
  | { type: 'settle'; at: number }
  | { type: 'road'; at: number }
  | { type: 'city'; at: number }
  | { type: 'roll' }
  | { type: 'discard'; cards: ResMap }
  | { type: 'robber'; hex: number; victim?: Seat }
  | { type: 'buy' }
  | { type: 'dev'; kind: Exclude<DevKind, 'vp'>; res?: Res[] }
  | { type: 'bank'; give: Res; get: Res }
  | { type: 'offer'; give: ResMap; want: ResMap }
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'cancel' }
  | { type: 'end' };

export interface HiPlayerView {
  /** 自己的手牌；别人只看到张数 */
  hand: ResMap | null;
  cards: number;
  /** 自己的发展卡；别人只看到张数 */
  devs: HiDev[] | null;
  devCount: number;
  knights: number;
  roads: number;
  settlements: number;
  cities: number;
  roadLength: number;
  /** 公开分数（不含没亮出的分数卡） */
  vp: number;
  /** 自己的总分（含分数卡）；别人为 null */
  vpTotal: number | null;
}

export interface HiView {
  seat: Seat | null;
  options: HiOptions;
  hexes: HiHex[];
  ports: HiPort[];
  robber: number;
  buildings: (HiBuilding | null)[];
  roads: (Seat | null)[];
  players: HiPlayerView[];
  bank: ResMap;
  devLeft: number;
  phase: HiPhase;
  setupVertex: number | null;
  /** 开局阶段：这是第几轮摆放（1 或 2） */
  setupRound: number;
  turn: Seat;
  turnNo: number;
  dice: [number, number] | null;
  discard: number[];
  devPlayed: boolean;
  freeRoads: number;
  longestRoad: Seat | null;
  largestArmy: Seat | null;
  trade: HiTrade | null;
  offersThisTurn: number;
  events: HiEvent[];
  winner: Seat | null;
  ranking: Seat[] | null;
}

export const MAX_OFFERS = 3;
