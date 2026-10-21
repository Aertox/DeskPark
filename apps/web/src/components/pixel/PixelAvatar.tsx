import type { CSSProperties } from 'react';
import { memo } from 'react';
import { findCharacter, useCharacters } from '../../lib/characters';
import { CharacterFace } from './CharacterSprite';
import type { PixelCharacter } from './characters';
import { characterForName, expandRows, getCharacter } from './characters';

/** 每种颜色合并为一条 path（同色横向连续像素合并成一个矩形），渲染开销很小 */
const pathCache = new Map<string, { color: string; d: string }[]>();

function pathsOf(c: PixelCharacter) {
  const hit = pathCache.get(c.id);
  if (hit) return hit;
  const grid = expandRows(c);
  const byColor = new Map<string, string[]>();
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x];
      if (!color) {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < row.length && row[x + len] === color) len++;
      const list = byColor.get(color) ?? [];
      list.push(`M${x} ${y}h${len}v1h-${len}z`);
      byColor.set(color, list);
      x += len;
    }
  });
  const out = [...byColor.entries()].map(([color, parts]) => ({ color, d: parts.join('') }));
  pathCache.set(c.id, out);
  return out;
}

export const PixelArt = memo(function PixelArt({
  character,
  className,
}: {
  character: PixelCharacter;
  className?: string;
}) {
  return (
    <svg
      viewBox="-1 -1.5 18 18"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pathsOf(character).map((p) => (
        <path key={p.color} d={p.d} fill={p.color} />
      ))}
    </svg>
  );
});

export function resolveCharacter(avatar: string | undefined | null, name: string): PixelCharacter {
  return getCharacter(avatar) ?? characterForName(name);
}

export function PixelAvatar({
  avatar,
  name,
  size = 44,
  className = '',
  style,
}: {
  avatar?: string | null;
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const characters = useCharacters();
  const vc = findCharacter(characters, avatar);
  if (vc) return <CharacterFace character={vc} size={size} className={className} style={style} />;
  const c = resolveCharacter(avatar, name);
  return (
    <span
      className={`avatar avatar--pixel ${className}`}
      style={{ width: size, height: size, background: c.bg, ...style }}
      title={c.name}
    >
      <PixelArt character={c} />
    </span>
  );
}
