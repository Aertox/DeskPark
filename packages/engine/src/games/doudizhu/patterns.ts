import type { Card } from '../../core/cards';
import { BIG_JOKER, SMALL_JOKER } from '../../core/cards';

/**
 * 斗地主牌型识别。
 * 取值：3..13 = 3..K，14 = A，15 = 2，16 = 小王，17 = 大王。
 */

export type DdzKind =
  | 'single'
  | 'pair'
  | 'trio'
  | 'trio1'
  | 'trio2'
  | 'straight'
  | 'pairs'
  | 'plane'
  | 'plane1'
  | 'plane2'
  | 'four2'
  | 'four22'
  | 'bomb'
  | 'rocket';

export interface DdzPattern {
  kind: DdzKind;
  /** 比较大小用的主值（顺子/连对/飞机取最大的那一组） */
  main: number;
  /** 链长：顺子张数、连对对数、飞机组数，其余为 1 */
  len: number;
  /** 总张数 */
  size: number;
}

export const DDZ_KIND_NAME: Record<DdzKind, string> = {
  single: '单张',
  pair: '对子',
  trio: '三张',
  trio1: '三带一',
  trio2: '三带二',
  straight: '顺子',
  pairs: '连对',
  plane: '飞机',
  plane1: '飞机带翅膀',
  plane2: '飞机带翅膀',
  four2: '四带二',
  four22: '四带两对',
  bomb: '炸弹',
  rocket: '王炸',
};

const CHAIN_MAX = 14; // 顺子、连对、飞机最大只能到 A

export function ddzValue(card: Card): number {
  if (card.rank === 2) return 15;
  return card.rank; // 3..14, 16, 17
}

