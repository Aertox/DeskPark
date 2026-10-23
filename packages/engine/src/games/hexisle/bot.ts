import type { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import { EDGES, HEX_VERTS, VERT_EDGES, VERT_HEXES, VERT_NEIGHBORS } from './geometry';
import {
  canPay,
  citySpots,
  roadOk,
  roadSpots,
  settlementSpots,
  tradeRates,
  vertexFree,
} from './rules';
import type { Build, HiAction, HiView, Res, ResMap } from './shared';
import { COST, PIECES, PIPS, RESOURCES, emptyRes, resTotal } from './shared';

/** 资源的相对价值：前期木材、砖块紧缺，矿石与小麦决定后期 */
const WEIGHT: Record<Res, number> = { wood: 1.1, brick: 1.1, sheep: 0.85, wheat: 1.05, ore: 1 };

type Board = Pick<
  HiView,
  'hexes' | 'ports' | 'buildings' | 'roads' | 'robber' | 'phase' | 'setupVertex'
>;

/** 自己已经能产出的资源（按点数） */
export function production(view: Board, seat: Seat): ResMap {
  const m = emptyRes();
  view.buildings.forEach((b, v) => {
    if (!b || b.owner !== seat) return;
    for (const h of VERT_HEXES[v]) {
      const hex = view.hexes[h];
      if (hex.terrain !== 'desert' && hex.num) m[hex.terrain] += PIPS[hex.num] * (b.city ? 2 : 1);
    }
  });
  return m;
}

/** 路口的价值：周围地形的点数 × 资源权重，补齐缺的资源、靠港口加分 */
export function vertexScore(view: Board, v: number, seat: Seat): number {
  const have = production(view, seat);
  let s = 0;
  const kinds = new Set<Res>();
  for (const h of VERT_HEXES[v]) {
    const hex = view.hexes[h];
    if (hex.terrain === 'desert' || !hex.num) continue;
    s += PIPS[hex.num] * WEIGHT[hex.terrain];
    kinds.add(hex.terrain);
    if (have[hex.terrain] === 0) s += 2;
  }
  s += kinds.size * 0.8;
  for (const port of view.ports) {
    if (!EDGES[port.edge].includes(v)) continue;
    if (port.kind === 'any') s += 1.2;
    else s += have[port.kind] + (kinds.has(port.kind) ? 4 : 0) >= 6 ? 2.5 : 0.6;
  }
  return s;
}

const deficit = (hand: ResMap, cost: Partial<ResMap>) =>
  RESOURCES.reduce((a, r) => a + Math.max(0, (cost[r] ?? 0) - hand[r]), 0);

/** 从某条边往外看，两步之内最好的空路口（规划道路方向） */
function edgeProspect(view: Board, e: number, from: number, seat: Seat): number {
  const far = EDGES[e][0] === from ? EDGES[e][1] : EDGES[e][0];
  let best = vertexFree(view, far) ? vertexScore(view, far, seat) : 0;
  for (const w of VERT_NEIGHBORS[far]) {
    if (w === from) continue;
    if (vertexFree(view, w)) best = Math.max(best, vertexScore(view, w, seat) * 0.85);
  }
  return best;
}

function bestRoad(view: Board, seat: Seat, rng: Rng): number | null {
  const spots = roadSpots(view, seat);
  if (!spots.length) return null;
  let best = spots[0];
  let bestScore = -Infinity;
  for (const e of spots) {
    const [a, b] = EDGES[e];
    // 从已连通的一端往外修
    const from =
      view.buildings[a]?.owner === seat ||
      VERT_EDGES[a].some((x) => x !== e && view.roads[x] === seat)
        ? a
        : b;
    const sc = edgeProspect(view, e, from, seat) + rng.next() * 0.5;
    if (sc > bestScore) {
      bestScore = sc;
      best = e;
    }
  }
  return best;
}

function bestOf(spots: number[], score: (v: number) => number): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const v of spots) {
    const s = score(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

/** 当前最想完成的建造目标：价值减去还缺几张牌 */
function goal(view: HiView, seat: Seat): Build {
  const me = view.players[seat];
  const hand = me.hand!;
  const prod = production(view, seat);
  const options: { b: Build; score: number }[] = [];
  if (me.cities < PIECES.city && citySpots(view, seat).length)
    options.push({
      b: 'city',
      score: 3 + (prod.ore + prod.wheat >= 6 ? 1 : 0) - deficit(hand, COST.city),
    });
  const spots = me.settlements < PIECES.settlement ? settlementSpots(view, seat, false) : [];
  if (spots.length) options.push({ b: 'settlement', score: 3.6 - deficit(hand, COST.settlement) });
  else if (
    me.roads < PIECES.road &&
    me.settlements < PIECES.settlement &&
    roadSpots(view, seat).length
  )
    // 没有空位：先修路去找新的地方
    options.push({ b: 'road', score: 3.2 - deficit(hand, COST.road) });
  if (view.devLeft > 0) options.push({ b: 'dev', score: 1.6 - deficit(hand, COST.dev) });
  if (!options.length) return 'dev';
  return options.sort((x, y) => y.score - x.score)[0].b;
}

/** 手里多出来、不影响目标的牌 */
function surplus(hand: ResMap, cost: Partial<ResMap>): ResMap {
  const m = emptyRes();
  for (const r of RESOURCES) m[r] = Math.max(0, hand[r] - (cost[r] ?? 0));
  return m;
}

function friendlyOk(view: HiView, hex: number): boolean {
  if (!view.options.friendly) return true;
  for (const v of HEX_VERTS[hex]) {
    const b = view.buildings[v];
    if (b && b.owner !== view.turn && view.players[b.owner].vp <= 2) return false;
  }
  return true;
}

function robberAction(view: HiView, seat: Seat, rng: Rng): HiAction {
  const leader = (s: Seat) => 1 + view.players[s].vp / 3;
  let best = -1;
  let bestScore = -Infinity;
  view.hexes.forEach((hex, h) => {
    if (h === view.robber) return;
    let sc = rng.next() * 0.2;
    const pips = hex.num ? PIPS[hex.num] : 0;
    for (const v of HEX_VERTS[h]) {
      const b = view.buildings[v];
      if (!b) continue;
      if (b.owner === seat) sc -= 8 + pips * 2;
      else
        sc += pips * (b.city ? 2 : 1) * leader(b.owner) + (view.players[b.owner].cards > 0 ? 1 : 0);
    }
    if (sc > bestScore && friendlyOk(view, h)) {
      bestScore = sc;
      best = h;
    }
  });
  if (best < 0) best = view.hexes.findIndex((_, h) => h !== view.robber);
  const victims = new Set<Seat>();
  for (const v of HEX_VERTS[best]) {
    const b = view.buildings[v];
    if (b && b.owner !== seat && view.players[b.owner].cards > 0) victims.add(b.owner);
  }
  const list = [...victims].sort(
    (a, b) =>
      view.players[b].vp - view.players[a].vp || view.players[b].cards - view.players[a].cards,
  );
  return list.length
    ? { type: 'robber', hex: best, victim: list[0] }
    : { type: 'robber', hex: best };
}

function discardAction(view: HiView, seat: Seat): HiAction {
  const hand = { ...view.players[seat].hand! };
  const keep = COST[goal(view, seat)];
  const out = emptyRes();
  for (let i = 0; i < view.discard[seat]; i++) {
    // 先丢最多、又不是目标需要的
    const r = [...RESOURCES]
      .filter((x) => hand[x] > 0)
      .sort(
        (a, b) => hand[b] - (keep[b] ?? 0) - (hand[a] - (keep[a] ?? 0)) || hand[b] - hand[a],
      )[0];
    hand[r]--;
    out[r]++;
  }
  return { type: 'discard', cards: out };
}

function respondTrade(view: HiView, seat: Seat): HiAction {
  const t = view.trade!;
  const hand = view.players[seat].hand!;
  if (!canPay(hand, t.want)) return { type: 'reject' };
  // 不帮快赢的人
  if (view.players[t.from].vp >= view.options.target - 2) return { type: 'reject' };
  const cost = COST[goal(view, seat)];
  const after = { ...hand };
  for (const r of RESOURCES) after[r] += t.give[r] - t.want[r];
  const better = deficit(after, cost) < deficit(hand, cost);
  const fair = resTotal(t.give) >= resTotal(t.want);
  return better && fair ? { type: 'accept' } : { type: 'reject' };
}

function devAction(view: HiView, seat: Seat, beforeRoll: boolean): HiAction | null {
  if (view.devPlayed) return null;
  const me = view.players[seat];
  const ready = (k: string) => me.devs!.some((d) => d.kind === k && d.bought < view.turnNo);
  const blocked = HEX_VERTS[view.robber].some((v) => view.buildings[v]?.owner === seat);
  if (ready('knight')) {
    const holder = view.largestArmy;
    const army =
      me.knights + 1 >= 3 &&
      (holder === null || (holder !== seat && me.knights + 1 > view.players[holder].knights));
    if (blocked || army) return { type: 'dev', kind: 'knight' };
  }
  if (beforeRoll) return null;
  const hand = me.hand!;
  const cost = COST[goal(view, seat)];
  if (ready('plenty')) {
    const need: Res[] = [];
    for (const r of RESOURCES) for (let i = hand[r]; i < (cost[r] ?? 0); i++) need.push(r);
    if (need.length >= 1 && need.length <= 2) {
      const res = [need[0], need[1] ?? need[0]];
      const m = emptyRes();
      for (const r of res) m[r]++;
      if (canPay(view.bank, m)) return { type: 'dev', kind: 'plenty', res };
    }
  }
  if (ready('monopoly')) {
    const others = view.players.reduce((a, p, s) => (s === seat ? a : a + p.cards), 0);
    const want = RESOURCES.find((r) => (cost[r] ?? 0) > hand[r]);
    if (want && others >= 8) return { type: 'dev', kind: 'monopoly', res: [want] };
  }
  if (
    ready('road') &&
    me.roads <= PIECES.road - 2 &&
    settlementSpots(view, seat, false).length === 0
  )
    return { type: 'dev', kind: 'road' };
  return null;
}

export function hiBot(view: HiView, seat: Seat, rng: Rng): HiAction {
  const me = view.players[seat];
  switch (view.phase) {
    case 'setup': {
      if (view.setupVertex === null) {
        const spots = settlementSpots(view, seat, true);
        const v = bestOf(spots, (x) => vertexScore(view, x, seat) + rng.next() * 0.4)!;
        return { type: 'settle', at: v };
      }
      const from = view.setupVertex;
      const e = bestOf(
        VERT_EDGES[from].filter((x) => view.roads[x] === null),
        (x) => edgeProspect(view, x, from, seat) + rng.next() * 0.3,
      )!;
      return { type: 'road', at: e };
    }
    case 'discard':
      return discardAction(view, seat);
    case 'robber':
      return robberAction(view, seat, rng);
    case 'roll':
      return devAction(view, seat, true) ?? { type: 'roll' };
    case 'roadBuilding': {
      const e = bestRoad(view, seat, rng);
      return e === null ? { type: 'end' } : { type: 'road', at: e };
    }
    case 'main': {
      if (view.trade) return respondTrade(view, seat);
      const hand = me.hand!;
      const dev = devAction(view, seat, false);
      if (dev) return dev;
      // 能建就建：城市 > 村庄 > 发展卡 / 道路
      if (me.cities < PIECES.city && canPay(hand, COST.city)) {
        const v = bestOf(citySpots(view, seat), (x) => vertexScore(view, x, seat));
        if (v !== null) return { type: 'city', at: v };
      }
      const spots = me.settlements < PIECES.settlement ? settlementSpots(view, seat, false) : [];
      if (spots.length && canPay(hand, COST.settlement)) {
        return { type: 'settle', at: bestOf(spots, (x) => vertexScore(view, x, seat))! };
      }
      const g = goal(view, seat);
      // 没有空位时修路找地方；快拿到最长道路时也修
      const roadUseful = !spots.length || (view.longestRoad !== seat && me.roadLength >= 4);
      if (me.roads < PIECES.road && canPay(hand, COST.road) && roadUseful && g !== 'city') {
        const e = bestRoad(view, seat, rng);
        if (e !== null) return { type: 'road', at: e };
      }
      if (view.devLeft > 0 && canPay(hand, COST.dev) && (g === 'dev' || resTotal(hand) >= 7))
        return { type: 'buy' };
      // 用多余的牌和银行 / 港口换缺的
      const cost = COST[g];
      const missing = RESOURCES.filter((r) => (cost[r] ?? 0) > hand[r]);
      if (missing.length) {
        const rates = tradeRates(view, seat);
        const extra = surplus(hand, cost);
        const give = RESOURCES.filter((r) => extra[r] >= rates[r]).sort(
          (a, b) => extra[b] - extra[a],
        )[0];
        if (give && view.bank[missing[0]] > 0) return { type: 'bank', give, get: missing[0] };
        // 向其他玩家发起 1:1 交易
        if (view.offersThisTurn < 1 && deficit(hand, cost) <= 2) {
          const spare = RESOURCES.filter((r) => extra[r] > 0).sort(
            (a, b) => extra[b] - extra[a],
          )[0];
          if (spare) {
            const give2 = emptyRes();
            const want2 = emptyRes();
            give2[spare] = 1;
            want2[missing[0]] = 1;
            return { type: 'offer', give: give2, want: want2 };
          }
        }
      }
      // 手牌太多容易被强盗弃掉：有路可修就修
      if (resTotal(hand) > 7 && me.roads < PIECES.road && canPay(hand, COST.road)) {
        const e = bestRoad(view, seat, rng);
        if (e !== null && roadOk(view, e, seat)) return { type: 'road', at: e };
      }
      return { type: 'end' };
    }
    default:
      return { type: 'end' };
  }
}
