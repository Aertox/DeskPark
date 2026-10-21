import { clone } from '../../core/clone';
import type { Card } from '../../core/cards';
import { createDeck } from '../../core/cards';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { txBot } from './bot';
import { bestFive, handName } from './evaluator';

export * from './evaluator';

export interface TxOptions {
  startingStack: number;
  bigBlind: number;
  /** 每多少手牌盲注翻倍，0 为不涨 */
  blindUp: number;
}

export type TxAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }
  | { type: 'allin' }
  | { type: 'ready' };

export type TxActionTag = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'sb' | 'bb';

export interface TxPlayer {
  stack: number;
  bet: number;
  total: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  out: boolean;
  acted: boolean;
  canRaise: boolean;
  lastAction: { tag: TxActionTag; amount?: number } | null;
}

export type TxStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface TxShownHand {
  seat: Seat;
  cards: Card[];
  score: number;
  name: string;
  best: Card[];
}

export interface TxHandResult {
  handNo: number;
  showdown: boolean;
  pots: { amount: number; winners: Seat[] }[];
  /** 每个座位本手赢回的筹码 */
  won: number[];
  /** 每个座位本手的净输赢 */
  net: number[];
  shown: TxShownHand[];
  board: Card[];
}

export type TxPhase = 'betting' | 'handOver' | 'gameOver';

export interface TxState {
  options: TxOptions;
  rng: number;
  handNo: number;
  phase: TxPhase;
  street: TxStreet;
  players: TxPlayer[];
  dealer: Seat;
  sbSeat: Seat;
  bbSeat: Seat;
  sb: number;
  bb: number;
  deck: Card[];
  board: Card[];
  pot: number;
  turn: Seat;
  currentBet: number;
  minRaise: number;
  result: TxHandResult | null;
  ready: boolean[];
  eliminated: Seat[];
}

export interface TxViewPlayer {
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  out: boolean;
  inHand: boolean;
  lastAction: TxPlayer['lastAction'];
  hole: Card[] | null;
}

export interface TxMyOptions {
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface TxView {
  seat: Seat | null;
  phase: TxPhase;
  street: TxStreet;
  handNo: number;
  options: TxOptions;
  players: TxViewPlayer[];
  dealer: Seat;
  sbSeat: Seat;
  bbSeat: Seat;
  sb: number;
  bb: number;
  board: Card[];
  /** 已收进底池的筹码 */
  pot: number;
  /** 底池 + 本轮下注 */
  totalPot: number;
  turn: Seat | null;
  currentBet: number;
  me: TxMyOptions | null;
  result: TxHandResult | null;
  ready: boolean[];
  /** 下次涨盲的手数（不涨为 null） */
  nextBlindUpAt: number | null;
  /** 名次（gameOver 时有效）：第 1 名在前 */
  ranking: Seat[] | null;
}

const canAct = (p: TxPlayer) => !p.folded && !p.allIn && !p.out;
const inHand = (p: TxPlayer) => !p.folded && !p.out;

function nextSeat(state: TxState, from: Seat, pred: (p: TxPlayer) => boolean): Seat {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const s = (from + i) % n;
    if (pred(state.players[s])) return s;
  }
  return -1;
}

function blindFor(options: TxOptions, handNo: number): number {
  if (!options.blindUp) return options.bigBlind;
  return options.bigBlind * 2 ** Math.floor((handNo - 1) / options.blindUp);
}

