import type { Card } from '../../core/cards';
import { BIG_JOKER, SMALL_JOKER } from '../../core/cards';
import type { DdzKind, DdzPattern } from './patterns';
import { analyzeValues, beats, ddzValue } from './patterns';

/**
 * 斗地主出牌生成：用于"提示"按钮与电脑玩家。
 * 以"值的多重集合"为单位生成，再映射回具体的牌。
 */

export type Counts = Map<number, number>;

export function countValues(cards: readonly Card[]): Counts {
  const m: Counts = new Map();
  for (const c of cards) {
    const v = ddzValue(c);
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}

export interface Combo {
  kind: DdzKind;
  values: number[];
  main: number;
  len: number;
}

function sub(cnt: Counts, values: readonly number[]): Counts {
  const m = new Map(cnt);
  for (const v of values) {
    const c = (m.get(v) ?? 0) - 1;
    if (c <= 0) m.delete(v);
    else m.set(v, c);
  }
  return m;
}

const rep = (v: number, n: number) => Array.from({ length: n }, () => v);

/** 选 k 个"代价最小"的带牌（单张优先从孤张中取），不得与 exclude 同点、不得组成王炸。 */
function pickKickers(
  cnt: Counts,
  k: number,
  pairs: boolean,
  exclude: Set<number>,
): number[] | null {
  const vals = [...cnt.keys()].filter((v) => !exclude.has(v)).sort((a, b) => a - b);
  const out: number[] = [];
  if (pairs) {
    // 先选恰好是对子的，再拆三张/炸弹
    const order = [...vals].sort(
      (a, b) => Number(cnt.get(a) !== 2) - Number(cnt.get(b) !== 2) || a - b,
    );
    for (const v of order) {
      if (out.length / 2 >= k) break;
      if (cnt.get(v)! >= 2 && v < SMALL_JOKER) out.push(v, v);
    }
    return out.length / 2 === k ? out : null;
  }
  const order = [...vals].sort(
    (a, b) => Number(cnt.get(a) !== 1) - Number(cnt.get(b) !== 1) || a - b,
  );
  let usedJoker = false;
  for (const v of order) {
    if (out.length >= k) break;
    if (v >= SMALL_JOKER) {
      if (usedJoker) continue;
      usedJoker = true;
    }
    const take = Math.min(cnt.get(v)!, k - out.length, 1);
    for (let i = 0; i < take; i++) out.push(v);
  }
  if (out.length < k) {
    // 不够再允许一个点数取多张
    for (const v of order) {
      while (out.length < k && out.filter((x) => x === v).length < cnt.get(v)! && v < SMALL_JOKER)
        out.push(v);
    }
  }
  return out.length === k ? out : null;
}

function chainStarts(cnt: Counts, len: number, need: number): number[] {
  const tops: number[] = [];
  for (let top = 3 + len - 1; top <= 14; top++) {
    let ok = true;
    for (let v = top - len + 1; v <= top; v++) if ((cnt.get(v) ?? 0) < need) ok = false;
    if (ok) tops.push(top);
  }
  return tops;
}

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}

