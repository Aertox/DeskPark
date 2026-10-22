import type { ss } from '@park/engine';
import { ss as SS } from '@park/engine';
import type { CSSProperties, MouseEvent } from 'react';
import board from './art/board.svg';
import back from './art/card-back.svg';
import c1 from './art/card-1.svg';
import c2 from './art/card-2.svg';
import c3 from './art/card-3.svg';
import c4 from './art/card-4.svg';
import c5 from './art/card-5.svg';
import c6 from './art/card-6.svg';
import c7 from './art/card-7.svg';
import c8 from './art/card-8.svg';
import wBlue from './art/wizard-blue.svg';
import wGray from './art/wizard-gray.svg';
import wGreen from './art/wizard-green.svg';
import wPink from './art/wizard-pink.svg';
import wYellow from './art/wizard-yellow.svg';
import './stones.css';

type Spell = ss.Spell;

export const CARD_ART: Record<Spell, string> = {
  1: c1,
  2: c2,
  3: c3,
  4: c4,
  5: c5,
  6: c6,
  7: c7,
  8: c8,
};
export const BACK_ART = back;
export const BOARD_ART = board;

/** 每个座位一位魔法师：既是生命指示物，也是计分轨道上的前进指示物 */
export const WIZARDS = [
  { id: 'blue', art: wBlue, color: '#4f7fe0' },
  { id: 'green', art: wGreen, color: '#4cae4a' },
  { id: 'pink', art: wPink, color: '#e2559c' },
  { id: 'yellow', art: wYellow, color: '#e8b830' },
  { id: 'gray', art: wGray, color: '#9aa2ae' },
] as const;
export const wizardOf = (seat: number) => WIZARDS[seat % WIZARDS.length];

export interface SpellUI {
  /** 与图版上这一行同色（在深色牌桌上提亮过） */
  color: string;
  /** 简短效果（按钮上） */
  short: string;
}

export const SPELL_UI: Record<Spell, SpellUI> = {
  1: { color: '#e0493c', short: '对手各 −骰' },
  2: { color: '#a65ad6', short: '对手 −1 · 己 +1' },
  3: { color: '#e8508a', short: '自己 +骰' },
  4: { color: '#d36a3c', short: '拿猫头鹰石' },
  5: { color: '#b9b04a', short: '左右手 −1' },
  6: { color: '#4aa8d4', short: '左手边 −1' },
  7: { color: '#f08a3a', short: '右手边 −1' },
  8: { color: '#4cb85a', short: '自己 +1' },
};

export type StoneSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';

/** 一块魔法石：spell 为 null 时是背面（看不到号码）。传入 onClick 时可点击查看魔法效果。 */
export function Stone({
  spell,
  size = 'md',
  dim,
  className = '',
  style,
  onClick,
  title,
  attrs,
}: {
  spell: Spell | null;
  size?: StoneSize;
  dim?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  title?: string;
  /** 额外的 data-* 属性（飞行动画用） */
  attrs?: Record<string, string | number>;
}) {
  const label = spell === null ? '看不到的魔法石' : `${spell} 号 ${SS.SPELL_NAME[spell]}`;
  const cls = `stone stone--${size} ${spell === null ? 'is-back' : ''} ${dim ? 'is-dim' : ''} ${onClick ? 'is-click' : ''} ${className}`;
  const img = <img src={spell === null ? BACK_ART : CARD_ART[spell]} alt="" draggable={false} />;
  return onClick ? (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={onClick}
      title={title ?? `${label}：点击查看魔法效果`}
      aria-label={label}
      {...attrs}
    >
      {img}
    </button>
  ) : (
    <span className={cls} style={style} role="img" aria-label={label} title={title} {...attrs}>
      {img}
    </span>
  );
}

/** 魔法师指示物 */
export function Wizard({
  seat,
  size,
  lost,
  className = '',
  style,
}: {
  seat: number;
  size?: number;
  lost?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      className={`ss-wiz ${lost ? 'is-lost' : ''} ${className}`}
      src={wizardOf(seat).art}
      width={size}
      height={size}
      style={style}
      alt=""
      draggable={false}
    />
  );
}

/** 生命：6 个魔法师指示物，失去的变灰 */
export function LifeTokens({
  seat,
  life,
  size = 13,
}: {
  seat: number;
  life: number;
  size?: number;
}) {
  return (
    <span className="ss-life" role="img" aria-label={`生命 ${life}/${SS.MAX_LIFE}`}>
      {Array.from({ length: SS.MAX_LIFE }, (_, i) => (
        <Wizard key={i} seat={seat} size={size} lost={i >= life} />
      ))}
    </span>
  );
}

/** 大厅卡片插画：三块魔法石扇形展开 */
export function SpellArt() {
  return (
    <div className="ss-art">
      {([1, 4, 7] as Spell[]).map((s, i) => (
        <Stone key={s} spell={s} size="lg" style={{ '--i': i - 1 } as CSSProperties} />
      ))}
    </div>
  );
}
