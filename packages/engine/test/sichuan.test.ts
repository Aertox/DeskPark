import { describe, expect, it } from 'vitest';
import type { mj as MJ } from '../src';
import { Rng, mj, sc, sichuan, simulate } from '../src';

type Tile = MJ.Tile;
type State = sc.ScState;
const { evaluateHand, scoreWin } = sc;

// ---------------------------------------------------------------------------
// 夹具工具：用 "123m456p78s" 记法生成牌（m 万、s 条、p 筒），id 按规范分配且不重复

const SUIT: Record<string, MJ.MjSuit> = { m: 'wan', s: 'tiao', p: 'tong' };

class Pool {
  used = new Map<number, number>();
  tiles(spec: string): Tile[] {
    const out: Tile[] = [];
    let digits: number[] = [];
    for (const ch of spec.replace(/\s+/g, '')) {
      if (/\d/.test(ch)) digits.push(Number(ch));
      else {
        for (const r of digits) out.push(this.one(SUIT[ch], r));
        digits = [];
      }
    }
    return out;
  }
  one(suit: MJ.MjSuit, rank: number): Tile {
    const kind = mj.suitIndex(suit) * 9 + rank - 1;
    const copy = this.used.get(kind) ?? 0;
    if (copy >= 4) throw new Error(`more than 4 of ${rank}${suit}`);
    this.used.set(kind, copy + 1);
    return mj.tileOf(mj.suitIndex(suit) * 36 + (rank - 1) * 4 + copy);
  }
}

const counts = (spec: string) => mj.countKinds(new Pool().tiles(spec));
const NO_CTX = {
  selfDrawn: true,
  afterKong: false,
  robbing: false,
  haidi: false,
  tianhu: false,
  dihu: false,
};
const value = (spec: string, melds: sc.MeldShape[] = [], jingoudiao = false) =>
  evaluateHand(counts(spec), melds, { jingoudiao });
const kind = (spec: string) => mj.kindOf(new Pool().tiles(spec)[0]);

function player(p: Partial<sc.ScPlayer> = {}): sc.ScPlayer {
  return {
    hand: [],
    melds: [],
    river: [],
    que: null,
    won: null,
    passHu: false,
    afterKong: false,
    lastReceipt: null,
    hasDrawn: true,
    ...p,
  };
}

function baseState(players: sc.ScPlayer[], patch: Partial<State> = {}): State {
  const s = sichuan.setup({
    players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, isBot: true })),
    options: sichuan.defaultOptions,
    seed: 1,
  });
  return {
    ...s,
    phase: 'play',
    window: null,
    players,
    ledger: [],
    receipts: [],
    discards: 5,
    claimsOrKongs: 1,
    drawnThisTurn: null,
    canSelfHu: true,
    mustHuSelf: false,
    dihuChance: false,
    ...patch,
  };
}

const act = (s: State, seat: number, a: sc.ScAction) => {
  const err = sichuan.validate(s, seat, a);
  if (err) throw new Error(`seat ${seat} ${JSON.stringify(a)}: ${err}`);
  return sichuan.apply(s, seat, a);
};

// ---------------------------------------------------------------------------

