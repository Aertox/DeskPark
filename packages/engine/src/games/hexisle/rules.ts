import { Rng } from '../../core/rng';
import type { Seat } from '../../core/types';
import {
  EDGES,
  HEX_NEIGHBORS,
  HEX_VERTS,
  PORT_EDGES,
  VERT_EDGES,
  VERT_HEXES,
  VERT_NEIGHBORS,
  VERTICES,
} from './geometry';
import type { Build, HiHex, HiPort, HiState, Res, ResMap, Terrain } from './shared';
import { COST, PIECES, RESOURCES, emptyRes } from './shared';

const TERRAINS: Terrain[] = [
  ...Array<Terrain>(4).fill('wood'),
  ...Array<Terrain>(4).fill('sheep'),
  ...Array<Terrain>(4).fill('wheat'),
  ...Array<Terrain>(3).fill('brick'),
  ...Array<Terrain>(3).fill('ore'),
  'desert',
];
const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORT_KINDS: HiPort['kind'][] = [
  'any',
  'any',
  'any',
  'any',
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
];

/** 随机地图：地形与数字打乱，6 和 8 不相邻，港口类型随机 */
export function makeBoard(rng: Rng): { hexes: HiHex[]; ports: HiPort[]; robber: number } {
  const terrains = rng.shuffle([...TERRAINS]);
  let hexes: HiHex[] = [];
  for (let tries = 0; tries < 500; tries++) {
    const nums = rng.shuffle([...NUMBERS]);
    let i = 0;
    hexes = terrains.map((t) => ({ terrain: t, num: t === 'desert' ? null : nums[i++] }));
    const hot = (h: number) => hexes[h].num === 6 || hexes[h].num === 8;
    const ok = hexes.every((_, h) => !hot(h) || HEX_NEIGHBORS[h].every((j) => !hot(j)));
    if (ok) break;
  }
  const kinds = rng.shuffle([...PORT_KINDS]);
  const ports = PORT_EDGES.map((edge, i) => ({ edge, kind: kinds[i] }));
  return { hexes, ports, robber: hexes.findIndex((h) => h.terrain === 'desert') };
}

export const canPay = (hand: ResMap, cost: Partial<ResMap>) =>
  RESOURCES.every((r) => hand[r] >= (cost[r] ?? 0));
export function pay(hand: ResMap, bank: ResMap, cost: Partial<ResMap>): void {
  for (const r of RESOURCES) {
    const n = cost[r] ?? 0;
    hand[r] -= n;
    bank[r] += n;
  }
}
export function isResMap(x: unknown): x is ResMap {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const m = x as Record<string, unknown>;
  return RESOURCES.every(
    (r) => Number.isInteger(m[r]) && (m[r] as number) >= 0 && (m[r] as number) <= 19,
  );
}

/** 路口是否满足距离规则：自己和相邻路口都没有建筑 */
export const vertexFree = (st: Pick<HiState, 'buildings'>, v: number) =>
  !st.buildings[v] && VERT_NEIGHBORS[v].every((n) => !st.buildings[n]);

/** 路口挨着自己的道路 */
export const touchesOwnRoad = (st: Pick<HiState, 'roads'>, v: number, seat: Seat) =>
  VERT_EDGES[v].some((e) => st.roads[e] === seat);

/** 能不能在这条边修路：和自己的建筑或道路相连（中间不能隔着别人的建筑） */
export function roadOk(st: Pick<HiState, 'roads' | 'buildings'>, e: number, seat: Seat): boolean {
  if (st.roads[e] !== null) return false;
  return EDGES[e].some((v) => {
    const b = st.buildings[v];
    if (b) return b.owner === seat;
    return VERT_EDGES[v].some((x) => x !== e && st.roads[x] === seat);
  });
}

export function settlementSpots(
  st: Pick<HiState, 'buildings' | 'roads'>,
  seat: Seat,
  setup: boolean,
): number[] {
  return VERTICES.map((_, v) => v).filter(
    (v) => vertexFree(st, v) && (setup || touchesOwnRoad(st, v, seat)),
  );
}
export function roadSpots(
  st: Pick<HiState, 'phase' | 'setupVertex' | 'roads' | 'buildings'>,
  seat: Seat,
): number[] {
  if (st.phase === 'setup') {
    const v = st.setupVertex;
    return v === null ? [] : VERT_EDGES[v].filter((e) => st.roads[e] === null);
  }
  return EDGES.map((_, e) => e).filter((e) => roadOk(st, e, seat));
}
export function citySpots(st: Pick<HiState, 'buildings'>, seat: Seat): number[] {
  return st.buildings
    .map((b, v) => (b && b.owner === seat && !b.city ? v : -1))
    .filter((v) => v >= 0);
}

