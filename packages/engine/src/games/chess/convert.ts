import {
  BISHOP,
  Board,
  F_EP,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  mFlag,
  mFrom,
  mPromo,
  mTo,
} from './board';
import type { ChLegal, ChPromo, ChState, ChType } from './shared';

export const CODE: Record<ChType, number> = {
  p: PAWN,
  n: KNIGHT,
  b: BISHOP,
  r: ROOK,
  q: QUEEN,
  k: KING,
};
export const TYPE: ChType[] = ['p', 'p', 'n', 'b', 'r', 'q', 'k'];
export const PROMO_CODE: Record<ChPromo, number> = { q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT };

export function toBoard(s: Pick<ChState, 'pieces' | 'side' | 'castle' | 'ep' | 'half'>): Board {
  const sq = s.pieces.map((p) => (p ? CODE[p.t] * (p.c === 'w' ? 1 : -1) : 0));
  return new Board(sq, s.side === 'w' ? 1 : -1, s.castle, s.ep, s.half);
}

export function legalOf(b: Board): ChLegal[] {
  return b.legal().map((m) => ({
    from: mFrom(m),
    to: mTo(m),
    promo: mPromo(m) ? (TYPE[mPromo(m)] as ChPromo) : undefined,
    capture: b.sq[mTo(m)] !== 0 || (mFlag(m) & F_EP) !== 0,
  }));
}
