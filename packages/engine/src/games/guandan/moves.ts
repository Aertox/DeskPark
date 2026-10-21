import type { Card, Suit } from '../../core/cards';
import { BIG_JOKER, SMALL_JOKER } from '../../core/cards';
import type { GdKind, GdPattern } from './patterns';
import { gdBeats, gdRankValue, isBombPattern, isWild, resolveGd } from './patterns';

/** 掼蛋出牌候选生成（含万能牌补位），用于提示与电脑玩家。 */

export interface GdCandidate {
  cards: Card[];
  pattern: GdPattern;
  wilds: number;
}

interface HandIndex {
  wilds: Card[];
  byRank: Map<number, Card[]>;
  small: Card[];
  big: Card[];
}

function indexHand(hand: readonly Card[], level: number): HandIndex {
  const idx: HandIndex = { wilds: [], byRank: new Map(), small: [], big: [] };
  for (const c of hand) {
    if (isWild(c, level)) idx.wilds.push(c);
    else if (c.rank === SMALL_JOKER) idx.small.push(c);
    else if (c.rank === BIG_JOKER) idx.big.push(c);
    else {
      const list = idx.byRank.get(c.rank) ?? [];
      list.push(c);
      idx.byRank.set(c.rank, list);
    }
  }
  return idx;
}

function finalize(cards: Card[], level: number, target: GdPattern | null, wilds: number) {
  const pattern = resolveGd(cards, level, target);
  if (!pattern) return null;
  if (target && !gdBeats(pattern, target)) return null;
  return { cards, pattern, wilds } as GdCandidate;
}

/** 每个点数取 size 张（必要时用万能牌补齐） */
function sameRank(
  idx: HandIndex,
  size: number,
  maxWilds: number,
): { rank: number; cards: Card[]; wilds: number }[] {
  const out: { rank: number; cards: Card[]; wilds: number }[] = [];
  for (const [rank, list] of idx.byRank) {
    const nat = Math.min(list.length, size);
    const need = size - nat;
    if (need <= Math.min(maxWilds, idx.wilds.length)) {
      out.push({ rank, cards: [...list.slice(0, nat), ...idx.wilds.slice(0, need)], wilds: need });
    }
  }
  return out;
}

const CHAIN_SPEC: Partial<Record<GdKind, { len: number; per: number; minTop: number }>> = {
  straight: { len: 5, per: 1, minTop: 5 },
  straightflush: { len: 5, per: 1, minTop: 5 },
  tube: { len: 3, per: 2, minTop: 3 },
  plate: { len: 2, per: 3, minTop: 2 },
};

function chainCandidates(
  idx: HandIndex,
  kind: GdKind,
  level: number,
  target: GdPattern | null,
): GdCandidate[] {
  const spec = CHAIN_SPEC[kind]!;
  const out: GdCandidate[] = [];
  const suits: (Suit | null)[] = kind === 'straightflush' ? ['S', 'H', 'C', 'D'] : [null];
  for (const suit of suits) {
    for (let top = spec.minTop; top <= 14; top++) {
      const cards: Card[] = [];
      let wildsUsed = 0;
      let ok = true;
      for (let r = top - spec.len + 1; r <= top; r++) {
        const natural = r === 1 ? 14 : r;
        const pool = (idx.byRank.get(natural) ?? []).filter((c) => !suit || c.suit === suit);
        const take = Math.min(pool.length, spec.per);
        cards.push(...pool.slice(0, take));
        wildsUsed += spec.per - take;
        if (wildsUsed > idx.wilds.length) {
          ok = false;
          break;
        }
      }
      if (!ok || wildsUsed === spec.len * spec.per) continue;
      cards.push(...idx.wilds.slice(0, wildsUsed));
      const cand = finalize(cards, level, target, wildsUsed);
      if (cand && (kind !== 'straightflush' || cand.pattern.kind === 'straightflush'))
        out.push(cand);
    }
  }
  return out;
}

