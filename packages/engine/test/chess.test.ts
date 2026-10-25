import { describe, expect, it } from 'vitest';
import type { ch as CH } from '../src';
import { Rng, ch, chess, simulate } from '../src';

type State = CH.ChState;
const sq = (name: string) => 'abcdefgh'.indexOf(name[0]) + (Number(name[1]) - 1) * 8;
const humanVsBot = [
  { name: '我', isBot: false },
  { name: '电脑', isBot: true },
];
const fresh = (side: 'w' | 'b' = 'w') =>
  chess.setup({ players: humanVsBot, options: { level: 1, side }, seed: 3 });

function play(st: State, ...moves: string[]): State {
  for (const mv of moves) {
    const [from, to, promo] = [
      sq(mv.slice(0, 2)),
      sq(mv.slice(2, 4)),
      mv[4] as CH.ChPromo | undefined,
    ];
    const seat = chess.activeSeats(st)[0];
    const action: CH.ChAction = { type: 'move', from, to, ...(promo ? { promo } : {}) };
    const err = chess.validate(st, seat, action);
    if (err) throw new Error(`${mv}: ${err}`);
    st = chess.apply(st, seat, action);
  }
  return st;
}

/** 从 FEN 摆一个局面（棋子编号按格子顺序） */
function fromFen(fen: string): State {
  const st = fresh();
  const b = ch.fromFen(fen);
  let id = 0;
  const types: CH.ChType[] = ['p', 'p', 'n', 'b', 'r', 'q', 'k'];
  st.pieces = Array.from(b.sq, (p) =>
    p ? { id: id++, t: types[Math.abs(p)], c: p > 0 ? 'w' : 'b' } : null,
  );
  st.side = b.side === 1 ? 'w' : 'b';
  st.castle = b.castle;
  st.ep = b.ep;
  st.half = b.half;
  st.keys = [b.key()];
  return st;
}