describe('川麻 · 牌与牌型', () => {
  it('108 张牌，id 映射符合规范', () => {
    const all = mj.createTiles();
    expect(all).toHaveLength(108);
    expect(all[0]).toMatchObject({ suit: 'wan', rank: 1 });
    expect(all[35]).toMatchObject({ suit: 'wan', rank: 9 });
    expect(all[36]).toMatchObject({ suit: 'tiao', rank: 1 });
    expect(all[107]).toMatchObject({ suit: 'tong', rank: 9 });
  });

  it('例子 A：清一色 3 番，自摸不加番', () => {
    const v = value('12345678934511m')!;
    const s = scoreWin(v, NO_CTX, 1);
    expect(v.patterns).toEqual(['qingyise']);
    expect(s.fanRaw).toBe(3);
    expect(s.points).toBe(4);
  });

  it('例子 G：清七对优先于标准型清一色', () => {
    const v = value('11223344556677m')!;
    expect(v.skeleton).toBe('qidui');
    expect(v.patterns).toEqual(['qingqidui']);
    expect(scoreWin(v, NO_CTX, 1).points).toBe(8);
  });

  it('qidui_wins_when_both_capped：只比 fan_raw', () => {
    const v = value('11112222333344m')!;
    const s = scoreWin(v, NO_CTX, 1);
    expect(v.skeleton).toBe('qidui');
    expect(s.fanRaw).toBe(7);
    expect(s.fanCharged).toBe(5);
    expect(s.points).toBe(16);
  });

  it('龙七对独占最高档时吞掉第一组根', () => {
    expect(value('1122334455m6677p')!.patterns).toEqual(['anqidui']);
    const one = value('1111223344m5566p')!;
    expect(one.patterns).toEqual(['longqidui']);
    expect(one.base).toBe(4);
    const two = value('11112222m334455p')!;
    expect(two.base).toBe(5);
  });

  it('常见牌型', () => {
    expect(value('123456m234789p55p')!.patterns).toEqual(['pinghu']);
    expect(value('111333m555777p99p')!.patterns).toEqual(['duidui']);
    expect(value('222555m222888p55p')!.patterns).toEqual(['jiangdui']);
    expect(value('123789m111999p11m')!.patterns).toEqual(['quanyaojiu']);
    const qyj = value('123123789999m11m')!;
    expect(qyj.patterns).toEqual(['qingyaojiu']);
    expect(qyj.roots).toBe(2);
    expect(value('123m456p789s11m123p')).toBeNull(); // 三门不能胡
  });

  it('根与金钩钓', () => {
    const k = kind('1m');
    const withKong = value('234m567p789p55p', [{ type: 'kong', kind: k }])!;
    expect(withKong.patterns).toEqual(['pinghu']);
    expect(withKong.base).toBe(2);
    const melds: sc.MeldShape[] = ['1m', '3m', '5p', '7p'].map((x) => ({
      type: 'pung',
      kind: kind(x),
    }));
    expect(value('99p', melds, false)!.base).toBe(2);
    expect(value('99p', melds, true)!.base).toBe(3);
  });

  it('过程番', () => {
    const v = value('123456m234789p55p')!;
    expect(scoreWin(v, { ...NO_CTX, afterKong: true }, 1).items.map((i) => i.id)).toContain(
      'gangshanghua',
    );
    expect(scoreWin(v, { ...NO_CTX, selfDrawn: false, afterKong: true }, 1).fanRaw).toBe(2);
    expect(scoreWin(v, { ...NO_CTX, tianhu: true }, 1).fanRaw).toBe(5);
  });

  it('听牌计算', () => {
    const w = mj.waitingKinds(counts('1112344556788m'), 0);
    expect(w).toEqual([kind('3m'), kind('6m')]);
    expect(mj.shanten(counts('1112344556788m'), 0)).toBe(0);
  });
});

