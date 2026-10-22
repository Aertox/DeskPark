import type { Seat } from '../../core/types';

/** 红 黄 绿 蓝 */
export type OcColor = 'R' | 'Y' | 'G' | 'B';
export const COLORS: readonly OcColor[] = ['R', 'Y', 'G', 'B'];
export const COLOR_NAME: Record<OcColor, string> = { R: '红', Y: '黄', G: '绿', B: '蓝' };

/** 数字牌、跳过、反转、+2、万能牌、万能 +4 */
export type OcKind = 'num' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface OcCard {
  id: number;
  /** 万能牌没有颜色 */
  color: OcColor | null;
  kind: OcKind;
  /** 数字牌的点数 0–9 */
  n?: number;
}

export const HAND_SIZE = 7;
/** 忘记喊「一张」被抓时的罚牌数 */
export const UNO_PENALTY = 2;

export interface OcOptions {
  /** 目标分；0 表示单局决胜 */
  target: number;
  /** 叠加罚牌：+2 可以接 +2 / +4，+4 可以接 +4，累计给下一位 */
  stack: boolean;
}

/** 等待下一位处理的罚牌 */
export interface OcPending {
  amount: number;
  kind: 'draw2' | 'wild4';
  from: Seat;
  /** 单张 +4 可以被质疑 */
  challengeable: boolean;
}

export type OcDrawReason = 'draw' | 'penalty' | 'caught' | 'challenge' | 'start';

export type OcEvent =
  | { seq: number; type: 'start'; card: OcCard; first: Seat }
  | {
      seq: number;
      type: 'play';
      seat: Seat;
      card: OcCard;
      /** 打出后生效的颜色（万能牌为玩家指定的颜色） */
      color: OcColor | null;
      /** 打到只剩一张时是否喊了「一张」 */
      uno: boolean;
    }
  | { seq: number; type: 'draw'; seat: Seat; count: number; reason: OcDrawReason }
  /** 摸到能出的牌但留在手里 */
  | { seq: number; type: 'keep'; seat: Seat }
  | { seq: number; type: 'skip'; seat: Seat }
  | { seq: number; type: 'reverse'; seat: Seat }
  | { seq: number; type: 'challenge'; seat: Seat; target: Seat; guilty: boolean }
  | { seq: number; type: 'catch'; seat: Seat; target: Seat }
  /** 补喊「一张」 */
  | { seq: number; type: 'uno'; seat: Seat };

export interface OcRoundResult {
  round: number;
  winner: Seat;
  /** 本局各家得分（赢家拿走其他人手牌的分值） */
  points: number[];
  /** 本局结束时各家手牌的分值 */
  handPoints: number[];
  hands: OcCard[][];
}

export type OcPhase = 'play' | 'roundOver' | 'matchOver';

export interface OcState {
  options: OcOptions;
  rng: number;
  round: number;
  phase: OcPhase;
  hands: OcCard[][];
  pile: OcCard[];
  /** 弃牌堆，最后一张在最上面 */
  discard: OcCard[];
  /** 当前颜色；null 表示开局翻出万能牌，第一位可以出任意牌 */
  color: OcColor | null;
  /** 1 = 座位号递增方向，-1 = 反向 */
  dir: 1 | -1;
  turn: Seat;
  dealer: Seat;
  pending: (OcPending & { guilty: boolean }) | null;
  /** 刚摸到、可以马上打出的那张牌 */
  drawn: number | null;
  /** 有人打到只剩一张却没喊：下一位行动前，其他人可以抓 */
  window: { seat: Seat; passed: Seat[] } | null;
  /** 只剩一张并且喊过了 */
  called: boolean[];
  scores: number[];
  events: OcEvent[];
  eventSeq: number;
  result: OcRoundResult | null;
  history: OcRoundResult[];
  ready: boolean[];
  ranking: Seat[] | null;
}

export type OcAction =
  | { type: 'play'; card: number; color?: OcColor; uno?: boolean }
  /** 摸一张；有罚牌时表示接受罚牌 */
  | { type: 'draw' }
  /** 摸到能出的牌，选择留着 */
  | { type: 'keep' }
  | { type: 'challenge' }
  /** 补喊「一张」 */
  | { type: 'uno' }
  /** 抓没喊「一张」的人 */
  | { type: 'catch' }
  /** 放过（不抓 / 不补喊） */
  | { type: 'pass' }
  | { type: 'ready' }
  /** 系统：关闭抓人的窗口 */
  | { type: 'close' };

export interface OcView {
  seat: Seat | null;
  phase: OcPhase;
  round: number;
  options: OcOptions;
  /** 自己的手牌（观战者为空） */
  hand: OcCard[];
  counts: number[];
  top: OcCard;
  /** 弃牌堆最上面几张（从下到上），用来摆出牌堆的样子 */
  under: OcCard[];
  discardCount: number;
  pileCount: number;
  color: OcColor | null;
  dir: 1 | -1;
  turn: Seat | null;
  dealer: Seat;
  pending: OcPending | null;
  /** 自己刚摸到、可以马上打出的牌 */
  drawn: number | null;
  /** 当前行动者正在决定要不要打出刚摸到的牌 */
  deciding: boolean;
  window: { seat: Seat; passed: Seat[] } | null;
  called: boolean[];
  scores: number[];
  events: OcEvent[];
  result: OcRoundResult | null;
  history: OcRoundResult[];
  ready: boolean[];
  ranking: Seat[] | null;
}

const KIND_NAME: Record<OcKind, string> = {
  num: '',
  skip: '跳过',
  reverse: '反转',
  draw2: '+2',
  wild: '万能牌',
  wild4: '万能 +4',
};

export function cardLabel(c: OcCard): string {
  if (c.kind === 'wild' || c.kind === 'wild4') return KIND_NAME[c.kind];
  return `${COLOR_NAME[c.color!]}${c.kind === 'num' ? ` ${c.n}` : ` ${KIND_NAME[c.kind]}`}`;
}

/** 结算分值：数字牌按点数，跳过 / 反转 / +2 各 20，万能牌 50 */
export function cardPoints(c: OcCard): number {
  if (c.kind === 'num') return c.n!;
  if (c.kind === 'wild' || c.kind === 'wild4') return 50;
  return 20;
}

export const isWild = (c: OcCard) => c.kind === 'wild' || c.kind === 'wild4';

/** 能否接在弃牌堆顶：同色、同号或同符号；万能牌任何时候都能出 */
export function matches(c: OcCard, top: OcCard, color: OcColor | null): boolean {
  if (isWild(c)) return true;
  if (color === null) return true;
  if (c.color === color) return true;
  if (c.kind === 'num') return top.kind === 'num' && top.n === c.n;
  return c.kind === top.kind;
}

/** 有罚牌等着时，叠加规则下能接的牌 */
export function stacksOn(c: OcCard, pending: OcPending): boolean {
  return pending.kind === 'draw2' ? c.kind === 'draw2' || c.kind === 'wild4' : c.kind === 'wild4';
}

/** 按当前方向数第 k 位 */
export const stepSeat = (seat: Seat, k: number, dir: 1 | -1, n: number) =>
  (((seat + dir * k) % n) + n) % n;
