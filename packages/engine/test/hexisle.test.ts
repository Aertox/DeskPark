import { describe, expect, it } from 'vitest';
import type { hi as HI } from '../src';
import { SYSTEM_SEAT, hexisle, hi, simulate } from '../src';

type State = HI.HiState;
const { EDGES, HEX_NEIGHBORS, HEX_VERTS, VERT_EDGES, VERT_NEIGHBORS } = hi.geo;
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: true }));
const res = (m: Partial<HI.ResMap> = {}): HI.ResMap => ({ ...hi.emptyRes(), ...m });

/** 跳过开局、进入第一个回合的空白局面 */
function blank(n = 3): State {
  const st = hexisle.setup({
    players: players(n),
    options: { target: 10, friendly: false },
    seed: 4,
  });
  st.phase = 'main';
  st.turn = 0;
  st.turnNo = 1;
  st.setupStep = st.setupOrder.length;
  return st;
}
const run = (st: State, seat: number, action: HI.HiAction) => {
  const err = hexisle.validate(st, seat, action);
  if (err) throw new Error(err);
  return hexisle.apply(st, seat, action);
};
const settle = (st: State, seat: number, v: number, city = false) => {
  st.buildings[v] = { owner: seat, city };
  if (city) st.players[seat].cities++;
  else st.players[seat].settlements++;
};
const road = (st: State, seat: number, e: number) => {
  st.roads[e] = seat;
  st.players[seat].roads++;
};
/** 从路口 v 出发找一条不重复经过路口的路径（深度优先） */
function path(from: number, len: number): number[] {
  const seen = new Set([from]);
  const edges: number[] = [];
  const dfs = (v: number): boolean => {
    if (edges.length === len) return true;
    for (const e of VERT_EDGES[v]) {
      const w = EDGES[e][0] === v ? EDGES[e][1] : EDGES[e][0];
      if (seen.has(w)) continue;
      seen.add(w);
      edges.push(e);
      if (dfs(w)) return true;
      edges.pop();
      seen.delete(w);
    }
    return false;
  };
  if (!dfs(from)) throw new Error('找不到路径');
  return edges;
}