/** 生成某一种牌型的所有候选（每个主值一个代表）。 */
export function generateKind(cnt: Counts, kind: DdzKind, len = 1): Combo[] {
  const out: Combo[] = [];
  const keys = [...cnt.keys()].sort((a, b) => a - b);
  const add = (values: number[], main: number, l = 1) => out.push({ kind, values, main, len: l });
  switch (kind) {
    case 'single':
      for (const v of keys) add([v], v);
      break;
    case 'pair':
      for (const v of keys) if (cnt.get(v)! >= 2) add([v, v], v);
      break;
    case 'trio':
      for (const v of keys) if (cnt.get(v)! >= 3) add(rep(v, 3), v);
      break;
    case 'trio1':
    case 'trio2':
      for (const v of keys) {
        if (cnt.get(v)! < 3) continue;
        const k = pickKickers(sub(cnt, rep(v, 3)), 1, kind === 'trio2', new Set([v]));
        if (k) add([...rep(v, 3), ...k], v);
      }
      break;
    case 'straight':
      for (const top of chainStarts(cnt, len, 1)) add(range(top - len + 1, top), top, len);
      break;
    case 'pairs':
      for (const top of chainStarts(cnt, len, 2))
        add(
          range(top - len + 1, top).flatMap((v) => [v, v]),
          top,
          len,
        );
      break;
    case 'plane':
    case 'plane1':
    case 'plane2':
      for (const top of chainStarts(cnt, len, 3)) {
        const body = range(top - len + 1, top).flatMap((v) => rep(v, 3));
        if (kind === 'plane') {
          add(body, top, len);
          continue;
        }
        const k = pickKickers(
          sub(cnt, body),
          len,
          kind === 'plane2',
          new Set(range(top - len + 1, top)),
        );
        if (k) add([...body, ...k], top, len);
      }
      break;
    case 'four2':
    case 'four22':
      for (const v of keys) {
        if (cnt.get(v)! < 4) continue;
        const k = pickKickers(sub(cnt, rep(v, 4)), 2, kind === 'four22', new Set([v]));
        if (k) add([...rep(v, 4), ...k], v);
      }
      break;
    case 'bomb':
      for (const v of keys) if (cnt.get(v) === 4) add(rep(v, 4), v);
      break;
    case 'rocket':
      if (cnt.has(SMALL_JOKER) && cnt.has(BIG_JOKER)) add([SMALL_JOKER, BIG_JOKER], BIG_JOKER);
      break;
  }
  // 校验一次，确保生成的组合确实是该牌型
  return out.filter((c) =>
    analyzeValues(c.values).some((p) => p.kind === kind && p.main === c.main),
  );
}

/** 所有能压过 target 的出法（target 为空时返回所有基础出法）。 */
export function beatingCombos(cnt: Counts, target: DdzPattern | null): Combo[] {
  const out: Combo[] = [];
  if (!target) {
    for (const kind of ['single', 'pair', 'trio', 'trio1', 'trio2'] as DdzKind[])
      out.push(...generateKind(cnt, kind));
    for (let len = 5; len <= 12; len++) out.push(...generateKind(cnt, 'straight', len));
    for (let len = 3; len <= 10; len++) out.push(...generateKind(cnt, 'pairs', len));
    for (let len = 2; len <= 6; len++) {
      out.push(...generateKind(cnt, 'plane', len));
      out.push(...generateKind(cnt, 'plane1', len));
      out.push(...generateKind(cnt, 'plane2', len));
    }
    out.push(...generateKind(cnt, 'four2'), ...generateKind(cnt, 'four22'));
    out.push(...generateKind(cnt, 'bomb'), ...generateKind(cnt, 'rocket'));
    return out;
  }
  if (target.kind === 'rocket') return out;
  if (target.kind !== 'bomb') {
    for (const c of generateKind(cnt, target.kind, target.len)) {
      const p: DdzPattern = { kind: c.kind, main: c.main, len: c.len, size: c.values.length };
      if (beats(p, target)) out.push(c);
    }
  }
  for (const c of generateKind(cnt, 'bomb')) {
    if (target.kind !== 'bomb' || c.main > target.main) out.push(c);
  }
  out.push(...generateKind(cnt, 'rocket'));
  return out;
}

