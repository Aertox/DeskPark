import { describe, expect, it } from 'vitest';
import type { xq as XQ } from '../src';
import { Rng, simulate, xiangqi, xq } from '../src';

type State = XQ.XqState;
/** 坐标：(rank, file)，rank 0 是红方底线 */
const at = (r: number, f: number) => r * 9 + f;
const humanVsBot = [
  { name: '我', isBot: false },
  { name: '电脑', isBot: true },
];
const fresh = (side: 'r' | 'b' = 'r') =>
  xiangqi.setup({ players: humanVsBot, options: { level: 1, side }, seed: 2 });

function move(st: State, from: number, to: number): State {
  const seat = xiangqi.activeSeats(st)[0];
  const err = xiangqi.validate(st, seat, { type: 'move', from, to });
  if (err) throw new Error(`${from}->${to}: ${err}`);
  return xiangqi.apply(st, seat, { type: 'move', from, to });
}

/** 摆一个只有指定棋子的局面 */
function setup(list: [number, XQ.XqType, XQ.XqColor][], side: XQ.XqColor = 'r'): State {
  const st = fresh();
  st.pieces = Array(90).fill(null);
  list.forEach(([sq, t, c], id) => (st.pieces[sq] = { id, t, c }));
  st.side = side;
  st.keys = [xq.toBoard(st).key()];
  return st;
}

