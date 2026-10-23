import type { Gem, GemMap, GgCard, GgNoble, Level } from './shared';
import { GEMS, emptyGems } from './shared';

/**
 * 原创牌库：沿用经典三级发展卡的结构（Ⅰ 40 张、Ⅱ 30 张、Ⅲ 20 张，每种颜色数量相同），
 * 价格模板按颜色轮换生成，保证五种颜色强度一致。
 * 模板里的数字键是「相对颜色」：0 = 这张牌自己的颜色，1–4 = 依次往后数的颜色。
 */
type Template = [Partial<Record<0 | 1 | 2 | 3 | 4, number>>, number];

const TEMPLATES: Record<Level, Template[]> = {
  1: [
    [{ 1: 1, 2: 1, 3: 1, 4: 1 }, 0],
    [{ 1: 1, 2: 2, 3: 1, 4: 1 }, 0],
    [{ 1: 2, 3: 2, 4: 1 }, 0],
    [{ 0: 1, 1: 3, 4: 1 }, 0],
    [{ 2: 2, 4: 1 }, 0],
    [{ 1: 2, 3: 2 }, 0],
    [{ 2: 3 }, 0],
    [{ 3: 4 }, 1],
  ],
  2: [
    [{ 0: 2, 1: 2, 4: 3 }, 1],
    [{ 0: 2, 2: 3, 3: 3 }, 1],
    [{ 1: 4, 2: 2, 4: 1 }, 2],
    [{ 2: 5, 3: 3 }, 2],
    [{ 4: 5 }, 2],
    [{ 0: 6 }, 3],
  ],
  3: [
    [{ 1: 3, 2: 3, 3: 5, 4: 3 }, 3],
    [{ 4: 7 }, 4],
    [{ 0: 3, 3: 6, 4: 3 }, 4],
    [{ 0: 3, 4: 7 }, 5],
  ],
};

const rel = (bonus: Gem, k: number): Gem => GEMS[(GEMS.indexOf(bonus) + k) % 5];

export function buildDeck(): GgCard[] {
  const out: GgCard[] = [];
  for (const level of [1, 2, 3] as Level[]) {
    for (const bonus of GEMS) {
      for (const [tpl, points] of TEMPLATES[level]) {
        const cost = emptyGems();
        for (const [k, n] of Object.entries(tpl)) cost[rel(bonus, Number(k))] += n!;
        out.push({ id: out.length, level, bonus, points, cost });
      }
    }
  }
  return out;
}

const NOBLE_NAMES = [
  '苏夫人',
  '林公爵',
  '顾伯爵',
  '沈侯爵',
  '温女爵',
  '陆子爵',
  '谢夫人',
  '韩亲王',
  '叶伯爵',
  '秦女公',
];

/** 10 位贵族：5 位要两种颜色各 4 张，5 位要三种颜色各 3 张 */
export function buildNobles(): GgNoble[] {
  const out: GgNoble[] = [];
  GEMS.forEach((g, i) => {
    const need: GemMap = emptyGems();
    need[g] = 4;
    need[GEMS[(i + 1) % 5]] = 4;
    out.push({ id: out.length, name: NOBLE_NAMES[out.length], points: 3, need });
  });
  GEMS.forEach((g, i) => {
    const need: GemMap = emptyGems();
    need[g] = 3;
    need[GEMS[(i + 2) % 5]] = 3;
    need[GEMS[(i + 3) % 5]] = 3;
    out.push({ id: out.length, name: NOBLE_NAMES[out.length], points: 3, need });
  });
  return out;
}
