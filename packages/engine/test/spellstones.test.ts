import { describe, expect, it } from 'vitest';
import type { ss as SS } from '../src';
import { ss, simulate, spellstones } from '../src';

type State = SS.SsState;
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: true }));
const stone = (id: number, spell: SS.Spell): SS.SsStone => ({ id, spell });

/** 构造一个可控的局面：指定每人面前的石头，牌库按给定顺序 */
function make(n: number, racks: SS.Spell[][], pool: SS.Spell[] = [8, 8, 8, 8, 8, 8, 8, 8]): State {
  const st = spellstones.setup({ players: players(n), options: {}, seed: 1 });
  let id = 100;
  st.players.forEach((p, s) => {
    p.rack = (racks[s] ?? []).map((sp) => stone(id++, sp));
    p.life = 6;
    p.secrets = [];
  });
  st.pool = pool.map((sp) => stone(id++, sp));
  st.secret = [stone(id++, 2), stone(id++, 5)];
  st.board = [];
  st.removed = [];
  st.turn = 0;
  st.chainMin = null;
  st.castThisTurn = 0;
  return st;
}

const cast = (st: State, seat: number, spell: SS.Spell) => {
  const err = spellstones.validate(st, seat, { type: 'cast', spell });
  if (err) throw new Error(err);
  return spellstones.apply(st, seat, { type: 'cast', spell });
};

