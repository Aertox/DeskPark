import type { xq } from '@park/engine';
import type * as React from 'react';
import { memo, useId } from 'react';
import './pieces.css';

const CHAR: Record<xq.XqType, [string, string]> = {
  k: ['帅', '将'],
  a: ['仕', '士'],
  e: ['相', '象'],
  h: ['马', '马'],
  r: ['车', '车'],
  c: ['炮', '炮'],
  p: ['兵', '卒'],
};

/** 木质棋子（viewBox 0 0 100 100）：外圈、倒角、内圈与刻字 */
export const XqPiece = memo(function XqPiece({ t, c }: { t: xq.XqType; c: xq.XqColor }) {
  const id = useId().replace(/:/g, '');
  const red = c === 'r';
  const ink = red ? '#b3282d' : '#231f1c';
  return (
    <svg viewBox="0 0 100 100" className={`xp xp-${c}`} aria-label={CHAR[t][red ? 0 : 1]}>
      <defs>
        <radialGradient id={`f${id}`} cx="0.4" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#fdf0d3" />
          <stop offset="0.6" stopColor="#efd4a2" />
          <stop offset="1" stopColor="#d6ad6c" />
        </radialGradient>
        <linearGradient id={`e${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c99a5c" />
          <stop offset="1" stopColor="#8a5d2c" />
        </linearGradient>
      </defs>
      {/* 侧面厚度 */}
      <circle cx="50" cy="53.5" r="45" fill={`url(#e${id})`} />
      <circle cx="50" cy="50" r="45" fill={`url(#f${id})`} stroke="#9c6b35" strokeWidth="1.6" />
      <circle cx="50" cy="50" r="38.5" fill="none" stroke={ink} strokeWidth="2.4" opacity="0.92" />
      <circle cx="50" cy="50" r="35.5" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.5" />
      {/* 高光 */}
      <ellipse
        cx="38"
        cy="26"
        rx="20"
        ry="9"
        fill="#fff"
        opacity="0.28"
        transform="rotate(-22 38 26)"
      />
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        className="xp__char"
        fill={ink}
      >
        {CHAR[t][red ? 0 : 1]}
      </text>
    </svg>
  );
});

/** 棋盘（viewBox 0 0 9 10，交叉点在 (f + 0.5, row + 0.5)） */
export const XqBoardBg = memo(function XqBoardBg() {
  const L = 0.5;
  const R = 8.5;
  const lines: string[] = [];
  for (let row = 0; row < 10; row++) lines.push(`M${L} ${row + 0.5}H${R}`);
  for (let f = 0; f < 9; f++) {
    if (f === 0 || f === 8) lines.push(`M${f + 0.5} 0.5V9.5`);
    else {
      lines.push(`M${f + 0.5} 0.5V4.5`);
      lines.push(`M${f + 0.5} 5.5V9.5`);
    }
  }
  // 九宫斜线
  lines.push('M3.5 0.5 5.5 2.5M5.5 0.5 3.5 2.5M3.5 7.5 5.5 9.5M5.5 7.5 3.5 9.5');
  // 炮位、兵位的定位标记
  const marks: [number, number][] = [
    [1, 2],
    [7, 2],
    [1, 7],
    [7, 7],
    ...[0, 2, 4, 6, 8].flatMap((f) => [[f, 3] as [number, number], [f, 6] as [number, number]]),
  ];
  const g = 0.09;
  const l = 0.2;
  for (const [f, row] of marks) {
    const x = f + 0.5;
    const y = row + 0.5;
    for (const sx of [-1, 1]) {
      if ((f === 0 && sx === -1) || (f === 8 && sx === 1)) continue;
      for (const sy of [-1, 1]) {
        const cx = x + sx * g;
        const cy = y + sy * g;
        lines.push(`M${cx + sx * l} ${cy}H${cx}V${cy + sy * l}`);
      }
    }
  }
  return (
    <svg viewBox="0 0 9 10" className="xb-bg" aria-hidden="true">
      <defs>
        <linearGradient id="xb-wood" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#f2dcae" />
          <stop offset="0.5" stopColor="#e9c98f" />
          <stop offset="1" stopColor="#dcb675" />
        </linearGradient>
        <pattern
          id="xb-grain"
          width="9"
          height="0.37"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-3)"
        >
          <path
            d="M0 0.18 Q2.2 0.1 4.5 0.2 T9 0.17"
            stroke="#b98a4f"
            strokeWidth="0.012"
            fill="none"
            opacity="0.35"
          />
        </pattern>
      </defs>
      <rect width="9" height="10" fill="url(#xb-wood)" />
      <rect width="9" height="10" fill="url(#xb-grain)" />
      <rect
        x="0.32"
        y="0.32"
        width="8.36"
        height="9.36"
        fill="none"
        stroke="#6b4423"
        strokeWidth="0.06"
      />
      <path
        d={lines.join('')}
        fill="none"
        stroke="#6b4423"
        strokeWidth="0.03"
        strokeLinecap="square"
      />
      <text x="2.5" y="5.02" className="xb-river" textAnchor="middle" dominantBaseline="central">
        {'楚\u3000河'}
      </text>
      <text x="6.5" y="5.02" className="xb-river" textAnchor="middle" dominantBaseline="central">
        {'汉\u3000界'}
      </text>
    </svg>
  );
});

/** 大厅卡片插画 */
export function XiangqiArt() {
  return (
    <div className="xp-art">
      <span style={{ '--i': -1 } as React.CSSProperties}>
        <XqPiece t="c" c="r" />
      </span>
      <span style={{ '--i': 0 } as React.CSSProperties}>
        <XqPiece t="k" c="r" />
      </span>
      <span style={{ '--i': 1 } as React.CSSProperties}>
        <XqPiece t="k" c="b" />
      </span>
    </div>
  );
}
