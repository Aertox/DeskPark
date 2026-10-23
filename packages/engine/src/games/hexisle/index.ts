import { clone } from '../../core/clone';
import { Rng } from '../../core/rng';
import type { GameDefinition, Seat } from '../../core/types';
import { SYSTEM_SEAT } from '../../core/types';
import { hiAiPrompt } from './ai';
import { hiBot } from './bot';
import { HEX_VERTS, VERT_EDGES } from './geometry';
import {
  canAfford,
  canPay,
  citySpots,
  isResMap,
  longestRoadOf,
  makeBoard,
  pay,
  production,
  randomCard,
  roadOk,
  roadSpots,
  robberVictims,
  startingGains,
  totalVp,
  publicVp,
  tradeRates,
  vertexFree,
  touchesOwnRoad,
} from './rules';
import type { DevKind, HiAction, HiEvent, HiOptions, HiState, HiView, ResMap } from './shared';
import {
  BANK_SIZE,
  COST,
  DEV_DECK,
  MAX_HAND_SAFE,
  MAX_OFFERS,
  PIECES,
  RESOURCES,
  emptyRes,
  resTotal,
} from './shared';

export * from './shared';
export * as geo from './geometry';
export {
  canAfford,
  citySpots,
  production,
  longestRoadOf,
  publicVp,
  roadSpots,
  robberVictims,
  settlementSpots,
  totalVp,
  tradeRates,
} from './rules';

/**
 * 拓岛记：开垦荒岛的资源经营游戏，规则参考经典的六边形拓荒桌游（基础版官方规则）。
 *
 * - 19 块地形（森林、丘陵、牧场、麦田、山脉各若干与一块沙漠）随机摆放，6 / 8 不相邻；9 个港口。
 * - 开局蛇形顺序各放 2 个村庄和 2 条道路，第二个村庄旁的地形各给 1 张资源。
 * - 轮到你时掷两颗骰子，点数对应的地形给旁边的村庄 1 张、城市 2 张资源（强盗所在的地块不产出）。
 * - 掷出 7：手牌超过 7 张的人弃一半，掷骰者移动强盗并抽一张牌。
 * - 用资源修路、建村庄、升级城市、买发展卡；可以和银行 / 港口兑换，也可以和其他玩家交易。
 * - 村庄 1 分、城市 2 分、最长道路（至少 5 段）2 分、最大军队（至少 3 张骑士）2 分、分数卡 1 分；
 *   轮到自己时达到 10 分获胜。
 */

type EventInput = HiEvent extends infer E ? (E extends unknown ? Omit<E, 'seq'> : never) : never;
function pushEvent(st: HiState, e: EventInput): void {
  st.events.push({ ...e, seq: ++st.eventSeq } as HiEvent);
  if (st.events.length > 24) st.events.shift();
}

const n = (st: HiState) => st.players.length;
/** 发起的交易没人回应时，系统自动结束的时间 */
export const TRADE_MS = 12000;
const PLAYABLE: readonly Exclude<DevKind, 'vp'>[] = ['knight', 'road', 'plenty', 'monopoly'];

function updateLongestRoad(st: HiState): void {
  st.players.forEach((p, s) => (p.roadLength = longestRoadOf(st, s)));
  const lengths = st.players.map((p) => p.roadLength);
  const max = Math.max(...lengths);
  const prev = st.longestRoad;
  let next: Seat | null;
  if (max < 5) next = null;
  else if (prev !== null && lengths[prev] === max) next = prev;
  else {
    const top = lengths.map((l, s) => (l === max ? s : -1)).filter((s) => s >= 0);
    // 并列最长时谁都拿不到（原持有者被截断后并列，牌放回去）
    next = top.length === 1 ? top[0] : null;
  }
  if (next !== prev) {
    st.longestRoad = next;
    pushEvent(st, { type: 'award', seat: next, what: 'road' });
  }
}

function updateArmy(st: HiState, seat: Seat): void {
  const k = st.players[seat].knights;
  const holder = st.largestArmy;
  if (holder === seat || k < 3) return;
  if (holder === null || k > st.players[holder].knights) {
    st.largestArmy = seat;
    pushEvent(st, { type: 'award', seat, what: 'army' });
  }
}

