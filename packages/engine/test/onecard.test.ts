import { describe, expect, it } from 'vitest';
import type { oc as OC } from '../src';
import { SYSTEM_SEAT, oc, onecard, simulate } from '../src';

type State = OC.OcState;
type Card = OC.OcCard;
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: true }));

let nextId = 500;
const num = (color: OC.OcColor, n: number): Card => ({ id: nextId++, color, kind: 'num', n });
const act = (color: OC.OcColor, kind: 'skip' | 'reverse' | 'draw2'): Card => ({
  id: nextId++,
  color,
  kind,
});
const wild = (kind: 'wild' | 'wild4' = 'wild'): Card => ({ id: nextId++, color: null, kind });

/** 可控局面：指定每人手牌、弃牌堆顶，0 号先出 */
function make(hands: Card[][], top: Card = num('R', 5), opts: Partial<OC.OcOptions> = {}): State {
  const st = onecard.setup({
    players: players(hands.length),
    options: { target: 0, stack: false, ...opts },
    seed: 1,
  });
  st.hands = hands;
  st.discard = [top];
  st.color = top.color;
  st.pile = Array.from({ length: 30 }, (_, i) => num('G', i % 10));
  st.turn = 0;
  st.dir = 1;
  st.pending = null;
  st.drawn = null;
  st.window = null;
  st.called = hands.map(() => false);
  return st;
}

function play(st: State, seat: number, card: Card, extra: Partial<OC.OcAction> = {}): State {
  const action = { type: 'play', card: card.id, ...extra } as OC.OcAction;
  const err = onecard.validate(st, seat, action);
  if (err) throw new Error(err);
  return onecard.apply(st, seat, action);
}
const run = (st: State, seat: number, action: OC.OcAction) => {
  const err = onecard.validate(st, seat, action);
  if (err) throw new Error(err);
  return onecard.apply(st, seat, action);
};