export function candidatesOfKind(
  hand: readonly Card[],
  level: number,
  kind: GdKind,
  target: GdPattern | null,
): GdCandidate[] {
  const idx = indexHand(hand, level);
  const out: GdCandidate[] = [];
  const add = (cards: Card[], wilds: number) => {
    const c = finalize(cards, level, target, wilds);
    if (c && c.pattern.kind === kind) out.push(c);
  };
  switch (kind) {
    case 'single': {
      for (const [, list] of idx.byRank) add([list[0]], 0);
      if (idx.small.length) add([idx.small[0]], 0);
      if (idx.big.length) add([idx.big[0]], 0);
      if (idx.wilds.length && !idx.byRank.has(level)) add([idx.wilds[0]], 1);
      break;
    }
    case 'pair':
    case 'trio': {
      const size = kind === 'pair' ? 2 : 3;
      for (const s of sameRank(idx, size, 2)) add(s.cards, s.wilds);
      if (kind === 'pair') {
        if (idx.small.length >= 2) add(idx.small.slice(0, 2), 0);
        if (idx.big.length >= 2) add(idx.big.slice(0, 2), 0);
        if (idx.wilds.length >= 2 && !idx.byRank.has(level)) add(idx.wilds.slice(0, 2), 2);
      }
      break;
    }
    case 'bomb': {
      for (let size = 4; size <= 10; size++) {
        for (const s of sameRank(idx, size, 2)) {
          // 只生成"刚好用完自然牌或补到 size"的组合，避免重复
          add(s.cards, s.wilds);
        }
      }
      break;
    }
    case 'fullhouse': {
      const trios = sameRank(idx, 3, 2);
      for (const t of trios) {
        const left = idx.wilds.length - t.wilds;
        let best: { cards: Card[]; wilds: number; value: number } | null = null;
        for (const [rank, list] of idx.byRank) {
          if (rank === t.rank) continue;
          const nat = Math.min(list.length, 2);
          const need = 2 - nat;
          if (need > left) continue;
          const value = gdRankValue(rank, level) + need * 20 + (list.length >= 3 ? 8 : 0);
          if (!best || value < best.value) {
            best = {
              cards: [...list.slice(0, nat), ...idx.wilds.slice(t.wilds, t.wilds + need)],
              wilds: need,
              value,
            };
          }
        }
        for (const jokers of [idx.small, idx.big]) {
          if (jokers.length >= 2) {
            const value = gdRankValue(jokers[0].rank, level) + 10;
            if (!best || value < best.value) best = { cards: jokers.slice(0, 2), wilds: 0, value };
          }
        }
        if (best) add([...t.cards, ...best.cards], t.wilds + best.wilds);
      }
      break;
    }
    case 'straight':
    case 'straightflush':
    case 'tube':
    case 'plate':
      return chainCandidates(idx, kind, level, target);
    case 'jokerbomb':
      if (idx.small.length === 2 && idx.big.length === 2) add([...idx.small, ...idx.big], 0);
      break;
  }
  return out;
}

const NON_BOMB: GdKind[] = ['single', 'pair', 'trio', 'fullhouse', 'straight', 'tube', 'plate'];
const BOMBS: GdKind[] = ['bomb', 'straightflush', 'jokerbomb'];