function checkWin(st: HiState): void {
  if (st.phase === 'over' || st.phase === 'setup') return;
  if (totalVp(st, st.turn) < st.options.target) return;
  st.phase = 'over';
  st.winner = st.turn;
  st.trade = null;
  st.ranking = st.players
    .map((_, s) => s)
    .sort(
      (a, b) =>
        (b === st.turn ? 1 : 0) - (a === st.turn ? 1 : 0) || totalVp(st, b) - totalVp(st, a),
    );
}

function roll(st: HiState): [number, number] {
  const rng = new Rng(st.rng);
  const d: [number, number] = [1 + rng.int(6), 1 + rng.int(6)];
  st.rng = rng.state;
  return d;
}

function playableDev(st: HiState, seat: Seat, kind: DevKind): number {
  return st.players[seat].devs.findIndex((d) => d.kind === kind && d.bought < st.turnNo);
}

function validateDev(
  st: HiState,
  seat: Seat,
  action: Extract<HiAction, { type: 'dev' }>,
): string | null {
  if (!PLAYABLE.includes(action.kind)) return '没有这种发展卡';
  if (st.devPlayed) return '每回合只能打出一张发展卡';
  if (playableDev(st, seat, action.kind) < 0) return '没有可以打出的这张牌（刚买的牌下回合才能用）';
  const res = action.res;
  if (action.kind === 'plenty') {
    if (!Array.isArray(res) || res.length !== 2 || !res.every((r) => RESOURCES.includes(r)))
      return '请选择两张资源';
    const need = emptyRes();
    for (const r of res) need[r]++;
    if (!canPay(st.bank, need)) return '银行里没有这么多';
  }
  if (action.kind === 'monopoly') {
    if (!Array.isArray(res) || res.length !== 1 || !RESOURCES.includes(res[0]))
      return '请选择一种资源';
  }
  return null;
}

function applyDev(st: HiState, seat: Seat, action: Extract<HiAction, { type: 'dev' }>): void {
  const p = st.players[seat];
  p.devs.splice(playableDev(st, seat, action.kind), 1);
  st.devPlayed = true;
  const back = st.phase === 'roll' ? 'roll' : 'main';
  switch (action.kind) {
    case 'knight':
      p.knights++;
      pushEvent(st, { type: 'dev', seat, kind: 'knight' });
      updateArmy(st, seat);
      st.afterRobber = back;
      st.phase = 'robber';
      break;
    case 'road':
      pushEvent(st, { type: 'dev', seat, kind: 'road' });
      st.freeRoads = Math.min(2, PIECES.road - p.roads);
      st.afterRoads = back;
      if (st.freeRoads > 0 && roadSpots(st, seat).length) st.phase = 'roadBuilding';
      else st.freeRoads = 0;
      break;
    case 'plenty':
      for (const r of action.res!) {
        st.bank[r]--;
        p.hand[r]++;
      }
      pushEvent(st, { type: 'dev', seat, kind: 'plenty', res: [...action.res!] });
      break;
    case 'monopoly': {
      const r = action.res![0];
      let taken = 0;
      st.players.forEach((q, s) => {
        if (s === seat) return;
        taken += q.hand[r];
        q.hand[r] = 0;
      });
      p.hand[r] += taken;
      pushEvent(st, { type: 'dev', seat, kind: 'monopoly', res: [r], taken });
      break;
    }
  }
}

function startTurn(st: HiState, seat: Seat): void {
  st.turn = seat;
  st.turnNo++;
  st.phase = 'roll';
  st.dice = null;
  st.devPlayed = false;
  st.offersThisTurn = 0;
  st.trade = null;
  st.freeRoads = 0;
}