describe('魔法出包', () => {
  it('发石：36 块各归其位，2 / 3 人局公开移出 12 / 6 块', () => {
    for (const n of [2, 3, 4, 5]) {
      const st = spellstones.setup({ players: players(n), options: {}, seed: n * 7 });
      const all = [...st.players.flatMap((p) => p.rack), ...st.pool, ...st.secret, ...st.removed];
      expect(all).toHaveLength(36);
      expect(new Set(all.map((s) => s.id)).size).toBe(36);
      for (const sp of ss.SPELLS) expect(all.filter((s) => s.spell === sp)).toHaveLength(sp);
      expect(st.players.every((p) => p.rack.length === 5 && p.life === 6)).toBe(true);
      expect(st.secret).toHaveLength(4);
      expect(st.removed).toHaveLength(ss.removedCount(n));
    }
  });

  it('石头的 id 只代表洗牌后的位置，不会泄露是哪种咒语', () => {
    const spellOf = (st: State, id: number) =>
      [...st.players.flatMap((p) => p.rack), ...st.pool, ...st.secret, ...st.removed].find(
        (x) => x.id === id,
      )!.spell;
    const a = spellstones.setup({ players: players(4), options: {}, seed: 1 });
    const b = spellstones.setup({ players: players(4), options: {}, seed: 2 });
    const diff = Array.from({ length: 36 }, (_, id) => spellOf(a, id) !== spellOf(b, id));
    expect(diff.filter(Boolean).length).toBeGreaterThan(15);
  });

  it('视图：看得到别人的石头，看不到自己的；观战者看不到任何人的', () => {
    const st = spellstones.setup({ players: players(4), options: {}, seed: 3 });
    const v = spellstones.view(st, 1);
    expect(v.players[1].rack).toBeNull();
    expect(v.myRack).toHaveLength(5);
    expect(v.players[0].rack).toHaveLength(5);
    expect(JSON.stringify(v)).not.toContain('"pool"');
    expect(JSON.stringify(v)).not.toContain('"secret"');
    const spec = spellstones.view(st, null);
    expect(spec.players.every((p) => p.rack === null)).toBe(true);
  });

  it('施放成功：石头上法阵，效果生效，可以继续宣告更大的号码', () => {
    let st = make(4, [[7, 7, 6, 3, 8], [8], [8], [8]]);
    st = cast(st, 0, 7); // 火球：上家（3 号座）-1
    expect(st.players[3].life).toBe(5);
    expect(st.board.map((s) => s.spell)).toEqual([7]);
    expect(st.turn).toBe(0);
    expect(spellstones.validate(st, 0, { type: 'cast', spell: 6 })).toContain('7 号');
    st = cast(st, 0, 7); // 同号可以再来
    expect(st.players[3].life).toBe(4);
    st = cast(st, 0, 8); // 药水：满血时不变
    expect(st.players[0].life).toBe(6);
    st = spellstones.apply(st, 0, { type: 'stop' });
    expect(st.turn).toBe(1);
    expect(st.players[0].rack).toHaveLength(5); // 补满
  });

  it('不能一个都不宣告就结束回合', () => {
    const st = make(3, [[8], [8], [8]]);
    expect(spellstones.validate(st, 0, { type: 'stop' })).toBeTruthy();
  });

  it('施放失败：失去 1 点生命，回合结束并补石', () => {
    let st = make(3, [[8, 8, 8], [8], [8]]);
    st = cast(st, 0, 5);
    expect(st.players[0].life).toBe(5);
    expect(st.turn).toBe(1);
    expect(st.players[0].rack).toHaveLength(5);
    const ev = st.events.at(-2)!;
    expect(ev.type).toBe('fail');
  });

  it('火龙出包：火龙反噬掷骰扣血，再加 1 点魔法反噬', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let st = make(3, [[8], [8], [8]]);
      st.rng = seed;
      st = cast(st, 0, 1);
      const ev = st.events.find((e) => e.type === 'fail')!;
      if (ev.type !== 'fail') throw new Error('应为出包');
      expect(ev.roll).toBeGreaterThanOrEqual(1);
      expect(ev.roll).toBeLessThanOrEqual(3);
      expect(ev.loss).toBe(ev.roll! + 1);
      expect(st.players[0].life).toBe(6 - ev.loss);
    }
  });

  it('每回合最多连续施放 5 次：打空后牌库还有石头就补满，轮到下一位', () => {
    let st = make(3, [[8, 8, 8, 8, 8], [7], [7]], [6, 6, 6, 6, 6, 6]);
    for (let i = 0; i < 5; i++) st = cast(st, 0, 8);
    expect(st.phase).toBe('play');
    expect(st.turn).toBe(1);
    expect(st.players[0].rack).toHaveLength(5);
    const forced = make(3, [[8, 8], [8], [8]]);
    forced.castThisTurn = 5;
    forced.chainMin = 8;
    expect(spellstones.validate(forced, 0, { type: 'cast', spell: 8 })).toContain('最多');
  });

  it('各咒语效果（含两人局的雷霆风暴）', () => {
    let st = make(4, [[2, 5, 6], [8], [8], [8]]);
    st.players[0].life = 4;
    st = cast(st, 0, 2); // 暗影游魂：其他人 -1，自己 +1
    expect(st.players.map((p) => p.life)).toEqual([5, 5, 5, 5]);
    st = cast(st, 0, 5); // 雷霆风暴：左右各 -1
    expect(st.players.map((p) => p.life)).toEqual([5, 4, 5, 4]);
    st = cast(st, 0, 6); // 暴风雪：下家 -1
    expect(st.players.map((p) => p.life)).toEqual([5, 3, 5, 4]);

    let two = make(2, [[5], [8]]);
    two = cast(two, 0, 5);
    expect(two.players[1].life).toBe(5);

    let owl = make(3, [[4, 8], [8], [8]]);
    owl = cast(owl, 0, 4);
    expect(owl.players[0].secrets).toHaveLength(1);
    expect(owl.secret).toHaveLength(1);
    expect(spellstones.view(owl, 0).players[0].secrets).toHaveLength(1);
    expect(spellstones.view(owl, 1).players[0].secrets).toBeNull();
    expect(spellstones.view(owl, 1).players[0].secretCount).toBe(1);
  });

  it('把别人打到 0：赢家 3 分，存活者 1 分，秘密石加分', () => {
    let st = make(3, [[7, 8], [8], [8]]);
    st.players[2].life = 1;
    st.players[1].secrets = [stone(90, 3)];
    st = cast(st, 0, 7);
    expect(st.phase).toBe('roundOver');
    expect(st.result).toMatchObject({ reason: 'knockout', winner: 0, knocked: [2] });
    expect(st.result!.points).toEqual([3, 2, 0]);
    expect(spellstones.view(st, 0).players[0].rack).not.toBeNull(); // 本轮结束后亮牌
  });

  it('失败把自己打到 0：没有赢家', () => {
    let st = make(3, [[8], [8], [8]]);
    st.players[0].life = 1;
    st = cast(st, 0, 3);
    expect(st.result).toMatchObject({ reason: 'self', winner: null, points: [0, 1, 1] });
  });

  it('牌库用完后打空面前的石头：上 3 层，其他人不动（猫头鹰魔法石照算）', () => {
    let st = make(3, [[6, 8], [8], [8]], []);
    st.players[2].secrets = [stone(91, 5)];
    st = cast(st, 0, 6);
    st = cast(st, 0, 8);
    expect(st.result).toMatchObject({ reason: 'empty', winner: 0, points: [3, 0, 1] });
  });

  it('所有人准备后开始新一轮，先手轮换；到达第 8 层结束整场', () => {
    let st = make(3, [[6, 8], [8], [8]], []);
    st = cast(st, 0, 6);
    st = cast(st, 0, 8);
    for (const s of [0, 1, 2]) st = spellstones.apply(st, s, { type: 'ready' });
    expect(st.round).toBe(2);
    expect(st.phase).toBe('play');
    expect(st.turn).toBe(1);
    expect(st.players.every((p) => p.life === 6 && p.rack.length === 5)).toBe(true);

    let end = make(3, [[7], [8], [8]]);
    end.players[0].score = 6;
    end.players[2].life = 1;
    end = cast(end, 0, 7);
    expect(end.phase).toBe('matchOver');
    expect(end.ranking![0]).toBe(0);
    expect(end.winners).toEqual([0]);
    expect(spellstones.isOver(end)).toBe(true);
  });

  it('多人同时到达第 8 层：本轮前进多的获胜，相同则共同获胜', () => {
    // 0 号击倒 2 号上 3 层到 8；1 号上 1 层到 8：0 号获胜
    let a = make(3, [[7], [8], [8]]);
    a.players[0].score = 5;
    a.players[1].score = 7;
    a.players[2].life = 1;
    a = cast(a, 0, 7);
    expect(a.winners).toEqual([0]);
    expect(a.ranking!.slice(0, 2)).toEqual([0, 1]);

    // 1 号还有 2 块猫头鹰魔法石：同样上 3 层，共同获胜
    let b = make(3, [[7], [8], [8]]);
    b.players[0].score = 5;
    b.players[1].score = 6;
    b.players[1].secrets = [stone(92, 3), stone(93, 4)];
    b.players[2].life = 1;
    b = cast(b, 0, 7);
    expect(b.result!.points).toEqual([3, 3, 0]);
    expect(b.winners).toEqual([0, 1]);

    // 没到终点的按层数排名
    let c = make(4, [[7], [8], [8], [8]]);
    c.players.forEach((p, s) => (p.score = [6, 4, 1, 5][s]));
    c.players[1].secrets = [stone(94, 3)];
    c.players[3].life = 1;
    c = cast(c, 0, 7);
    expect(c.winners).toEqual([0]);
    expect(c.ranking).toEqual([0, 1, 3, 2]);
  });

  it('概率推算：看得见的都排除，确定没有的为 0', () => {
    const st = make(3, [
      [1, 2],
      [2, 3, 3, 3],
      [8, 8, 8, 8, 8, 8, 8, 8],
    ]);
    st.board = [stone(80, 1)];
    const odds = ss.rackOdds(spellstones.view(st, 0), 0);
    const of = (s: SS.Spell) => odds.find((o) => o.spell === s)!;
    expect(of(1).chance).toBe(0); // 唯一一块在法阵上
    expect(of(8).unknown).toBe(0); // 8 块都在别人面前
    expect(of(8).chance).toBe(0);
    expect(of(2).unknown).toBe(1);
    expect(of(7).chance).toBeGreaterThan(of(2).chance);
  });

  it('电脑对战可以完整打完多场', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + (seed % 4);
      const { state } = simulate(spellstones, n, {}, seed);
      expect(state.phase).toBe('matchOver');
      expect(Math.max(...state.players.map((p) => p.score))).toBeGreaterThanOrEqual(8);
    }
  });
});
