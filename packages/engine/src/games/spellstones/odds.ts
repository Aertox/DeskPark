import type { Spell, SsView } from './shared';

const ALL: Spell[] = [1, 2, 3, 4, 5, 6, 7, 8];

export interface SpellOdds {
  spell: Spell;
  /** 这种咒语一共几块 */
  total: number;
  /** 你看得见的（别人面前、法阵上、移出的、自己的秘密石） */
  seen: number;
  /** 下落不明的（可能在你面前、牌库或秘密石里） */
  unknown: number;
  /** 你面前至少有一块的概率 */
  chance: number;
}

/**
 * 推算自己面前每种咒语的概率（超几何分布）：
 * 自己的 r 块石头可以看作从「所有下落不明的石头」中随机抽出的 r 块。
 */
export function rackOdds(view: SsView, seat: number): SpellOdds[] {
  const seen = new Map<Spell, number>(ALL.map((s) => [s, 0]));
  const add = (s: Spell) => seen.set(s, (seen.get(s) ?? 0) + 1);
  view.players.forEach((p, s) => {
    if (s !== seat) p.rack?.forEach((x) => add(x.spell));
  });
  view.players[seat]?.secrets?.forEach((x) => add(x.spell));
  view.board.forEach((x) => add(x.spell));
  view.removed.forEach((x) => add(x.spell));

  const r = view.players[seat]?.rackCount ?? 0;
  const totalUnknown = ALL.reduce((sum, s) => sum + s - (seen.get(s) ?? 0), 0);
  return ALL.map((spell) => {
    const unknown = Math.max(0, spell - (seen.get(spell) ?? 0));
    // P(一块都没有) = C(U-u, r) / C(U, r)
    let none = 1;
    for (let i = 0; i < r; i++) {
      const denom = totalUnknown - i;
      none *= denom > 0 ? Math.max(0, totalUnknown - unknown - i) / denom : 0;
    }
    const chance = r === 0 || unknown === 0 ? 0 : 1 - none;
    return { spell, total: spell, seen: seen.get(spell) ?? 0, unknown, chance };
  });
}