function commit(p: TxPlayer, amount: number): number {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.total += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

function startHand(state: TxState): void {
  state.handNo++;
  state.bb = blindFor(state.options, state.handNo);
  state.sb = Math.max(1, Math.floor(state.bb / 2));
  for (const p of state.players) {
    p.bet = 0;
    p.total = 0;
    p.hole = [];
    p.folded = p.out;
    p.allIn = false;
    p.acted = false;
    p.canRaise = true;
    p.lastAction = null;
  }
  if (state.handNo > 1 || state.players[state.dealer].out) {
    state.dealer = nextSeat(state, state.dealer, (p) => !p.out);
  }
  const live = state.players.filter((p) => !p.out).length;
  if (live === 2) {
    state.sbSeat = state.dealer;
    state.bbSeat = nextSeat(state, state.dealer, (p) => !p.out);
  } else {
    state.sbSeat = nextSeat(state, state.dealer, (p) => !p.out);
    state.bbSeat = nextSeat(state, state.sbSeat, (p) => !p.out);
  }
  const rng = new Rng(state.rng);
  state.deck = rng.shuffle(createDeck(1, false));
  state.rng = rng.state;
  state.board = [];
  state.pot = 0;
  state.street = 'preflop';
  state.result = null;
  // 从小盲开始依次发两张
  for (let round = 0; round < 2; round++) {
    let s = state.sbSeat;
    for (let i = 0; i < live; i++) {
      state.players[s].hole.push(state.deck.pop()!);
      s = nextSeat(state, s, (p) => !p.out);
    }
  }
  const sbP = state.players[state.sbSeat];
  const bbP = state.players[state.bbSeat];
  sbP.lastAction = { tag: 'sb', amount: commit(sbP, state.sb) };
  bbP.lastAction = { tag: 'bb', amount: commit(bbP, state.bb) };
  state.currentBet = state.bb;
  state.minRaise = state.bb;
  state.phase = 'betting';
  state.ready = state.players.map((p) => p.out);
  state.turn = nextSeat(state, state.bbSeat, canAct);
  settle(state);
}

function roundComplete(state: TxState): boolean {
  const actors = state.players.filter(canAct);
  if (actors.length === 0) return true;
  if (actors.length === 1 && actors[0].bet >= state.currentBet) {
    // 其余人都已全下：只剩一人无需再行动（若还需跟注则仍要表态）
    const others = state.players.filter((p) => inHand(p) && p !== actors[0]);
    if (others.every((p) => p.bet <= actors[0].bet) || actors[0].acted) return true;
  }
  return actors.every((p) => p.acted && p.bet === state.currentBet);
}

function collectBets(state: TxState): void {
  for (const p of state.players) {
    state.pot += p.bet;
    p.bet = 0;
  }
}

/** 处理动作后的推进：一人独存、轮次结束、发下一街、摊牌。 */
function settle(state: TxState): void {
  const alive = state.players.filter(inHand);
  if (alive.length === 1) {
    collectBets(state);
    award(state, false);
    return;
  }
  while (roundComplete(state)) {
    collectBets(state);
    for (const p of state.players) {
      p.acted = false;
      p.canRaise = true;
      if (!p.folded) p.lastAction = null;
    }
    state.currentBet = 0;
    state.minRaise = state.bb;
    if (state.street === 'preflop') {
      state.board.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
      state.street = 'flop';
    } else if (state.street === 'flop') {
      state.board.push(state.deck.pop()!);
      state.street = 'turn';
    } else if (state.street === 'turn') {
      state.board.push(state.deck.pop()!);
      state.street = 'river';
    } else {
      state.street = 'showdown';
      award(state, true);
      return;
    }
    const actors = state.players.filter(canAct);
    if (actors.length >= 2) {
      state.turn = nextSeat(state, state.dealer, canAct);
      return;
    }
    // 不足两人可行动：继续发完公共牌
  }
  if (!canAct(state.players[state.turn]) || state.players[state.turn].acted) {
    state.turn = nextSeat(
      state,
      state.turn,
      (p) => canAct(p) && (!p.acted || p.bet < state.currentBet),
    );
  }
}

function award(state: TxState, showdown: boolean): void {
  const n = state.players.length;
  const won = new Array<number>(n).fill(0);
  const contributed = state.players.map((p) => p.total);
  const pots: TxHandResult['pots'] = [];
  const shown: TxShownHand[] = [];
  const scores = new Map<Seat, number>();

  if (showdown) {
    state.players.forEach((p, s) => {
      if (!inHand(p)) return;
      const best = bestFive([...p.hole, ...state.board]);
      scores.set(s, best.score);
      shown.push({
        seat: s,
        cards: p.hole,
        score: best.score,
        name: handName(best.score),
        best: best.cards,
      });
    });
  }

  const levels = [...new Set(contributed.filter((c) => c > 0))].sort((a, b) => a - b);
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contributed) amount += Math.max(0, Math.min(c, level) - prev);
    let eligible = state.players
      .map((p, s) => ({ p, s }))
      .filter(({ p, s }) => inHand(p) && contributed[s] >= level)
      .map(({ s }) => s);
    if (eligible.length === 0)
      eligible = state.players
        .map((p, s) => ({ p, s }))
        .filter(({ p }) => inHand(p))
        .map(({ s }) => s);
    let winners = eligible;
    if (showdown && eligible.length > 1) {
      const top = Math.max(...eligible.map((s) => scores.get(s)!));
      winners = eligible.filter((s) => scores.get(s) === top);
    }
    // 余数给庄家左手第一位赢家
    const ordered = [...winners].sort(
      (a, b) => ((a - state.dealer - 1 + n) % n) - ((b - state.dealer - 1 + n) % n),
    );
    const share = Math.floor(amount / ordered.length);
    let rem = amount - share * ordered.length;
    for (const s of ordered) {
      won[s] += share + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    }
    const last = pots[pots.length - 1];
    if (last && last.winners.join() === ordered.join()) last.amount += amount;
    else pots.push({ amount, winners: ordered });
    prev = level;
  }

  state.players.forEach((p, s) => {
    p.stack += won[s];
  });
  state.pot = 0;
  state.result = {
    handNo: state.handNo,
    showdown,
    pots,
    won,
    net: won.map((w, s) => w - contributed[s]),
    shown,
    board: [...state.board],
  };
  // 出局判定：按本手开始前筹码少的先出局
  const busted = state.players
    .map((p, s) => ({ p, s }))
    .filter(({ p }) => !p.out && p.stack === 0)
    .sort((a, b) => contributed[a.s] - contributed[b.s]);
  for (const { p, s } of busted) {
    p.out = true;
    state.eliminated.push(s);
  }
  const remaining = state.players.filter((p) => !p.out).length;
  state.phase = remaining <= 1 ? 'gameOver' : 'handOver';
  state.ready = state.players.map((p) => p.out);
}

