import { describe, expect, it } from 'vitest';
import { ch, gradeOf, scoreCp, xq } from '../src';

const sq = (name: string) => 'abcdefgh'.indexOf(name[0]) + (Number(name[1]) - 1) * 8;

describe('导师：评级', () => {
  it('分差越大评级越差；杀棋比子力优势更重要', () => {
    expect(gradeOf({ cp: 50 }, { cp: 45 }, false).grade).toBe('best');
    expect(gradeOf({ cp: 50 }, { cp: 20 }, false).grade).toBe('good');
    expect(gradeOf({ cp: 50 }, { cp: -60 }, false).grade).toBe('inaccuracy');
    expect(gradeOf({ cp: 50 }, { cp: -400 }, false).grade).toBe('blunder');
    expect(gradeOf({ mate: 2 }, { cp: 150 }, false).grade).toBe('blunder');
    expect(gradeOf({ cp: 0 }, { mate: -1 }, false).grade).toBe('blunder');
    expect(scoreCp({ mate: 1 })).toBeGreaterThan(scoreCp({ mate: 3 }));
    expect(scoreCp({ mate: -1 })).toBeLessThan(scoreCp({ mate: -3 }));
  });
});

describe('导师：国际象棋', () => {
  it('送马：指出对方会用兵吃掉、净丢子力，并给出更好的走法', () => {
    // 1.e4 e5 2.Nf3 d6，白方想走 3.Nxe5??
    const b = ch.fromFen('rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3');
    const user = { from: sq('f3'), to: sq('e5') };
    const a = ch.analyzeChessLocal(b, user, 60000);
    const r = ch.explainChess(b, a, 3);
    expect(['mistake', 'blunder']).toContain(r.grade);
    expect(r.points.join()).toContain('e5 的马');
    expect(r.points.join()).toContain('更好的是');
    expect(r.arrows.map((x) => x.kind)).toEqual(['try', 'reply', 'best']);
    expect(r.facts).toContain('Nxe5');
    expect(r.outlook.user).toMatch(/落后|劣势/);
    expect(r.title).toMatch(/^(失误|大错)：Nxe5（马 f3→e5）$/);
  });

  it('提示：发现一步杀', () => {
    const b = ch.fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const r = ch.explainChess(b, ch.analyzeChessLocal(b, null, 40000), 4);
    expect(r.title).toContain('Qxf7#');
    expect(r.points.join()).toContain('杀棋');
  });

  it('最佳着法给出肯定', () => {
    const b = ch.fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const r = ch.explainChess(
      b,
      ch.analyzeChessLocal(b, { from: sq('h5'), to: sq('f7') }, 40000),
      4,
    );
    expect(r.grade).toBe('best');
    expect(r.points.join()).toContain('将死');
  });

  it('被威胁的棋子', () => {
    // 黑象 b4 攻击白马 c3，没有保护
    const b = ch.fromFen('rnbqk1nr/pppp1ppp/8/4p3/1b6/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 3');
    expect(ch.threatened(b, 1).length).toBe(0); // c3 马有 b2、d2 兵保护
    const lone = ch.fromFen('4k3/8/8/8/1b6/2N5/8/4K3 w - - 0 1');
    expect(ch.threatened(lone, 1).map((x) => x.sq)).toEqual([sq('c3')]);
    expect(ch.threatNotes(lone)).toEqual(['你在 c3 的马正受到威胁']);
  });
});

describe('导师：中国象棋', () => {
  it('把马跳到车口：指出会被车吃掉', () => {
    const pieces: [number, number][] = [
      [0 * 9 + 4, 1], // 帅
      [2 * 9 + 2, 4], // 红马
      [9 * 9 + 3, -1], // 将
      [5 * 9 + 1, -5], // 黑车
    ];
    const sq90 = new Array(90).fill(0);
    for (const [s, p] of pieces) sq90[s] = p;
    const b = new xq.Board(sq90, 1);
    const user = { from: 2 * 9 + 2, to: 4 * 9 + 1 };
    const r = xq.explainXiangqi(b, xq.analyzeXiangqiLocal(b, user, 40000));
    expect(r.grade).toBe('blunder');
    expect(r.points.join()).toMatch(/车吃掉你.*马/);
  });

  it('FEN 与 Fairy-Stockfish 的写法一致', () => {
    expect(xq.xiangqiFen(xq.Board.start())).toBe(
      'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
    );
  });
});
