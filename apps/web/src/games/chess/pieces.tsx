import type { ch } from '@park/engine';
import type * as React from 'react';
import type { ReactNode } from 'react';
import { memo, useId } from 'react';
import './pieces.css';

type T = ch.ChType;
type C = ch.ChColor;

/** 所有棋子共用的底座 */
const BASE = (
  <>
    <path d="M30 70.5h40a3 3 0 0 1 3 3v2.5H27v-2.5a3 3 0 0 1 3-3Z" />
    <path d="M23.5 76h53a3.5 3.5 0 0 1 3.5 3.5v3a3.5 3.5 0 0 1-3.5 3.5h-53a3.5 3.5 0 0 1-3.5-3.5v-3a3.5 3.5 0 0 1 3.5-3.5Z" />
  </>
);
const BAND = (y: number, half: number) => (
  <path d={`M${50 - half} ${y}h${half * 2}a3 3 0 0 1 0 6h-${half * 2}a3 3 0 0 1 0-6Z`} />
);
/** 底座之上逐渐收窄的身子 */
const BODY = (top: number, half: number) => (
  <path
    d={`M${50 - half} ${top}C${50 - half} ${top + 9} ${42 - half * 0.2} ${64} ${33} 70.5H67C${58 + half * 0.2} 64 ${50 + half} ${top + 9} ${50 + half} ${top}Z`}
  />
);

/** 形状部分（填充用统一的渐变，细节线单独画） */
const SHAPES: Record<T, { body: ReactNode; detail?: ReactNode }> = {
  p: {
    body: (
      <>
        <circle cx="50" cy="29" r="11.5" />
        {BAND(42, 11)}
        {BODY(48, 8)}
        {BASE}
      </>
    ),
  },
  r: {
    body: (
      <>
        <path d="M30 18h8.5v6.5h6V18h11v6.5h6V18H70v14.5H30Z" />
        {BAND(32.5, 16)}
        <path d="M36.5 38.5h27l-2.6 27.5H39.1Z" />
        <path d="M33 65.5h34a2.5 2.5 0 0 1 2.5 2.5v2.5h-39V68a2.5 2.5 0 0 1 2.5-2.5Z" />
        {BASE}
      </>
    ),
    detail: <path d="M37 38.6h26" />,
  },
  n: {
    body: (
      <>
        <path d="M33 70.5C33 61 37.5 55.5 45 51.5 40.5 50.5 36.5 50 31.5 52.5 26.5 55 21 52 20.5 46.5 20 41 24 35.5 30 29.5 35 24 40.5 18.5 46.5 15.5L50.5 7.5 55 15C66.5 17 75 30.5 73 48 72 59 70.5 65 70.5 70.5Z" />
        {BASE}
      </>
    ),
    detail: (
      <>
        <circle cx="39.5" cy="29.5" r="2.4" fill="currentColor" stroke="none" />
        <circle cx="24.5" cy="45" r="1.4" fill="currentColor" stroke="none" />
        <path d="M56.5 18.5C64 25 68.5 35 67.5 49" />
        <path d="M45 51.5c2.5-1.2 5-1.6 7.5-1.2" />
      </>
    ),
  },
  b: {
    body: (
      <>
        <circle cx="50" cy="13.5" r="5" />
        <path d="M50 18.5C61.5 26 65 37 61 46.5H39C35 37 38.5 26 50 18.5Z" />
        {BAND(46.5, 13)}
        {BODY(52.5, 8)}
        {BASE}
      </>
    ),
    detail: <path d="M55 28 47.5 38.5" />,
  },
  q: {
    body: (
      <>
        <path d="M27 25 35.5 46h29L73 25 61.5 37.5 57.5 18 50 35 42.5 18 38.5 37.5Z" />
        {[
          [26, 22],
          [38.5, 15],
          [50, 12],
          [61.5, 15],
          [74, 22],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="4.2" />
        ))}
        {BAND(46, 15.5)}
        {BODY(52, 11)}
        {BASE}
      </>
    ),
  },
  k: {
    body: (
      <>
        <path d="M47 5h6v6h6v6h-6v8h-6v-8h-6v-6h6Z" />
        <path d="M50 26.5C35 21.5 25 31 30 41l4 5h32l4-5c5-10-5-19.5-20-14.5Z" />
        {BAND(46, 15.5)}
        {BODY(52, 11)}
        {BASE}
      </>
    ),
    detail: <path d="M50 27v18" />,
  },
};

/** 国际象棋棋子（viewBox 0 0 100 100） */
export const ChessPiece = memo(function ChessPiece({ t, c }: { t: T; c: C }) {
  const id = useId().replace(/:/g, '');
  const s = SHAPES[t];
  const white = c === 'w';
  return (
    <svg viewBox="0 0 100 100" className={`cp cp-${c}`} aria-label={`${white ? '白' : '黑'}${t}`}>
      <defs>
        <linearGradient id={`g${id}`} x1="0.15" y1="0" x2="0.85" y2="1">
          {white ? (
            <>
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.55" stopColor="#f3ede2" />
              <stop offset="1" stopColor="#d6cbb8" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#5d5852" />
              <stop offset="0.5" stopColor="#2f2b28" />
              <stop offset="1" stopColor="#131110" />
            </>
          )}
        </linearGradient>
      </defs>
      <g
        fill={`url(#g${id})`}
        stroke={white ? '#2b251f' : '#0b0a09'}
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {s.body}
      </g>
      {s.detail && (
        <g
          fill="none"
          stroke={white ? '#2b251f' : '#b9b0a3'}
          strokeWidth="2.2"
          strokeLinecap="round"
          style={{ color: white ? '#2b251f' : '#b9b0a3' }}
        >
          {s.detail}
        </g>
      )}
    </svg>
  );
});

/** 大厅卡片插画 */
export function ChessArt() {
  return (
    <div className="cp-art">
      <span style={{ '--i': -1 } as React.CSSProperties}>
        <ChessPiece t="n" c="w" />
      </span>
      <span style={{ '--i': 0 } as React.CSSProperties}>
        <ChessPiece t="k" c="b" />
      </span>
      <span style={{ '--i': 1 } as React.CSSProperties}>
        <ChessPiece t="q" c="w" />
      </span>
    </div>
  );
}