export const texas: GameDefinition<TxState, TxAction, TxView, TxOptions> = {
  meta: {
    id: 'texas',
    category: 'poker',
    name: '德州扑克',
    nameEn: "Texas Hold'em",
    tagline: '两张底牌，五张公共牌，组成最大的五张',
    minPlayers: 2,
    maxPlayers: 8,
    defaultPlayers: 6,
    botDelayMs: [800, 1600],
    rules: [
      '每人两张底牌，与五张公共牌中任选五张组成最大牌型。',
      '下注轮：翻牌前、翻牌（3 张）、转牌（1 张）、河牌（1 张），可弃牌、过牌、跟注、加注或全下。',
      '牌型从大到小：同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌。',
      '加注至少为上一次加注的幅度；全下不足最小加注时不重新开放加注。',
      '筹码输光即出局，最后留在桌上的玩家获胜。',
    ],
  },
  defaultOptions: { startingStack: 2000, bigBlind: 20, blindUp: 10 },
  optionFields: [
    {
      key: 'startingStack',
      label: '初始筹码',
      type: 'select',
      choices: [
        { value: 1000, label: '1,000' },
        { value: 2000, label: '2,000' },
        { value: 5000, label: '5,000' },
      ],
    },
    {
      key: 'bigBlind',
      label: '大盲',
      type: 'select',
      choices: [
        { value: 10, label: '10 / 5' },
        { value: 20, label: '20 / 10' },
        { value: 50, label: '50 / 25' },
      ],
    },
    {
      key: 'blindUp',
      label: '涨盲',
      hint: '每隔若干手盲注翻倍',
      type: 'select',
      choices: [
        { value: 0, label: '不涨' },
        { value: 10, label: '每 10 手' },
        { value: 5, label: '每 5 手' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const rng = new Rng(seed);
    const state: TxState = {
      options: { ...options },
      rng: 0,
      handNo: 0,
      phase: 'betting',
      street: 'preflop',
      players: players.map(() => ({
        stack: options.startingStack,
        bet: 0,
        total: 0,
        hole: [],
        folded: false,
        allIn: false,
        out: false,
        acted: false,
        canRaise: true,
        lastAction: null,
      })),
      dealer: rng.int(players.length),
      sbSeat: 0,
      bbSeat: 0,
      sb: 0,
      bb: 0,
      deck: [],
      board: [],
      pot: 0,
      turn: 0,
      currentBet: 0,
      minRaise: 0,
      result: null,
      ready: players.map(() => false),
      eliminated: [],
    };
    state.rng = rng.state;
    startHand(state);
    return state;
  },

  activeSeats(state) {
    if (state.phase === 'betting') return [state.turn];
    if (state.phase === 'handOver')
      return state.players.map((_, s) => s).filter((s) => !state.ready[s]);
    return [];
  },

  validate(state, seat, action) {
    if (action.type === 'ready') return state.phase === 'handOver' ? null : '当前不能开始下一手';
    if (state.phase !== 'betting') return '当前不能操作';
    const p = state.players[seat];
    const toCall = state.currentBet - p.bet;
    switch (action.type) {
      case 'fold':
        return null;
      case 'check':
        return toCall > 0 ? '需要跟注或弃牌' : null;
      case 'call':
        return toCall > 0 ? null : '无需跟注，可以过牌';
      case 'allin':
        if (p.stack <= 0) return '没有筹码了';
        if (!p.canRaise && p.bet + p.stack > state.currentBet) return '当前只能跟注或弃牌';
        return null;
      case 'raise': {
        const to = Math.floor(action.to);
        const max = p.bet + p.stack;
        if (!p.canRaise) return '当前只能跟注或弃牌';
        if (to <= state.currentBet) return '加注额需大于当前下注';
        if (to > max) return '筹码不足';
        const min = state.currentBet === 0 ? state.bb : state.currentBet + state.minRaise;
        if (to < min && to !== max) return `至少需要加注到 ${min}`;
        return null;
      }
      default:
        return '未知操作';
    }
  },

  apply(prev, seat, action) {
    const state = clone(prev);
    if (action.type === 'ready') {
      state.ready[seat] = true;
      if (state.ready.every(Boolean)) startHand(state);
      return state;
    }
    const p = state.players[seat];
    const raiseTo = (to: number) => {
      const size = to - state.currentBet;
      const full = size >= state.minRaise;
      const wasBet = state.currentBet === 0;
      commit(p, to - p.bet);
      if (full) state.minRaise = size;
      for (const o of state.players) {
        if (o === p || !canAct(o)) continue;
        if (!full && o.acted) o.canRaise = false;
        if (full) o.canRaise = true;
        o.acted = false;
      }
      state.currentBet = to;
      p.lastAction = { tag: p.allIn ? 'allin' : wasBet ? 'bet' : 'raise', amount: p.bet };
    };
    switch (action.type) {
      case 'fold':
        p.folded = true;
        p.lastAction = { tag: 'fold' };
        break;
      case 'check':
        p.lastAction = { tag: 'check' };
        break;
      case 'call': {
        commit(p, state.currentBet - p.bet);
        p.lastAction = { tag: p.allIn ? 'allin' : 'call', amount: p.bet };
        break;
      }
      case 'allin': {
        const max = p.bet + p.stack;
        if (max <= state.currentBet) {
          commit(p, p.stack);
          p.lastAction = { tag: 'allin', amount: p.bet };
        } else {
          raiseTo(max);
        }
        break;
      }
      case 'raise':
        raiseTo(Math.floor(action.to));
        break;
    }
    p.acted = true;
    state.turn = nextSeat(state, seat, canAct);
    settle(state);
    return state;
  },

  view(state, seat) {
    const over = state.phase !== 'betting';
    const shownSeats = new Set(state.result?.shown.map((h) => h.seat) ?? []);
    const me =
      seat !== null && state.phase === 'betting' && state.turn === seat
        ? state.players[seat]
        : null;
    let myOpts: TxMyOptions | null = null;
    if (me) {
      const toCall = Math.max(0, state.currentBet - me.bet);
      const max = me.bet + me.stack;
      const min = state.currentBet === 0 ? state.bb : state.currentBet + state.minRaise;
      myOpts = {
        toCall: Math.min(toCall, me.stack),
        canCheck: toCall === 0,
        canRaise: me.canRaise && max > state.currentBet,
        minRaiseTo: Math.min(min, max),
        maxRaiseTo: max,
      };
    }
    let ranking: Seat[] | null = null;
    if (state.phase === 'gameOver') {
      const alive = state.players
        .map((p, s) => ({ p, s }))
        .filter(({ p }) => !p.out)
        .map(({ s }) => s);
      ranking = [...alive, ...[...state.eliminated].reverse()];
    }
    return {
      seat,
      phase: state.phase,
      street: state.street,
      handNo: state.handNo,
      options: state.options,
      players: state.players.map((p, s) => ({
        stack: p.stack,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        out: p.out,
        inHand: inHand(p),
        lastAction: p.lastAction,
        hole: s === seat || (over && shownSeats.has(s)) ? p.hole : null,
      })),
      dealer: state.dealer,
      sbSeat: state.sbSeat,
      bbSeat: state.bbSeat,
      sb: state.sb,
      bb: state.bb,
      board: state.board,
      pot: state.pot,
      totalPot: state.pot + state.players.reduce((a, p) => a + p.bet, 0),
      turn: state.phase === 'betting' ? state.turn : null,
      currentBet: state.currentBet,
      me: myOpts,
      result: state.result,
      ready: state.ready,
      nextBlindUpAt: state.options.blindUp
        ? Math.ceil(state.handNo / state.options.blindUp) * state.options.blindUp + 1
        : null,
      ranking,
    };
  },

  isOver(state) {
    return state.phase === 'gameOver';
  },

  bot: txBot,
};