describe('川麻 · 结算（规范数字例子）', () => {
  it('例子 C：花猪 + 查大叫 + 退税', () => {
    // 东：花猪（三门）+ 暗杠 9 筒；南：听 3/6 万清一色；西：直杠 5 条、未听；北：听 1/4 筒平胡
    const pool = new Pool();
    const anKong = pool.tiles('9999p');
    const zhiKong = pool.tiles('5555s');
    const players = [
      player({
        que: 'wan',
        hand: pool.tiles('12m12468s357p'),
        melds: [
          { type: 'kong', kongType: 'an', kind: mj.kindOf(anKong[0]), tiles: anKong, from: null },
        ],
      }),
      player({ que: 'tong', hand: pool.tiles('1112344556788m') }),
      player({
        que: 'wan',
        hand: pool.tiles('1347s124688p'),
        melds: [
          { type: 'kong', kongType: 'zhi', kind: mj.kindOf(zhiKong[0]), tiles: zhiKong, from: 3 },
        ],
      }),
      player({ que: 'wan', hand: pool.tiles('123789s456p23p44s') }),
    ];
    const s = baseState(players);
    s.ledger = [
      { from: 1, to: 0, amount: 2, clause: 'kong.xia_yu' },
      { from: 2, to: 0, amount: 2, clause: 'kong.xia_yu' },
      { from: 3, to: 0, amount: 2, clause: 'kong.xia_yu' },
      { from: 3, to: 2, amount: 2, clause: 'kong.gua_feng_zhi' },
    ];
    s.receipts = [
      { seat: 0, entries: [0, 1, 2], gross: 6, transferred: 0 },
      { seat: 2, entries: [3], gross: 2, transferred: 0 },
    ];
    expect(sc.deltasOf(s.ledger)).toEqual([6, -2, 0, -4]);
    const r = sc._settle(s);
    expect(r.huazhu).toEqual([0]);
    expect(r.notReady).toEqual([2]);
    expect(r.ting.map((t) => [t.seat, t.points])).toEqual([
      [1, 4],
      [3, 1],
    ]);
    expect(sc.deltasOf(s.ledger)).toEqual([-48, 20, 11, 17]);
  });

  it('例子 F：三家胡，剩下一家是花猪', () => {
    const pool = new Pool();
    const anKong = pool.tiles('1111s');
    const won = {
      seat: 0,
      group: 1,
      selfDrawn: true,
      tile: pool.one('wan', 9),
      from: null,
      score: {} as sc.WinScore,
    };
    const players = [
      player({
        que: 'wan',
        hand: pool.tiles('23m456p789s2p'),
        melds: [
          { type: 'kong', kongType: 'an', kind: mj.kindOf(anKong[0]), tiles: anKong, from: null },
        ],
      }),
      player({ que: 'tong', won: { ...won, seat: 1 } }),
      player({ que: 'tong', won: { ...won, seat: 2 } }),
      player({ que: 'tong', won: { ...won, seat: 3 } }),
    ];
    const s = baseState(players);
    s.ledger = [
      { from: 1, to: 0, amount: 2, clause: 'kong.xia_yu' },
      { from: 2, to: 0, amount: 2, clause: 'kong.xia_yu' },
      { from: 3, to: 0, amount: 2, clause: 'kong.xia_yu' },
      { from: 0, to: 1, amount: 1, clause: 'pay.zimo' },
      { from: 2, to: 1, amount: 1, clause: 'pay.zimo' },
      { from: 3, to: 1, amount: 1, clause: 'pay.zimo' },
      { from: 0, to: 2, amount: 1, clause: 'pay.zimo' },
      { from: 3, to: 2, amount: 1, clause: 'pay.zimo' },
      { from: 0, to: 3, amount: 1, clause: 'pay.zimo' },
    ];
    s.receipts = [{ seat: 0, entries: [0, 1, 2], gross: 6, transferred: 0 }];
    expect(sc.deltasOf(s.ledger)).toEqual([3, 1, -1, -3]);
    const r = sc._settle(s);
    expect(r.ting).toEqual([]);
    expect(s.ledger.filter((e) => e.clause === 'tax.chajiao')).toHaveLength(0);
    expect(sc.deltasOf(s.ledger)).toEqual([-51, 19, 17, 15]);
  });
});

