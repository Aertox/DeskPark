import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { chAiPrompt } from './ai';
import type { Board } from './board';
import { F_CASTLE, F_EP, mFlag, mFrom, mPromo, mTo, san } from './board';
import { PROMO_CODE, TYPE, toBoard } from './convert';
import { chBot } from './bot';
import { legalOf } from './convert';
import type {
  ChAction,
  ChColor,
  ChOptions,
  ChPiece,
  ChPromo,
  ChState,
  ChType,
  ChView,
} from './shared';

export * from './shared';
export { Board, fromFen, toFen, perft } from './board';
export { toBoard, legalOf } from './convert';
export { explainChess, analyzeChessLocal, threatened, threatNotes, toPacked } from './coach';

/**
 * 国际象棋（FIDE 规则）：王车易位、吃过路兵、升变；将死、逼和、三次重复、五十步、子力不足。
 * 和电脑下时可以悔棋。
 */

/** 超过这么多步还没分出胜负，判和（防止电脑之间无限对弈） */
export const MAX_PLIES = 600;

function startPieces(): (ChPiece | null)[] {
  const back: ChType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const out: (ChPiece | null)[] = Array(64).fill(null);
  let id = 0;
  for (let f = 0; f < 8; f++) out[f] = { id: id++, t: back[f], c: 'w' };
  for (let f = 0; f < 8; f++) out[8 + f] = { id: id++, t: 'p', c: 'w' };
  for (let f = 0; f < 8; f++) out[48 + f] = { id: id++, t: 'p', c: 'b' };
  for (let f = 0; f < 8; f++) out[56 + f] = { id: id++, t: back[f], c: 'b' };
  return out;
}

const seatOf = (st: Pick<ChState, 'colors'>, c: ChColor) => st.colors.indexOf(c);

/** 在状态上走一步（已确认合法）；返回是否结束 */
function play(st: ChState, m: number): void {
  const b = toBoard(st);
  const legal = b.legal();
  const from = mFrom(m);
  const to = mTo(m);
  const flag = mFlag(m);
  const s = b.side;
  const mover = st.pieces[from]!;
  const notation = san(b, m, legal);
  let captured: ChPiece | null = st.pieces[to];
  if (flag & F_EP) {
    captured = st.pieces[to - 8 * s];
    st.pieces[to - 8 * s] = null;
  }
  const promo = mPromo(m) ? (TYPE[mPromo(m)] as ChPromo) : undefined;
  st.pieces[to] = promo ? { ...mover, t: promo } : mover;
  st.pieces[from] = null;
  if (flag & F_CASTLE) {
    const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
    st.pieces[rt] = st.pieces[rf];
    st.pieces[rf] = null;
  }
  b.make(m);
  st.side = b.side === 1 ? 'w' : 'b';
  st.castle = b.castle;
  st.ep = b.ep;
  st.half = b.half;
  const check = b.inCheck();
  st.moves.push({
    from,
    to,
    promo,
    san: notation,
    color: mover.c,
    piece: mover.t,
    captured: captured?.t,
    check,
    castle: (flag & F_CASTLE) !== 0 || undefined,
  });
  const key = b.key();
  st.keys.push(key);
  // 终局判定
  if (!b.legal().length) {
    st.phase = 'over';
    st.result = check
      ? { winner: seatOf(st, mover.c), reason: 'checkmate' }
      : { winner: null, reason: 'stalemate' };
  } else if (st.keys.filter((k) => k === key).length >= 3) {
    st.phase = 'over';
    st.result = { winner: null, reason: 'repetition' };
  } else if (b.half >= 100) {
    st.phase = 'over';
    st.result = { winner: null, reason: 'fifty' };
  } else if (b.insufficient()) {
    st.phase = 'over';
    st.result = { winner: null, reason: 'material' };
  } else if (st.moves.length >= MAX_PLIES) {
    st.phase = 'over';
    st.result = { winner: null, reason: 'length' };
  }
}

function packOf(b: Board, a: { from: number; to: number; promo?: ChPromo }): number | null {
  for (const m of b.legal()) {
    if (mFrom(m) !== a.from || mTo(m) !== a.to) continue;
    const pr = mPromo(m);
    if (pr ? PROMO_CODE[a.promo!] === pr : !a.promo) return m;
  }
  return null;
}

