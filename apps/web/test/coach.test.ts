import { describe, expect, it } from 'vitest';
import type { UciTransport } from '../src/lib/coach/uci';
import { UciEngine, fromUci, parseInfo, toUci } from '../src/lib/coach/uci';

describe('UCI 解析', () => {
  it('普通分数与多条变化', () => {
    expect(
      parseInfo(
        'info depth 14 seldepth 20 multipv 2 score cp -35 nodes 1000 nps 9 pv e7e5 g1f3 b8c6',
      ),
    ).toEqual({ multipv: 2, depth: 14, cp: -35, pv: ['e7e5', 'g1f3', 'b8c6'] });
  });
  it('杀棋分数', () => {
    expect(parseInfo('info depth 5 score mate -2 pv h3h10 i10h10')).toMatchObject({
      multipv: 1,
      mate: -2,
      pv: ['h3h10', 'i10h10'],
    });
  });
  it('上下界估计、没有变化的行忽略', () => {
    expect(parseInfo('info depth 10 score cp 20 lowerbound pv e2e4')).toBeNull();
    expect(parseInfo('info depth 10 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfo('info string NNUE evaluation enabled')).toBeNull();
    expect(parseInfo('bestmove e2e4')).toBeNull();
  });
});

describe('着法写法转换', () => {
  it('国际象棋', () => {
    expect(toUci('chess', { from: 12, to: 28 })).toBe('e2e4');
    expect(toUci('chess', { from: 52, to: 60, promo: 'q' })).toBe('e7e8q');
    expect(fromUci('chess', 'g1f3')).toEqual({ from: 6, to: 21 });
    expect(fromUci('chess', 'a7a8n')).toEqual({ from: 48, to: 56, promo: 'n' });
    expect(fromUci('chess', 'z9a1')).toBeNull();
  });
  it('中国象棋：行 1–10', () => {
    // 炮二平五：h3 → e3（红方右炮，索引 2*9+7=25 → 2*9+4=22）
    expect(toUci('xiangqi', { from: 25, to: 22 })).toBe('h3e3');
    expect(fromUci('xiangqi', 'h3e3')).toEqual({ from: 25, to: 22 });
    // 黑车 a10 → a9
    expect(fromUci('xiangqi', 'a10a9')).toEqual({ from: 81, to: 72 });
    expect(toUci('xiangqi', { from: 81, to: 72 })).toBe('a10a9');
  });
});

describe('UCI 引擎会话', () => {
  /** 假引擎：照着协议回话 */
  function fake() {
    const sent: string[] = [];
    let cb: (l: string) => void = () => {};
    const io: UciTransport = {
      send(cmd) {
        sent.push(cmd);
        queueMicrotask(() => {
          if (cmd === 'uci') cb('id name Fake\nuciok');
          else if (cmd === 'isready') cb('readyok');
          else if (cmd.startsWith('go')) {
            cb('info depth 1 multipv 1 score cp 10 pv e2e4');
            cb('info depth 2 multipv 1 score cp 30 pv d2d4 d7d5');
            cb('info depth 2 multipv 2 score cp 12 pv e2e4 e7e5');
            cb('bestmove d2d4');
          }
        });
      },
      onLine: (f) => (cb = f),
      terminate() {},
    };
    return { io, sent };
  }
  it('握手、设置、取最深的一条', async () => {
    const { io, sent } = fake();
    const engine = new UciEngine(io, ['setoption name Hash value 16']);
    await engine.ready;
    expect(sent).toEqual(['uci', 'setoption name Hash value 16', 'isready']);
    const lines = await engine.analyze('startpos-fen', {
      multipv: 2,
      movetime: 100,
      searchmoves: ['d2d4', 'e2e4'],
    });
    expect(lines.map((l) => [l.multipv, l.cp, l.pv[0]])).toEqual([
      [1, 30, 'd2d4'],
      [2, 12, 'e2e4'],
    ]);
    expect(sent.slice(3)).toEqual([
      'setoption name MultiPV value 2',
      'position fen startpos-fen',
      'go movetime 100 searchmoves d2d4 e2e4',
    ]);
  });
});