describe('川麻 · 行牌（规范数字例子）', () => {
  it('例子 B：杠上炮一炮双响 + 呼叫转移', () => {
    const pool = new Pool();
    const pung = pool.tiles('333m');
    const fourth = pool.one('wan', 3);
    const seven = pool.one('tong', 7);
    const players = [
      player({ que: 'tong', hand: pool.tiles('12468m13572468s') }),
      player({ que: 'wan', hand: pool.tiles('123456234p89p55p') }),
      player({ que: 'wan', hand: pool.tiles('123456789s99s56p') }),
      player({
        que: 'tiao',
        hand: [...pool.tiles('1579m2469p1p'), fourth, seven],
        melds: [{ type: 'pung', kind: mj.kindOf(pung[0]), tiles: pung, from: 0 }],
      }),
    ];
    let s = baseState(players, {
      turn: 3,
      drawnThisTurn: fourth.id,
      wall: pool.tiles('5m6m7m1s2s3s4s5s6s7s'),
    });
    s = act(s, 3, { type: 'gang', tile: fourth.id });
    expect(sc.deltasOf(s.ledger)).toEqual([-1, -1, -1, 3]);
    expect(s.players[3].afterKong).toBe(true);
    s = act(s, 3, { type: 'discard', tile: seven.id });
    expect(s.window?.kind).toBe('claims');
    s = act(s, 1, { type: 'hu' });
    s = act(s, 2, { type: 'hu' });
    expect(s.players[1].won!.score.points).toBe(8);
    expect(s.players[2].won!.score.points).toBe(2);
    expect(sc.deltasOf(s.ledger)).toEqual([-1, 10, 4, -13]);
    expect(s.receipts[0].transferred).toBe(6);
    // 一炮多响：下一盘庄家是点炮者
    expect(s.firstGroup).toEqual({ seats: [1, 2], supplier: 3 });
  });

  it('例子 D：抢杠胡，杠分不入账', () => {
    const pool = new Pool();
    const pung = pool.tiles('444p');
    const fourth = pool.one('tong', 4);
    const players = [
      player({ que: 'tong', hand: pool.tiles('1112223335557m') }),
      player({ que: 'wan', hand: pool.tiles('123456789s23p77p') }),
      player({
        que: 'wan',
        hand: [...pool.tiles('2468s1357s9s'), fourth],
        melds: [{ type: 'pung', kind: mj.kindOf(pung[0]), tiles: pung, from: 0 }],
      }),
      player({ que: 'tiao', hand: pool.tiles('2468m1359p2568p9m') }),
    ];
    let s = baseState(players, {
      turn: 2,
      drawnThisTurn: fourth.id,
      wall: pool.tiles('5m6m7m8m9m'),
    });
    s = act(s, 2, { type: 'gang', tile: fourth.id });
    expect(s.window?.kind).toBe('rob');
    s = act(s, 1, { type: 'hu' });
    const w = s.players[1].won!;
    expect(w.score.items.map((i) => i.id)).toEqual(['pinghu', 'qianggang']);
    expect(sc.deltasOf(s.ledger)).toEqual([0, 2, -2, 0]);
    expect(s.players[2].melds[0].type).toBe('pung');
    expect(s.players[2].river.at(-1)!.claimedBy).toEqual([1]);
  });

  it('例子 E：先碰后巴杠不是及时雨，不收杠分', () => {
    const pool = new Pool();
    const pung = pool.tiles('666m');
    const late = pool.one('wan', 6);
    const players = [
      player({ que: 'tong', hand: pool.tiles('1112223335558m') }),
      player({
        que: 'tong',
        hand: [...pool.tiles('1234m789s135s'), late],
        melds: [{ type: 'pung', kind: mj.kindOf(pung[0]), tiles: pung, from: 0 }],
      }),
      player({ que: 'wan', hand: pool.tiles('2468s2468p9s1p2p') }),
      player({ que: 'tiao', hand: pool.tiles('479m3568p4p7p9p1p2p') }),
    ];
    let s = baseState(players, {
      turn: 1,
      drawnThisTurn: null,
      wall: pool.tiles('5s6s7s8s9p8p7p6p'),
    });
    s = act(s, 1, { type: 'gang', tile: late.id });
    expect(s.players[1].melds[0].kongType).toBe('ba');
    expect(sc.deltasOf(s.ledger)).toEqual([0, 0, 0, 0]);
    expect(s.players[1].afterKong).toBe(true);
  });

  it('缺门约束与过水', () => {
    const pool = new Pool();
    const five = pool.one('tong', 5);
    const players = [
      player({ que: 'tong', hand: pool.tiles('123456789m11m4m6p') }),
      player({ que: 'wan', hand: pool.tiles('1112223334446p') }),
      player({ que: 'wan', hand: pool.tiles('2468s2468p1357s') }),
      player({ que: 'tiao', hand: [...pool.tiles('99m37889p6p'), five] }),
    ];
    let s = baseState(players, { turn: 3, drawnThisTurn: null, wall: pool.tiles('9m1s5s6s7s8s') });
    s = act(s, 3, { type: 'discard', tile: five.id });
    expect(s.window?.kind).toBe('claims');
    expect(sc.legalActions(s, 1)!.hu).toBe(true);
    // 南家放过 5 筒 → 过水
    s = act(s, 1, { type: 'pass' });
    expect(s.players[1].passHu).toBe(true);
    expect(s.turn).toBe(0);
    // 东家手上有缺门（筒），只能先打缺门
    const wan = s.players[0].hand.find((t) => t.suit === 'wan')!;
    expect(sichuan.validate(s, 0, { type: 'discard', tile: wan.id })).toContain('缺门');
    const six = s.players[0].hand.find((t) => t.suit === 'tong')!;
    s = act(s, 0, { type: 'discard', tile: six.id });
    // 南家能胡 6 筒，但过水中，不弹出应牌窗口，直接轮到南家摸牌
    expect(s.window).toBeNull();
    expect(s.turn).toBe(1);
    expect(s.players[1].passHu).toBe(false);
  });

  it('最后四张：能胡必须胡', () => {
    const pool = new Pool();
    const players = [
      player({ que: 'tong', hand: pool.tiles('1234567893451m') }),
      player({ que: 'wan', hand: pool.tiles('1112223334446p') }),
      player({ que: 'wan', hand: pool.tiles('2468s2468p1357s') }),
      player({ que: 'tiao', hand: pool.tiles('2479m3568p7p9p8p') }),
    ];
    const last = pool.one('wan', 1);
    let s = baseState(players, {
      turn: 3,
      drawnThisTurn: null,
      wall: [last, ...pool.tiles('5s6s7s')],
    });
    const nine = s.players[3].hand.find((x) => x.suit === 'tong' && x.rank === 9)!;
    s = act(s, 3, { type: 'discard', tile: nine.id });
    expect(s.turn).toBe(0);
    const L = sc.legalActions(s, 0)!;
    expect(L.mustHu).toBe(true);
    expect(L.hu).toBe(true);
    expect(L.discard).toEqual([]);
    expect(sichuan.validate(s, 0, { type: 'discard', tile: last.id })).toContain('必须胡');
  });
});

