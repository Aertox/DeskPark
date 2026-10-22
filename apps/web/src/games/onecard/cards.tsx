import type { oc } from '@park/engine';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import './cards.css';

type Card = oc.OcCard;
type Color = oc.OcColor;

export const COLOR_HEX: Record<Color, string> = {
  R: '#e8403a',
  Y: '#f4b400',
  G: '#22a861',
  B: '#2577da',
};
export const COLOR_LABEL: Record<Color, string> = { R: '红', Y: '黄', G: '绿', B: '蓝' };

/** 跳过：圆圈加斜杠 */
function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="occ__icon" aria-hidden="true">
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="2.9" />
      <path d="M6.6 17.4 17.4 6.6" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" />
    </svg>
  );
}

/** 反转：两支弯折的箭头，一来一回 */
function ReverseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="occ__icon" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="rotate(-45 12 12)"
      >
        <path d="m15.5 3.8 3.7 3.7-3.7 3.7" />
        <path d="M4.6 11.6v-.6a3.5 3.5 0 0 1 3.5-3.5h11" />
        <path d="m8.5 20.2-3.7-3.7 3.7-3.7" />
        <path d="M19.4 12.4v.6a3.5 3.5 0 0 1-3.5 3.5h-11" />
      </g>
    </svg>
  );
}

/** 菱形宝石：圆角白边，可选四色分区（万能牌） */
function Gem({ quad, className = '' }: { quad?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 76 104" className={`occ__gem ${className}`} aria-hidden="true">
      <path className="occ__gem-rim" d="M38 6 70 52 38 98 6 52Z" />
      {quad ? (
        <g className="occ__gem-quad">
          <path d="M38 13 38 52 11 52Z" fill="#e8403a" />
          <path d="M38 13 65 52 38 52Z" fill="#f4b400" />
          <path d="M65 52 38 91 38 52Z" fill="#22a861" />
          <path d="M11 52 38 52 38 91Z" fill="#2577da" />
          <path d="M38 13 65 52 38 91 11 52Z" className="occ__gem-glass" />
        </g>
      ) : (
        <path className="occ__gem-line" d="M38 15 63.5 52 38 89 12.5 52Z" />
      )}
    </svg>
  );
}

function glyph(card: Card, big: boolean): ReactNode {
  switch (card.kind) {
    case 'num':
      return (
        <span className={`occ__num ${card.n === 6 || card.n === 9 ? 'is-u' : ''}`}>{card.n}</span>
      );
    case 'skip':
      return <SkipIcon />;
    case 'reverse':
      return <ReverseIcon />;
    case 'draw2':
      return <span className="occ__num is-plus">+2</span>;
    case 'wild4':
      return <span className="occ__num is-plus">+4</span>;
    case 'wild':
      return big ? null : <Gem quad className="is-mini" />;
  }
}

const KIND_LABEL: Record<oc.OcKind, string> = {
  num: '',
  skip: '跳过',
  reverse: '反转',
  draw2: '+2',
  wild: '万能牌',
  wild4: '万能 +4',
};
export function cardName(c: Card): string {
  if (c.kind === 'wild' || c.kind === 'wild4') return KIND_LABEL[c.kind];
  return `${COLOR_LABEL[c.color!]} ${c.kind === 'num' ? c.n : KIND_LABEL[c.kind]}`;
}

export interface CardViewProps {
  /** null = 背面 */
  card: Card | null;
  /** 牌宽（CSS 长度），默认 var(--cw) */
  w?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  title?: string;
  attrs?: Record<string, string | number>;
}

/** 一张牌：全部由 CSS + 内联 SVG 绘制，任意尺寸都清晰 */
export function CardView({
  card,
  w,
  className = '',
  style,
  onClick,
  disabled,
  title,
  attrs,
}: CardViewProps) {
  const s = { ...(w ? { '--w': w } : null), ...style } as CSSProperties;
  const inner =
    card === null ? (
      <span className="occ__panel">
        <span className="occ__frame" />
        <span className="occ__emblem">
          <Gem quad className="is-back" />
        </span>
      </span>
    ) : (
      <span className="occ__panel">
        <span className="occ__frame" />
        <span className="occ__emblem">
          <Gem quad={card.color === null} />
          <span className="occ__big">{glyph(card, true)}</span>
        </span>
        <span className="occ__idx is-tl">{glyph(card, false)}</span>
        <span className="occ__idx is-br">{glyph(card, false)}</span>
      </span>
    );
  const cls = `occ ${card === null ? 'is-back' : `is-${card.color ?? 'W'} kind-${card.kind}`} ${className}`;
  const label = card === null ? '牌背' : cardName(card);
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        style={s}
        onClick={onClick}
        disabled={disabled}
        title={title ?? label}
        aria-label={label}
        {...attrs}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={cls} style={s} role="img" aria-label={label} title={title} {...attrs}>
      {inner}
    </span>
  );
}

/** 大厅卡片插画：三张牌扇形展开 */
export function OneCardArt() {
  const cards: Card[] = [
    { id: 1, color: 'R', kind: 'num', n: 7 },
    { id: 2, color: null, kind: 'wild4' },
    { id: 3, color: 'B', kind: 'reverse' },
  ];
  return (
    <div className="occ-art">
      {cards.map((c, i) => (
        <CardView key={c.id} card={c} w="54px" style={{ '--i': i - 1 } as CSSProperties} />
      ))}
    </div>
  );
}
