/**
 * 国际象棋的走法生成（紧凑表示，供规则判定与电脑搜索共用）。
 *
 * - 格子编号 0–63：index = rank * 8 + file，rank 0 是白方底线（第 1 横排），file 0 是 a 线。
 * - 棋子编码：兵 1、马 2、象 3、车 4、后 5、王 6；白方为正、黑方为负，空格为 0。
 * - 走法打包成整数：from | to << 6 | 升变棋子 << 12 | 标记 << 15。
 */

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const F_EP = 1;
export const F_CASTLE = 2;
export const F_DOUBLE = 4;

export const mFrom = (m: number) => m & 63;
export const mTo = (m: number) => (m >> 6) & 63;
export const mPromo = (m: number) => (m >> 12) & 7;
export const mFlag = (m: number) => (m >> 15) & 7;
const pack = (from: number, to: number, promo = 0, flag = 0) =>
  from | (to << 6) | (promo << 12) | (flag << 15);

const fileOf = (sq: number) => sq & 7;
const rankOf = (sq: number) => sq >> 3;

/* ---------------- 预先算好的目标格 ---------------- */
function targets(deltas: readonly (readonly [number, number])[]): number[][] {
  return Array.from({ length: 64 }, (_, sq) => {
    const out: number[] = [];
    for (const [df, dr] of deltas) {
      const f = fileOf(sq) + df;
      const r = rankOf(sq) + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(r * 8 + f);
    }
    return out;
  });
}
const KNIGHT_T = targets([
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
]);
const KING_T = targets([
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]);
/** 8 个方向的射线：0–3 直线，4–7 斜线 */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const RAYS: number[][][] = DIRS.map(([df, dr]) =>
  Array.from({ length: 64 }, (_, sq) => {
    const out: number[] = [];
    let f = fileOf(sq) + df;
    let r = rankOf(sq) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      out.push(r * 8 + f);
      f += df;
      r += dr;
    }
    return out;
  }),
);

interface Undo {
  m: number;
  captured: number;
  castle: number;
  ep: number;
  half: number;
}

export class Board {
  sq: Int8Array;
  /** 1 = 白方走，-1 = 黑方走 */
  side: 1 | -1;
  /** 1 白短、2 白长、4 黑短、8 黑长 */
  castle: number;
  /** 吃过路兵的目标格，没有为 -1 */
  ep: number;
  half: number;
  kingW = -1;
  kingB = -1;
  private stack: Undo[] = [];

  constructor(sq: ArrayLike<number>, side: 1 | -1, castle: number, ep: number, half: number) {
    this.sq = Int8Array.from(sq);
    this.side = side;
    this.castle = castle;
    this.ep = ep;
    this.half = half;
    for (let i = 0; i < 64; i++) {
      if (this.sq[i] === KING) this.kingW = i;
      if (this.sq[i] === -KING) this.kingB = i;
    }
  }

  static start(): Board {
    const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
    const sq = new Array<number>(64).fill(0);
    for (let f = 0; f < 8; f++) {
      sq[f] = back[f];
      sq[8 + f] = PAWN;
      sq[48 + f] = -PAWN;
      sq[56 + f] = -back[f];
    }
    return new Board(sq, 1, 15, -1, 0);
  }

  /** 某一方是否攻击到这个格子 */
  attacked(sq: number, by: 1 | -1): boolean {
    const b = this.sq;
    const f = fileOf(sq);
    const r = rankOf(sq);
    // 兵
    if (by === 1) {
      if (r > 0) {
        if (f > 0 && b[sq - 9] === PAWN) return true;
        if (f < 7 && b[sq - 7] === PAWN) return true;
      }
    } else if (r < 7) {
      if (f > 0 && b[sq + 7] === -PAWN) return true;
      if (f < 7 && b[sq + 9] === -PAWN) return true;
    }
    for (const t of KNIGHT_T[sq]) if (b[t] === KNIGHT * by) return true;
    for (const t of KING_T[sq]) if (b[t] === KING * by) return true;
    for (let d = 0; d < 8; d++) {
      const straight = d < 4;
      for (const t of RAYS[d][sq]) {
        const p = b[t];
        if (p === 0) continue;
        if (p === QUEEN * by || p === (straight ? ROOK : BISHOP) * by) return true;
        break;
      }
    }
    return false;
  }

  /** 已经走了、还没撤销的步数 */
  get depth(): number {
    return this.stack.length;
  }

  kingOf(side: 1 | -1): number {
    return side === 1 ? this.kingW : this.kingB;
  }

  inCheck(side: 1 | -1 = this.side): boolean {
    return this.attacked(this.kingOf(side), side === 1 ? -1 : 1);
  }

