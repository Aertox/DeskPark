import { describe, expect, it } from 'vitest';
import { ddz, doudizhu, simulate } from '../src';

const { analyzeValues, beats, preferredPattern } = ddz;

const kinds = (values: number[]) => analyzeValues(values).map((p) => p.kind);

describe('斗地主牌型识别', () => {
  it('基础牌型', () => {
    expect(kinds([5])).toEqual(['single']);
    expect(kinds([5, 5])).toEqual(['pair']);
    expect(kinds([5, 5, 5])).toEqual(['trio']);
    expect(kinds([5, 5, 5, 9])).toEqual(['trio1']);
    expect(kinds([5, 5, 5, 9, 9])).toEqual(['trio2']);
    expect(kinds([7, 7, 7, 7])).toEqual(['bomb']);
    expect(kinds([16, 17])).toEqual(['rocket']);
    expect(kinds([5, 6])).toEqual([]);
  });

  it('顺子与连对', () => {
    expect(kinds([3, 4, 5, 6, 7])).toEqual(['straight']);
    expect(kinds([10, 11, 12, 13, 14])).toEqual(['straight']);
    expect(kinds([11, 12, 13, 14, 15])).toEqual([]); // 2 不能进顺子
    expect(kinds([3, 4, 5, 6])).toEqual([]);
    expect(kinds([3, 3, 4, 4, 5, 5])).toEqual(['pairs']);
    expect(kinds([3, 3, 4, 4])).toEqual([]);
  });

  it('飞机与带翅膀', () => {
    expect(kinds([3, 3, 3, 4, 4, 4])).toEqual(['plane']);
    expect(kinds([3, 3, 3, 4, 4, 4, 9, 10])).toEqual(['plane1']);
    expect(kinds([3, 3, 3, 4, 4, 4, 9, 9, 10, 10])).toEqual(['plane2']);
    expect(kinds([14, 14, 14, 15, 15, 15])).toEqual([]); // AAA222 不是飞机
    // 333444555666：既可以是四连飞机，也可以是三连飞机带三张单
    const ks = kinds([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]);
    expect(ks).toContain('plane');
    expect(ks).toContain('plane1');
    expect(preferredPattern(analyzeValues([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]))!.kind).toBe(
      'plane',
    );
  });

  it('四带二', () => {
    expect(kinds([8, 8, 8, 8, 3, 4])).toEqual(['four2']);
    expect(kinds([8, 8, 8, 8, 3, 3, 4, 4])).toEqual(['four22']);
    expect(kinds([8, 8, 8, 8, 16, 17])).toEqual([]); // 不能带王炸
  });

  it('大小比较', () => {
    const [p1] = analyzeValues([5, 5]);
    const [p2] = analyzeValues([9, 9]);
    const [bomb] = analyzeValues([3, 3, 3, 3]);
    const [bomb2] = analyzeValues([4, 4, 4, 4]);
    const [rocket] = analyzeValues([16, 17]);
    expect(beats(p2, p1)).toBe(true);
    expect(beats(p1, p2)).toBe(false);
    expect(beats(bomb, p2)).toBe(true);
    expect(beats(bomb2, bomb)).toBe(true);
    expect(beats(rocket, bomb2)).toBe(true);
    expect(beats(bomb2, rocket)).toBe(false);
    const [s5] = analyzeValues([3, 4, 5, 6, 7]);
    const [s6] = analyzeValues([4, 5, 6, 7, 8, 9]);
    expect(beats(s6, s5)).toBe(false); // 张数不同不能压
  });
});

describe('斗地主对局流程', () => {
  it('电脑对战可以完整打完多局，且牌数守恒', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = simulate(doudizhu, 3, { baseScore: 1, rounds: 3 }, seed);
      expect(state.phase).toBe('matchOver');
      expect(state.history).toHaveLength(3);
      // 积分零和
      expect(state.scores.reduce((a: number, b: number) => a + b, 0)).toBe(0);
      for (const r of state.history) {
        expect(r.deltas.reduce((a: number, b: number) => a + b, 0)).toBe(0);
      }
    }
  });

  it('无人叫分会重新发牌', () => {
    let state = doudizhu.setup({
      players: [0, 1, 2].map((i) => ({ name: `P${i}`, isBot: true })),
      options: doudizhu.defaultOptions,
      seed: 42,
    });
    for (let i = 0; i < 3; i++)
      state = doudizhu.apply(state, state.turn, { type: 'bid', score: 0 });
    expect(state.redeals).toBe(1);
    expect(state.phase).toBe('bidding');
    expect(state.hands.every((h: unknown[]) => h.length === 17)).toBe(true);
  });

  it('叫 3 分直接成为地主并获得底牌', () => {
    let state = doudizhu.setup({
      players: [0, 1, 2].map((i) => ({ name: `P${i}`, isBot: true })),
      options: doudizhu.defaultOptions,
      seed: 7,
    });
    const seat = state.turn;
    state = doudizhu.apply(state, seat, { type: 'bid', score: 3 });
    expect(state.landlord).toBe(seat);
    expect(state.hands[seat]).toHaveLength(20);
    expect(state.phase).toBe('playing');
    expect(doudizhu.validate(state, seat, { type: 'pass' })).not.toBeNull(); // 首家不能不出
  });

  it('视图不泄露他人手牌', () => {
    const state = doudizhu.setup({
      players: [0, 1, 2].map((i) => ({ name: `P${i}`, isBot: true })),
      options: doudizhu.defaultOptions,
      seed: 3,
    });
    const v = doudizhu.view(state, 1);
    expect(v.hand).toHaveLength(17);
    const json = JSON.stringify(v);
    for (const card of state.hands[0]) expect(json).not.toContain(`"id":${card.id},`);
    expect(v.bottom).toBeNull();
  });
});