export function ddzValueLabel(v: number): string {
  if (v <= 10) return String(v);
  return (
    { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' } as Record<
      number,
      string
    >
  )[v];
}

function counts(values: readonly number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function isChain(sortedUnique: number[]): boolean {
  if (sortedUnique[sortedUnique.length - 1] > CHAIN_MAX) return false;
  for (let i = 1; i < sortedUnique.length; i++) {
    if (sortedUnique[i] !== sortedUnique[i - 1] + 1) return false;
  }
  return true;
}

/** 返回这组牌所有可能的牌型解释（可能为空）。 */
export function analyzeValues(values: readonly number[]): DdzPattern[] {
  const n = values.length;
  if (n === 0) return [];
  const cnt = counts(values);
  const keys = [...cnt.keys()].sort((a, b) => a - b);
  const out: DdzPattern[] = [];
  const push = (kind: DdzKind, main: number, len = 1) => out.push({ kind, main, len, size: n });

  if (n === 2 && cnt.get(SMALL_JOKER) === 1 && cnt.get(BIG_JOKER) === 1) {
    push('rocket', BIG_JOKER);
    return out;
  }
  if (n === 1) push('single', values[0]);
  if (n === 2 && keys.length === 1) push('pair', keys[0]);
  if (n === 3 && keys.length === 1) push('trio', keys[0]);
  if (n === 4 && keys.length === 1) push('bomb', keys[0]);
  if (n === 4 && keys.length === 2) {
    const t = keys.find((k) => cnt.get(k) === 3);
    if (t !== undefined) push('trio1', t);
  }
  if (n === 5 && keys.length === 2) {
    const t = keys.find((k) => cnt.get(k) === 3);
    const p = keys.find((k) => cnt.get(k) === 2);
    if (t !== undefined && p !== undefined) push('trio2', t);
  }
  // 顺子：至少 5 张，单张连续
  if (n >= 5 && keys.length === n && isChain(keys)) {
    push('straight', keys[keys.length - 1], n);
  }
  // 连对：至少 3 对
  if (n >= 6 && n % 2 === 0 && keys.length === n / 2 && keys.every((k) => cnt.get(k) === 2)) {
    if (isChain(keys)) push('pairs', keys[keys.length - 1], n / 2);
  }
  // 飞机（不带）
  if (n >= 6 && n % 3 === 0 && keys.length === n / 3 && keys.every((k) => cnt.get(k) === 3)) {
    if (isChain(keys)) push('plane', keys[keys.length - 1], n / 3);
  }
  // 四带二 / 四带两对
  for (const k of keys) {
    if (cnt.get(k)! < 4) continue;
    const rest = new Map(cnt);
    rest.set(k, rest.get(k)! - 4);
    if (rest.get(k) === 0) rest.delete(k);
    const restCount = n - 4;
    if (restCount === 2) {
      const hasRocket = rest.get(SMALL_JOKER) === 1 && rest.get(BIG_JOKER) === 1;
      if (!hasRocket) push('four2', k);
    }
    if (restCount === 4 && [...rest.values()].every((c) => c % 2 === 0)) {
      if (!rest.has(k)) push('four22', k);
    }
  }
  // 飞机带翅膀
  for (const [wing, per] of [
    ['plane1', 4],
    ['plane2', 5],
  ] as const) {
    if (n < per * 2 || n % per !== 0) continue;
    const k = n / per;
    for (let top = CHAIN_MAX; top - k + 1 >= 3; top--) {
      let ok = true;
      for (let v = top - k + 1; v <= top; v++) if ((cnt.get(v) ?? 0) < 3) ok = false;
      if (!ok) continue;
      const rest = new Map(cnt);
      for (let v = top - k + 1; v <= top; v++) {
        rest.set(v, rest.get(v)! - 3);
        if (rest.get(v) === 0) rest.delete(v);
      }
      // 翅膀不能与机身同点数
      let clash = false;
      for (let v = top - k + 1; v <= top; v++) if (rest.has(v)) clash = true;
      if (clash) continue;
      if (wing === 'plane1') {
        const hasRocket = rest.get(SMALL_JOKER) === 1 && rest.get(BIG_JOKER) === 1;
        if (!hasRocket) push('plane1', top, k);
      } else if ([...rest.values()].every((c) => c % 2 === 0)) {
        push('plane2', top, k);
      }
    }
  }
  return out;
}

export function analyze(cards: readonly Card[]): DdzPattern[] {
  return analyzeValues(cards.map(ddzValue));
}

/** a 能否压过 b */
export function beats(a: DdzPattern, b: DdzPattern): boolean {
  if (a.kind === 'rocket') return true;
  if (b.kind === 'rocket') return false;
  if (a.kind === 'bomb' && b.kind !== 'bomb') return true;
  if (a.kind === 'bomb' && b.kind === 'bomb') return a.main > b.main;
  return a.kind === b.kind && a.size === b.size && a.len === b.len && a.main > b.main;
}

const LEAD_PRIORITY: DdzKind[] = [
  'rocket',
  'bomb',
  'plane2',
  'plane',
  'plane1',
  'four22',
  'four2',
  'pairs',
  'straight',
  'trio2',
  'trio1',
  'trio',
  'pair',
  'single',
];

/** 主动出牌时，从多种解释中挑一个最自然的。 */
export function preferredPattern(patterns: DdzPattern[]): DdzPattern | null {
  if (patterns.length === 0) return null;
  return [...patterns].sort(
    (a, b) =>
      b.len - a.len ||
      LEAD_PRIORITY.indexOf(a.kind) - LEAD_PRIORITY.indexOf(b.kind) ||
      b.main - a.main,
  )[0];
}

/** 找到一种能压过 target 的解释；target 为空时返回首选解释。 */
export function resolvePlay(cards: readonly Card[], target: DdzPattern | null): DdzPattern | null {
  const pats = analyze(cards);
  if (!target) return preferredPattern(pats);
  const ok = pats.filter((p) => beats(p, target));
  if (ok.length === 0) return null;
  // 优先使用与目标同类型的解释，炸弹作为最后手段
  return ok.sort((a, b) => Number(a.kind !== target.kind) - Number(b.kind !== target.kind))[0];
}

export function describePattern(p: DdzPattern): string {
  const name = DDZ_KIND_NAME[p.kind];
  return name;
}
