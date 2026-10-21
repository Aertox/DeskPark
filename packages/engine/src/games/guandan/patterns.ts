import type { Card } from '../../core/cards';
import { BIG_JOKER, SMALL_JOKER } from '../../core/cards';

/**
 * 掼蛋牌型识别（含"逢人配"）。
 *
 * 大小：2 < 3 < … < K < A < 级牌 < 小王 < 大王；红桃级牌为万能牌，可替代除大小王外的任意牌。
 * 顺子 / 三连对 / 钢板 / 同花顺 中，级牌回到自然位置，A 可作 1 或 14。
 */

export type GdKind =
  | 'single'
  | 'pair'
  | 'trio'
  | 'fullhouse'
  | 'straight'
  | 'tube'
  | 'plate'
  | 'bomb'
  | 'straightflush'
  | 'jokerbomb';

export interface GdPattern {
  kind: GdKind;
  main: number;
  size: number;
}

export const GD_KIND_NAME: Record<GdKind, string> = {
  single: '单张',
  pair: '对子',
  trio: '三同张',
  fullhouse: '三带二',
  straight: '顺子',
  tube: '三连对',
  plate: '钢板',
  bomb: '炸弹',
  straightflush: '同花顺',
  jokerbomb: '天王炸',
};

export function isWild(card: Card, level: number): boolean {
  return card.suit === 'H' && card.rank === level;
}

/** 单张/对子/三张/炸弹比较用的值 */
export function gdRankValue(rank: number, level: number): number {
  if (rank === SMALL_JOKER) return 16;
  if (rank === BIG_JOKER) return 17;
  if (rank === level) return 15;
  return rank;
}

export function gdValue(card: Card, level: number): number {
  return gdRankValue(card.rank, level);
}

export function bombPower(p: GdPattern): number {
  if (p.kind === 'jokerbomb') return 100;
  if (p.kind === 'straightflush') return 5.5;
  if (p.kind === 'bomb') return p.size;
  return 0;
}

export function isBombPattern(p: GdPattern): boolean {
  return bombPower(p) > 0;
}

/** a 能否压过 b */
export function gdBeats(a: GdPattern, b: GdPattern): boolean {
  const pa = bombPower(a);
  const pb = bombPower(b);
  if (pa > 0 || pb > 0) {
    if (pa !== pb) return pa > pb;
    return a.main > b.main;
  }
  return a.kind === b.kind && a.size === b.size && a.main > b.main;
}

/** 窗口内的自然点数：top=5 表示 A2345（A 记为 1） */
function windowRanks(top: number, len: number): number[] {
  const out: number[] = [];
  for (let r = top - len + 1; r <= top; r++) out.push(r);
  return out;
}

function toWindowRank(rank: number, window: number[]): number {
  if (rank === 14 && window.includes(1)) return 1;
  return rank;
}

/**
 * 检查非万能牌能否在 [top-len+1, top] 窗口中，每个点数恰好凑出 per 张（用 wilds 补齐）。
 */
function fitsChain(normals: Card[], wilds: number, top: number, len: number, per: number): boolean {
  const window = windowRanks(top, len);
  const cnt = new Map<number, number>();
  for (const c of normals) {
    const r = toWindowRank(c.rank, window);
    if (!window.includes(r)) return false;
    cnt.set(r, (cnt.get(r) ?? 0) + 1);
  }
  let need = 0;
  for (const r of window) {
    const c = cnt.get(r) ?? 0;
    if (c > per) return false;
    need += per - c;
  }
  return need === wilds;
}

