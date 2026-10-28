import { describe, expect, it } from 'vitest';
import type { mj, sc } from '../src';
import { mj as M, sc as S } from '../src';

/** 「123m456m789s」→ 牌（m 万、s 条、p 筒），同种牌自动用不同的副本 id */
function tiles(spec: string, used = new Map<number, number>()): mj.Tile[] {
  const out: mj.Tile[] = [];
  for (const [, digits, suit] of spec.matchAll(/(\d+)([msp])/g)) {
    const si = { m: 0, s: 1, p: 2 }[suit as 'm' | 's' | 'p'];
    for (const d of digits) {
      const kind = si * 9 + Number(d) - 1;
      const copy = used.get(kind) ?? 0;
      used.set(kind, copy + 1);
      out.push(M.tileOf(si * 36 + (Number(d) - 1) * 4 + copy));
    }
  }
  return out;
}

interface Opts {
  hand: string;
  que?: mj.MjSuit;
  /** 自己回合（14 张）还是等待 / 抢牌 */
  window?: { tile: string; from: number; peng?: boolean; hu?: boolean; gang?: boolean };
  /** 对手：缺门与牌河 */
  opps?: { que: mj.MjSuit; river?: string; melds?: string[] }[];
  wall?: number;
}

function view(o: Opts): sc.ScView {
  const used = new Map<number, number>();
  const hand = tiles(o.hand, used);
  const que = o.que ?? 'tong';
  const players: sc.ScPlayerView[] = [0, 1, 2, 3].map((s) => {
    const opp = s === 0 ? null : o.opps?.[s - 1];
    return {
      handCount: s === 0 ? hand.length : 13,
      melds: (opp?.melds ?? []).map((m) => {
        const ts = tiles(m, used);
        return { type: 'pung' as const, kind: M.kindOf(ts[0]), tiles: ts, from: 0 };
      }),
      river: opp?.river ? tiles(opp.river, used).map((tile) => ({ tile })) : [],
      que: s === 0 ? que : (opp?.que ?? 'wan'),
      queChosen: true,
      exchangeChosen: true,
      won: null,
      hand: null,
    };
  });
  const w = o.window ? tiles(o.window.tile, used)[0] : null;
  // 看得见的牌：自己的手牌、牌河、碰杠、桌上这张
  const visible = new Array<number>(27).fill(0);
  for (const [kind, n] of used) visible[kind] = n;
  const hasQue = hand.some((t) => t.suit === que);
  const legal: sc.ScLegal = {
    discard: o.window ? [] : hand.filter((t) => !hasQue || t.suit === que).map((t) => t.id),
    hu: !!o.window?.hu,
    gang: o.window?.gang && w ? [{ tile: w.id, type: 'zhi' }] : [],
    peng: !!o.window?.peng,
    pass: !!o.window,
    exchange: false,
    que: false,
    ready: false,
    mustHu: false,
  };
  return {
    seat: 0,
    phase: 'play',
    round: 1,
    options: { baseScore: 1, exchange: true, jingoudiao: false, rounds: 8, chips: 0 },
    dealer: 0,
    wallCount: o.wall ?? 40,
    turn: o.window ? o.window.from : 0,
    players,
    hand,
    drawn: null,
    legal,
    window: o.window && w ? { kind: 'claims', source: o.window.from, tile: w } : null,
    lastDiscard: null,
    exchangeDir: null,
    exchange: null,
    scores: [0, 0, 0, 0],
    roundDeltas: [0, 0, 0, 0],
    visible,
    events: [],
    result: null,
    ready: [false, false, false, false],
    history: [],
  };
}

const name = (v: sc.ScView, id: number) => M.tileName(v.hand.find((t) => t.id === id)!);