describe('卡旦岛', () => {
  it('地图：19 块地形、18 个数字（6 / 8 不相邻）、9 个港口，强盗在沙漠', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const st = hexisle.setup({ players: players(4), options: hexisle.defaultOptions, seed });
      const count = (t: string) => st.hexes.filter((h) => h.terrain === t).length;
      expect([
        count('wood'),
        count('sheep'),
        count('wheat'),
        count('brick'),
        count('ore'),
        count('desert'),
      ]).toEqual([4, 4, 4, 3, 3, 1]);
      expect(
        st.hexes
          .filter((h) => h.num !== null)
          .map((h) => h.num)
          .sort((a, b) => a! - b!),
      ).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
      const hot = (h: number) => st.hexes[h].num === 6 || st.hexes[h].num === 8;
      for (let h = 0; h < 19; h++) if (hot(h)) expect(HEX_NEIGHBORS[h].some(hot)).toBe(false);
      expect(st.ports.filter((p) => p.kind === 'any')).toHaveLength(4);
      expect(new Set(st.ports.filter((p) => p.kind !== 'any').map((p) => p.kind)).size).toBe(5);
      expect(st.hexes[st.robber].terrain).toBe('desert');
      expect(st.devDeck).toHaveLength(25);
    }
  });

  it('开局：蛇形顺序，村庄守距离规则，道路连着村庄，第二个村庄拿起始资源', () => {
    let st = hexisle.setup({ players: players(3), options: hexisle.defaultOptions, seed: 2 });
    const first = st.setupOrder[0];
    expect(st.setupOrder).toEqual([
      first,
      (first + 1) % 3,
      (first + 2) % 3,
      (first + 2) % 3,
      (first + 1) % 3,
      first,
    ]);
    const seat = hexisle.activeSeats(st)[0];
    st = run(st, seat, { type: 'settle', at: 10 });
    expect(
      hexisle.validate(st, seat, {
        type: 'road',
        at: VERT_EDGES[20].find((e) => !VERT_EDGES[10].includes(e))!,
      }),
    ).toBeTruthy();
    st = run(st, seat, { type: 'road', at: VERT_EDGES[10][0] });
    const next = hexisle.activeSeats(st)[0];
    for (const v of VERT_NEIGHBORS[10])
      expect(hexisle.validate(st, next, { type: 'settle', at: v })).toContain('隔两段');
    // 跑完开局：每人 2 村 2 路，第二个村庄旁的地形各给一张
    while (st.phase === 'setup') {
      const s = hexisle.activeSeats(st)[0];
      st = hexisle.apply(
        st,
        s,
        hexisle.bot(hexisle.view(st, s), s, {
          next: () => 0.5,
          int: () => 0,
          pick: (a: unknown[]) => a[0],
        } as never),
      );
    }
    expect(st.phase).toBe('roll');
    expect(st.turn).toBe(first);
    for (const p of st.players) {
      expect(p.settlements).toBe(2);
      expect(p.roads).toBe(2);
      expect(hi.resTotal(p.hand)).toBeGreaterThan(0);
      expect(hi.resTotal(p.hand)).toBeLessThanOrEqual(3);
    }
    const inBank = hi.RESOURCES.reduce((a, r) => a + st.bank[r], 0);
    expect(inBank + st.players.reduce((a, p) => a + hi.resTotal(p.hand), 0)).toBe(95);
  });

  it('掷骰产出：村庄 1 张、城市 2 张，强盗挡住的地块不产出', () => {
    const st = blank(3);
    const h = st.hexes.findIndex((x) => x.terrain !== 'desert');
    const t = st.hexes[h].terrain as HI.Res;
    // 只让这一块地带数字 8，避免别的地块干扰
    st.hexes.forEach((x, i) => (x.num = i === h ? 8 : null));
    const [a, , c] = HEX_VERTS[h];
    settle(st, 0, a);
    settle(st, 1, c, true);
    const roll8 = (robber: number) => {
      const s2 = structuredClone(st);
      s2.robber = robber;
      s2.phase = 'roll';
      for (let seed = 1; seed < 500; seed++) {
        s2.rng = seed;
        const next = hexisle.apply(s2, 0, { type: 'roll' });
        if (next.dice![0] + next.dice![1] === 8) return next;
      }
      throw new Error('掷不出 8');
    };
    const rolled = roll8((h + 1) % 19);
    expect(rolled.players[0].hand[t]).toBe(1);
    expect(rolled.players[1].hand[t]).toBe(2);
    expect(rolled.phase).toBe('main');
    const blocked = roll8(h);
    expect(blocked.players[0].hand[t]).toBe(0);
    expect(blocked.players[1].hand[t]).toBe(0);
  });

  it('银行不够时：只有一人需要就给剩下的，多人需要则谁都拿不到', () => {
    const st = blank(3);
    const h = st.hexes.findIndex((x) => x.terrain !== 'desert');
    const t = st.hexes[h].terrain as HI.Res;
    st.hexes.forEach((x, i) => (x.num = i === h ? 9 : null));
    st.robber = (h + 1) % 19;
    const [a, , c] = HEX_VERTS[h];
    settle(st, 0, a, true);
    settle(st, 1, c, true);
    st.bank[t] = 3;
    const both = hi.production(st, 9);
    expect(both.blocked).toContain(t);
    expect(both.gains[0][t] + both.gains[1][t]).toBe(0);
    st.bank[t] = 1;
    st.buildings[c] = null;
    const single = hi.production(st, 9);
    expect(single.gains[0][t]).toBe(1);
    expect(single.blocked).toEqual([]);
  });

  it('掷出 7：超过 7 张的人弃一半，强盗必须换地方并抽一张牌（只有两人知道是哪张）', () => {
    let st = blank(3);
    st.phase = 'roll';
    st.players[1].hand = res({ wood: 5, ore: 4 });
    st.players[2].hand = res({ sheep: 3 });
    const h = st.hexes.findIndex((_, i) => i !== st.robber);
    settle(st, 2, HEX_VERTS[h][0]);
    for (let seed = 1; seed < 500; seed++) {
      st.rng = seed;
      const next = hexisle.apply(st, 0, { type: 'roll' });
      if (next.dice![0] + next.dice![1] === 7) {
        st = next;
        break;
      }
    }
    expect(st.phase).toBe('discard');
    expect(st.discard).toEqual([0, 4, 0]);
    expect(hexisle.activeSeats(st)).toEqual([1]);
    expect(hexisle.validate(st, 1, { type: 'discard', cards: res({ wood: 3 }) })).toContain('4');
    st = run(st, 1, { type: 'discard', cards: res({ wood: 2, ore: 2 }) });
    expect(st.phase).toBe('robber');
    expect(hexisle.validate(st, 0, { type: 'robber', hex: st.robber })).toBeTruthy();
    expect(hexisle.validate(st, 0, { type: 'robber', hex: h })).toContain('选择');
    st = run(st, 0, { type: 'robber', hex: h, victim: 2 });
    expect(st.robber).toBe(h);
    expect(hi.resTotal(st.players[0].hand)).toBe(1);
    expect(st.players[2].hand.sheep).toBe(2);
    expect(st.phase).toBe('main');
    const steal = (seat: number) => hexisle.view(st, seat).events.find((e) => e.type === 'steal')!;
    expect(steal(0)).toMatchObject({ res: 'sheep' });
    expect(steal(2)).toMatchObject({ res: 'sheep' });
    expect((steal(1) as { res?: string }).res).toBeUndefined();
  });

  it('建造：村庄要连着自己的道路、守距离规则；城市只能升级自己的村庄', () => {
    let st = blank(3);
    const v = 20;
    settle(st, 0, v);
    const [e1, e2] = path(v, 2);
    road(st, 0, e1);
    st.players[0].hand = res({ wood: 3, brick: 3, sheep: 1, wheat: 3, ore: 3 });
    const mid = EDGES[e1][0] === v ? EDGES[e1][1] : EDGES[e1][0];
    expect(hexisle.validate(st, 0, { type: 'settle', at: mid })).toBeTruthy(); // 离村庄太近
    st = run(st, 0, { type: 'road', at: e2 });
    const far = EDGES[e2][0] === mid ? EDGES[e2][1] : EDGES[e2][0];
    st = run(st, 0, { type: 'settle', at: far });
    expect(st.players[0].settlements).toBe(2);
    expect(st.players[0].hand).toEqual(res({ wood: 1, brick: 1, wheat: 2, ore: 3 }));
    expect(hexisle.validate(st, 0, { type: 'city', at: mid })).toBeTruthy();
    st = run(st, 0, { type: 'city', at: v });
    expect(st.buildings[v]).toEqual({ owner: 0, city: true });
    expect(st.players[0].cities).toBe(1);
    expect(hexisle.validate(st, 1, { type: 'road', at: e2 })).toBeTruthy(); // 不是他的回合
  });

  it('港口：通用港口 3:1，对应资源港口 2:1', () => {
    const st = blank(3);
    expect(hi.tradeRates(st, 0)).toEqual(res({ wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 }));
    const any = st.ports.find((p) => p.kind === 'any')!;
    const two = st.ports.find((p) => p.kind !== 'any')!;
    settle(st, 0, EDGES[any.edge][0]);
    settle(st, 0, EDGES[two.edge][1]);
    const rates = hi.tradeRates(st, 0);
    for (const r of hi.RESOURCES) expect(rates[r]).toBe(r === two.kind ? 2 : 3);
    st.players[0].hand = res({ [two.kind as HI.Res]: 2 });
    const next = run(st, 0, {
      type: 'bank',
      give: two.kind as HI.Res,
      get: two.kind === 'ore' ? 'wood' : 'ore',
    });
    expect(hi.resTotal(next.players[0].hand)).toBe(1);
  });

  it('发展卡：当回合买的不能用；骑士凑满 3 张拿最大军队；每回合只能打一张', () => {
    let st = blank(3);
    st.players[0].hand = res({ sheep: 2, wheat: 2, ore: 2 });
    st.devDeck.push('knight');
    st = run(st, 0, { type: 'buy' });
    expect(st.players[0].devs.at(-1)).toMatchObject({ kind: 'knight', bought: 1 });
    expect(hexisle.validate(st, 0, { type: 'dev', kind: 'knight' })).toContain('下回合');
    expect(hexisle.view(st, 1).events.find((e) => e.type === 'buy')).not.toHaveProperty(
      'kind',
      'knight',
    );
    st.players[0].devs = [
      { kind: 'knight', bought: 0 },
      { kind: 'knight', bought: 0 },
    ];
    st.players[0].knights = 2;
    st = run(st, 0, { type: 'dev', kind: 'knight' });
    expect(st.phase).toBe('robber');
    expect(st.largestArmy).toBe(0);
    st = run(st, 0, {
      type: 'robber',
      hex: (st.robber + 1) % 19,
      ...victimOf(st, (st.robber + 1) % 19),
    });
    expect(st.phase).toBe('main');
    expect(hexisle.validate(st, 0, { type: 'dev', kind: 'knight' })).toContain('一张');
  });

  it('丰收之年、垄断、道路建设', () => {
    let st = blank(3);
    st.players[0].devs = [
      { kind: 'plenty', bought: 0 },
      { kind: 'monopoly', bought: 0 },
      { kind: 'road', bought: 0 },
    ];
    st = run(st, 0, { type: 'dev', kind: 'plenty', res: ['ore', 'ore'] });
    expect(st.players[0].hand.ore).toBe(2);
    st.devPlayed = false;
    st.players[1].hand = res({ wheat: 3, wood: 1 });
    st.players[2].hand = res({ wheat: 2 });
    st = run(st, 0, { type: 'dev', kind: 'monopoly', res: ['wheat'] });
    expect(st.players[0].hand.wheat).toBe(5);
    expect(st.players[1].hand).toEqual(res({ wood: 1 }));
    st.devPlayed = false;
    settle(st, 0, 20);
    st = run(st, 0, { type: 'dev', kind: 'road' });
    expect(st.phase).toBe('roadBuilding');
    const spots = hi.roadSpots(st, 0);
    st = run(st, 0, { type: 'road', at: spots[0] });
    st = run(st, 0, { type: 'road', at: hi.roadSpots(st, 0)[0] });
    expect(st.phase).toBe('main');
    expect(st.players[0].roads).toBe(2);
    expect(hi.resTotal(st.players[0].hand)).toBe(7); // 免费修路
  });

  it('分数卡只有自己看得到，别人看到的公开分不含它', () => {
    const st = blank(3);
    settle(st, 0, 20);
    st.players[0].devs = [{ kind: 'vp', bought: 0 }];
    expect(hexisle.view(st, 0).players[0].vpTotal).toBe(2);
    expect(hexisle.view(st, 1).players[0].vp).toBe(1);
    expect(hexisle.view(st, 1).players[0].vpTotal).toBeNull();
    expect(hexisle.view(st, 1).players[0].devs).toBeNull();
    expect(hexisle.view(st, 1).players[0].hand).toBeNull();
  });

  it('玩家交易：只问付得起的人，最先接受的人成交；都拒绝或超时则作罢', () => {
    let st = blank(3);
    st.players[0].hand = res({ wood: 2 });
    st.players[1].hand = res({ ore: 1 });
    st.players[2].hand = res({ ore: 2 });
    const offer = { type: 'offer', give: res({ wood: 1 }), want: res({ ore: 1 }) } as const;
    st = run(st, 0, offer);
    expect(st.trade!.waiting).toEqual([1, 2]);
    expect(hexisle.activeSeats(st)).toEqual([1, 2]);
    expect(hexisle.autoAdvance!(st)).toMatchObject({ action: { type: 'cancel' } });
    const accepted = run(st, 2, { type: 'accept' });
    expect(accepted.players[0].hand).toEqual(res({ wood: 1, ore: 1 }));
    expect(accepted.players[2].hand).toEqual(res({ wood: 1, ore: 1 }));
    expect(accepted.trade).toBeNull();
    let rejected = run(st, 1, { type: 'reject' });
    rejected = run(rejected, 2, { type: 'reject' });
    expect(rejected.trade).toBeNull();
    expect(rejected.players[0].hand).toEqual(res({ wood: 2 }));
    const timeout = hexisle.apply(st, SYSTEM_SEAT, { type: 'cancel' });
    expect(timeout.trade).toBeNull();
    st.trade = null;
    st.offersThisTurn = 3;
    expect(hexisle.validate(st, 0, offer)).toContain('最多');
  });

  it('最长道路：至少 5 段得 2 分；被别人的村庄截断会失去', () => {
    let st = blank(3);
    settle(st, 0, 0);
    const edges = path(0, 6);
    for (const e of edges.slice(0, 4)) road(st, 0, e);
    st.players[0].hand = res({ wood: 2, brick: 2 });
    st = run(st, 0, { type: 'road', at: edges[4] });
    expect(st.longestRoad).toBe(0);
    expect(hexisle.view(st, 1).players[0].vp).toBe(3);
    // 1 号在道路中间建村庄，截断成 2 + 3
    let v = 0;
    const verts = [0];
    for (const e of edges.slice(0, 5)) {
      v = EDGES[e][0] === v ? EDGES[e][1] : EDGES[e][0];
      verts.push(v);
    }
    st.turn = 1;
    st.buildings[verts[2]] = { owner: 1, city: false };
    st.players[1].settlements++;
    st.players[1].hand = res({ wood: 1, brick: 1, sheep: 1, wheat: 1 });
    // 用 settle 动作触发重新计算：先给 1 号一条连到那里的路
    const link = VERT_EDGES[verts[2]].find((e) => st.roads[e] === null)!;
    st.buildings[verts[2]] = null;
    st.players[1].settlements--;
    road(st, 1, link);
    st = run(st, 1, { type: 'settle', at: verts[2] });
    expect(st.players[0].roadLength).toBe(3);
    expect(st.longestRoad).toBeNull();
  });

  it('轮到自己时达到目标分即获胜', () => {
    let st = blank(3);
    // 3 城市 + 3 村庄 = 9 分，再升级一座村庄 = 10 分
    for (const v of [0, 8, 16]) settle(st, 0, v, true);
    for (const v of [30, 40, 45]) settle(st, 0, v);
    st.players[0].hand = res({ wheat: 2, ore: 3 });
    expect(hexisle.isOver(st)).toBe(false);
    st = run(st, 0, { type: 'city', at: 45 });
    expect(st.phase).toBe('over');
    expect(st.winner).toBe(0);
    expect(st.ranking![0]).toBe(0);
  });

  it('电脑对战可以完整打完（2–4 人，含友好强盗）', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const n = 2 + (seed % 3);
      const { state } = simulate(hexisle, n, { target: 10, friendly: seed % 2 === 0 }, seed, 40000);
      expect(state.phase).toBe('over');
      expect(hi.totalVp(state, state.winner!)).toBeGreaterThanOrEqual(10);
    }
  });
});

/** 被抢者参数：那块地旁有可抢的人就选第一个 */
function victimOf(st: State, hex: number): { victim?: number } {
  const v = hi.robberVictims(st, hex, st.turn);
  return v.length ? { victim: v[0] } : {};
}
