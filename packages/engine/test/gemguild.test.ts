import { describe, expect, it } from 'vitest';
import type { gg as GG } from '../src';
import { gemguild, gg, simulate } from '../src';

type State = GG.GgState;
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: true }));
const tok = (m: Partial<GG.TokenMap> = {}): GG.TokenMap => ({ ...gg.emptyTokens(), ...m });
const gems = (m: Partial<GG.GemMap> = {}): GG.GemMap => ({ ...gg.emptyGems(), ...m });
let nextId = 1000;
const card = (
  bonus: GG.Gem,
  cost: Partial<GG.GemMap>,
  points = 0,
  level: GG.Level = 1,
): GG.GgCard => ({
  id: nextId++,
  level,
  bonus,
  points,
  cost: gems(cost),
});

function fresh(n = 3): State {
  const st = gemguild.setup({ players: players(n), options: { target: 15 }, seed: 5 });
  st.turn = 0;
  st.starter = 0;
  return st;
}
const run = (st: State, seat: number, action: GG.GgAction) => {
  const err = gemguild.validate(st, seat, action);
  if (err) throw new Error(err);
  return gemguild.apply(st, seat, action);
};

describe('宝石商会', () => {
  it('牌库：三级共 90 张（40 / 30 / 20），每种颜色数量相同；10 位贵族', () => {
    const st = gemguild.setup({ players: players(4), options: { target: 15 }, seed: 1 });
    const all = [...st.decks.flat(), ...(st.market.flat().filter(Boolean) as GG.GgCard[])];
    expect(all).toHaveLength(90);
    expect(new Set(all.map((c) => c.id)).size).toBe(90);
    for (const [l, count] of [
      [1, 40],
      [2, 30],
      [3, 20],
    ] as const) {
      const lv = all.filter((c) => c.level === l);
      expect(lv).toHaveLength(count);
      for (const g of gg.GEMS) expect(lv.filter((c) => c.bonus === g)).toHaveLength(count / 5);
    }
    expect(st.market.every((row) => row.length === 4 && row.every(Boolean))).toBe(true);
    expect(st.nobles).toHaveLength(5);
  });

  it('人数不同时宝石数量不同，黄金 5 颗；贵族为人数 + 1', () => {
    for (const [n, supply] of [
      [2, 4],
      [3, 5],
      [4, 7],
    ] as const) {
      const st = gemguild.setup({ players: players(n), options: { target: 15 }, seed: n });
      for (const g of gg.GEMS) expect(st.bank[g]).toBe(supply);
      expect(st.bank.gold).toBe(5);
      expect(st.nobles).toHaveLength(n + 1);
    }
  });

  it('拿宝石：3 种不同颜色；同色 2 颗要剩至少 4 颗；颜色不够时才能少拿', () => {
    const bank = tok({ white: 4, blue: 3, green: 1, red: 0, black: 0, gold: 5 });
    expect(gg.takeError(bank, ['white', 'blue', 'green'])).toBeNull();
    expect(gg.takeError(bank, ['white', 'white'])).toBeNull();
    expect(gg.takeError(bank, ['blue', 'blue'])).toContain('4');
    expect(gg.takeError(bank, ['white', 'blue'])).toContain('3 种');
    expect(gg.takeError(bank, ['white', 'white', 'blue'])).toBeTruthy();
    expect(gg.takeError(bank, ['gold'])).toContain('黄金');
    expect(gg.takeError(bank, ['red', 'white', 'blue'])).toContain('拿光');
    const two = tok({ white: 1, blue: 1 });
    expect(gg.takeError(two, ['white', 'blue'])).toBeNull();
    let st = fresh();
    st = run(st, 0, { type: 'take', gems: ['white', 'blue', 'green'] });
    expect(st.players[0].tokens).toEqual(tok({ white: 1, blue: 1, green: 1 }));
    expect(st.bank.white).toBe(4);
    expect(st.turn).toBe(1);
  });

  it('买牌：折扣先抵，再付同色宝石，不够用黄金；买下的牌从牌堆补上', () => {
    let st = fresh();
    const target = card('red', { white: 3, blue: 2 }, 1);
    st.market[0][0] = target;
    st.players[0].cards = [card('white', {})];
    st.players[0].tokens = tok({ white: 1, blue: 1, gold: 2 });
    const before = st.decks[0].length;
    st = run(st, 0, { type: 'buy', card: target.id });
    expect(st.players[0].cards.map((c) => c.id)).toContain(target.id);
    expect(st.players[0].tokens).toEqual(tok({ gold: 0 }));
    expect(st.bank.gold).toBe(7);
    expect(st.market[0][0]!.id).not.toBe(target.id);
    expect(st.decks[0].length).toBe(before - 1);
    expect(gemguild.view(st, 1).players[0].bonuses.red).toBe(1);
    const poor = fresh();
    poor.market[0][0] = target;
    expect(gemguild.validate(poor, 0, { type: 'buy', card: target.id })).toContain('不够');
  });

  it('预留：拿 1 颗黄金，最多 3 张；盲抽的牌别人看不到', () => {
    let st = fresh();
    const shown = st.market[2][1]!;
    st = run(st, 0, { type: 'reserve', card: shown.id });
    expect(st.players[0].tokens.gold).toBe(1);
    expect(st.players[0].reserved[0]).toMatchObject({ card: { id: shown.id }, blind: false });
    st.turn = 0;
    st = run(st, 0, { type: 'reserve', level: 3 });
    expect(st.players[0].reserved[1].blind).toBe(true);
    const other = gemguild.view(st, 1);
    expect(other.players[0].reserved[0]?.id).toBe(shown.id);
    expect(other.players[0].reserved[1]).toBeNull();
    expect(other.events.filter((e) => e.type === 'reserve').at(-1)).not.toHaveProperty('card.id');
    expect(gemguild.view(st, 0).players[0].reserved[1]).not.toBeNull();
    st.turn = 0;
    st = run(st, 0, { type: 'reserve', level: 1 });
    st.turn = 0;
    expect(gemguild.validate(st, 0, { type: 'reserve', level: 2 })).toContain('3');
    // 预留的牌只能自己买
    const mine = st.players[0].reserved[0].card;
    st.turn = 1;
    expect(gemguild.validate(st, 1, { type: 'buy', card: mine.id })).toBeTruthy();
    // 黄金没了也能预留，只是拿不到黄金
    const noGold = fresh();
    noGold.bank.gold = 0;
    const after = run(noGold, 0, { type: 'reserve', level: 1 });
    expect(after.players[0].tokens.gold).toBe(0);
  });

  it('回合结束时宝石超过 10 颗要退回', () => {
    let st = fresh();
    st.players[0].tokens = tok({ white: 3, blue: 3, green: 3 });
    st = run(st, 0, { type: 'take', gems: ['red', 'black', 'white'] });
    expect(st.phase).toBe('discard');
    expect(st.discard).toBe(2);
    expect(st.turn).toBe(0);
    expect(gemguild.validate(st, 0, { type: 'discard', gems: tok({ red: 1 }) })).toContain('2');
    expect(gemguild.validate(st, 0, { type: 'discard', gems: tok({ gold: 2 }) })).toBeTruthy();
    st = run(st, 0, { type: 'discard', gems: tok({ white: 2 }) });
    expect(gg.tokenTotal(st.players[0].tokens)).toBe(10);
    expect(st.turn).toBe(1);
  });

  it('贵族：满足折扣要求时来拜访（+3），同时满足多位时自己选', () => {
    let st = fresh();
    const a = { id: 900, name: '甲', points: 3, need: gems({ white: 1 }) };
    const b = { id: 901, name: '乙', points: 3, need: gems({ white: 1, blue: 1 }) };
    st.nobles = [a, b];
    st.players[0].cards = [card('white', {}), card('blue', {})];
    st = run(st, 0, { type: 'take', gems: ['white', 'blue', 'green'] });
    expect(st.phase).toBe('noble');
    expect(st.nobleChoices.sort()).toEqual([900, 901]);
    st = run(st, 0, { type: 'noble', id: 901 });
    expect(st.players[0].nobles.map((n) => n.id)).toEqual([901]);
    expect(gemguild.view(st, 0).players[0].points).toBe(3);
    expect(st.nobles.map((n) => n.id)).toEqual([900]);
    expect(st.turn).toBe(1);
  });

  it('达到目标声望后打完这一轮；同分时发展卡少的获胜', () => {
    let st = fresh(3);
    st.starter = 0;
    st.turn = 1;
    st.players[1].cards = [card('red', {}, 5, 3), card('red', {}, 5, 3), card('red', {}, 4, 3)];
    const win = card('blue', {}, 1);
    st.market[0][0] = win;
    st = run(st, 1, { type: 'buy', card: win.id });
    expect(st.lastRound).toBe(true);
    expect(st.phase).toBe('play');
    expect(st.turn).toBe(2);
    // 2 号也拿到 15 分，但用的牌更少
    st.players[2].cards = [
      card('green', {}, 5, 3),
      card('green', {}, 5, 3),
      card('green', {}, 5, 3),
    ];
    st = run(st, 2, { type: 'take', gems: ['white', 'blue', 'green'] });
    expect(st.phase).toBe('over');
    expect(st.ranking!.slice(0, 2)).toEqual([2, 1]);
    expect(st.winners).toEqual([2]);
    expect(gemguild.isOver(st)).toBe(true);
  });

  it('没有任何动作可做时才能跳过', () => {
    const st = fresh();
    expect(gemguild.validate(st, 0, { type: 'pass' })).toBeTruthy();
    for (const g of gg.GEMS) st.bank[g] = 0;
    st.players[0].reserved = [0, 1, 2].map(() => ({ card: card('red', { red: 9 }), blind: false }));
    st.market = [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ];
    expect(gemguild.validate(st, 0, { type: 'pass' })).toBeNull();
  });

  it('牌的 id 只代表洗牌后的位置', () => {
    const label = (st: State, id: number) => {
      const c = [...st.decks.flat(), ...(st.market.flat().filter(Boolean) as GG.GgCard[])].find(
        (x) => x.id === id,
      )!;
      return `${c.level}${c.bonus}${c.points}${gg.costText(c.cost)}`;
    };
    const a = gemguild.setup({ players: players(2), options: { target: 15 }, seed: 1 });
    const b = gemguild.setup({ players: players(2), options: { target: 15 }, seed: 2 });
    const diff = Array.from({ length: 90 }, (_, id) => label(a, id) !== label(b, id));
    expect(diff.filter(Boolean).length).toBeGreaterThan(60);
  });

  it('电脑对战可以完整打完（2–4 人）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + (seed % 3);
      const { state } = simulate(gemguild, n, { target: 15 }, seed, 20000);
      expect(state.phase).toBe('over');
      expect(gg.pointsOf(state.players[state.ranking![0]])).toBeGreaterThanOrEqual(15);
      // 每人回合数相同
      expect(state.turnNo % n).toBe(0);
    }
  });
});