/** 把值列表映射成手牌中的具体牌。 */
export function valuesToCards(hand: readonly Card[], values: readonly number[]): Card[] {
  const pool = [...hand];
  const out: Card[] = [];
  for (const v of values) {
    const idx = pool.findIndex((c) => ddzValue(c) === v);
    if (idx < 0) throw new Error(`value ${v} not in hand`);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 手牌拆分：估算"还需几手出完"，用于电脑决策

export interface Split {
  combos: Combo[];
  turns: number;
}

function extractChains(cnt: Counts, need: number, minLen: number, kind: DdzKind): Combo[] {
  const out: Combo[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    let bestLo = -1;
    let bestLen = 0;
    for (let lo = 3; lo <= 14; lo++) {
      let len = 0;
      while (lo + len <= 14 && (cnt.get(lo + len) ?? 0) >= need) len++;
      if (len >= minLen && len > bestLen) {
        bestLo = lo;
        bestLen = len;
      }
    }
    if (bestLo >= 0) {
      const vals = range(bestLo, bestLo + bestLen - 1);
      for (const v of vals) {
        const c = cnt.get(v)! - need;
        if (c === 0) cnt.delete(v);
        else cnt.set(v, c);
      }
      out.push({
        kind,
        values: vals.flatMap((v) => rep(v, need)),
        main: bestLo + bestLen - 1,
        len: bestLen,
      });
      changed = true;
    }
  }
  return out;
}

/** 顺子提取：只在它能吸收足够多孤张时才拆。 */
function extractStraights(cnt: Counts): Combo[] {
  const out: Combo[] = [];
  for (;;) {
    let best: { lo: number; len: number; gain: number } | null = null;
    for (let lo = 3; lo <= 10; lo++) {
      let len = 0;
      while (lo + len <= 14 && (cnt.get(lo + len) ?? 0) >= 1) len++;
      if (len < 5) continue;
      // 收益：吸收的孤张数 - 拆散对子/三张的数量
      let gain = 0;
      for (let v = lo; v < lo + len; v++) {
        const c = cnt.get(v)!;
        if (c === 1) gain += 1;
        else if (c === 2) gain -= 0.6;
        else if (c === 3) gain -= 0.8;
        else gain -= 3;
      }
      if (gain >= 2 && (!best || gain > best.gain)) best = { lo, len, gain };
    }
    if (!best) break;
    const vals = range(best.lo, best.lo + best.len - 1);
    for (const v of vals) {
      const c = cnt.get(v)! - 1;
      if (c === 0) cnt.delete(v);
      else cnt.set(v, c);
    }
    out.push({ kind: 'straight', values: vals, main: vals[vals.length - 1], len: vals.length });
  }
  return out;
}

export function splitHand(input: Counts): Split {
  const cnt = new Map(input);
  const combos: Combo[] = [];
  if (cnt.has(SMALL_JOKER) && cnt.has(BIG_JOKER)) {
    combos.push({ kind: 'rocket', values: [SMALL_JOKER, BIG_JOKER], main: BIG_JOKER, len: 1 });
    cnt.delete(SMALL_JOKER);
    cnt.delete(BIG_JOKER);
  }
  for (const [v, c] of [...cnt]) {
    if (c === 4) {
      combos.push({ kind: 'bomb', values: rep(v, 4), main: v, len: 1 });
      cnt.delete(v);
    }
  }
  const planes = extractChains(cnt, 3, 2, 'plane');
  const straights = extractStraights(cnt);
  const pairChains = extractChains(cnt, 2, 3, 'pairs');
  const trios: Combo[] = [];
  const pairs: Combo[] = [];
  const singles: Combo[] = [];
  for (const [v, c] of [...cnt].sort((a, b) => a[0] - b[0])) {
    if (c === 3) trios.push({ kind: 'trio', values: rep(v, 3), main: v, len: 1 });
    else if (c === 2) pairs.push({ kind: 'pair', values: [v, v], main: v, len: 1 });
    else if (c === 1) singles.push({ kind: 'single', values: [v], main: v, len: 1 });
  }
  // 带牌：飞机、三张吃掉最小的单张 / 对子（大牌不当带牌）
  const takeSingle = () => {
    const i = singles.findIndex((s) => s.main < 14);
    return i >= 0 ? singles.splice(i, 1)[0] : null;
  };
  const takePair = () => {
    const i = pairs.findIndex((s) => s.main < 14);
    return i >= 0 ? pairs.splice(i, 1)[0] : null;
  };
  for (const p of planes) {
    const usable = singles.filter((s) => s.main < 14).length;
    const usablePairs = pairs.filter((s) => s.main < 14).length;
    if (usable >= p.len) {
      for (let i = 0; i < p.len; i++) p.values.push(...takeSingle()!.values);
      p.kind = 'plane1';
    } else if (usablePairs >= p.len) {
      for (let i = 0; i < p.len; i++) p.values.push(...takePair()!.values);
      p.kind = 'plane2';
    }
  }
  for (const t of trios) {
    const s = takeSingle();
    if (s) {
      t.values.push(...s.values);
      t.kind = 'trio1';
      continue;
    }
    const p = takePair();
    if (p) {
      t.values.push(...p.values);
      t.kind = 'trio2';
    }
  }
  combos.push(...planes, ...straights, ...pairChains, ...trios, ...pairs, ...singles);
  const bombs = combos.filter((c) => c.kind === 'bomb' || c.kind === 'rocket').length;
  // 炸弹本身可以抢回出牌权，不算负担
  return { combos, turns: combos.length - bombs * 0.5 };
}
