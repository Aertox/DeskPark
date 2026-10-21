import { describe, expect, it } from 'vitest';
import type { Card, Suit } from '../src';
import { Rng, gd, guandan, simulate } from '../src';

const { classify, gdBeats, resolveGd, gdCandidates } = gd;

let nextId = 1000;
const c = (spec: string): Card => {
  // 形如 "H5"、"S10"、"SJ"(小王)、"BJ"(大王)
  if (spec === 'SJ') return { id: nextId++, suit: 'J', rank: 16 };
  if (spec === 'BJ') return { id: nextId++, suit: 'J', rank: 17 };
  const suit = spec[0] as Suit;
  const r = spec.slice(1);
  const rank = ({ J: 11, Q: 12, K: 13, A: 14 } as Record<string, number>)[r] ?? Number(r);
  return { id: nextId++, suit, rank };
};
const cards = (s: string) => s.split(' ').map(c);
const kinds = (s: string, level = 2) =>
  classify(cards(s), level)
    .map((p) => p.kind)
    .sort();

describe('掼蛋牌型识别', () => {
  it('基础牌型', () => {
    expect(kinds('S5')).toEqual(['single']);
    expect(kinds('S5 C5')).toEqual(['pair']);
    expect(kinds('S5 C5 D5')).toEqual(['trio']);
    expect(kinds('S5 C5 D5 S9 C9')).toEqual(['fullhouse']);
    expect(kinds('S5 C5 D5 S5')).toEqual(['bomb']);
    expect(kinds('SJ SJ')).toEqual(['pair']);
    expect(kinds('SJ BJ')).toEqual([]);
    expect(kinds('SJ SJ BJ BJ')).toEqual(['jokerbomb']);
  });

  it('顺子固定 5 张，A 可作 1 或 14', () => {
    expect(kinds('S3 C4 D5 S6 H7')).toEqual(['straight']);
    expect(kinds('SA C2 D3 S4 H5', 9)).toEqual(['straight']);
    expect(kinds('S10 CJ DQ SK HA')).toEqual(['straight']);
    expect(kinds('SQ CK DA S2 H3', 9)).toEqual([]); // 不能绕圈
    expect(kinds('S3 C4 D5 S6 H7 C8')).toEqual([]);
  });

  it('三连对与钢板', () => {
    expect(kinds('S3 C3 D4 S4 H5 C5')).toEqual(['tube']);
    expect(kinds('SA CA D2 S2 H3 C3', 9)).toEqual(['tube']);
    expect(kinds('S7 C7 D7 S8 H8 C8')).toEqual(['plate']);
    expect(kinds('SA CA DA S2 C2 D2', 9)).toEqual(['plate']);
  });

  it('同花顺', () => {
    expect(kinds('S3 S4 S5 S6 S7')).toEqual(['straight', 'straightflush']);
    const [sf] = classify(cards('S3 S4 S5 S6 S7'), 2).filter((p) => p.kind === 'straightflush');
    const [b5] = classify(cards('S9 C9 D9 S9 C9'), 2);
    const [b6] = classify(cards('S9 C9 D9 S9 C9 D9'), 2);
    expect(gdBeats(sf, b5)).toBe(true);
    expect(gdBeats(b6, sf)).toBe(true);
  });

  it('逢人配：红桃级牌可替代任意非王牌', () => {
    // 级牌为 5，H5 是万能牌
    expect(kinds('S9 H5', 5)).toEqual(['pair']);
    expect(kinds('S9 C9 H5', 5)).toEqual(['trio']);
    expect(kinds('S9 C9 D9 H5', 5)).toEqual(['bomb']);
    expect(kinds('S3 C4 H5 S6 D7', 5)).toEqual(['straight']); // H5 作 5
    expect(kinds('S3 C4 H5 S7 D8', 5)).toEqual([]);
    expect(kinds('S3 C4 H5 H5 D7', 5)).toEqual(['straight']); // 两张万能补 5、6
    expect(kinds('SJ H5', 5)).toEqual([]); // 不能配王
    // 333 + 两张万能：既是三带二，也是 5 炸，取最强解释
    expect(resolveGd(cards('S3 C3 D3 H5 H5'), 5, null)!.kind).toBe('bomb');
  });

  it('级牌大小：级牌大于 A，小于王', () => {
    const lv = 7;
    const [seven] = classify(cards('S7'), lv);
    const [ace] = classify(cards('SA'), lv);
    const [sj] = classify(cards('SJ'), lv);
    expect(gdBeats(seven, ace)).toBe(true);
    expect(gdBeats(sj, seven)).toBe(true);
  });

  it('炸弹大小顺序', () => {
    const lv = 2;
    const b4 = resolveGd(cards('SK CK DK HK'), lv, null)!;
    const b4small = resolveGd(cards('S3 C3 D3 H3'), lv, null)!;
    const b5 = resolveGd(cards('S3 C3 D3 H3 S3'), lv, null)!;
    const joker = resolveGd(cards('SJ SJ BJ BJ'), lv, null)!;
    const pair = resolveGd(cards('SA CA'), lv, null)!;
    expect(gdBeats(b4, b4small)).toBe(true);
    expect(gdBeats(b5, b4)).toBe(true);
    expect(gdBeats(joker, b5)).toBe(true);
    expect(gdBeats(b4small, pair)).toBe(true);
    expect(gdBeats(pair, b4small)).toBe(false);
  });

  it('候选生成能用万能牌凑出能压过的牌', () => {
    const hand = cards('H5 S9 D3');
    const target = resolveGd(cards('S8 C8'), 5, null)!;
    const cands = gdCandidates(hand, 5, target);
    expect(cands.some((x) => x.pattern.kind === 'pair' && x.wilds === 1)).toBe(true);
  });
});

describe('掼蛋对局流程', () => {
  it('电脑对战可以完整打完整场（含进贡、升级）', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = simulate(guandan, 4, { startLevel: 10, tribute: true }, seed, 60000);
      expect(state.phase).toBe('matchOver');
      expect(state.winnerTeam).not.toBeNull();
      const total = state.history.length;
      expect(total).toBeGreaterThan(0);
      // 每局名次都是 4 个不同座位
      for (const r of state.history) expect(new Set(r.order).size).toBe(4);
    }
  });

  it('一局中每张牌守恒（108 张）', () => {
    let state = guandan.setup({
      players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, isBot: true })),
      options: guandan.defaultOptions,
      seed: 99,
    });
    expect(state.hands.flat()).toHaveLength(108);
    expect(new Set(state.hands.flat().map((x: Card) => x.id)).size).toBe(108);
    // 走几步，牌总数（手牌 + 出过的）保持一致
    let played = 0;
    for (let i = 0; i < 40 && state.phase === 'playing'; i++) {
      const seat = state.turn;
      const action = guandan.bot(guandan.view(state, seat), seat, new Rng(i));
      if (action.type === 'play') played += action.cards.length;
      state = guandan.apply(state, seat, action);
    }
    expect(state.hands.flat().length + played).toBe(108);
  });
});
