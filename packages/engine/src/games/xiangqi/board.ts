/**
 * 中国象棋的走法生成（紧凑表示，供规则判定与电脑搜索共用）。
 *
 * - 交叉点编号 0–89：index = rank * 9 + file，rank 0 是红方底线，file 0 是红方视角最左边一路。
 * - 棋子编码：帅将 1、仕士 2、相象 3、马 4、车 5、炮 6、兵卒 7；红方为正、黑方为负。
 * - 走法打包成整数：from | to << 7。
 */

export const KING = 1;
export const ADVISOR = 2;
export const ELEPHANT = 3;
export const HORSE = 4;
export const ROOK = 5;
export const CANNON = 6;
export const PAWN = 7;

export const mFrom = (m: number) => m & 127;
export const mTo = (m: number) => (m >> 7) & 127;
export const pack = (from: number, to: number) => from | (to << 7);

export const fileOf = (sq: number) => sq % 9;
export const rankOf = (sq: number) => Math.floor(sq / 9);
const at = (r: number, f: number) => (r >= 0 && r < 10 && f >= 0 && f < 9 ? r * 9 + f : -1);

const inPalace = (sq: number, side: 1 | -1) => {
  const f = fileOf(sq);
  const r = rankOf(sq);
  return f >= 3 && f <= 5 && (side === 1 ? r <= 2 : r >= 7);
};
/** 还在自己这一侧（没过河） */
const ownHalf = (sq: number, side: 1 | -1) => (side === 1 ? rankOf(sq) <= 4 : rankOf(sq) >= 5);

const ORTH: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const RAYS: number[][][] = ORTH.map(([dr, df]) =>
  Array.from({ length: 90 }, (_, sq) => {
    const out: number[] = [];
    let r = rankOf(sq) + dr;
    let f = fileOf(sq) + df;
    while (at(r, f) >= 0) {
      out.push(at(r, f));
      r += dr;
      f += df;
    }
    return out;
  }),
);
/** 马：目标与「马腿」 */
const HORSE_T: { to: number; leg: number }[][] = Array.from({ length: 90 }, (_, sq) => {
  const r = rankOf(sq);
  const f = fileOf(sq);
  const out: { to: number; leg: number }[] = [];
  for (const [dr, df] of [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [-1, 2],
    [1, -2],
    [-1, -2],
  ]) {
    const to = at(r + dr, f + df);
    if (to < 0) continue;
    const leg = Math.abs(dr) === 2 ? at(r + Math.sign(dr), f) : at(r, f + Math.sign(df));
    out.push({ to, leg });
  }
  return out;
});
/** 反过来：从哪些位置的马能踩到这里（马的位置与它的马腿） */
const HORSE_FROM: { from: number; leg: number }[][] = Array.from({ length: 90 }, () => []);
HORSE_T.forEach((list, from) => list.forEach(({ to, leg }) => HORSE_FROM[to].push({ from, leg })));
/** 象：目标与「象眼」 */
const ELEPHANT_T: { to: number; eye: number }[][] = Array.from({ length: 90 }, (_, sq) => {
  const r = rankOf(sq);
  const f = fileOf(sq);
  const out: { to: number; eye: number }[] = [];
  for (const [dr, df] of [
    [2, 2],
    [2, -2],
    [-2, 2],
    [-2, -2],
  ]) {
    const to = at(r + dr, f + df);
    if (to >= 0) out.push({ to, eye: at(r + dr / 2, f + df / 2) });
  }
  return out;
});
const DIAG1: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

interface Undo {
  m: number;
  captured: number;
}

export class Board {
  sq: Int8Array;
  /** 1 = 红方走，-1 = 黑方走 */
  side: 1 | -1;
  kingR = -1;
  kingB = -1;
  private stack: Undo[] = [];

  constructor(sq: ArrayLike<number>, side: 1 | -1) {
    this.sq = Int8Array.from(sq);
    this.side = side;
    for (let i = 0; i < 90; i++) {
      if (this.sq[i] === KING) this.kingR = i;
      if (this.sq[i] === -KING) this.kingB = i;
    }
  }

