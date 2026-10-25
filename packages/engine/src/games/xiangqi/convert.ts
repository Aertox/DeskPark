import { ADVISOR, Board, CANNON, ELEPHANT, HORSE, KING, PAWN, ROOK, mFrom, mTo } from './board';
import type { XqColor, XqLegal, XqMoveRec, XqState, XqType } from './shared';

export const CODE: Record<XqType, number> = {
  k: KING,
  a: ADVISOR,
  e: ELEPHANT,
  h: HORSE,
  r: ROOK,
  c: CANNON,
  p: PAWN,
};
export const TYPE: XqType[] = ['k', 'k', 'a', 'e', 'h', 'r', 'c', 'p'];

export function toBoard(s: Pick<XqState, 'pieces' | 'side'>): Board {
  const sq = s.pieces.map((p) => (p ? CODE[p.t] * (p.c === 'r' ? 1 : -1) : 0));
  return new Board(sq, s.side === 'r' ? 1 : -1);
}

export function legalOf(b: Board): XqLegal[] {
  return b.legal().map((m) => ({ from: mFrom(m), to: mTo(m), capture: b.sq[mTo(m)] !== 0 }));
}

/**
 * 局面第三次出现时怎么判：循环里一方每步都在将军、另一方没有，长将的一方判负；
 * 否则判和。返回走这步的人的结果。
 */
export function repetitionOutcome(
  moves: readonly XqMoveRec[],
  keys: readonly string[],
  next: { key: string; check: boolean; color: XqColor },
): 'lose' | 'win' | 'draw' | null {
  const all = [...keys, next.key];
  if (all.filter((k) => k === next.key).length < 3) return null;
  // 上一次出现这个局面之后的所有着法（包括这一步）
  let j = all.length - 2;
  while (j >= 0 && all[j] !== next.key) j--;
  const cycle = [...moves.slice(j), { color: next.color, check: next.check }];
  const allCheck = (c: XqColor) => {
    const mine = cycle.filter((m) => m.color === c);
    return mine.length > 0 && mine.every((m) => m.check);
  };
  const other: XqColor = next.color === 'r' ? 'b' : 'r';
  const me = allCheck(next.color);
  const them = allCheck(other);
  if (me && !them) return 'lose';
  if (them && !me) return 'win';
  return 'draw';
}
