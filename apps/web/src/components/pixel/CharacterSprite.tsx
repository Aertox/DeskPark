import type { CSSProperties } from 'react';
import type { VirtualCharacter } from '../../lib/characters';
import { characterUrl } from '../../lib/characters';

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** 全身立绘：横向精灵图逐帧循环播放；seed 用于错开多个角色的动作节奏 */
export function CharacterSprite({
  character: c,
  height,
  seed = '',
  animate = true,
  className = '',
}: {
  character: VirtualCharacter;
  height: number;
  seed?: string;
  animate?: boolean;
  className?: string;
}) {
  const width = (height * c.frameW) / c.frameH;
  const moving = animate && c.frames > 1;
  const style = {
    width,
    height,
    backgroundImage: `url(${characterUrl(c)})`,
    backgroundSize: `${c.frames * 100}% 100%`,
    '--vc-frames': c.frames,
    animationDuration: `${c.frames / c.fps}s`,
    animationDelay: `${-(hash(seed) % c.frames) / c.fps}s`,
  } as CSSProperties;
  return (
    <span
      className={`vc-sprite ${moving ? 'is-moving' : ''} ${className}`}
      style={style}
      role="img"
      aria-label={c.name}
    />
  );
}

/** 小头像：从第 1 帧裁出头部，放进圆形底色中 */
export function CharacterFace({
  character: c,
  size,
  className = '',
  style,
}: {
  character: VirtualCharacter;
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [x, y, s] = c.face;
  const k = size / s;
  return (
    <span
      className={`avatar avatar--vc ${className}`}
      style={{ width: size, height: size, background: c.bg ?? '#dfe7f5', ...style }}
      title={c.name}
    >
      <i
        style={{
          backgroundImage: `url(${characterUrl(c)})`,
          backgroundSize: `${c.frames * c.frameW * k}px ${c.frameH * k}px`,
          backgroundPosition: `${-x * k}px ${-y * k}px`,
        }}
      />
    </span>
  );
}