/** 能压过 target 的全部候选；target 为空时返回所有可领出的组合。 */
export function gdCandidates(
  hand: readonly Card[],
  level: number,
  target: GdPattern | null,
): GdCandidate[] {
  const out: GdCandidate[] = [];
  const seen = new Set<string>();
  const push = (list: GdCandidate[]) => {
    for (const c of list) {
      const key = c.cards
        .map((x) => x.id)
        .sort((a, b) => a - b)
        .join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  };
  if (!target) {
    for (const k of [...NON_BOMB, ...BOMBS]) push(candidatesOfKind(hand, level, k, null));
    return out;
  }
  if (!isBombPattern(target)) push(candidatesOfKind(hand, level, target.kind, target));
  for (const k of BOMBS) push(candidatesOfKind(hand, level, k, target));
  return out;
}

// ---------------------------------------------------------------------------
// 手牌规划（不使用万能牌），用于估算出完所需手数

export interface GdGroup {
  kind: GdKind;
  cards: Card[];
  main: number;
}

export interface GdPlan {
  groups: GdGroup[];
  wilds: Card[];
  turns: number;
}

export function planHand(hand: readonly Card[], level: number): GdPlan {
  const idx = indexHand(hand, level);
  const groups: GdGroup[] = [];
  const by = new Map<number, Card[]>();
  for (const [r, list] of idx.byRank) by.set(r, [...list]);
  const take = (rank: number, n: number) => {
    const list = by.get(rank)!;
    const got = list.splice(0, n);
    if (list.length === 0) by.delete(rank);
    return got;
  };
  const count = (rank: number) => by.get(rank === 1 ? 14 : rank)?.length ?? 0;

  if (idx.small.length === 2 && idx.big.length === 2) {
    groups.push({ kind: 'jokerbomb', cards: [...idx.small, ...idx.big], main: 100 });
  } else {
    for (const j of [idx.small, idx.big]) {
      if (j.length === 2)
        groups.push({ kind: 'pair', cards: j, main: gdRankValue(j[0].rank, level) });
      else if (j.length === 1)
        groups.push({ kind: 'single', cards: j, main: gdRankValue(j[0].rank, level) });
    }
  }
  for (const [r, list] of [...by]) {
    if (list.length >= 4) {
      groups.push({ kind: 'bomb', cards: take(r, list.length), main: gdRankValue(r, level) });
    }
  }
  // 钢板：两个连续的三张
  for (let top = 14; top >= 2; top--) {
    const lo = top - 1;
    if (count(lo) === 3 && count(top) === 3) {
      const cards = [...take(lo === 1 ? 14 : lo, 3), ...take(top, 3)];
      groups.push({ kind: 'plate', cards, main: top });
    }
  }
  // 三连对
  for (let top = 14; top >= 3; top--) {
    if (count(top - 2) === 2 && count(top - 1) === 2 && count(top) === 2) {
      const cards = [top - 2, top - 1, top].flatMap((r) => take(r === 1 ? 14 : r, 2));
      groups.push({ kind: 'tube', cards, main: top });
    }
  }
  // 顺子：至少吸收 3 张孤张才拆
  for (let top = 5; top <= 14; top++) {
    const ranks = [0, 1, 2, 3, 4].map((i) => top - 4 + i);
    if (!ranks.every((r) => count(r) >= 1)) continue;
    const singles = ranks.filter((r) => count(r) === 1).length;
    if (singles >= 3) {
      const cards = ranks.flatMap((r) => take(r === 1 ? 14 : r, 1));
      groups.push({ kind: 'straight', cards, main: top });
    }
  }
  const trios: GdGroup[] = [];
  const pairs: GdGroup[] = [];
  const singles: GdGroup[] = [];
  for (const [r, list] of [...by].sort(
    (a, b) => gdRankValue(a[0], level) - gdRankValue(b[0], level),
  )) {
    const v = gdRankValue(r, level);
    if (list.length === 3) trios.push({ kind: 'trio', cards: [...list], main: v });
    else if (list.length === 2) pairs.push({ kind: 'pair', cards: [...list], main: v });
    else singles.push({ kind: 'single', cards: [...list], main: v });
  }
  for (const t of trios) {
    const i = pairs.findIndex((p) => p.main < 14);
    if (i >= 0) {
      const p = pairs.splice(i, 1)[0];
      t.cards.push(...p.cards);
      t.kind = 'fullhouse';
    }
  }
  groups.push(...trios, ...pairs, ...singles);
  const bombs = groups.filter((g) => g.kind === 'bomb' || g.kind === 'jokerbomb').length;
  const control = groups.filter(
    (g) => g.kind !== 'bomb' && g.kind !== 'jokerbomb' && g.main >= 16,
  ).length;
  const turns = groups.length - bombs * 0.6 - control * 0.4 - idx.wilds.length * 0.7;
  return { groups, wilds: idx.wilds, turns };
}