/** 还能不能建（棋子是否用完、钱够不够） */
export function canAfford(st: HiState, seat: Seat, what: Build): boolean {
  const p = st.players[seat];
  if (what === 'road' && p.roads >= PIECES.road) return false;
  if (what === 'settlement' && p.settlements >= PIECES.settlement) return false;
  if (what === 'city' && p.cities >= PIECES.city) return false;
  if (what === 'dev' && st.devDeck.length === 0) return false;
  return canPay(p.hand, COST[what]);
}

/** 某位玩家的最长连续道路（被别人的建筑截断） */
export function longestRoadOf(st: Pick<HiState, 'roads' | 'buildings'>, seat: Seat): number {
  const mine = EDGES.map((_, e) => e).filter((e) => st.roads[e] === seat);
  if (!mine.length) return 0;
  let best = 0;
  const used = new Set<number>();
  const blocked = (v: number) => {
    const b = st.buildings[v];
    return !!b && b.owner !== seat;
  };
  const walk = (v: number, len: number) => {
    best = Math.max(best, len);
    if (blocked(v)) return;
    for (const e of VERT_EDGES[v]) {
      if (st.roads[e] !== seat || used.has(e)) continue;
      used.add(e);
      const [a, b] = EDGES[e];
      walk(a === v ? b : a, len + 1);
      used.delete(e);
    }
  };
  for (const e of mine) {
    for (const start of EDGES[e]) {
      used.clear();
      used.add(e);
      const [a, b] = EDGES[e];
      walk(a === start ? b : a, 1);
    }
  }
  return best;
}

/** 公开分数：村庄 1、城市 2、最长道路 2、最大军队 2（不含分数卡） */
export function publicVp(st: HiState, seat: Seat): number {
  const p = st.players[seat];
  return (
    p.settlements +
    p.cities * 2 +
    (st.longestRoad === seat ? 2 : 0) +
    (st.largestArmy === seat ? 2 : 0)
  );
}
export function totalVp(st: HiState, seat: Seat): number {
  return publicVp(st, seat) + st.players[seat].devs.filter((d) => d.kind === 'vp').length;
}

/** 海港兑换比例：默认 4:1，有通用港口 3:1，有对应资源港口 2:1 */
export function tradeRates(st: Pick<HiState, 'ports' | 'buildings'>, seat: Seat): ResMap {
  const rates = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
  for (const port of st.ports) {
    const owned = EDGES[port.edge].some((v) => st.buildings[v]?.owner === seat);
    if (!owned) continue;
    if (port.kind === 'any') for (const r of RESOURCES) rates[r] = Math.min(rates[r], 3);
    else rates[port.kind] = 2;
  }
  return rates;
}

/** 强盗放到这块地上能抢谁（手里有牌的对手） */
export function robberVictims(st: HiState, hex: number, seat: Seat): Seat[] {
  const out = new Set<Seat>();
  for (const v of HEX_VERTS[hex]) {
    const b = st.buildings[v];
    if (b && b.owner !== seat && RESOURCES.some((r) => st.players[b.owner].hand[r] > 0))
      out.add(b.owner);
  }
  return [...out];
}

/** 掷出点数后的产出（考虑强盗与银行存量） */
export function production(st: HiState, roll: number): { gains: ResMap[]; blocked: Res[] } {
  const want = st.players.map(() => emptyRes());
  st.hexes.forEach((h, i) => {
    if (h.num !== roll || i === st.robber || h.terrain === 'desert') return;
    for (const v of HEX_VERTS[i]) {
      const b = st.buildings[v];
      if (b) want[b.owner][h.terrain] += b.city ? 2 : 1;
    }
  });
  const blocked: Res[] = [];
  for (const r of RESOURCES) {
    const total = want.reduce((a, m) => a + m[r], 0);
    if (total <= st.bank[r]) continue;
    // 银行不够：只有一人需要时给剩下的，否则谁都拿不到
    const takers = want.filter((m) => m[r] > 0);
    if (takers.length === 1) takers[0][r] = st.bank[r];
    else {
      for (const m of want) m[r] = 0;
      blocked.push(r);
    }
  }
  return { gains: want, blocked };
}

/** 开局第二个村庄带来的起始资源 */
export function startingGains(st: HiState, v: number): ResMap {
  const m = emptyRes();
  for (const h of VERT_HEXES[v]) {
    const t = st.hexes[h].terrain;
    if (t !== 'desert') m[t]++;
  }
  return m;
}

export function randomCard(hand: ResMap, rng: Rng): Res | null {
  const pool = RESOURCES.flatMap((r) => Array<Res>(hand[r]).fill(r));
  return pool.length ? rng.pick(pool) : null;
}
