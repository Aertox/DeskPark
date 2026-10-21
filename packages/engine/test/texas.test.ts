import { describe, expect, it } from 'vitest';
import type { Card, Suit } from '../src';
import { simulate, texas, tx } from '../src';

const { scoreHand, handName, bestFive } = tx;

let nextId = 5000;
const c = (spec: string): Card => {
  const suit = spec[0] as Suit;
  const r = spec.slice(1);
  const rank = ({ J: 11, Q: 12, K: 13, A: 14, T: 10 } as Record<string, number>)[r] ?? Number(r);
  return { id: nextId++, suit, rank };
};
const hand = (s: string) => s.split(' ').map(c);
const name = (s: string) => handName(scoreHand(hand(s)));

describe('德州牌力评估', () => {
  it('识别各类牌型', () => {
    expect(name('SA SK SQ SJ ST C2 D3')).toBe('皇家同花顺');
    expect(name('S9 S8 S7 S6 S5 C2 D3')).toBe('同花顺');
    expect(name('SA CA DA HA S5 C2 D3')).toBe('四条');
    expect(name('SA CA DA H5 S5 C2 D3')).toBe('葫芦');
    expect(name('S2 S8 S7 S6 SJ C2 D3')).toBe('同花');
    expect(name('SA C2 D3 H4 S5 C9 DJ')).toBe('顺子');
    expect(name('SA CA DA H4 S5 C9 DJ')).toBe('三条');
    expect(name('SA CA D4 H4 S5 C9 DJ')).toBe('两对');
    expect(name('SA CA D4 H3 S5 C9 DJ')).toBe('一对');
    expect(name('SA CQ D4 H3 S5 C9 DJ')).toBe('高牌');
  });

  it('比较大小与踢脚', () => {
    expect(scoreHand(hand('SA CA D9 H4 S5'))).toBeGreaterThan(scoreHand(hand('SK CK DQ HJ S9')));
    expect(scoreHand(hand('SA CA DK H4 S5'))).toBeGreaterThan(scoreHand(hand('HA DA DQ HJ S9')));
    expect(scoreHand(hand('S6 C5 D4 H3 S2'))).toBeGreaterThan(scoreHand(hand('SA C5 D4 H3 S2')));
    // 同花与三条共存取同花；（8 张时）同花与葫芦共存取葫芦
    expect(name('SA SK S9 S5 S2 CA DA')).toBe('同花');
    expect(name('SA SK S9 S5 S2 CA DA H9')).toBe('葫芦');
  });

  it('bestFive 返回构成牌型的五张', () => {
    const { cards, score } = bestFive(hand('SA CA DA H5 S5 C2 D3'));
    expect(cards).toHaveLength(5);
    expect(handName(score)).toBe('葫芦');
  });
});

describe('德州下注流程', () => {
  const players = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: true }));

  it('盲注与行动顺序（3 人）', () => {
    const s = texas.setup({ players: players(3), options: texas.defaultOptions, seed: 11 });
    expect(s.players[s.sbSeat].bet).toBe(10);
    expect(s.players[s.bbSeat].bet).toBe(20);
    expect(s.turn).toBe((s.bbSeat + 1) % 3);
    expect(s.turn).toBe(s.dealer);
  });

  it('单挑时庄家是小盲并先行动', () => {
    const s = texas.setup({ players: players(2), options: texas.defaultOptions, seed: 5 });
    expect(s.sbSeat).toBe(s.dealer);
    expect(s.turn).toBe(s.dealer);
  });

  it('其余人弃牌时直接赢下底池', () => {
    let s = texas.setup({ players: players(3), options: texas.defaultOptions, seed: 2 });
    s = texas.apply(s, s.turn, { type: 'fold' });
    s = texas.apply(s, s.turn, { type: 'fold' });
    expect(s.phase).toBe('handOver');
    expect(s.result!.showdown).toBe(false);
    const total = s.players.reduce((a: number, p: { stack: number }) => a + p.stack, 0);
    expect(total).toBe(6000);
  });

  it('全下形成边池，筹码守恒', () => {
    let s = texas.setup({
      players: players(3),
      options: { startingStack: 1000, bigBlind: 20, blindUp: 0 },
      seed: 21,
    });
    // 人为制造不同筹码量
    s.players[0].stack = 100;
    s.players[1].stack = 500;
    s.players[2].stack = 2000;
    const before = s.players.reduce((a: number, p: any) => a + p.stack + p.bet, 0);
    let guard = 0;
    while (s.phase === 'betting' && guard++ < 20) s = texas.apply(s, s.turn, { type: 'allin' });
    expect(s.phase === 'handOver' || s.phase === 'gameOver').toBe(true);
    const after = s.players.reduce((a: number, p: any) => a + p.stack, 0);
    expect(after).toBe(before);
    // 只有 100 筹码的玩家最多赢回 3 × 100
    expect(s.result!.won[0]).toBeLessThanOrEqual(300);
    expect(s.result!.pots.reduce((a: number, p: { amount: number }) => a + p.amount, 0)).toBe(
      before,
    );
  });

  it('加注规则：最小加注额', () => {
    const s = texas.setup({ players: players(3), options: texas.defaultOptions, seed: 8 });
    expect(texas.validate(s, s.turn, { type: 'raise', to: 30 })).not.toBeNull();
    expect(texas.validate(s, s.turn, { type: 'raise', to: 40 })).toBeNull();
    expect(texas.validate(s, s.turn, { type: 'check' })).not.toBeNull();
  });

  it('电脑对战可以打到决出胜者，筹码总数守恒', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const n = 2 + (seed % 5);
      const { state } = simulate(
        texas,
        n,
        { startingStack: 1000, bigBlind: 20, blindUp: 5 },
        seed,
        40000,
      );
      expect(state.phase).toBe('gameOver');
      const total = state.players.reduce((a: number, p: { stack: number }) => a + p.stack, 0);
      expect(total).toBe(1000 * n);
      expect(state.players.filter((p: { out: boolean }) => !p.out)).toHaveLength(1);
    }
  });
});