  static start(): Board {
    const sq = new Array<number>(90).fill(0);
    const back = [ROOK, HORSE, ELEPHANT, ADVISOR, KING, ADVISOR, ELEPHANT, HORSE, ROOK];
    for (let f = 0; f < 9; f++) {
      sq[f] = back[f];
      sq[81 + f] = -back[f];
    }
    for (const f of [1, 7]) {
      sq[2 * 9 + f] = CANNON;
      sq[7 * 9 + f] = -CANNON;
    }
    for (const f of [0, 2, 4, 6, 8]) {
      sq[3 * 9 + f] = PAWN;
      sq[6 * 9 + f] = -PAWN;
    }
    return new Board(sq, 1);
  }

  get depth(): number {
    return this.stack.length;
  }

  kingOf(side: 1 | -1): number {
    return side === 1 ? this.kingR : this.kingB;
  }

  /** by 一方是否攻击到 sq（含将帅照面） */
  attacked(sq: number, by: 1 | -1): boolean {
    const b = this.sq;
    for (let d = 0; d < 4; d++) {
      const ray = RAYS[d][sq];
      let i = 0;
      // 第一个子：车、照面的将
      for (; i < ray.length; i++) {
        const p = b[ray[i]];
        if (!p) continue;
        if (p === ROOK * by) return true;
        if (p === KING * by && d < 2) return true;
        break;
      }
      // 隔一个子：炮
      for (i++; i < ray.length; i++) {
        const p = b[ray[i]];
        if (!p) continue;
        if (p === CANNON * by) return true;
        break;
      }
    }
    for (const { from, leg } of HORSE_FROM[sq])
      if (b[from] === HORSE * by && b[leg] === 0) return true;
    // 兵：从后面（对兵来说是前方）或过河后从两侧
    const r = rankOf(sq);
    const f = fileOf(sq);
    const back = at(r - by, f);
    if (back >= 0 && b[back] === PAWN * by) return true;
    for (const df of [-1, 1]) {
      const s = at(r, f + df);
      if (s >= 0 && b[s] === PAWN * by && !ownHalf(s, by)) return true;
    }
    return false;
  }

  inCheck(side: 1 | -1 = this.side): boolean {
    return this.attacked(this.kingOf(side), side === 1 ? -1 : 1);
  }

  pseudo(out: number[], captures = false): number[] {
    const b = this.sq;
    const s = this.side;
    const push = (from: number, to: number) => {
      const q = b[to] * s;
      if (q > 0) return;
      if (captures && q === 0) return;
      out.push(pack(from, to));
    };
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq] * s;
      if (p <= 0) continue;
      const r = rankOf(sq);
      const f = fileOf(sq);
      switch (p) {
        case KING:
          for (const [dr, df] of ORTH) {
            const t = at(r + dr, f + df);
            if (t >= 0 && inPalace(t, s)) push(sq, t);
          }
          break;
        case ADVISOR:
          for (const [dr, df] of DIAG1) {
            const t = at(r + dr, f + df);
            if (t >= 0 && inPalace(t, s)) push(sq, t);
          }
          break;
        case ELEPHANT:
          for (const { to, eye } of ELEPHANT_T[sq])
            if (b[eye] === 0 && ownHalf(to, s)) push(sq, to);
          break;
        case HORSE:
          for (const { to, leg } of HORSE_T[sq]) if (b[leg] === 0) push(sq, to);
          break;
        case ROOK:
          for (let d = 0; d < 4; d++) {
            for (const t of RAYS[d][sq]) {
              if (b[t] === 0) {
                if (!captures) out.push(pack(sq, t));
                continue;
              }
              if (b[t] * s < 0) out.push(pack(sq, t));
              break;
            }
          }
          break;
        case CANNON:
          for (let d = 0; d < 4; d++) {
            let screen = false;
            for (const t of RAYS[d][sq]) {
              if (!screen) {
                if (b[t] === 0) {
                  if (!captures) out.push(pack(sq, t));
                } else screen = true;
                continue;
              }
              if (b[t] === 0) continue;
              if (b[t] * s < 0) out.push(pack(sq, t));
              break;
            }
          }
          break;
        case PAWN: {
          const fwd = at(r + s, f);
          if (fwd >= 0) push(sq, fwd);
          if (!ownHalf(sq, s)) {
            for (const df of [-1, 1]) {
              const t = at(r, f + df);
              if (t >= 0) push(sq, t);
            }
          }
          break;
        }
      }
    }
    return out;
  }

  make(m: number): void {
    const from = mFrom(m);
    const to = mTo(m);
    const p = this.sq[from];
    this.stack.push({ m, captured: this.sq[to] });
    this.sq[to] = p;
    this.sq[from] = 0;
    if (p === KING) this.kingR = to;
    else if (p === -KING) this.kingB = to;
    this.side = this.side === 1 ? -1 : 1;
  }

  unmake(): void {
    const u = this.stack.pop()!;
    const from = mFrom(u.m);
    const to = mTo(u.m);
    const p = this.sq[to];
    this.sq[from] = p;
    this.sq[to] = u.captured;
    if (p === KING) this.kingR = from;
    else if (p === -KING) this.kingB = from;
    this.side = this.side === 1 ? -1 : 1;
  }

  legal(captures = false): number[] {
    const out: number[] = [];
    const mover = this.side;
    for (const m of this.pseudo([], captures)) {
      this.make(m);
      if (!this.attacked(this.kingOf(mover), this.side)) out.push(m);
      this.unmake();
    }
    return out;
  }

  key(): string {
    return `${this.sq.join(',')}${this.side}`;
  }

  /** 双方都没有能过河进攻的子（车马炮兵） */
  noAttackers(): boolean {
    for (let i = 0; i < 90; i++) {
      const t = Math.abs(this.sq[i]);
      if (t === ROOK || t === HORSE || t === CANNON || t === PAWN) return false;
    }
    return true;
  }
}