describe('中国象棋', () => {
  it('走法生成通过标准 perft（开局 44 / 1920 / 79666）', () => {
    expect([1, 2, 3].map((d) => xq.perft(xq.Board.start(), d))).toEqual([44, 1920, 79666]);
  });

  it('中文记谱', () => {
    let st = fresh();
    st = move(st, at(2, 7), at(2, 4)); // 炮二平五
    st = move(st, at(9, 7), at(7, 6)); // 马8进7
    st = move(st, at(0, 7), at(2, 6)); // 马二进三
    st = move(st, at(9, 8), at(8, 8)); // 车9进1
    st = move(st, at(3, 6), at(4, 6)); // 兵三进一
    expect(st.moves.map((m) => m.text)).toEqual([
      '炮二平五',
      '马8进7',
      '马二进三',
      '车9进1',
      '兵三进一',
    ]);
  });

  it('马蹩腿、象眼与象不过河、炮隔子打', () => {
    const st = fresh();
    const legal = (from: number) =>
      xiangqi
        .view(st, 0)
        .legal.filter((m) => m.from === from)
        .map((m) => m.to);
    // 开局马二只能跳到 2,6 和 2,8（被兵和车挡住的方向不算）
    expect(legal(at(0, 7)).sort()).toEqual([at(2, 6), at(2, 8)].sort());
    // 相只能走到己方
    const e = setup([
      [at(4, 2), 'e', 'r'],
      [at(0, 4), 'k', 'r'],
      [at(9, 3), 'k', 'b'],
    ]);
    const eMoves = xiangqi
      .view(e, 0)
      .legal.filter((m) => m.from === at(4, 2))
      .map((m) => m.to);
    expect(eMoves.every((t) => Math.floor(t / 9) <= 4)).toBe(true);
    // 炮隔一个子吃
    const c = setup([
      [at(2, 4), 'c', 'r'],
      [at(5, 4), 'p', 'b'],
      [at(8, 4), 'r', 'b'],
      [at(0, 3), 'k', 'r'],
      [at(9, 5), 'k', 'b'],
    ]);
    const cMoves = xiangqi.view(c, 0).legal.filter((m) => m.from === at(2, 4));
    expect(cMoves.some((m) => m.to === at(8, 4) && m.capture)).toBe(true);
    expect(cMoves.some((m) => m.to === at(5, 4))).toBe(false);
  });

  it('将帅不能照面', () => {
    const st = setup([
      [at(0, 4), 'k', 'r'],
      [at(9, 3), 'k', 'b'],
      [at(5, 4), 'r', 'r'],
    ]);
    // 车离开中路会让将帅照面？不会——黑将在 3 路。把黑将挪到中路：
    const face = setup(
      [
        [at(0, 3), 'k', 'r'],
        [at(9, 4), 'k', 'b'],
        [at(5, 4), 'p', 'b'],
      ],
      'b',
    );
    expect(xiangqi.validate(face, 1, { type: 'move', from: at(5, 4), to: at(4, 4) })).toBeNull();
    expect(xiangqi.validate(face, 1, { type: 'move', from: at(9, 4), to: at(9, 3) })).toBeTruthy();
    expect(st.phase).toBe('play');
  });

  it('兵过河才能横走，不能后退', () => {
    const st = setup([
      [at(3, 0), 'p', 'r'],
      [at(5, 2), 'p', 'r'],
      [at(0, 4), 'k', 'r'],
      [at(9, 3), 'k', 'b'],
    ]);
    const v = xiangqi.view(st, 0);
    expect(v.legal.filter((m) => m.from === at(3, 0)).map((m) => m.to)).toEqual([at(4, 0)]);
    expect(
      v.legal
        .filter((m) => m.from === at(5, 2))
        .map((m) => m.to)
        .sort(),
    ).toEqual([at(5, 1), at(5, 3), at(6, 2)].sort());
  });

  it('将死获胜，困毙也算输', () => {
    // 双车错将：黑将在 9,4
    let st = setup([
      [at(0, 3), 'k', 'r'],
      [at(8, 0), 'r', 'r'],
      [at(5, 8), 'r', 'r'],
      [at(9, 4), 'k', 'b'],
    ]);
    st = move(st, at(5, 8), at(9, 8));
    expect(st.result).toEqual({ winner: 0, reason: 'checkmate' });
    // 困毙：黑将没被将军，但上去被车封、左边会和帅照面、右边被另一只车控制
    let stuck = setup([
      [at(0, 3), 'k', 'r'],
      [at(8, 0), 'r', 'r'],
      [at(5, 6), 'r', 'r'],
      [at(9, 4), 'k', 'b'],
    ]);
    stuck = move(stuck, at(5, 6), at(5, 5));
    expect(stuck.result).toEqual({ winner: 0, reason: 'stalemate' });
  });

  it('长将判负：一方一直将军造成三次重复', () => {
    // 红车在黑将旁来回将军，黑将在九宫里来回躲
    let st = setup([
      [at(0, 3), 'k', 'r'],
      [at(7, 0), 'r', 'r'],
      [at(9, 5), 'k', 'b'],
      [at(9, 0), 'p', 'b'],
      [at(2, 8), 'p', 'b'],
    ]);
    st = move(st, at(7, 0), at(7, 5)); // 将
    const cycle: [number, number][] = [
      [at(9, 5), at(9, 4)],
      [at(7, 5), at(7, 4)], // 将
      [at(9, 4), at(9, 5)],
      [at(7, 4), at(7, 5)], // 将
    ];
    for (let i = 0; i < 4 && st.phase === 'play'; i++)
      for (const [f, t] of cycle) if (st.phase === 'play') st = move(st, f, t);
    expect(st.result?.reason).toBe('perpetual');
    expect(st.result?.winner).toBe(1);
  });

  it('悔棋只在和电脑下时可用', () => {
    let st = fresh();
    st = move(st, at(2, 7), at(2, 4));
    st = xiangqi.apply(st, 1, xiangqi.bot(xiangqi.view(st, 1), 1, new Rng(3)));
    expect(xiangqi.view(st, 0).canUndo).toBe(true);
    st = xiangqi.apply(st, 0, { type: 'undo' });
    expect(st.moves).toHaveLength(0);
    expect(st.pieces[at(2, 7)]?.t).toBe('c');
  });

  it('电脑对弈可以下完', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const { state } = simulate(xiangqi, 2, { level: 1, side: 'r' }, seed, 2000);
      expect(state.phase).toBe('over');
    }
  });
});
