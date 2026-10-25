/**
 * 通用 UCI 引擎封装：Stockfish、Fairy-Stockfish 都说这种协议（一行一条文字命令）。
 * 这里只管收发与解析，引擎文件怎么加载由 engines.ts 决定。
 */

import type { CoachMove } from '@park/engine';

export type CoachGame = 'chess' | 'xiangqi';

/* ---------------- 着法写法转换 ----------------
 * 国际象棋 e2e4、e7e8q；中国象棋 Fairy-Stockfish 的写法 h3e3、a10a9（列 a–i，行 1–10，红方在 1）。
 */
const FILES = 'abcdefghi';
export function toUci(game: CoachGame, m: CoachMove): string {
  if (game === 'chess') {
    const n = (s: number) => `${FILES[s & 7]}${(s >> 3) + 1}`;
    return `${n(m.from)}${n(m.to)}${m.promo ?? ''}`;
  }
  const n = (s: number) => `${FILES[s % 9]}${Math.floor(s / 9) + 1}`;
  return `${n(m.from)}${n(m.to)}`;
}
export function fromUci(game: CoachGame, s: string): CoachMove | null {
  if (game === 'chess') {
    const m = /^([a-h])([1-8])([a-h])([1-8])([qrbn])?$/.exec(s);
    if (!m) return null;
    const sq = (f: string, r: string) => FILES.indexOf(f) + (Number(r) - 1) * 8;
    return { from: sq(m[1], m[2]), to: sq(m[3], m[4]), ...(m[5] ? { promo: m[5] } : {}) };
  }
  const m = /^([a-i])(\d{1,2})([a-i])(\d{1,2})$/.exec(s);
  if (!m) return null;
  const sq = (f: string, r: string) => FILES.indexOf(f) + (Number(r) - 1) * 9;
  return { from: sq(m[1], m[2]), to: sq(m[3], m[4]) };
}

export interface UciTransport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate(): void;
}

export interface UciLine {
  multipv: number;
  depth: number;
  /** 分数（走子方视角） */
  cp?: number;
  mate?: number;
  /** 主要变化，引擎自己的着法写法（e2e4、h3h10 …） */
  pv: string[];
}

/** 解析一行 info；没有主要变化或只是上下界估计的行返回 null */
export function parseInfo(line: string): UciLine | null {
  if (!line.startsWith('info ')) return null;
  const t = line.split(/\s+/);
  const at = (k: string) => t.indexOf(k);
  const pvAt = at('pv');
  if (pvAt < 0 || pvAt === t.length - 1) return null;
  if (at('lowerbound') >= 0 || at('upperbound') >= 0) return null;
  const scoreAt = at('score');
  if (scoreAt < 0) return null;
  const kind = t[scoreAt + 1];
  const value = Number(t[scoreAt + 2]);
  if (!Number.isFinite(value)) return null;
  const mpAt = at('multipv');
  const dAt = at('depth');
  return {
    multipv: mpAt >= 0 ? Number(t[mpAt + 1]) : 1,
    depth: dAt >= 0 ? Number(t[dAt + 1]) : 0,
    ...(kind === 'mate' ? { mate: value } : { cp: value }),
    pv: t.slice(pvAt + 1),
  };
}

export interface GoOptions {
  multipv?: number;
  movetime: number;
  searchmoves?: string[];
}

export class UciEngine {
  private waiters: { test: (l: string) => boolean; resolve: (l: string) => void }[] = [];
  private busy: Promise<unknown> = Promise.resolve();
  private listener: ((l: string) => void) | null = null;
  readonly ready: Promise<void>;

  constructor(
    private io: UciTransport,
    setup: string[] = [],
  ) {
    io.onLine((raw) => {
      for (const line of String(raw).split('\n')) {
        this.listener?.(line);
        const i = this.waiters.findIndex((w) => w.test(line));
        if (i >= 0) this.waiters.splice(i, 1)[0].resolve(line);
      }
    });
    this.ready = (async () => {
      io.send('uci');
      await this.wait((l) => l.startsWith('uciok'));
      for (const cmd of setup) io.send(cmd);
      io.send('isready');
      await this.wait((l) => l.startsWith('readyok'));
    })();
  }

  private wait(test: (l: string) => boolean): Promise<string> {
    return new Promise((resolve) => this.waiters.push({ test, resolve }));
  }

  /** 分析一个局面：返回每条主要变化（按 multipv 排序） */
  analyze(fen: string, opts: GoOptions): Promise<UciLine[]> {
    const run = async () => {
      await this.ready;
      const lines = new Map<number, UciLine>();
      this.listener = (l) => {
        const info = parseInfo(l);
        if (!info) return;
        const prev = lines.get(info.multipv);
        if (!prev || info.depth >= prev.depth) lines.set(info.multipv, info);
      };
      this.io.send(`setoption name MultiPV value ${opts.multipv ?? 1}`);
      this.io.send(`position fen ${fen}`);
      const sm = opts.searchmoves?.length ? ` searchmoves ${opts.searchmoves.join(' ')}` : '';
      this.io.send(`go movetime ${opts.movetime}${sm}`);
      await this.wait((l) => l.startsWith('bestmove'));
      this.listener = null;
      return [...lines.values()].sort((a, b) => a.multipv - b.multipv);
    };
    // 一次只跑一个分析
    const p = this.busy.then(run, run);
    this.busy = p.catch(() => undefined);
    return p;
  }

  terminate(): void {
    this.io.terminate();
  }
}