  /** 伪合法走法（不检查走完后自己的王是否被将）；captures 只生成吃子与升变 */
  pseudo(out: number[], captures = false): number[] {
    const b = this.sq;
    const s = this.side;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq] * s;
      if (p <= 0) continue;
      switch (p) {
        case PAWN: {
          const dir = 8 * s;
          const r = rankOf(sq);
          const lastRank = s === 1 ? 6 : 1;
          const startRank = s === 1 ? 1 : 6;
          const one = sq + dir;
          if (b[one] === 0) {
            if (r === lastRank) {
              for (const pr of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(pack(sq, one, pr));
            } else if (!captures) {
              out.push(pack(sq, one));
              if (r === startRank && b[one + dir] === 0) out.push(pack(sq, one + dir, 0, F_DOUBLE));
            }
          }
          for (const df of [-1, 1]) {
            const f = fileOf(sq) + df;
            if (f < 0 || f > 7) continue;
            const t = one + df;
            if (b[t] * s < 0) {
              if (r === lastRank)
                for (const pr of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(pack(sq, t, pr));
              else out.push(pack(sq, t));
            } else if (t === this.ep) out.push(pack(sq, t, 0, F_EP));
          }
          break;
        }
        case KNIGHT:
        case KING:
          for (const t of (p === KNIGHT ? KNIGHT_T : KING_T)[sq]) {
            const q = b[t] * s;
            if (q > 0 || (captures && q === 0)) continue;
            out.push(pack(sq, t));
          }
          if (p === KING && !captures) this.castles(sq, out);
          break;
        default: {
          const from = p === ROOK ? 0 : 4;
          const to = p === BISHOP ? 8 : p === ROOK ? 4 : 8;
          for (let d = p === QUEEN ? 0 : from; d < to; d++) {
            for (const t of RAYS[d][sq]) {
              const q = b[t] * s;
              if (q > 0) break;
              if (q < 0) {
                out.push(pack(sq, t));
                break;
              }
              if (!captures) out.push(pack(sq, t));
            }
          }
        }
      }
    }
    return out;
  }

  private castles(sq: number, out: number[]): void {
    const b = this.sq;
    const s = this.side;
    const home = s === 1 ? 4 : 60;
    if (sq !== home) return;
    const enemy = s === 1 ? -1 : 1;
    const [kBit, qBit] = s === 1 ? [1, 2] : [4, 8];
    if (this.castle & kBit && b[home + 1] === 0 && b[home + 2] === 0 && b[home + 3] === ROOK * s) {
      if (
        !this.attacked(home, enemy) &&
        !this.attacked(home + 1, enemy) &&
        !this.attacked(home + 2, enemy)
      )
        out.push(pack(home, home + 2, 0, F_CASTLE));
    }
    if (
      this.castle & qBit &&
      b[home - 1] === 0 &&
      b[home - 2] === 0 &&
      b[home - 3] === 0 &&
      b[home - 4] === ROOK * s
    ) {
      if (
        !this.attacked(home, enemy) &&
        !this.attacked(home - 1, enemy) &&
        !this.attacked(home - 2, enemy)
      )
        out.push(pack(home, home - 2, 0, F_CASTLE));
    }
  }

  make(m: number): void {
    const b = this.sq;
    const s = this.side;
    const from = mFrom(m);
    const to = mTo(m);
    const flag = mFlag(m);
    const promo = mPromo(m);
    const p = b[from];
    let captured = b[to];
    this.stack.push({ m, captured: 0, castle: this.castle, ep: this.ep, half: this.half });
    if (flag & F_EP) {
      const cap = to - 8 * s;
      captured = b[cap];
      b[cap] = 0;
    }
    this.stack[this.stack.length - 1].captured = captured;
    b[to] = promo ? promo * s : p;
    b[from] = 0;
    if (flag & F_CASTLE) {
      if (to > from) {
        b[from + 1] = b[from + 3];
        b[from + 3] = 0;
      } else {
        b[from - 1] = b[from - 4];
        b[from - 4] = 0;
      }
    }
    if (p === KING) this.kingW = to;
    else if (p === -KING) this.kingB = to;
    if (p === KING) this.castle &= ~3;
    if (p === -KING) this.castle &= ~12;
    for (const x of [from, to]) {
      if (x === 0) this.castle &= ~2;
      else if (x === 7) this.castle &= ~1;
      else if (x === 56) this.castle &= ~8;
      else if (x === 63) this.castle &= ~4;
    }
    this.ep = flag & F_DOUBLE ? (from + to) >> 1 : -1;
    this.half = Math.abs(p) === PAWN || captured ? 0 : this.half + 1;
    this.side = s === 1 ? -1 : 1;
  }

  unmake(): void {
    const u = this.stack.pop()!;
    const b = this.sq;
    this.side = this.side === 1 ? -1 : 1;
    const s = this.side;
    const from = mFrom(u.m);
    const to = mTo(u.m);
    const flag = mFlag(u.m);
    const moved = mPromo(u.m) ? PAWN * s : b[to];
    b[from] = moved;
    if (flag & F_EP) {
      b[to] = 0;
      b[to - 8 * s] = u.captured;
    } else b[to] = u.captured;
    if (flag & F_CASTLE) {
      if (to > from) {
        b[from + 3] = b[from + 1];
        b[from + 1] = 0;
      } else {
        b[from - 4] = b[from - 1];
        b[from - 1] = 0;
      }
    }
    if (moved === KING) this.kingW = from;
    else if (moved === -KING) this.kingB = from;
    this.castle = u.castle;
    this.ep = u.ep;
    this.half = u.half;
  }

