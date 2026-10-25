import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { xqAiPrompt } from './ai';
import { mFrom, mTo, notation } from './board';
import { legalOf, repetitionOutcome, toBoard, TYPE } from './convert';
import { xqBot } from './bot';
import type {
  XqAction,
  XqColor,
  XqEndReason,
  XqOptions,
  XqPiece,
  XqState,
  XqType,
  XqView,
} from './shared';

export * from './shared';
export { Board, notation, perft } from './board';
export { toBoard, legalOf } from './convert';

/**
 * 中国象棋：马蹩腿、象塞眼不过河、炮隔子打、兵过河横走、将帅不照面；
 * 将死或困毙（无子可走）判负；重复局面中长将一方判负，其余循环判和；
 * 60 回合无吃子、双方都没有进攻子力时判和。和电脑下时可以悔棋。
 */

/** 连续这么多步没有吃子判和（60 回合） */
export const IDLE_LIMIT = 120;
export const MAX_PLIES = 600;

function startPieces(): (XqPiece | null)[] {
  const out: (XqPiece | null)[] = Array(90).fill(null);
  const back: XqType[] = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r'];
  let id = 0;
  const put = (sq: number, t: XqType, c: XqColor) => (out[sq] = { id: id++, t, c });
  for (let f = 0; f < 9; f++) put(f, back[f], 'r');
  put(2 * 9 + 1, 'c', 'r');
  put(2 * 9 + 7, 'c', 'r');
  for (const f of [0, 2, 4, 6, 8]) put(3 * 9 + f, 'p', 'r');
  for (let f = 0; f < 9; f++) put(81 + f, back[f], 'b');
  put(7 * 9 + 1, 'c', 'b');
  put(7 * 9 + 7, 'c', 'b');
  for (const f of [0, 2, 4, 6, 8]) put(6 * 9 + f, 'p', 'b');
  return out;
}

const seatOf = (st: Pick<XqState, 'colors'>, c: XqColor) => st.colors.indexOf(c);

function reset(st: XqState): void {
  st.pieces = startPieces();
  st.side = 'r';
  st.moves = [];
  st.keys = [toBoard(st).key()];
  st.idle = 0;
  st.phase = 'play';
  st.result = null;
}

function findMove(st: XqState, from: number, to: number): number | null {
  return (
    toBoard(st)
      .legal()
      .find((m) => mFrom(m) === from && mTo(m) === to) ?? null
  );
}

function play(st: XqState, m: number): void {
  const b = toBoard(st);
  const from = mFrom(m);
  const to = mTo(m);
  const mover = st.pieces[from]!;
  const text = notation(b, m);
  const captured = st.pieces[to];
  st.pieces[to] = mover;
  st.pieces[from] = null;
  b.make(m);
  st.side = b.side === 1 ? 'r' : 'b';
  const check = b.inCheck();
  const key = b.key();
  const rep = repetitionOutcome(st.moves, st.keys, { key, check, color: mover.c });
  st.moves.push({ from, to, text, color: mover.c, piece: mover.t, captured: captured?.t, check });
  st.keys.push(key);
  st.idle = captured ? 0 : st.idle + 1;
  const me = seatOf(st, mover.c);
  const end = (winner: Seat | null, reason: XqEndReason) => {
    st.phase = 'over';
    st.result = { winner, reason };
  };
  if (!b.legal().length) end(me, check ? 'checkmate' : 'stalemate');
  else if (rep === 'lose') end(1 - me, 'perpetual');
  else if (rep === 'win') end(me, 'perpetual');
  else if (rep === 'draw') end(null, 'repetition');
  else if (st.idle >= IDLE_LIMIT) end(null, 'idle');
  else if (b.noAttackers()) end(null, 'material');
  else if (st.moves.length >= MAX_PLIES) end(null, 'length');
}

function canUndo(st: XqState, seat: Seat): boolean {
  if (st.phase !== 'play' || !st.bots[1 - seat] || st.bots[seat]) return false;
  return st.moves.some((m) => m.color === st.colors[seat]);
}

