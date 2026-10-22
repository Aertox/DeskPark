import type { ss } from '@park/engine';
import type { LucideProps } from 'lucide-react';
import { Bird, FlaskConical, Flame, Ghost, Moon, Snowflake, Zap } from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';
import './stones.css';

type Spell = ss.Spell;

/** 远古巨龙：lucide 风格的线条龙头（双角、张口） */
function Dragon({ size = 24, strokeWidth = 2, ...rest }: LucideProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M7 21c-1-4-1-8 2-11.5l4-1.5 6.5 1.2c1.4.3 2 1.3 1.6 2.4L15 12l4.6 1.4c-1.3 2-4 2.8-6.6 2.4C12.5 18 13 20 14.5 21" />
      <path d="M10 8.3C9 5.5 7 3.8 4 3.2" />
      <path d="M13 7.9c.2-2.4-.6-4.4-2.4-5.9" />
      <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export interface SpellUI {
  color: string;
  deep: string;
  Icon: ComponentType<LucideProps>;
  /** 简短效果（按钮上） */
  short: string;
}

export const SPELL_UI: Record<Spell, SpellUI> = {
  1: { color: '#e0574a', deep: '#8e1f1c', Icon: Dragon, short: '对手各 −骰' },
  2: { color: '#8a6ee0', deep: '#40298f', Icon: Ghost, short: '对手 −1 · 己 +1' },
  3: { color: '#ea8cc0', deep: '#9a3a72', Icon: Moon, short: '自己 +骰' },
  4: { color: '#5a7ed6', deep: '#22397e', Icon: Bird, short: '拿秘密石' },
  5: { color: '#f0c13c', deep: '#8f6a0e', Icon: Zap, short: '左右 −1' },
  6: { color: '#58bfe6', deep: '#1c6688', Icon: Snowflake, short: '下家 −1' },
  7: { color: '#f07a38', deep: '#9a3a0e', Icon: Flame, short: '上家 −1' },
  8: { color: '#4cbd7e', deep: '#1c6b42', Icon: FlaskConical, short: '自己 +1' },
};

/** 一块魔法石：spell 为 null 时是背面（看不到号码） */
export function Stone({
  spell,
  size = 'md',
  dim,
  className = '',
  style,
}: {
  spell: Spell | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  dim?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (spell === null) {
    return (
      <span
        className={`stone stone--${size} is-back ${className}`}
        style={style}
        aria-label="看不到的魔法石"
      >
        <b>?</b>
      </span>
    );
  }
  const ui = SPELL_UI[spell];
  return (
    <span
      className={`stone stone--${size} ${dim ? 'is-dim' : ''} ${className}`}
      style={{ '--c': ui.color, '--d': ui.deep, ...style } as CSSProperties}
      aria-label={`${spell} 号`}
    >
      <ui.Icon className="stone__icon" strokeWidth={2.4} />
      <b>{spell}</b>
    </span>
  );
}

/** 大厅卡片插画：三块魔法石 */
export function SpellArt() {
  return (
    <div className="ss-art">
      {([1, 5, 7] as Spell[]).map((s, i) => (
        <Stone key={s} spell={s} size="lg" style={{ '--i': i - 1 } as CSSProperties} />
      ))}
    </div>
  );
}