describe('喊一张', () => {
  it('108 张牌：四色 0 一张、1–9 / 跳过 / 反转 / +2 各两张，万能牌与 +4 各四张', () => {
    for (const count of [2, 4, 8]) {
      const st = onecard.setup({
        players: players(count),
        options: onecard.defaultOptions,
        seed: count,
      });
      const all = [...st.hands.flat(), ...st.pile, ...st.discard];
      expect(all).toHaveLength(108);
      expect(new Set(all.map((c) => c.id)).size).toBe(108);
      expect(st.hands.every((h) => h.length === 7 || h.length === 9)).toBe(true);
      for (const color of oc.COLORS) {
        const mine = all.filter((c) => c.color === color);
        expect(mine).toHaveLength(25);
        expect(mine.filter((c) => c.kind === 'num' && c.n === 0)).toHaveLength(1);
        expect(mine.filter((c) => c.kind === 'num' && c.n === 7)).toHaveLength(2);
        expect(mine.filter((c) => c.kind === 'draw2')).toHaveLength(2);
      }
      expect(all.filter((c) => c.kind === 'wild')).toHaveLength(4);
      expect(all.filter((c) => c.kind === 'wild4')).toHaveLength(4);
      expect(st.discard[0].kind).not.toBe('wild4');
    }
  });

  it('牌的 id 只代表洗牌后的位置，不会泄露是哪张牌', () => {
    const a = onecard.setup({ players: players(4), options: onecard.defaultOptions, seed: 1 });
    const b = onecard.setup({ players: players(4), options: onecard.defaultOptions, seed: 2 });
    const label = (st: State, id: number) => {
      const c = [...st.hands.flat(), ...st.pile, ...st.discard].find((x) => x.id === id)!;
      return oc.cardLabel(c);
    };
    const diff = Array.from({ length: 108 }, (_, id) => label(a, id) !== label(b, id));
    expect(diff.filter(Boolean).length).toBeGreaterThan(60);
  });

  it('视图：只看得到自己的手牌，+4 是否违规不会发出去', () => {
    const st = make([[wild('wild4'), num('R', 2), num('B', 3)], [num('Y', 1)], [num('G', 1)]]);
    const v = onecard.view(st, 1);
    expect(v.hand.map((c) => c.id)).toEqual([st.hands[1][0].id]);
    expect(v.counts).toEqual([3, 1, 1]);
    expect(JSON.stringify(v)).not.toContain('"hands"');
    expect(JSON.stringify(v)).not.toContain('"pile"');
    const after = play(st, 0, st.hands[0][0], { color: 'B' });
    expect(after.pending?.guilty).toBe(true);
    expect(JSON.stringify(onecard.view(after, 1))).not.toContain('guilty');
    expect(onecard.view(after, null).hand).toEqual([]);
  });

  it('同色、同号、同符号才能接；万能牌随时能出', () => {
    const top = num('R', 5);
    expect(oc.matches(num('R', 1), top, 'R')).toBe(true);
    expect(oc.matches(num('B', 5), top, 'R')).toBe(true);
    expect(oc.matches(num('B', 6), top, 'R')).toBe(false);
    expect(oc.matches(act('B', 'skip'), act('R', 'skip'), 'R')).toBe(true);
    expect(oc.matches(act('B', 'skip'), act('R', 'reverse'), 'R')).toBe(false);
    expect(oc.matches(wild(), top, 'R')).toBe(true);
    // 万能牌指定蓝色后，只看颜色
    expect(oc.matches(num('B', 9), wild(), 'B')).toBe(true);
    expect(oc.matches(num('R', 9), wild(), 'B')).toBe(false);
    const st = make([[num('B', 6), num('R', 1)], [num('Y', 1)]]);
    expect(onecard.validate(st, 0, { type: 'play', card: st.hands[0][0].id })).toContain('同色');
    expect(onecard.validate(st, 0, { type: 'play', card: 9999 })).toBeTruthy();
    const w = make([[wild(), num('R', 1)], [num('Y', 1)]]);
    expect(onecard.validate(w, 0, { type: 'play', card: w.hands[0][0].id })).toContain('颜色');
  });

  it('跳过、反转（两人局相当于跳过）、+2', () => {
    let st = make([[act('R', 'skip'), num('R', 1), num('R', 2)], [num('Y', 1)], [num('G', 1)]]);
    st = play(st, 0, st.hands[0][0]);
    expect(st.turn).toBe(2);

    st = make([[act('R', 'reverse'), num('R', 1), num('R', 2)], [num('Y', 1)], [num('G', 1)]]);
    st = play(st, 0, st.hands[0][0]);
    expect(st.dir).toBe(-1);
    expect(st.turn).toBe(2);

    let two = make([[act('R', 'reverse'), num('R', 1), num('R', 2)], [num('Y', 1)]]);
    two = play(two, 0, two.hands[0][0]);
    expect(two.turn).toBe(0);

    st = make([[act('R', 'draw2'), num('R', 1), num('R', 2)], [num('Y', 1)], [num('G', 1)]]);
    st = play(st, 0, st.hands[0][0]);
    expect(st.hands[1]).toHaveLength(3);
    expect(st.turn).toBe(2);
  });

  it('摸牌：摸到能出的可以马上打出或留着，摸到不能出的直接轮到下一位', () => {
    let st = make([[num('B', 1)], [num('Y', 1)]]);
    st.pile = [num('R', 7)];
    st = run(st, 0, { type: 'draw' });
    expect(st.drawn).toBe(st.hands[0][1].id);
    expect(st.turn).toBe(0);
    expect(onecard.validate(st, 0, { type: 'play', card: st.hands[0][0].id })).toContain('刚摸到');
    const kept = run(st, 0, { type: 'keep' });
    expect(kept.turn).toBe(1);
    const played = play(st, 0, st.hands[0][1]);
    expect(played.discard.at(-1)!.n).toBe(7);

    let miss = make([[num('B', 1)], [num('Y', 1)]]);
    miss.pile = [num('G', 8)];
    miss = run(miss, 0, { type: 'draw' });
    expect(miss.turn).toBe(1);
    expect(miss.drawn).toBeNull();
  });

  it('万能 +4：接受摸 4 张；质疑时违规的人摸 4 张，没违规则质疑者摸 6 张', () => {
    // 0 号手里还有红色：违规
    let st = make([[wild('wild4'), num('R', 2), num('B', 3)], [num('Y', 1)], [num('G', 1)]]);
    st = play(st, 0, st.hands[0][0], { color: 'B' });
    expect(st.turn).toBe(1);
    expect(st.pending).toMatchObject({ amount: 4, challengeable: true });
    expect(onecard.validate(st, 1, { type: 'play', card: st.hands[1][0].id })).toBeTruthy();
    const accepted = run(st, 1, { type: 'draw' });
    expect(accepted.hands[1]).toHaveLength(5);
    expect(accepted.turn).toBe(2);
    const caught = run(st, 1, { type: 'challenge' });
    expect(caught.hands[0]).toHaveLength(6);
    expect(caught.hands[1]).toHaveLength(1);
    expect(caught.turn).toBe(1);

    // 没有红色：合法，质疑失败摸 6 张
    let ok = make([[wild('wild4'), num('B', 3), num('G', 3)], [num('Y', 1)], [num('G', 1)]]);
    ok = play(ok, 0, ok.hands[0][0], { color: 'B' });
    const wrong = run(ok, 1, { type: 'challenge' });
    expect(wrong.hands[1]).toHaveLength(7);
    expect(wrong.turn).toBe(2);
  });

  it('叠加罚牌：+2 接 +2 / +4，累计给下一位', () => {
    let st = make(
      [
        [act('R', 'draw2'), num('R', 1)],
        [act('B', 'draw2'), num('B', 1)],
        [wild('wild4'), num('G', 1)],
        [num('Y', 1)],
      ],
      num('R', 5),
      { stack: true },
    );
    st = play(st, 0, st.hands[0][0], { uno: true });
    expect(st.pending).toMatchObject({ amount: 2, kind: 'draw2' });
    expect(onecard.validate(st, 1, { type: 'play', card: st.hands[1][1].id })).toContain('+2');
    st = play(st, 1, st.hands[1][0], { uno: true });
    st = play(st, 2, st.hands[2][0], { color: 'G', uno: true });
    expect(st.pending).toMatchObject({ amount: 8, kind: 'wild4', challengeable: false });
    expect(onecard.validate(st, 3, { type: 'challenge' })).toBeTruthy();
    st = run(st, 3, { type: 'draw' });
    expect(st.hands[3]).toHaveLength(9);
    expect(st.turn).toBe(0);
  });

  it('只剩一张没喊：下一位行动前可以被抓，罚摸 2 张；补喊或无人抓则躲过', () => {
    const base = make([[num('R', 1), num('R', 2)], [num('Y', 1), num('Y', 2)], [num('G', 1)]]);
    const st = play(base, 0, base.hands[0][0]);
    expect(st.window).toMatchObject({ seat: 0 });
    expect(onecard.activeSeats(st).sort()).toEqual([0, 1, 2]);
    const caught = run(st, 2, { type: 'catch' });
    expect(caught.hands[0]).toHaveLength(3);
    expect(caught.window).toBeNull();
    expect(caught.turn).toBe(1);

    const late = run(st, 0, { type: 'uno' });
    expect(late.window).toBeNull();
    expect(late.called[0]).toBe(true);
    expect(onecard.validate(late, 2, { type: 'catch' })).toBeTruthy();

    // 下一位开始行动，窗口关闭
    const moved = run(st, 1, { type: 'draw' });
    expect(moved.window).toBeNull();
    expect(moved.hands[0]).toHaveLength(1);

    // 其他人都放过也会关闭；系统定时关闭
    let passed = run(st, 0, { type: 'pass' });
    passed = run(passed, 2, { type: 'pass' });
    expect(passed.window).toBeNull();
    expect(onecard.autoAdvance!(st)).toMatchObject({ action: { type: 'close' } });
    expect(onecard.apply(st, SYSTEM_SEAT, { type: 'close' }).window).toBeNull();

    // 喊了就不能抓
    const called = play(base, 0, base.hands[0][0], { uno: true });
    expect(called.window).toBeNull();
    expect(called.called[0]).toBe(true);
  });

  it('出完最后一张赢下本局，拿走其他人手牌的分值；最后一张是 +2 时下一位照样要摸', () => {
    let st = make([[act('R', 'draw2')], [num('Y', 9), wild()], [act('G', 'skip')]], num('R', 5), {
      target: 250,
    });
    st = play(st, 0, st.hands[0][0]);
    expect(st.phase).toBe('roundOver');
    expect(st.hands[1]).toHaveLength(4);
    // 9 + 50 + 摸到的两张绿色数字牌 + 20
    const handPoints = st.result!.handPoints;
    expect(handPoints[0]).toBe(0);
    expect(st.result!.points[0]).toBe(handPoints[1] + handPoints[2]);
    expect(st.scores[0]).toBe(st.result!.points[0]);
    for (const s of [0, 1, 2]) st = run(st, s, { type: 'ready' });
    expect(st.round).toBe(2);
    expect(st.phase).toBe('play');
    expect(st.hands.every((h) => h.length >= 7)).toBe(true);
  });

  it('单局决胜：出完就结束整场', () => {
    let st = make([[num('R', 1)], [num('Y', 9)]]);
    st = play(st, 0, st.hands[0][0]);
    expect(st.phase).toBe('matchOver');
    expect(st.ranking![0]).toBe(0);
    expect(onecard.isOver(st)).toBe(true);
  });

  it('开局翻出功能牌：跳过 / +2 让第一位停一轮，反转由庄家先出', () => {
    let seen = 0;
    for (let seed = 1; seed <= 400 && seen < 3; seed++) {
      const st = onecard.setup({ players: players(4), options: onecard.defaultOptions, seed });
      const first = (st.dealer + 1) % 4;
      const top = st.discard[0];
      if (top.kind === 'skip' || top.kind === 'draw2') {
        expect(st.turn).toBe((first + 1) % 4);
        if (top.kind === 'draw2') expect(st.hands[first]).toHaveLength(9);
        seen++;
      } else if (top.kind === 'reverse') {
        expect(st.turn).toBe(st.dealer);
        expect(st.dir).toBe(-1);
        seen++;
      } else if (top.kind === 'wild') {
        expect(st.color).toBeNull();
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('牌堆摸空时把弃牌堆洗回去', () => {
    let st = make([[num('B', 1)], [num('Y', 1)]]);
    st.pile = [];
    st.discard = [num('G', 1), num('G', 2), num('R', 5)];
    st = run(st, 0, { type: 'draw' });
    expect(st.hands[0]).toHaveLength(2);
    expect(st.discard).toHaveLength(1);
    expect(st.discard[0].n).toBe(5);
  });

  it('电脑对战（含叠加规则与计分）可以完整打完', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const n = 2 + (seed % 7);
      const { state } = simulate(
        onecard,
        n,
        { target: seed % 2 ? 0 : 250, stack: seed % 3 === 0 },
        seed,
      );
      expect(state.phase).toBe('matchOver');
      expect(state.ranking).toHaveLength(n);
    }
  });
});