export const xiangqi: GameDefinition<XqState, XqAction, XqView, XqOptions> = {
  meta: {
    id: 'xiangqi',
    category: 'chess',
    name: '中国象棋',
    nameEn: 'Xiangqi',
    tagline: '楚河汉界，车马炮将',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    rules: [
      '红方先走。棋子走在交叉点上：车直走任意格；马走「日」字，被紧挨着的棋子绊住「马腿」时不能走；相（象）走「田」字，「象眼」被堵不能走，也不能过河。',
      '炮不吃子时和车一样走；吃子时必须隔一个棋子（炮架）。兵（卒）只能向前一步，过了河才可以左右走，永远不能后退。',
      '帅（将）和仕（士）只能在九宫里走：帅一次直走一步，仕一次斜走一步。将帅不能在同一条直线上直接照面。',
      '把对方的帅（将）将死，或对方无棋可走（困毙），就获胜。',
      '同一局面重复出现三次时：一方一直在将军（长将）而另一方没有，长将的一方判负；其他情况判和。60 回合双方都没有吃子、或双方都没有能过河进攻的棋子，也判和。',
      '和电脑下时可以悔棋；随时可以认输。记谱用中文纵线：红方从右往左一至九，黑方 1 至 9，例如「炮二平五」「马8进7」。',
    ],
    botDelayMs: [500, 900],
    turnTimeoutMs: 180_000,
  },
  defaultOptions: { level: 2, side: 'r' },
  optionFields: [
    {
      key: 'level',
      label: '电脑强度',
      type: 'select',
      choices: [
        { value: 1, label: '入门' },
        { value: 2, label: '普通' },
        { value: 3, label: '困难' },
      ],
    },
    {
      key: 'side',
      label: '执子',
      hint: '单人时是你执的颜色；联机时指 1 号位',
      type: 'select',
      choices: [
        { value: 'r', label: '红方（先走）' },
        { value: 'b', label: '黑方' },
        { value: 'random', label: '随机' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const rng = new Rng(seed);
    const side =
      options.side === 'b' ? 'b' : options.side === 'random' ? (rng.next() < 0.5 ? 'r' : 'b') : 'r';
    const st: XqState = {
      options: { level: [1, 2, 3].includes(options.level) ? options.level : 2, side: options.side },
      rng: rng.state,
      pieces: [],
      side: 'r',
      colors: side === 'r' ? ['r', 'b'] : ['b', 'r'],
      bots: players.map((p) => p.isBot),
      moves: [],
      keys: [],
      idle: 0,
      phase: 'play',
      result: null,
    };
    reset(st);
    return st;
  },

  activeSeats: (st) => (st.phase === 'play' ? [seatOf(st, st.side)] : []),

  validate(st, seat, action) {
    if (st.phase !== 'play') return '对局已结束';
    if (seat !== seatOf(st, st.side)) return '还没轮到你';
    switch (action.type) {
      case 'resign':
        return null;
      case 'undo':
        return canUndo(st, seat) ? null : '现在不能悔棋';
      case 'move': {
        const int = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 90;
        if (!int(action.from) || !int(action.to)) return '无效走法';
        return findMove(st, action.from, action.to) !== null ? null : '这样走不合法';
      }
      default:
        return '未知操作';
    }
  },

  apply(prev, seat, action) {
    const st = clone(prev);
    if (action.type === 'resign') {
      st.phase = 'over';
      st.result = { winner: 1 - seat, reason: 'resign' };
      return st;
    }
    if (action.type === 'undo') {
      const mine = st.colors[seat];
      let cut = st.moves.length;
      while (cut > 0 && st.moves[cut - 1].color !== mine) cut--;
      const keep = st.moves.slice(0, Math.max(0, cut - 1));
      reset(st);
      for (const r of keep) play(st, findMove(st, r.from, r.to)!);
      return st;
    }
    play(st, findMove(st, action.from, action.to)!);
    return st;
  },

  view(st, seat) {
    const b = toBoard(st);
    const turn = seatOf(st, st.side);
    return {
      seat,
      options: st.options,
      pieces: st.pieces,
      side: st.side,
      colors: st.colors,
      turn,
      moves: st.moves,
      keys: st.keys,
      idle: st.idle,
      legal: st.phase === 'play' ? legalOf(b) : [],
      check: b.inCheck() ? b.kingOf(b.side) : null,
      canUndo: seat !== null && seat === turn && canUndo(st, seat),
      phase: st.phase,
      result: st.result,
    };
  },

  isOver: (st) => st.phase === 'over',
  bot: xqBot,
  aiPrompt: xqAiPrompt,
};

export { TYPE };
