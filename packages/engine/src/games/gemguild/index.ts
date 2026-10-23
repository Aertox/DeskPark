import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { ggAiPrompt } from './ai';
import { ggBot } from './bot';
import { buildDeck, buildNobles } from './cards';
import {
  addTokens,
  anyTake,
  bonusesOf,
  canReserve,
  findInMarket,
  nobleOk,
  payment,
  pointsOf,
  takeError,
} from './rules';
import type {
  GgAction,
  GgCard,
  GgEvent,
  GgOptions,
  GgPlayer,
  GgState,
  GgView,
  Level,
  TokenMap,
} from './shared';
import {
  GEMS,
  GEM_SUPPLY,
  GOLD,
  LEVELS,
  MAX_TOKENS,
  TOKENS,
  emptyTokens,
  tokenTotal,
} from './shared';

export * from './shared';
export { bonusesOf, payment, pointsOf, shortfall, takeError, nobleOk } from './rules';

/**
 * 宝石商会：收集宝石、买下发展卡、迎来贵族拜访。规则参考经典的宝石引擎构筑桌游（官方规则）。
 *
 * - 每回合四选一：拿 3 种不同颜色的宝石；拿 2 颗同色宝石（那种至少剩 4 颗）；
 *   预留一张发展卡并拿 1 颗黄金（最多预留 3 张）；买下一张公开的或自己预留的发展卡。
 * - 发展卡永久提供一颗对应颜色的折扣，部分带声望；凑够贵族要求的折扣，贵族会来拜访（+3 声望）。
 * - 回合结束时手里的宝石不能超过 10 颗。
 * - 有人达到 15 声望后打完这一轮，声望最高的获胜；同分时买的发展卡少的获胜。
 */

type EventInput = GgEvent extends infer E ? (E extends unknown ? Omit<E, 'seq'> : never) : never;
function pushEvent(st: GgState, e: EventInput): void {
  st.events.push({ ...e, seq: ++st.eventSeq } as GgEvent);
  if (st.events.length > 20) st.events.shift();
}

const refill = (st: GgState, level: Level, slot: number) => {
  st.market[level - 1][slot] = st.decks[level - 1].pop() ?? null;
};

/** 当前行动者在主阶段有没有任何合法动作（都没有才能跳过） */
function canAct(st: GgState, seat: Seat): boolean {
  const p = st.players[seat];
  if (anyTake(st.bank)) return true;
  if (
    canReserve(
      p,
      st.market,
      st.decks.map((d) => d.length),
    )
  )
    return true;
  const cards = [...st.market.flat().filter(Boolean), ...p.reserved.map((r) => r.card)] as GgCard[];
  return cards.some((c) => payment(p, c) !== null);
}

function finishGame(st: GgState): void {
  st.phase = 'over';
  const score = (s: Seat) => pointsOf(st.players[s]);
  const order = st.players
    .map((_, s) => s)
    .sort((a, b) => score(b) - score(a) || st.players[a].cards.length - st.players[b].cards.length);
  st.ranking = order;
  const best = order[0];
  st.winners = order.filter(
    (s) => score(s) === score(best) && st.players[s].cards.length === st.players[best].cards.length,
  );
}

function endTurn(st: GgState): void {
  const seat = st.turn;
  if (!st.lastRound && pointsOf(st.players[seat]) >= st.options.target) {
    st.lastRound = true;
    pushEvent(st, { type: 'final', seat });
  }
  const next = (seat + 1) % st.players.length;
  if (st.lastRound && next === st.starter) {
    finishGame(st);
    return;
  }
  st.turn = next;
  st.turnNo++;
  st.phase = 'play';
  st.discard = 0;
  st.nobleChoices = [];
}

/** 动作之后：宝石超过 10 颗先退回，再看贵族，最后结束回合 */
function afterAction(st: GgState): void {
  const p = st.players[st.turn];
  const over = tokenTotal(p.tokens) - MAX_TOKENS;
  if (over > 0) {
    st.phase = 'discard';
    st.discard = over;
    return;
  }
  visitNobles(st);
}

function visitNobles(st: GgState): void {
  const p = st.players[st.turn];
  const bonus = bonusesOf(p.cards);
  const ok = st.nobles.filter((n) => nobleOk(bonus, n));
  if (ok.length > 1) {
    st.phase = 'noble';
    st.nobleChoices = ok.map((n) => n.id);
    return;
  }
  if (ok.length === 1) takeNoble(st, ok[0].id);
  endTurn(st);
}