export function classify(cards: readonly Card[], level: number): GdPattern[] {
  const n = cards.length;
  if (n === 0) return [];
  const out: GdPattern[] = [];
  const push = (kind: GdKind, main: number) => out.push({ kind, main, size: n });

  const wildCards = cards.filter((c) => isWild(c, level));
  const w = wildCards.length;
  const normals = cards.filter((c) => !isWild(c, level));
  const jokers = normals.filter((c) => c.suit === 'J');
  const plain = normals.filter((c) => c.suit !== 'J');
  const small = jokers.filter((c) => c.rank === SMALL_JOKER).length;
  const big = jokers.length - small;
  const plainRanks = [...new Set(plain.map((c) => c.rank))];

  if (n === 4 && small === 2 && big === 2) {
    push('jokerbomb', 100);
    return out;
  }

  if (n === 1) {
    push('single', gdValue(cards[0], level));
    return out;
  }

  // 同点数（对子 / 三张 / 炸弹）
  if (jokers.length === 0 && plainRanks.length <= 1) {
    const rank = plainRanks[0] ?? level;
    const v = gdRankValue(rank, level);
    if (n === 2) push('pair', v);
    if (n === 3) push('trio', v);
    if (n >= 4 && n <= 10) push('bomb', v);
  }
  if (n === 2 && jokers.length === 2 && (small === 2 || big === 2)) {
    push('pair', small === 2 ? 16 : 17);
  }

  // 三带二
  if (n === 5) {
    if (jokers.length > 0) {
      // 王只能作为对子：两张同色王 + 三张
      if (jokers.length === 2 && (small === 2 || big === 2) && plainRanks.length <= 1) {
        const rank = plainRanks[0] ?? level;
        push('fullhouse', gdRankValue(rank, level));
      }
    } else {
      const cnt = new Map<number, number>();
      for (const c of plain) cnt.set(c.rank, (cnt.get(c.rank) ?? 0) + 1);
      const ranks = [...cnt.keys()];
      const tried = new Set<number>();
      if (ranks.length === 2) {
        for (const [t, p] of [
          [ranks[0], ranks[1]],
          [ranks[1], ranks[0]],
        ]) {
          const ct = cnt.get(t)!;
          const cp = cnt.get(p)!;
          if (ct <= 3 && cp <= 2 && 3 - ct + (2 - cp) === w) {
            const v = gdRankValue(t, level);
            if (!tried.has(v)) {
              tried.add(v);
              push('fullhouse', v);
            }
          }
        }
      } else if (ranks.length === 1 && w === 2 && cnt.get(ranks[0]) === 3 && ranks[0] !== level) {
        // 三张 + 一对万能牌（作为级牌对子）
        push('fullhouse', gdRankValue(ranks[0], level));
      }
    }
  }

  if (jokers.length === 0) {
    // 顺子 / 同花顺
    if (n === 5) {
      const suits = new Set(plain.map((c) => c.suit));
      for (let top = 14; top >= 5; top--) {
        if (fitsChain(plain, w, top, 5, 1)) {
          push('straight', top);
          if (suits.size <= 1) push('straightflush', top);
          break; // 取最大的窗口
        }
      }
    }
    if (n === 6) {
      for (let top = 14; top >= 3; top--) {
        if (fitsChain(plain, w, top, 3, 2)) {
          push('tube', top);
          break;
        }
      }
      for (let top = 14; top >= 2; top--) {
        if (fitsChain(plain, w, top, 2, 3)) {
          push('plate', top);
          break;
        }
      }
    }
  }
  return out;
}

const LEAD_ORDER: GdKind[] = [
  'jokerbomb',
  'bomb',
  'straightflush',
  'plate',
  'tube',
  'straight',
  'fullhouse',
  'trio',
  'pair',
  'single',
];

/** 选出最强的解释：炸弹优先，其次主值更大。 */
function strongest(patterns: GdPattern[]): GdPattern {
  return [...patterns].sort(
    (a, b) =>
      bombPower(b) - bombPower(a) ||
      LEAD_ORDER.indexOf(a.kind) - LEAD_ORDER.indexOf(b.kind) ||
      b.main - a.main,
  )[0];
}

/** 解析一手出牌：target 为空时取最强解释，否则取一个能压过 target 的最强解释。 */
export function resolveGd(
  cards: readonly Card[],
  level: number,
  target: GdPattern | null,
): GdPattern | null {
  const pats = classify(cards, level);
  if (pats.length === 0) return null;
  if (!target) return strongest(pats);
  const ok = pats.filter((p) => gdBeats(p, target));
  return ok.length ? strongest(ok) : null;
}