function reset(st: ChState): void {
  st.pieces = startPieces();
  st.side = 'w';
  st.castle = 15;
  st.ep = -1;
  st.half = 0;
  st.moves = [];
  st.keys = [toBoard(st).key()];
  st.phase = 'play';
  st.result = null;
}

function canUndo(st: ChState, seat: Seat): boolean {
  if (st.phase !== 'play' || !st.bots[1 - seat] || st.bots[seat]) return false;
  return st.moves.some((m) => m.color === st.colors[seat]);
}

export const chess: GameDefinition<ChState, ChAction, ChView, ChOptions> = {
  meta: {
    id: 'chess',
    category: 'chess',
    name: '国际象棋',
    nameEn: 'Chess',
    tagline: '黑白六兵种，将死对方的王',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    rules: [
      '白方先走。王走一格；后走横、竖、斜任意格；车走横竖；象走斜线；马走「日」字，可以越过棋子；兵向前走一格，第一次可以走两格，斜前方吃子。',
      '王车易位：王和车都没动过、中间没有棋子、王不在被将军中且不经过被攻击的格子时，王向车的方向走两格，车跳到王的另一侧。',
      '吃过路兵：对方的兵一次走两格、停在你的兵旁边时，你可以在下一步斜走到它越过的格子把它吃掉。',
      '升变：兵走到对方底线时必须升变为后、车、象或马。',
      '将死对方的王获胜。没有合法走法又没被将军是逼和（和棋）；同一局面出现三次、50 回合内双方都没有吃子或动兵、或双方都不够子力将死对方，也判和。',
      '和电脑下时可以悔棋；随时可以认输。',
    ],
    botDelayMs: [500, 900],
    turnTimeoutMs: 180_000,
  },
  defaultOptions: { level: 2, side: 'w' },
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
        { value: 'w', label: '白方（先走）' },
        { value: 'b', label: '黑方' },
        { value: 'random', label: '随机' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const rng = new Rng(seed);
    const side =
      options.side === 'b' ? 'b' : options.side === 'random' ? (rng.next() < 0.5 ? 'w' : 'b') : 'w';
    const st: ChState = {
      options: { level: [1, 2, 3].includes(options.level) ? options.level : 2, side: options.side },
      rng: rng.state,
      pieces: [],
      side: 'w',
      castle: 15,
      ep: -1,
      half: 0,
      colors: side === 'w' ? ['w', 'b'] : ['b', 'w'],
      bots: players.map((p) => p.isBot),
      moves: [],
      keys: [],
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
        const int = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 64;
        if (!int(action.from) || !int(action.to)) return '无效走法';
        if (action.promo !== undefined && !['q', 'r', 'b', 'n'].includes(action.promo))
          return '无效的升变';
        const b = toBoard(st);
        const ok = packOf(b, action);
        if (ok !== null) return null;
        const needPromo = b
          .legal()
          .some((m) => mFrom(m) === action.from && mTo(m) === action.to && mPromo(m));
        return needPromo ? '请选择升变的棋子' : '这样走不合法';
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
      // 撤回到自己上一步之前，然后从开局重新摆一遍
      const mine = st.colors[seat];
      const moves = st.moves;
      let cut = moves.length;
      while (cut > 0 && moves[cut - 1].color !== mine) cut--;
      cut--;
      const keep = moves.slice(0, Math.max(0, cut));
      reset(st);
      for (const r of keep) play(st, packOf(toBoard(st), r)!);
      return st;
    }
    play(st, packOf(toBoard(st), action)!);
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
      castle: st.castle,
      ep: st.ep,
      half: st.half,
      colors: st.colors,
      turn,
      moves: st.moves,
      keys: st.keys,
      legal: st.phase === 'play' ? legalOf(b) : [],
      check: b.inCheck() ? b.kingOf(b.side) : null,
      canUndo: seat !== null && seat === turn && canUndo(st, seat),
      phase: st.phase,
      result: st.result,
    };
  },

  isOver: (st) => st.phase === 'over',
  bot: chBot,
  aiPrompt: chAiPrompt,
};