  /** 合法走法 */
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

  /** 局面键（判断重复局面）：吃过路兵只有真的能吃时才计入 */
  key(): string {
    let ep = '-';
    if (this.ep >= 0 && this.legal(true).some((m) => mFlag(m) & F_EP)) ep = String(this.ep);
    return `${this.sq.join('')}${this.side}${this.castle}${ep}`;
  }

  /** 双方都没有足够子力将死对方 */
  insufficient(): boolean {
    const minors: { t: number; color: number }[] = [];
    for (let i = 0; i < 64; i++) {
      const t = Math.abs(this.sq[i]);
      if (t === 0 || t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      minors.push({ t, color: (fileOf(i) + rankOf(i)) & 1 });
    }
    if (minors.length <= 1) return true;
    // 只剩同色格的象
    return minors.every((x) => x.t === BISHOP && x.color === minors[0].color);
  }
}

const FILES = 'abcdefgh';
export const sqName = (sq: number) => `${FILES[fileOf(sq)]}${rankOf(sq) + 1}`;
const LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];
export const PROMO_LETTER: Record<number, string> = { 2: 'N', 3: 'B', 4: 'R', 5: 'Q' };

/** 标准代数记谱（SAN），例如 Nf3、exd5、O-O、e8=Q#。调用时 b 是走之前的局面 */
export function san(b: Board, m: number, legal: number[] = b.legal()): string {
  const from = mFrom(m);
  const to = mTo(m);
  const t = Math.abs(b.sq[from]);
  let out: string;
  if (mFlag(m) & F_CASTLE) out = to > from ? 'O-O' : 'O-O-O';
  else {
    const capture = b.sq[to] !== 0 || (mFlag(m) & F_EP) !== 0;
    if (t === PAWN) {
      out = capture ? `${FILES[fileOf(from)]}x${sqName(to)}` : sqName(to);
      if (mPromo(m)) out += `=${PROMO_LETTER[mPromo(m)]}`;
    } else {
      const twins = legal.filter(
        (x) => x !== m && mTo(x) === to && Math.abs(b.sq[mFrom(x)]) === t && mFrom(x) !== from,
      );
      let dis = '';
      if (twins.length) {
        const sameFile = twins.some((x) => fileOf(mFrom(x)) === fileOf(from));
        const sameRank = twins.some((x) => rankOf(mFrom(x)) === rankOf(from));
        if (!sameFile) dis = FILES[fileOf(from)];
        else if (!sameRank) dis = String(rankOf(from) + 1);
        else dis = sqName(from);
      }
      out = `${LETTER[t]}${dis}${capture ? 'x' : ''}${sqName(to)}`;
    }
  }
  b.make(m);
  if (b.inCheck()) out += b.legal().length ? '+' : '#';
  b.unmake();
  return out;
}

const FEN_CODE: Record<string, number> = {
  p: PAWN,
  n: KNIGHT,
  b: BISHOP,
  r: ROOK,
  q: QUEEN,
  k: KING,
};
const FEN_CHAR = ['', 'p', 'n', 'b', 'r', 'q', 'k'];

export function fromFen(fen: string): Board {
  const [placement, side, castle, ep, half] = fen.trim().split(/\s+/);
  const sq = new Array<number>(64).fill(0);
  placement.split('/').forEach((row, i) => {
    const r = 7 - i;
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const t = FEN_CODE[ch.toLowerCase()];
        sq[r * 8 + f] = ch === ch.toUpperCase() ? t : -t;
        f++;
      }
    }
  });
  let c = 0;
  if (castle?.includes('K')) c |= 1;
  if (castle?.includes('Q')) c |= 2;
  if (castle?.includes('k')) c |= 4;
  if (castle?.includes('q')) c |= 8;
  const epSq = ep && ep !== '-' ? (Number(ep[1]) - 1) * 8 + FILES.indexOf(ep[0]) : -1;
  return new Board(sq, side === 'b' ? -1 : 1, c, epSq, Number(half) || 0);
}

export function toFen(b: Board, fullmove = 1): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = b.sq[r * 8 + f];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      const ch = FEN_CHAR[Math.abs(p)];
      row += p > 0 ? ch.toUpperCase() : ch;
    }
    rows.push(row + (empty || ''));
  }
  const c =
    (b.castle & 1 ? 'K' : '') +
      (b.castle & 2 ? 'Q' : '') +
      (b.castle & 4 ? 'k' : '') +
      (b.castle & 8 ? 'q' : '') || '-';
  return `${rows.join('/')} ${b.side === 1 ? 'w' : 'b'} ${c} ${b.ep >= 0 ? sqName(b.ep) : '-'} ${b.half} ${fullmove}`;
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

export { fileOf, rankOf, pack };
