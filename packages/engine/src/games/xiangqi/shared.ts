import type { Seat } from '../../core/types';

/** 红 / 黑 */
export type XqColor = 'r' | 'b';
/** 帅将 仕士 相象 马 车 炮 兵卒 */
export type XqType = 'k' | 'a' | 'e' | 'h' | 'r' | 'c' | 'p';

export const XQ_CHAR: Record<XqType, [string, string]> = {
  k: ['帅', '将'],
  a: ['仕', '士'],
  e: ['相', '象'],
  h: ['马', '马'],
  r: ['车', '车'],
  c: ['炮', '炮'],
  p: ['兵', '卒'],
};
export const XQ_COLOR_NAME: Record<XqColor, string> = { r: '红方', b: '黑方' };

export interface XqPiece {
  id: number;
  t: XqType;
  c: XqColor;
}

export interface XqMoveRec {
  from: number;
  to: number;
  /** 中文记谱，例如「炮二平五」 */
  text: string;
  color: XqColor;
  piece: XqType;
  captured?: XqType;
  /** 这步是否将军（判断长将） */
  check: boolean;
}

export interface XqOptions {
  level: number;
  /** 1 号位执的颜色 */
  side: 'r' | 'b' | 'random';
}

export type XqEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'resign'
  | 'perpetual'
  | 'repetition'
  | 'idle'
  | 'material'
  | 'length';

export interface XqResult {
  winner: Seat | null;
  reason: XqEndReason;
}

export interface XqState {
  options: XqOptions;
  rng: number;
  /** 90 个交叉点，index = rank * 9 + file（rank 0 = 红方底线） */
  pieces: (XqPiece | null)[];
  side: XqColor;
  colors: XqColor[];
  bots: boolean[];
  moves: XqMoveRec[];
  /** 开局与每一步之后的局面键 */
  keys: string[];
  /** 连续没有吃子的步数 */
  idle: number;
  phase: 'play' | 'over';
  result: XqResult | null;
}

export type XqAction =
  { type: 'move'; from: number; to: number } | { type: 'resign' } | { type: 'undo' };

export interface XqLegal {
  from: number;
  to: number;
  capture: boolean;
}

export interface XqView {
  seat: Seat | null;
  options: XqOptions;
  pieces: (XqPiece | null)[];
  side: XqColor;
  colors: XqColor[];
  turn: Seat;
  moves: XqMoveRec[];
  keys: string[];
  idle: number;
  legal: XqLegal[];
  check: number | null;
  canUndo: boolean;
  phase: 'play' | 'over';
  result: XqResult | null;
}
