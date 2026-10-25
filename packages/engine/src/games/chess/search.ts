import type { Rng } from '../../core/rng';
import type { Board } from './board';
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, mFlag, mFrom, mPromo, mTo, F_EP } from './board';

/**
 * 电脑的搜索：迭代加深的 alpha-beta + 静态搜索（只看吃子），子力价值 + 位置表评估。
 * 用节点数限制强度，结果只和局面与随机数有关，可以复现。
 */

const VALUE = [0, 100, 320, 330, 500, 900, 0];
export const MATE = 100000;

// 位置表（白方视角，第一行是第 8 横排）
const PST: Record<number, number[]> = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5,
    10, 25, 25, 10, 5, 5, 0, 0, 0, 22, 22, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20,
    -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [KNIGHT]: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10,
    0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10,
    5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0,
    -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  [ROOK]: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0,
    5, 5, 0, 0, 0,
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0,
    0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  [KING]: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
    -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
    -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
    10, 30, 20,
  ],
};
/** 残局里王要走到中间 */
const KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30,
  20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10,
  20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
];

/** 白方视角的分数 */
function evalWhite(b: Board): number {
  const sq = b.sq;
  let score = 0;
  let heavy = 0;
  for (let i = 0; i < 64; i++) {
    const t = Math.abs(sq[i]);
    if (t && t !== KING && t !== PAWN) heavy += VALUE[t];
  }
  const endgame = heavy <= 1300;
  let wBishops = 0;
  let bBishops = 0;
  for (let i = 0; i < 64; i++) {
    const p = sq[i];
    if (!p) continue;
    const t = Math.abs(p);
    const idx = p > 0 ? (7 - (i >> 3)) * 8 + (i & 7) : i;
    const pst = t === KING && endgame ? KING_END[idx] : PST[t][idx];
    const v = VALUE[t] + pst;
    score += p > 0 ? v : -v;
    if (p === BISHOP) wBishops++;
    if (p === -BISHOP) bBishops++;
  }
  if (wBishops >= 2) score += 30;
  if (bBishops >= 2) score -= 30;
  return score;
}

export const evaluate = (b: Board) => evalWhite(b) * b.side;

/** 走法排序：吃子（大吃小优先）、升变在前 */
function orderScore(b: Board, m: number, killers: number[] | undefined): number {
  const victim = mFlag(m) & F_EP ? PAWN : Math.abs(b.sq[mTo(m)]);
  let s = 0;
  if (victim) s += 10000 + VALUE[victim] * 10 - VALUE[Math.abs(b.sq[mFrom(m)])];
  if (mPromo(m)) s += 9000 + VALUE[mPromo(m)];
  if (killers && (killers[0] === m || killers[1] === m)) s += 5000;
  return s;
}

function sortMoves(b: Board, moves: number[], killers?: number[]): number[] {
  return moves
    .map((m) => ({ m, s: orderScore(b, m, killers) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.m);
}

class Aborted extends Error {}

export interface SearchResult {
  move: number;
  score: number;
  depth: number;
  /** 根节点上每个走法的分数（走子方视角），供大模型参考 */
  scores: Map<number, number>;
}

export function search(
  board: Board,
  opts: {
    maxDepth: number;
    nodes: number;
    noise: number;
    rng: Rng;
    avoid?: (m: number) => boolean;
  },
): SearchResult {
  const b = board;
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
    if (ply > 24) return stand;
    const mover = b.side;
    for (const m of sortMoves(b, b.pseudo([], true))) {
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
    if (check) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply);
    const mover = b.side;
    let legal = 0;
    let best = -MATE;
    for (const m of sortMoves(b, b.pseudo([]), killers[ply])) {
      b.make(m);
      if (b.attacked(b.kingOf(mover), b.side)) {
        b.unmake();
        continue;
      }
      legal++;
      const s = b.half >= 100 ? 0 : -negamax(depth - 1, -beta, -alpha, ply + 1);
      b.unmake();
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (!b.sq[mTo(m)] && !mPromo(m)) {
          const k = (killers[ply] ??= []);
          if (k[0] !== m) {
            k[1] = k[0];
            k[0] = m;
          }
        }
        break;
      }
    }
    if (!legal) return check ? -MATE + ply : 0;
    return best;
  };

  const root = b.legal();
  const scores = new Map<number, number>();
  let order = sortMoves(b, root);
  let bestMove = order[0];
  let bestScore = -Infinity;
  let reached = 0;
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const cur = new Map<number, number>();
    try {
      let alpha = -MATE - 1;
      for (const m of order) {
        let s: number;
        if (opts.avoid?.(m)) s = 0;
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
      // 被打断时还有没撤销的步：恢复到根局面
      while (b.depth > base) b.unmake();
      // 这一层没走完：用上一层的结果，但这一层已经算出更好的走法时也采用
      for (const [m, s] of cur)
        if (!scores.has(m) || s > (scores.get(m) ?? -Infinity)) scores.set(m, s);
      break;
    }
    scores.clear();
    for (const [m, s] of cur) scores.set(m, s);
    reached = depth;
    order = [...order].sort((x, y) => (cur.get(y) ?? -MATE) - (cur.get(x) ?? -MATE));
    if (Math.abs(cur.get(order[0]) ?? 0) > MATE - 100) break;
  }
  // 加一点随机：分数接近的走法里随机挑一个
  for (const m of root) {
    const s = (scores.get(m) ?? -MATE) + opts.rng.next() * opts.noise;
    if (s > bestScore) {
      bestScore = s;
      bestMove = m;
    }
  }
  return { move: bestMove, score: scores.get(bestMove) ?? 0, depth: reached, scores };
}