export const hexisle: GameDefinition<HiState, HiAction, HiView, HiOptions> = {
  meta: {
    id: 'hexisle',
    category: 'board',
    name: '拓岛记',
    nameEn: 'Hex Isles',
    tagline: '开垦荒岛，修路建城，先到 10 分',
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 4,
    rules: [
      '19 块地形：森林产木材、丘陵产砖块、牧场产羊毛、麦田产小麦、山脉产矿石，另有一块沙漠（强盗起点）。地形上的数字是掷骰点数，6 和 8 最常出现。',
      '开局按蛇形顺序（1→4，再 4→1）各放 2 个村庄和 2 条相连的道路；第二个村庄旁的地形各给 1 张资源。村庄之间至少隔两段路。',
      '轮到你时先掷两颗骰子：点数对应的地形给旁边的村庄 1 张、城市 2 张资源，强盗所在的地块不产出。',
      '掷出 7：手牌超过 7 张的人弃掉一半（向下取整），掷骰者把强盗移到别的地块，并从那块地旁的一位玩家手里随机抽一张牌。',
      '建造：道路 = 木材 + 砖块；村庄 = 木材 + 砖块 + 羊毛 + 小麦（要连着自己的道路）；城市 = 2 小麦 + 3 矿石（升级自己的村庄）；发展卡 = 羊毛 + 小麦 + 矿石。',
      '交易：任意 4 张同种资源换银行 1 张；在 3:1 港口或对应资源的 2:1 港口有村庄 / 城市，兑换更便宜。也可以向其他玩家发起交易，最先接受的人成交。',
      '发展卡：骑士（移动强盗并抽牌）、道路建设（免费 2 条路）、丰收之年（拿 2 张资源）、垄断（拿走所有人的某种资源）、分数卡（1 分）。每回合最多打出一张，刚买的牌下回合才能用。',
      '计分：村庄 1 分、城市 2 分；最长连续道路（至少 5 段）2 分；最大军队（至少 3 张骑士）2 分；分数卡各 1 分。轮到自己时达到 10 分即获胜。',
    ],
    botDelayMs: [700, 1300],
  },
  defaultOptions: { target: 10, friendly: false },
  optionFields: [
    {
      key: 'target',
      label: '获胜分数',
      hint: '轮到自己时达到即获胜',
      type: 'select',
      choices: [
        { value: 8, label: '8 分' },
        { value: 10, label: '10 分' },
        { value: 12, label: '12 分' },
      ],
    },
    {
      key: 'friendly',
      label: '友好强盗',
      hint: '强盗不能放到只有 2 分的玩家旁边，新手更友好',
      type: 'toggle',
    },
  ],

  setup({ players, options, seed }) {
    const count = players.length;
    const rng = new Rng(seed);
    const board = makeBoard(rng);
    const devDeck = rng.shuffle(
      (Object.keys(DEV_DECK) as DevKind[]).flatMap((k) => Array<DevKind>(DEV_DECK[k]).fill(k)),
    );
    const first = rng.int(count);
    const order = Array.from({ length: count }, (_, i) => (first + i) % count);
    return {
      options: {
        target: [8, 10, 12].includes(options.target) ? options.target : 10,
        friendly: options.friendly === true,
      },
      rng: rng.state,
      hexes: board.hexes,
      ports: board.ports,
      robber: board.robber,
      buildings: Array(54).fill(null),
      roads: Array(72).fill(null),
      players: players.map(() => ({
        hand: emptyRes(),
        devs: [],
        knights: 0,
        roads: 0,
        settlements: 0,
        cities: 0,
        roadLength: 0,
      })),
      bank: {
        wood: BANK_SIZE,
        brick: BANK_SIZE,
        sheep: BANK_SIZE,
        wheat: BANK_SIZE,
        ore: BANK_SIZE,
      },
      devDeck,
      phase: 'setup',
      setupOrder: [...order, ...[...order].reverse()],
      setupStep: 0,
      setupVertex: null,
      turn: first,
      turnNo: 0,
      dice: null,
      discard: players.map(() => 0),
      afterRobber: 'main',
      devPlayed: false,
      freeRoads: 0,
      afterRoads: 'main',
      longestRoad: null,
      largestArmy: null,
      trade: null,
      offersThisTurn: 0,
      events: [],
      eventSeq: 0,
      winner: null,
      ranking: null,
    };
  },

  activeSeats(st) {
    switch (st.phase) {
      case 'setup':
        return [st.setupOrder[st.setupStep]];
      case 'discard':
        return st.discard.map((d, s) => (d > 0 ? s : -1)).filter((s) => s >= 0);
      case 'over':
        return [];
      case 'main':
        // 交易进行中只等回应的人；没人理会时由系统自动结束
        return st.trade ? [...st.trade.waiting] : [st.turn];
      default:
        return [st.turn];
    }
  },

  autoAdvance(st) {
    return st.phase === 'main' && st.trade
      ? { delayMs: TRADE_MS, action: { type: 'cancel' } }
      : null;
  },

  validate(st, seat, action) {
    if (st.phase === 'over') return '本局已结束';
    if (seat === SYSTEM_SEAT) return action.type === 'cancel' && st.trade ? null : '无效操作';
    const p = st.players[seat];
    if (!p) return '无效座位';
    const int = (x: unknown, max: number) =>
      Number.isInteger(x) && (x as number) >= 0 && (x as number) < max;
    switch (st.phase) {
      case 'setup':
        if (st.setupVertex === null) {
          if (action.type !== 'settle') return '请先放一个村庄';
          return int(action.at, 54) && vertexFree(st, action.at)
            ? null
            : '这里不能建村庄（村庄之间至少隔两段路）';
        }
        if (action.type !== 'road') return '请在村庄旁修一条路';
        return int(action.at, 72) &&
          VERT_EDGES[st.setupVertex].includes(action.at) &&
          st.roads[action.at] === null
          ? null
          : '道路要连着刚放的村庄';
      case 'discard': {
        if (action.type !== 'discard') return '请先弃牌';
        if (!isResMap(action.cards)) return '无效操作';
        if (resTotal(action.cards) !== st.discard[seat]) return `需要弃掉 ${st.discard[seat]} 张`;
        return canPay(p.hand, action.cards) ? null : '手里没有这些牌';
      }
      case 'robber': {
        if (seat !== st.turn) return '还没轮到你';
        if (action.type !== 'robber') return '请先移动强盗';
        if (!int(action.hex, 19) || action.hex === st.robber) return '强盗要移到另一块地上';
        if (st.options.friendly) {
          const weak = robberVictimsAll(st, action.hex).some((s) => publicVp(st, s) <= 2);
          if (weak && hasStrongSpot(st)) return '友好强盗：不能放到只有 2 分的玩家旁边';
        }
        const victims = robberVictims(st, action.hex, seat);
        if (victims.length) {
          if (!victims.includes(action.victim as Seat)) return '请选择要抽牌的玩家';
        } else if (action.victim !== undefined) return '这里没有可以抽牌的人';
        return null;
      }
      case 'roll':
        if (seat !== st.turn) return '还没轮到你';
        if (action.type === 'roll') return null;
        if (action.type === 'dev') return validateDev(st, seat, action);
        return '请先掷骰子';
      case 'roadBuilding':
        if (seat !== st.turn) return '还没轮到你';
        if (action.type === 'end') return null;
        if (action.type !== 'road') return '请先修完免费的道路';
        return int(action.at, 72) && roadOk(st, action.at, seat) ? null : '这里不能修路';
      case 'main': {
        const t = st.trade;
        if (t) {
          if (!t.waiting.includes(seat)) return '等待其他人回应交易';
          if (action.type === 'reject') return null;
          if (action.type === 'accept') return canPay(p.hand, t.want) ? null : '你的资源不够';
          return '请回应交易';
        }
        if (seat !== st.turn) return '还没轮到你';
        switch (action.type) {
          case 'settle':
            if (!canAfford(st, seat, 'settlement')) return '资源不够或村庄已经用完';
            return int(action.at, 54) &&
              vertexFree(st, action.at) &&
              touchesOwnRoad(st, action.at, seat)
              ? null
              : '这里不能建村庄';
          case 'road':
            if (!canAfford(st, seat, 'road')) return '资源不够或道路已经用完';
            return int(action.at, 72) && roadOk(st, action.at, seat) ? null : '这里不能修路';
          case 'city':
            if (!canAfford(st, seat, 'city')) return '资源不够或城市已经用完';
            return int(action.at, 54) && citySpots(st, seat).includes(action.at)
              ? null
              : '只能升级自己的村庄';
          case 'buy':
            return canAfford(st, seat, 'dev') ? null : '资源不够或发展卡已经卖完';
          case 'dev':
            return validateDev(st, seat, action);
          case 'bank': {
            if (!RESOURCES.includes(action.give) || !RESOURCES.includes(action.get))
              return '无效操作';
            if (action.give === action.get) return '不能换同一种资源';
            const rate = tradeRates(st, seat)[action.give];
            if (p.hand[action.give] < rate) return `需要 ${rate} 张才能换`;
            return st.bank[action.get] > 0 ? null : '银行没有这种资源了';
          }
          case 'offer': {
            if (!isResMap(action.give) || !isResMap(action.want)) return '无效操作';
            if (!resTotal(action.give) || !resTotal(action.want)) return '要写清楚给什么、换什么';
            if (RESOURCES.some((r) => action.give[r] && action.want[r]))
              return '不能用同一种资源换自己';
            if (st.offersThisTurn >= MAX_OFFERS) return `每回合最多发起 ${MAX_OFFERS} 次交易`;
            return canPay(p.hand, action.give) ? null : '你的资源不够';
          }
          case 'end':
            return null;
          default:
            return '现在不能这样做';
        }
      }
      default:
        return '现在不能这样做';
    }
  },

  apply(prev, seat, action) {
    const st = clone(prev);
    const p = st.players[seat];
    switch (action.type) {
      case 'settle': {
        st.buildings[action.at] = { owner: seat, city: false };
        p.settlements++;
        pushEvent(st, { type: 'place', seat, what: 'settlement', at: action.at });
        if (st.phase === 'setup') {
          st.setupVertex = action.at;
          if (st.setupStep >= n(st)) {
            const gains = startingGains(st, action.at);
            for (const r of RESOURCES) {
              p.hand[r] += gains[r];
              st.bank[r] -= gains[r];
            }
          }
        } else {
          pay(p.hand, st.bank, COST.settlement);
        }
        // 新村庄可能截断别人的道路
        updateLongestRoad(st);
        break;
      }
      case 'road': {
        st.roads[action.at] = seat;
        p.roads++;
        pushEvent(st, { type: 'place', seat, what: 'road', at: action.at });
        if (st.phase === 'setup') {
          st.setupVertex = null;
          st.setupStep++;
          if (st.setupStep >= st.setupOrder.length) startTurn(st, st.setupOrder[0]);
          else st.turn = st.setupOrder[st.setupStep];
        } else if (st.phase === 'roadBuilding') {
          st.freeRoads--;
          if (st.freeRoads <= 0 || !roadSpots(st, seat).length) {
            st.freeRoads = 0;
            st.phase = st.afterRoads;
          }
        } else {
          pay(p.hand, st.bank, COST.road);
        }
        updateLongestRoad(st);
        break;
      }
      case 'city':
        pay(p.hand, st.bank, COST.city);
        st.buildings[action.at] = { owner: seat, city: true };
        p.settlements--;
        p.cities++;
        pushEvent(st, { type: 'place', seat, what: 'city', at: action.at });
        break;
      case 'roll': {
        const dice = roll(st);
        st.dice = dice;
        pushEvent(st, { type: 'roll', seat, dice });
        const sum = dice[0] + dice[1];
        if (sum === 7) {
          st.discard = st.players.map((q) => {
            const c = resTotal(q.hand);
            return c > MAX_HAND_SAFE ? Math.floor(c / 2) : 0;
          });
          st.afterRobber = 'main';
          st.phase = st.discard.some((d) => d > 0) ? 'discard' : 'robber';
        } else {
          const { gains, blocked } = production(st, sum);
          gains.forEach((g, s) => {
            for (const r of RESOURCES) {
              st.players[s].hand[r] += g[r];
              st.bank[r] -= g[r];
            }
          });
          pushEvent(st, { type: 'produce', gains, blocked });
          st.phase = 'main';
        }
        break;
      }
      case 'discard':
        pay(p.hand, st.bank, action.cards);
        st.discard[seat] = 0;
        pushEvent(st, { type: 'discard', seat, cards: { ...action.cards } });
        if (st.discard.every((d) => d === 0)) st.phase = 'robber';
        break;
      case 'robber': {
        st.robber = action.hex;
        pushEvent(st, { type: 'robber', seat, hex: action.hex });
        if (action.victim !== undefined) {
          const victim = st.players[action.victim];
          const rng = new Rng(st.rng);
          const r = randomCard(victim.hand, rng);
          st.rng = rng.state;
          if (r) {
            victim.hand[r]--;
            p.hand[r]++;
          }
          pushEvent(st, { type: 'steal', seat, victim: action.victim, res: r ?? undefined });
        }
        st.phase = st.afterRobber;
        break;
      }
      case 'dev':
        applyDev(st, seat, action);
        break;
      case 'buy': {
        pay(p.hand, st.bank, COST.dev);
        const kind = st.devDeck.pop()!;
        p.devs.push({ kind, bought: st.turnNo });
        pushEvent(st, { type: 'buy', seat, kind });
        break;
      }
      case 'bank': {
        const rate = tradeRates(st, seat)[action.give];
        p.hand[action.give] -= rate;
        st.bank[action.give] += rate;
        st.bank[action.get]--;
        p.hand[action.get]++;
        pushEvent(st, { type: 'bank', seat, give: action.give, count: rate, get: action.get });
        break;
      }
      case 'offer': {
        st.offersThisTurn++;
        pushEvent(st, { type: 'offer', seat, give: { ...action.give }, want: { ...action.want } });
        // 只问付得起的人
        const waiting = st.players
          .map((q, s) => (s !== seat && canPay(q.hand, action.want) ? s : -1))
          .filter((s) => s >= 0);
        if (waiting.length) {
          st.trade = {
            from: seat,
            give: { ...action.give },
            want: { ...action.want },
            waiting,
            rejected: [],
          };
        } else {
          pushEvent(st, {
            type: 'trade',
            seat,
            partner: null,
            give: action.give,
            want: action.want,
          });
        }
        break;
      }
      case 'accept': {
        const t = st.trade!;
        const from = st.players[t.from];
        for (const r of RESOURCES) {
          from.hand[r] += t.want[r] - t.give[r];
          p.hand[r] += t.give[r] - t.want[r];
        }
        pushEvent(st, { type: 'trade', seat: t.from, partner: seat, give: t.give, want: t.want });
        st.trade = null;
        break;
      }
      case 'reject': {
        const t = st.trade!;
        t.waiting = t.waiting.filter((s) => s !== seat);
        t.rejected.push(seat);
        if (!t.waiting.length) {
          pushEvent(st, { type: 'trade', seat: t.from, partner: null, give: t.give, want: t.want });
          st.trade = null;
        }
        break;
      }
      case 'cancel': {
        const t = st.trade!;
        pushEvent(st, { type: 'trade', seat: t.from, partner: null, give: t.give, want: t.want });
        st.trade = null;
        break;
      }
      case 'end':
        if (st.phase === 'roadBuilding') {
          st.freeRoads = 0;
          st.phase = st.afterRoads;
          return st;
        }
        pushEvent(st, { type: 'end', seat });
        startTurn(st, (st.turn + 1) % n(st));
        return st;
    }
    checkWin(st);
    return st;
  },

  view(st, seat) {
    const over = st.phase === 'over';
    return {
      seat,
      options: st.options,
      hexes: st.hexes,
      ports: st.ports,
      robber: st.robber,
      buildings: st.buildings,
      roads: st.roads,
      players: st.players.map((p, s) => {
        const mine = s === seat || over;
        return {
          hand: mine ? p.hand : null,
          cards: resTotal(p.hand),
          devs: mine ? p.devs : null,
          devCount: p.devs.length,
          knights: p.knights,
          roads: p.roads,
          settlements: p.settlements,
          cities: p.cities,
          roadLength: p.roadLength,
          vp: publicVp(st, s),
          vpTotal: mine ? totalVp(st, s) : null,
        };
      }),
      bank: st.bank,
      devLeft: st.devDeck.length,
      phase: st.phase,
      setupVertex: st.setupVertex,
      setupRound: st.setupStep < n(st) ? 1 : 2,
      turn: st.turn,
      turnNo: st.turnNo,
      dice: st.dice,
      discard: st.discard,
      devPlayed: st.devPlayed,
      freeRoads: st.freeRoads,
      longestRoad: st.longestRoad,
      largestArmy: st.largestArmy,
      trade: st.trade,
      offersThisTurn: st.offersThisTurn,
      // 抽到哪张、买到什么只告诉当事人
      events: st.events.map((e) => {
        if (over) return e;
        if (e.type === 'steal' && seat !== e.seat && seat !== e.victim)
          return { ...e, res: undefined };
        if (e.type === 'buy' && seat !== e.seat) return { ...e, kind: undefined };
        return e;
      }),
      winner: st.winner,
      ranking: st.ranking,
    };
  },

  isOver: (st) => st.phase === 'over',
  bot: hiBot,
  aiPrompt: hiAiPrompt,
};

/** 这块地旁所有对手（不管手里有没有牌） */
function robberVictimsAll(st: HiState, hex: number): Seat[] {
  const out = new Set<Seat>();
  for (const v of HEX_VERTS[hex]) {
    const b = st.buildings[v];
    if (b && b.owner !== st.turn) out.add(b.owner);
  }
  return [...out];
}
/** 友好强盗：是否还有地方可放（否则不限制） */
function hasStrongSpot(st: HiState): boolean {
  return st.hexes.some(
    (_, h) => h !== st.robber && robberVictimsAll(st, h).every((s) => publicVp(st, s) > 2),
  );
}
export type { ResMap };
