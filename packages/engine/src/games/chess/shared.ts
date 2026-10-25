import type { Seat } from '../../core/types';

export type ChColor = 'w' | 'b';
export type ChType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type ChPromo = 'q' | 'r' | 'b' | 'n';

export const TYPE_NAME: Record<ChType, string> = {
  k: '王',
  q: '后',
  r: '车',
  b: '象',
  n: '马',
  p: '兵',
};
export const COLOR_NAME: Record<ChColor, string> = { w: '白方', b: '黑方' };

export interface ChPiece {
  /** 固定编号：界面用它来做移动动画 */
  id: number;
  t: ChType;
  c: ChColor;
}

export interface ChMoveRec {
  from: number;
  to: number;
  promo?: ChPromo;
  san: string;
  color: ChColor;
  piece: ChType;
  captured?: ChType;
  check: boolean;
  castle?: boolean;
}

export interface ChOptions {
  /** 电脑强度 1–3 */
  level: number;
  /** 1 号位执的颜色 */
  side: 'w' | 'b' | 'random';
}

export type ChEndReason =
  'checkmate' | 'stalemate' | 'resign' | 'repetition' | 'fifty' | 'material' | 'length';

export interface ChResult {
  winner: Seat | null;
  reason: ChEndReason;
}

export interface ChState {
  options: ChOptions;
  rng: number;
  /** 64 格，index = rank * 8 + file（rank 0 = 白方底线） */
  pieces: (ChPiece | null)[];
  side: ChColor;
  /** 1 白短、2 白长、4 黑短、8 黑长 */
  castle: number;
  ep: number;
  half: number;
  /** 座位 → 执子颜色 */
  colors: ChColor[];
  bots: boolean[];
  moves: ChMoveRec[];
  /** 每一步之后的局面键（判断三次重复） */
  keys: string[];
  phase: 'play' | 'over';
  result: ChResult | null;
}

export type ChAction =
  | { type: 'move'; from: number; to: number; promo?: ChPromo }
  | { type: 'resign' }
  /** 和电脑下时悔一步：撤回自己上一步（以及电脑的应着） */
  | { type: 'undo' };

export interface ChLegal {
  from: number;
  to: number;
  promo?: ChPromo;
  capture: boolean;
}

export interface ChView {
  seat: Seat | null;
  options: ChOptions;
  pieces: (ChPiece | null)[];
  side: ChColor;
  castle: number;
  ep: number;
  half: number;
  colors: ChColor[];
  /** 现在该谁走 */
  turn: Seat;
  moves: ChMoveRec[];
  keys: string[];
  legal: ChLegal[];
  /** 被将军时王所在的格子 */
  check: number | null;
  canUndo: boolean;
  phase: 'play' | 'over';
  result: ChResult | null;
}

export const FILES = 'abcdefgh';
export const squareName = (sq: number) => `${FILES[sq & 7]}${(sq >> 3) + 1}`;
