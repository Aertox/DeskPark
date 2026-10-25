import type { Rng } from '../../core/rng';
import type { Board } from './board';
import {
  ADVISOR,
  CANNON,
  ELEPHANT,
  HORSE,
  KING,
  PAWN,
  ROOK,
  fileOf,
  mFrom,
  mTo,
  rankOf,
} from './board';

/** 迭代加深 alpha-beta + 静态搜索；子力价值 + 位置分（红方视角） */

const VALUE = [0, 0, 120, 120, 270, 600, 285, 30];
export const MATE = 100000;

/** 位置分：r 是这一方视角的横排（0 = 自己的底线） */
function posBonus(t: number, r: number, f: number): number {
  const center = 4 - Math.abs(f - 4);
  switch (t) {
    case PAWN:
      if (r <= 4) return r === 4 ? 10 : 0;
      // 过河兵：越靠中间、越接近九宫越好；沉底兵价值下降
      if (r === 9) return 20;
      return 40 + center * 6 + (r >= 6 && r <= 8 && f >= 3 && f <= 5 ? 20 : 0);
    case HORSE:
      return center * 6 + (r >= 2 && r <= 7 ? 12 : 0) - (f === 0 || f === 8 ? 12 : 0);
    case ROOK:
      return (r >= 3 ? 12 : 0) + (f === 0 || f === 8 ? -4 : 4);
    case CANNON:
      return (f === 4 ? 14 : 0) + (r === 2 || r === 0 ? 6 : 0);
    case KING:
      return r === 0 ? 8 : -6 * r;
    default:
      return 0;
  }
}

function evalRed(b: Board): number {
  const sq = b.sq;
  let score = 0;
  let redGuards = 0;
  let blackGuards = 0;
  let redAttack = 0;
  let blackAttack = 0;
  for (let i = 0; i < 90; i++) {
    const p = sq[i];
    if (!p) continue;
    const t = Math.abs(p);
    const r = rankOf(i);
    const f = fileOf(i);
    const v = VALUE[t] + posBonus(t, p > 0 ? r : 9 - r, p > 0 ? f : 8 - f);
    score += p > 0 ? v : -v;
    if (t === ADVISOR || t === ELEPHANT) {
      if (p > 0) redGuards++;
      else blackGuards++;
    }
    if (t === ROOK || t === HORSE || t === CANNON) {
      if (p > 0) redAttack += VALUE[t];
      else blackAttack += VALUE[t];
    }
  }
  // 士象残缺时，对方的攻击子更有威胁
  score -= ((4 - redGuards) * blackAttack) / 60;
  score += ((4 - blackGuards) * redAttack) / 60;
  return score;
}

export const evaluate = (b: Board) => evalRed(b) * b.side;

function order(b: Board, moves: number[], killers?: number[]): number[] {
  return moves
    .map((m) => {
      const victim = Math.abs(b.sq[mTo(m)]);
      let s = victim
        ? 10000 + (victim === KING ? 5000 : VALUE[victim]) * 10 - VALUE[Math.abs(b.sq[mFrom(m)])]
        : 0;
      if (killers && (killers[0] === m || killers[1] === m)) s += 5000;
      return { m, s };
    })
    .sort((x, y) => y.s - x.s)
    .map((x) => x.m);
}

class Aborted extends Error {}

export interface SearchResult {
  move: number;
  score: number;
  depth: number;
  scores: Map<number, number>;
}

export function search(
  b: Board,
  opts: {
    maxDepth: number;
    nodes: number;
    noise: number;
    rng: Rng;
    avoid?: (m: number) => number | null;
  },
): SearchResult {
  const base = b.depth;
  let nodes = 0;
  const killers: number[][] = [];
  const tick = () => {
    if (++nodes > opts.nodes) throw new Aborted();
  };

  const quiesce = (alpha: number, beta: number, ply: number): number => {
    tick();
    const stand = evaluate(b);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 20) return stand;
    const mover = b.side;
    for (const m of order(b, b.pseudo([], true))) {
      b.make(m);
      if (b.attacked(b.kingOf(mover), b.side)) {
        b.unmake();
        continue;
      }
      const s = -quiesce(-beta, -alpha, ply + 1);
      b.unmake();
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  };

  const negamax = (depth: number, alpha: number, beta: number, ply: number): number => {
    tick();
    const check = b.inCheck();
    if (check && ply < 12) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply);
    const mover = b.side;
    let legal = 0;
    let best = -MATE;
    for (const m of order(b, b.pseudo([]), killers[ply])) {
      b.make(m);
      if (b.attacked(b.kingOf(mover), b.side)) {
        b.unmake();
        continue;
      }
      legal++;
      const s = -negamax(depth - 1, -beta, -alpha, ply + 1);
      b.unmake();
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (!b.sq[mTo(m)]) {
          const k = (killers[ply] ??= []);
          if (k[0] !== m) {
            k[1] = k[0];
            k[0] = m;
          }
        }
        break;
      }
    }
    // 象棋里无子可走（困毙）也算输
    if (!legal) return -MATE + ply;
    return best;
  };

  const root = b.legal();
  const scores = new Map<number, number>();
  let list = order(b, root);
  let reached = 0;
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const cur = new Map<number, number>();
    try {
      let alpha = -MATE - 1;
      for (const m of list) {
        const fixed = opts.avoid?.(m);
        let s: number;
        if (fixed !== null && fixed !== undefined) s = fixed;
        else {
          b.make(m);
          s = -negamax(depth - 1, -MATE - 1, -alpha + 60, 1);
          b.unmake();
        }
        cur.set(m, s);
        if (s > alpha) alpha = s;
      }
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
      while (b.depth > base) b.unmake();
      for (const [m, s] of cur)
        if (!scores.has(m) || s > (scores.get(m) ?? -Infinity)) scores.set(m, s);
      break;
    }
    scores.clear();
    for (const [m, s] of cur) scores.set(m, s);
    reached = depth;
    list = [...list].sort((x, y) => (cur.get(y) ?? -MATE) - (cur.get(x) ?? -MATE));
    if (Math.abs(cur.get(list[0]) ?? 0) > MATE - 100) break;
  }
  let bestMove = list[0];
  let bestScore = -Infinity;
  for (const m of root) {
    const s = (scores.get(m) ?? -MATE) + opts.rng.next() * opts.noise;
    if (s > bestScore) {
      bestScore = s;
      bestMove = m;
    }
  }
  return { move: bestMove, score: scores.get(bestMove) ?? 0, depth: reached, scores };
}
