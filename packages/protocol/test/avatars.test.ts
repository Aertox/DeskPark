import { describe, expect, it } from 'vitest';
import { CHARACTERS, expandRows } from '../../../apps/web/src/components/pixel/characters';
import { AVATARS, isAvatarId } from '../src';

describe('像素形象', () => {
  it('协议中的形象与像素画一一对应', () => {
    expect(CHARACTERS.map((c) => c.id).sort()).toEqual(AVATARS.map((a) => a.id).sort());
    expect(new Set(AVATARS.map((a) => a.botName)).size).toBe(AVATARS.length);
  });

  it('每个形象都是合法的 16×16 像素画', () => {
    for (const c of CHARACTERS) {
      expect(c.rows).toHaveLength(16);
      for (const row of c.rows) {
        expect([8, 16]).toContain(row.length);
        for (const ch of row)
          if (ch !== '.') expect(c.palette[ch], `${c.id} 缺少颜色 ${ch}`).toBeTruthy();
      }
      const grid = expandRows(c);
      expect(grid.every((r) => r.length === 16)).toBe(true);
      // 至少画了一半以上的像素
      expect(grid.flat().filter(Boolean).length).toBeGreaterThan(100);
    }
  });

  it('isAvatarId 只接受已知形象', () => {
    expect(isAvatarId('hero-pig')).toBe(true);
    expect(isAvatarId('nope')).toBe(false);
    expect(isAvatarId(undefined)).toBe(false);
  });
});