describe('川麻 · 整局模拟', () => {
  function allIds(s: State): number[] {
    const ids = [
      ...s.wall.map((t) => t.id),
      ...s.players.flatMap((p) =>
        [...p.hand, ...p.melds.flatMap((m) => m.tiles), ...p.river.map((r) => r.tile)].map(
          (t) => t.id,
        ),
      ),
    ];
    if (s.window?.kind === 'rob') ids.push(s.window.tile!.id);
    return ids;
  }

  it('电脑对战：牌张守恒、每盘零和、可以打完', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = new Rng(seed * 7);
      let s = sichuan.setup({
        players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, isBot: true })),
        options: {
          baseScore: 1,
          exchange: seed % 3 !== 0,
          jingoudiao: seed % 2 === 0,
          rounds: 3,
          chips: 0,
        },
        seed,
      });
      let steps = 0;
      while (!sichuan.isOver(s) && steps++ < 5000) {
        const seats = sichuan.activeSeats(s);
        const seat = seats[rng.int(seats.length)];
        const a = sichuan.bot(sichuan.view(s, seat), seat, rng);
        const err = sichuan.validate(s, seat, a);
        if (err) throw new Error(`seed ${seed} step ${steps}: ${err} ${JSON.stringify(a)}`);
        s = sichuan.apply(s, seat, a);
        if (s.phase === 'play' || s.phase === 'exchange' || s.phase === 'dingque') {
          const ids = allIds(s);
          expect(ids.length).toBe(108);
          expect(new Set(ids).size).toBe(108);
        }
      }
      expect(s.phase).toBe('matchOver');
      for (const h of s.history) expect(h.deltas.reduce((a, b) => a + b, 0)).toBe(0);
      expect(s.scores.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it('simulate 可以跑完多盘', () => {
    const { state } = simulate(sichuan, 4, { ...sichuan.defaultOptions, rounds: 4 }, 2026, 20000);
    expect(state.phase).toBe('matchOver');
    expect(state.history).toHaveLength(4);
  });

  it('筹码模式：有人输光即结束整场', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state } = simulate(
        sichuan,
        4,
        { ...sichuan.defaultOptions, rounds: 0, chips: 20 },
        seed,
        200000,
      );
      expect(state.phase).toBe('matchOver');
      expect(state.scores.some((x) => x <= 0)).toBe(true);
      expect(state.scores.reduce((a, b) => a + b, 0)).toBe(80);
      // 结束前的每一盘结束时都还没有人输光
      let running = [20, 20, 20, 20];
      state.history.slice(0, -1).forEach((h) => {
        running = running.map((x, i) => x + h.deltas[i]);
        expect(running.every((x) => x > 0)).toBe(true);
      });
    }
  });
});