describe('国际象棋', () => {
  it('走法生成通过标准 perft 局面', () => {
    const cases: [string, number[]][] = [
      ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902]],
      ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
      ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
      ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ];
    for (const [fen, want] of cases)
      expect(want.map((_, d) => ch.perft(ch.fromFen(fen), d + 1))).toEqual(want);
  });

  it('记谱：SAN、吃子、易位、将军与将死', () => {
    const st = play(fresh(), 'e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7');
    expect(st.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
    expect(st.phase).toBe('over');
    expect(st.result).toEqual({ winner: 0, reason: 'checkmate' });
  });

  it('王车易位：车跟着走；动过王之后不能再易位', () => {
    let st = play(fresh(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1');
    expect(st.moves.at(-1)!.san).toBe('O-O');
    expect(st.pieces[sq('f1')]?.t).toBe('r');
    expect(st.pieces[sq('g1')]?.t).toBe('k');
    expect(st.castle & 3).toBe(0);
    st = play(
      fresh(),
      'e2e4',
      'e7e5',
      'e1e2',
      'd7d6',
      'e2e1',
      'c8e6',
      'g1f3',
      'b8c6',
      'f1c4',
      'g8f6',
    );
    expect(chess.validate(st, 0, { type: 'move', from: sq('e1'), to: sq('g1') })).toBeTruthy();
  });

  it('吃过路兵只能在紧接着的一步', () => {
    const st = play(fresh(), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    const ep = { type: 'move', from: sq('e5'), to: sq('d6') } as const;
    expect(chess.validate(st, 0, ep)).toBeNull();
    const after = chess.apply(st, 0, ep);
    expect(after.pieces[sq('d5')]).toBeNull();
    expect(after.moves.at(-1)!.san).toBe('exd6');
    const late = play(st, 'h2h3', 'h7h6');
    expect(chess.validate(late, 0, ep)).toBeTruthy();
  });

  it('升变必须选择棋子，可以升成马', () => {
    const st = fromFen('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1');
    expect(chess.validate(st, 0, { type: 'move', from: sq('e7'), to: sq('e8') })).toContain('升变');
    const after = chess.apply(st, 0, { type: 'move', from: sq('e7'), to: sq('e8'), promo: 'n' });
    expect(after.pieces[sq('e8')]).toMatchObject({ t: 'n', c: 'w' });
    expect(after.moves.at(-1)!.san).toBe('e8=N+');
  });

  it('被牵制的棋子不能离开，被将军时只能解将', () => {
    const st = fromFen('4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1');
    expect(chess.validate(st, 0, { type: 'move', from: sq('e2'), to: sq('d3') })).toBeTruthy();
    const chk = fromFen('4k3/8/8/8/8/8/8/r3K3 w - - 0 1');
    const legal = chess.view(chk, 0).legal.map((m) => m.to);
    expect(legal.every((t) => t >= 8)).toBe(true);
  });

  it('逼和、子力不足、三次重复判和', () => {
    const stale = fromFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
    const s1 = chess.apply(stale, 0, { type: 'move', from: sq('f7'), to: sq('f6') });
    expect(s1.result).toBeNull();
    const s2 = fromFen('k7/8/1QK5/8/8/8/8/8 w - - 0 1');
    const s3 = chess.apply(s2, 0, { type: 'move', from: sq('b6'), to: sq('c7') });
    expect(s3.result).toEqual({ winner: null, reason: 'stalemate' });

    const mat = fromFen('4k3/8/8/8/8/8/3n4/4K3 w - - 0 1');
    const m2 = chess.apply(mat, 0, { type: 'move', from: sq('e1'), to: sq('d2') });
    expect(m2.result).toEqual({ winner: null, reason: 'material' });

    const rep = play(fresh(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
    expect(rep.result).toEqual({ winner: null, reason: 'repetition' });
  });

  it('五十步规则', () => {
    const st = fromFen('4k3/8/8/8/8/8/8/R3K3 w - - 99 60');
    const after = chess.apply(st, 0, { type: 'move', from: sq('a1'), to: sq('a2') });
    expect(after.result).toEqual({ winner: null, reason: 'fifty' });
  });

  it('执黑时电脑先走；悔棋撤回自己和电脑的一步', () => {
    let st = fresh('b');
    expect(st.colors).toEqual(['b', 'w']);
    expect(chess.activeSeats(st)).toEqual([1]);
    st = chess.apply(st, 1, chess.bot(chess.view(st, 1), 1, new Rng(1)));
    expect(chess.view(st, 0).canUndo).toBe(false);
    st = play(st, 'e7e5');
    st = chess.apply(st, 1, { type: 'move', ...pickAny(st) });
    expect(chess.view(st, 0).canUndo).toBe(true);
    const before = st.moves.length;
    st = chess.apply(st, 0, { type: 'undo' });
    expect(st.moves.length).toBe(before - 2);
    expect(chess.activeSeats(st)).toEqual([0]);
    // 双人对局不能悔棋
    const pvp = chess.setup({
      players: [
        { name: 'A', isBot: false },
        { name: 'B', isBot: false },
      ],
      options: chess.defaultOptions,
      seed: 1,
    });
    const moved = play(pvp, 'e2e4', 'e7e5');
    expect(chess.validate(moved, 0, { type: 'undo' })).toBeTruthy();
  });

  it('认输', () => {
    const st = chess.apply(fresh(), 0, { type: 'resign' });
    expect(st.result).toEqual({ winner: 1, reason: 'resign' });
  });

  it('电脑对弈可以下完，走法都合法', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const { state } = simulate(chess, 2, { level: 1, side: 'w' }, seed, 2000);
      expect(state.phase).toBe('over');
    }
  });
});

function pickAny(st: State): { from: number; to: number } {
  const v = chess.view(st, chess.activeSeats(st)[0]);
  return { from: v.legal[0].from, to: v.legal[0].to };
}