describe('麻将导师：出牌', () => {
  it('打掉孤张，打完就听牌，并说出听哪张', () => {
    const v = view({ hand: '123m456m57m789s22s1s' });
    const c = S.coachSichuan(v);
    expect(c.stage).toBe('discard');
    expect(name(v, c.advice.tiles[0])).toBe('1条');
    expect(c.options[0].shanten).toBe(0);
    // 4567 万：听 3 万、6 万
    expect(c.options[0].waits.map((w) => M.kindName(w.kind))).toEqual(['3万', '6万']);
    expect(c.points[0]).toContain('听 3万');
  });

  it('打掉多余的一张就听三面：23456 万听 1、4、7 万', () => {
    const v = view({ hand: '23m9m456m789s222s55s' });
    const c = S.coachSichuan(v);
    expect(name(v, c.advice.tiles[0])).toBe('9万');
    expect(c.options[0].waits.map((w) => M.kindName(w.kind))).toEqual(['1万', '4万', '7万']);
    // 4 万自己手里有一张
    expect(c.options[0].waits.map((w) => w.left)).toEqual([4, 3, 4]);
  });

  it('手里有缺门：先打缺门', () => {
    const v = view({ hand: '123m456m789s22s57m38p', que: 'tong' });
    const c = S.coachSichuan(v);
    expect(c.title).toMatch(/^先打缺门/);
    expect(M.tileOf(c.advice.tiles[0]).suit).toBe('tong');
    expect(c.status).toContain('2 张缺门');
  });

  it('评价玩家选中的牌：退向听要指出来', () => {
    const v = view({ hand: '123m456m57m789s22s1s' });
    const c = S.coachSichuan(v);
    const bad = v.hand.find((t) => M.tileName(t) === '5万')!;
    const j = S.coachSelected(v, c, [bad.id]);
    expect(j?.tone).toBe('bad');
    expect(j?.text).toContain('退成');
    const good = S.coachSelected(v, c, [c.advice.tiles[0]]);
    expect(good?.tone).toBe('best');
  });

  it('对手缺的那门对他绝对安全', () => {
    // 三家都打了十张牌，可能已经听牌；三家都缺条
    const v = view({
      hand: '123m456m57m789s22s1s',
      opps: [
        { que: 'tiao', river: '1199p2288p55p' },
        { que: 'tiao', river: '3377p4466p55p' },
        { que: 'tiao', river: '88m99m1199p66p' },
      ],
    });
    const c = S.coachSichuan(v);
    const tiao = c.options.filter((o) => M.kindSuit(o.kind) === 'tiao');
    expect(tiao.length).toBeGreaterThan(0);
    expect(tiao.every((o) => o.danger === 0)).toBe(true);
  });
});

describe('麻将导师：碰杠胡', () => {
  it('能胡就建议胡，并算出番数', () => {
    const v = view({
      hand: '123m456m789m22m57m',
      que: 'tong',
      window: { tile: '6m', from: 2, hu: true },
    });
    const c = S.coachSichuan(v);
    expect(c.advice.action).toBe('hu');
    expect(c.points[0]).toMatch(/清一色.*3 番/);
  });

  it('碰了能更快听牌：建议碰', () => {
    // 碰 9 条后打掉 1 万就听牌
    const v = view({
      hand: '123m456m78s99s1m55s',
      window: { tile: '9s', from: 1, peng: true },
    });
    const c = S.coachSichuan(v);
    expect(c.advice.action).toBe('peng');
  });

  it('对子很多、在做七对：碰了不会更快就建议过', () => {
    const v = view({
      hand: '11m33m55m77m22s44s9s',
      window: { tile: '1m', from: 3, peng: true },
    });
    const c = S.coachSichuan(v);
    expect(c.advice.action).toBe('pass');
    expect(c.points.join()).toContain('七对');
  });
});

describe('麻将导师：换三张、定缺', () => {
  it('换三张换最弱的一门，定缺定最少的一门', () => {
    const v = view({ hand: '1123m556789p2s7s9s' });
    v.phase = 'exchange';
    v.legal = { ...v.legal!, discard: [], exchange: true };
    v.exchangeDir = 'next';
    const c = S.coachSichuan(v);
    expect(c.stage).toBe('exchange');
    expect(c.advice.tiles.map((id) => M.tileOf(id).suit)).toEqual(['tiao', 'tiao', 'tiao']);
    expect(S.coachSelected(v, c, c.advice.tiles)?.tone).toBe('best');

    v.phase = 'dingque';
    v.legal = { ...v.legal, exchange: false, que: true };
    const q = S.coachSichuan(v);
    expect(q.advice.suit).toBe('tiao');
  });
});
