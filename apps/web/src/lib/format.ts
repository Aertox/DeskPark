export function formatChips(n: number): string {
  if (Math.abs(n) >= 100_000) return `${(n / 1000).toFixed(0)}k`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-US');
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** 根据名字生成稳定的头像底色（低饱和、耐看） */
const AVATAR_COLORS = [
  '#7d8f69',
  '#a2775c',
  '#6b7f99',
  '#9b6b84',
  '#5f8a87',
  '#a48b5a',
  '#7a6f9b',
  '#8c6d5a',
];
export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initial(name: string): string {
  return [...name.trim()][0] ?? '?';
}