/* ---------------- 中文记谱：炮二平五、马8进7、前车进一 ---------------- */
const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export const PIECE_CHAR: Record<number, [string, string]> = {
  [KING]: ['帅', '将'],
  [ADVISOR]: ['仕', '士'],
  [ELEPHANT]: ['相', '象'],
  [HORSE]: ['马', '马'],
  [ROOK]: ['车', '车'],
  [CANNON]: ['炮', '炮'],
  [PAWN]: ['兵', '卒'],
};

/** 纵线编号：红方从右往左一到九，黑方从（黑方的）右往左 1 到 9 */
const fileNo = (f: number, side: 1 | -1) => (side === 1 ? 9 - f : f + 1);
const num = (n: number, side: 1 | -1) => (side === 1 ? CN[n] : String(n));

export function notation(b: Board, m: number): string {
  const from = mFrom(m);
  const to = mTo(m);
  const p = b.sq[from];
  const side: 1 | -1 = p > 0 ? 1 : -1;
  const t = Math.abs(p);
  const ch = PIECE_CHAR[t][side === 1 ? 0 : 1];
  const fr = rankOf(from);
  const tr = rankOf(to);
  const ff = fileOf(from);
  const tf = fileOf(to);
  // 同一条纵线上的同种棋子：用前 / 中 / 后区分
  const same: number[] = [];
  for (let r = 0; r < 10; r++) if (b.sq[r * 9 + ff] === p) same.push(r);
  let head: string;
  if (same.length > 1 && t !== KING && t !== ADVISOR && t !== ELEPHANT) {
    // 「前」是对这一方来说更靠前（红方 rank 大、黑方 rank 小）
    const order = [...same].sort((a, c) => (side === 1 ? c - a : a - c));
    const idx = order.indexOf(fr);
    const names =
      order.length === 2
        ? ['前', '后']
        : order.length === 3
          ? ['前', '中', '后']
          : ['一', '二', '三', '四', '五'];
    head = `${names[idx]}${ch}`;
  } else head = `${ch}${num(fileNo(ff, side), side)}`;
  const forward = (tr - fr) * side;
  if (forward === 0) return `${head}平${num(fileNo(tf, side), side)}`;
  const dir = forward > 0 ? '进' : '退';
  const straight = t === ROOK || t === CANNON || t === PAWN || t === KING;
  return `${head}${dir}${straight ? num(Math.abs(tr - fr), side) : num(fileNo(tf, side), side)}`;
}

export function perft(b: Board, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of b.legal()) {
    b.make(m);
    n += perft(b, depth - 1);
    b.unmake();
  }
  return n;
}

export { at };