function takeNoble(st: GgState, id: number): void {
  const i = st.nobles.findIndex((n) => n.id === id);
  const [noble] = st.nobles.splice(i, 1);
  st.players[st.turn].nobles.push(noble);
  pushEvent(st, { type: 'noble', seat: st.turn, noble });
}

export const gemguild: GameDefinition<GgState, GgAction, GgView, GgOptions> = {
  meta: {
    id: 'gemguild',
    category: 'board',
    name: '宝石商会',
    nameEn: 'Gem Guild',
    tagline: '收集宝石，买下矿脉与珠宝，迎来贵族拜访',
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 4,
    rules: [
      '宝石有五种：钻石、蓝宝石、祖母绿、红宝石、黑曜石；黄金是万能宝石。发展卡分三级（Ⅰ 矿脉、Ⅱ 工坊、Ⅲ 王冠），每级公开 4 张。',
      '每回合从四个动作中选一个：① 拿 3 颗不同颜色的宝石；② 拿 2 颗同色宝石（那种宝石至少剩 4 颗时才行）；③ 预留一张公开的发展卡或牌堆顶的一张，并拿 1 颗黄金；④ 买下一张公开的或自己预留的发展卡。',
      '买下的发展卡永久提供一颗对应颜色的折扣：以后买牌时每张该色发展卡少付一颗该色宝石。黄金可以当任意颜色用。',
      '最多同时预留 3 张牌，预留的牌只能自己买。从牌堆顶盲抽预留的牌，其他人看不到是哪张。',
      '回合结束时手里的宝石（含黄金）不能超过 10 颗，多的要退回。',
      '贵族：回合结束时，如果你的发展卡折扣满足某位贵族的要求，他会来拜访你（+3 声望），每回合最多一位。',
      '有人达到 15 声望后，打完这一轮（每人回合数相同）就结束。声望最高的获胜；同分时买的发展卡少的获胜。',
      '人数不同时宝石数量不同：2 人局每种 4 颗，3 人局 5 颗，4 人局 7 颗，黄金都是 5 颗；贵族数量为人数 + 1。',
    ],
    botDelayMs: [700, 1200],
  },
  defaultOptions: { target: 15 },
  optionFields: [
    {
      key: 'target',
      label: '目标声望',
      hint: '有人达到后打完这一轮结束',
      type: 'select',
      choices: [
        { value: 15, label: '15（标准）' },
        { value: 18, label: '18' },
        { value: 21, label: '21（长局）' },
      ],
    },
  ],

  setup({ players, options, seed }) {
    const n = players.length;
    const rng = new Rng(seed);
    // 洗牌后按位置重新编号：id 不对应固定的牌
    const all = rng.shuffle(buildDeck()).map((c, i) => ({ ...c, id: i }));
    const decks = LEVELS.map((l) => all.filter((c) => c.level === l)) as GgState['decks'];
    const market = decks.map((d) =>
      Array.from({ length: 4 }, () => d.pop() ?? null),
    ) as GgState['market'];
    const nobles = rng.shuffle(buildNobles()).slice(0, n + 1);
    const supply = GEM_SUPPLY[n] ?? 7;
    const bank = { ...emptyTokens(), gold: GOLD };
    for (const g of GEMS) bank[g] = supply;
    const starter = rng.int(n);
    return {
      options: { target: [15, 18, 21].includes(options.target) ? options.target : 15 },
      rng: rng.state,
      decks,
      market,
      nobles,
      bank,
      players: players.map((): GgPlayer => ({
        tokens: emptyTokens(),
        cards: [],
        reserved: [],
        nobles: [],
      })),
      starter,
      turn: starter,
      turnNo: 1,
      phase: 'play',
      discard: 0,
      nobleChoices: [],
      lastRound: false,
      events: [],
      eventSeq: 0,
      winners: null,
      ranking: null,
    };
  },

  activeSeats: (st) => (st.phase === 'over' ? [] : [st.turn]),

  validate(st, seat, action) {
    if (st.phase === 'over') return '本局已结束';
    if (seat !== st.turn) return '还没轮到你';
    const p = st.players[seat];
    if (st.phase === 'discard') {
      if (action.type !== 'discard') return `请先退回 ${st.discard} 颗宝石`;
      const m = action.gems as unknown;
      if (!m || typeof m !== 'object') return '无效操作';
      const g = m as Record<string, unknown>;
      if (!TOKENS.every((t) => Number.isInteger(g[t]) && (g[t] as number) >= 0)) return '无效操作';
      if (tokenTotal(action.gems) !== st.discard) return `需要退回 ${st.discard} 颗`;
      return TOKENS.every((t) => p.tokens[t] >= action.gems[t]) ? null : '手里没有这些宝石';
    }
    if (st.phase === 'noble') {
      if (action.type !== 'noble') return '请选择来拜访的贵族';
      return st.nobleChoices.includes(action.id) ? null : '这位贵族不会来';
    }
    switch (action.type) {
      case 'take':
        return takeError(st.bank, action.gems);
      case 'reserve': {
        if (p.reserved.length >= 3) return '最多同时预留 3 张';
        if (action.card !== undefined) {
          if (action.level !== undefined) return '无效操作';
          return Number.isInteger(action.card) && findInMarket(st.market, action.card)
            ? null
            : '这张牌不在桌上';
        }
        if (!LEVELS.includes(action.level as Level)) return '请选择要预留的牌';
        return st.decks[action.level! - 1].length ? null : '这一级的牌堆已经空了';
      }
      case 'buy': {
        if (!Number.isInteger(action.card)) return '无效操作';
        const card =
          findInMarket(st.market, action.card)?.card ??
          p.reserved.find((r) => r.card.id === action.card)?.card;
        if (!card) return '只能买桌上的牌或自己预留的牌';
        return payment(p, card) ? null : '宝石不够';
      }
      case 'pass':
        return canAct(st, seat) ? '还有可以做的事，不能跳过' : null;
      default:
        return '现在不能这样做';
    }
  },

  apply(prev, seat, action) {
    const st = clone(prev);
    const p = st.players[seat];
    switch (action.type) {
      case 'take': {
        const gems = emptyTokens();
        for (const g of action.gems) gems[g]++;
        addTokens(st.bank, gems, -1);
        addTokens(p.tokens, gems);
        pushEvent(st, { type: 'take', seat, gems });
        afterAction(st);
        break;
      }
      case 'reserve': {
        let card: GgCard;
        let level: Level;
        const blind = action.card === undefined;
        if (blind) {
          level = action.level!;
          card = st.decks[level - 1].pop()!;
        } else {
          const at = findInMarket(st.market, action.card!)!;
          level = at.level;
          card = at.card;
          refill(st, level, at.slot);
        }
        p.reserved.push({ card, blind });
        const gold = st.bank.gold > 0;
        if (gold) {
          st.bank.gold--;
          p.tokens.gold++;
        }
        pushEvent(st, { type: 'reserve', seat, level, card, blind, gold });
        afterAction(st);
        break;
      }
      case 'buy': {
        const at = findInMarket(st.market, action.card);
        const ri = p.reserved.findIndex((r) => r.card.id === action.card);
        const card = at ? at.card : p.reserved[ri].card;
        const paid = payment(p, card)!;
        addTokens(p.tokens, paid, -1);
        addTokens(st.bank, paid);
        p.cards.push(card);
        if (at) refill(st, at.level, at.slot);
        else p.reserved.splice(ri, 1);
        pushEvent(st, { type: 'buy', seat, card, paid, reserved: !at });
        afterAction(st);
        break;
      }
      case 'discard':
        addTokens(p.tokens, action.gems, -1);
        addTokens(st.bank, action.gems);
        pushEvent(st, { type: 'discard', seat, gems: { ...action.gems } });
        st.discard = 0;
        st.phase = 'play';
        visitNobles(st);
        break;
      case 'noble':
        takeNoble(st, action.id);
        endTurn(st);
        break;
      case 'pass':
        pushEvent(st, { type: 'pass', seat });
        endTurn(st);
        break;
    }
    return st;
  },

  view(st, seat) {
    const over = st.phase === 'over';
    return {
      seat,
      options: st.options,
      phase: st.phase,
      market: st.market,
      deckCounts: st.decks.map((d) => d.length),
      nobles: st.nobles,
      bank: st.bank,
      players: st.players.map((p, s) => ({
        tokens: p.tokens,
        cards: p.cards,
        bonuses: bonusesOf(p.cards),
        points: pointsOf(p),
        reserved: p.reserved.map((r) => (r.blind && s !== seat && !over ? null : r.card)),
        nobles: p.nobles,
      })),
      starter: st.starter,
      turn: st.turn,
      turnNo: st.turnNo,
      discard: st.discard,
      nobleChoices: st.nobleChoices,
      lastRound: st.lastRound,
      events: st.events.map((e) =>
        e.type === 'reserve' && e.blind && e.seat !== seat && !over ? { ...e, card: undefined } : e,
      ),
      winners: st.winners,
      ranking: st.ranking,
    };
  },

  isOver: (st) => st.phase === 'over',
  bot: ggBot,
  aiPrompt: ggAiPrompt,
};

export type { TokenMap };
