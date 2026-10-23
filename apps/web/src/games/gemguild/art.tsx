import type { gg } from '@park/engine';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { memo, useId } from 'react';
import './art.css';

type Gem = gg.Gem;
type Token = gg.Token;
type Card = gg.GgCard;
type P = [number, number];

export const GEMS: readonly Gem[] = ['white', 'blue', 'green', 'red', 'black'];
export const GEM_LABEL: Record<Token, string> = {
  white: '钻石',
  blue: '蓝宝石',
  green: '祖母绿',
  red: '红宝石',
  black: '黑曜石',
  gold: '黄金',
};

/** 每种宝石的暗 / 中 / 亮三档颜色 */
export const GEM_PAL: Record<Token, [string, string, string]> = {
  white: ['#7d91a6', '#d3e1ee', '#ffffff'],
  blue: ['#0a286b', '#2463d6', '#a3ccff'],
  green: ['#063f26', '#119652', '#98f3c4'],
  red: ['#5a0912', '#d1253a', '#ffa6ad'],
  black: ['#0c0c11', '#393a4a', '#a2a4c2'],
  gold: ['#734606', '#e2a621', '#fff2b5'],
};
/** 发展卡背景的上下两档色调 */
const TINT: Record<Gem, [string, string]> = {
  white: ['#f5f8fb', '#93a5b8'],
  blue: ['#dbe8ff', '#22418f'],
  green: ['#dcf5e6', '#1a6040'],
  red: ['#ffe0dc', '#86202c'],
  black: ['#e4e4ec', '#272733'],
};

/* ============================ 颜色与刻面计算 ============================ */

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i] - v) * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
const shade = (pal: [string, string, string], t: number) =>
  t < 0.5 ? mix(pal[0], pal[1], t * 2) : mix(pal[1], pal[2], (t - 0.5) * 2);

const LIGHT: P = (() => {
  const v: P = [-0.55, -0.83];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l];
})();
const centroid = (p: P[]): P => [
  p.reduce((a, q) => a + q[0], 0) / p.length,
  p.reduce((a, q) => a + q[1], 0) / p.length,
];
const lit = (p: P[], amp: number, bias = 0) => {
  const [x, y] = centroid(p);
  const l = Math.hypot(x, y) || 1;
  return 0.5 + bias + amp * ((x / l) * LIGHT[0] + (y / l) * LIGHT[1]);
};
const pts = (p: P[]) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const ring = (n: number, rx: number, ry: number, rot: number): P[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180;
    return [rx * Math.cos(a), ry * Math.sin(a)] as P;
  });
const scale = (p: P[], s: number): P[] => p.map(([x, y]) => [x * s, y * s]);

interface Facet {
  p: P[];
  t: number;
}

/** 明亮式切工（俯视）：外圈三角刻面 + 台面 + 星形 */
function brilliant(n: number, rx: number, ry: number): Facet[] {
  const O = ring(n, rx, ry, -90);
  const I = ring(n, rx * 0.56, ry * 0.56, -90 + 180 / n);
  const S = ring(n, rx * 0.3, ry * 0.3, -90);
  const out: Facet[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = [O[i], O[j], I[i]];
    const b = [I[i], O[j], I[j]];
    out.push({ p: a, t: lit(a, 0.46) });
    out.push({ p: b, t: lit(b, -0.3, 0.12) });
  }
  out.push({ p: I, t: 0.74 });
  for (let i = 0; i < n; i++) {
    const tri = [I[i], I[(i + 1) % n], S[(i + 1) % n]];
    out.push({ p: tri, t: lit(tri, 0.25, 0.3) });
  }
  out.push({ p: S, t: 0.9 });
  return out;
}

/** 阶梯式切工：一圈圈向内收的台阶 */
function stepCut(outer: P[], scales: number[], amps: number[], table = 0.8): Facet[] {
  const rings = scales.map((s) => scale(outer, s));
  const out: Facet[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r];
    const b = rings[r + 1];
    for (let k = 0; k < a.length; k++) {
      const q = [a[k], a[(k + 1) % a.length], b[(k + 1) % a.length], b[k]];
      out.push({ p: q, t: lit(q, amps[r]) });
    }
  }
  out.push({ p: rings.at(-1)!, t: table });
  return out;
}

/** 钻石：经典的侧面轮廓（冠部 + 亭部） */
function diamondProfile(): Facet[] {
  const g = [-46, -23, 0, 23, 46].map((x) => [x, -6] as P);
  const t = [-24, 0, 24].map((x) => [x, -30] as P);
  const tip: P = [0, 44];
  return [
    { p: [g[0], t[0], g[1]], t: 0.72 },
    { p: [t[0], t[1], g[1]], t: 0.98 },
    { p: [t[1], g[2], g[1]], t: 0.66 },
    { p: [t[1], t[2], g[3]], t: 0.86 },
    { p: [t[1], g[3], g[2]], t: 0.5 },
    { p: [t[2], g[4], g[3]], t: 0.4 },
    { p: [g[0], g[1], tip], t: 0.58 },
    { p: [g[1], g[2], tip], t: 0.9 },
    { p: [g[2], g[3], tip], t: 0.36 },
    { p: [g[3], g[4], tip], t: 0.22 },
  ];
}

const FACETS: Record<Gem, Facet[]> = {
  white: diamondProfile(),
  blue: brilliant(8, 34, 44),
  green: stepCut(
    [
      [-19, -42],
      [19, -42],
      [31, -30],
      [31, 30],
      [19, 42],
      [-19, 42],
      [-31, 30],
      [-31, -30],
    ],
    [1, 0.74, 0.5],
    [0.46, -0.28],
  ),
  red: brilliant(10, 42, 42),
  black: stepCut(ring(6, 44, 44, -90), [1, 0.68, 0.4], [0.5, -0.3], 0.62),
};

const SPARK = 'M0 -9Q1.1 -1.1 9 0Q1.1 1.1 0 9Q-1.1 1.1 -9 0Q-1.1 -1.1 0 -9Z';

/** 一颗宝石（坐标系 -50..50） */
export const GemShape = memo(function GemShape({
  gem,
  sparkle = true,
}: {
  gem: Gem;
  sparkle?: boolean;
}) {
  const pal = GEM_PAL[gem];
  const facets = FACETS[gem];
  const edge = mix(pal[0], pal[1], 0.25);
  return (
    <g>
      {facets.map((f, i) => (
        <polygon
          key={i}
          points={pts(f.p)}
          fill={shade(pal, f.t)}
          stroke={edge}
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      ))}
      {/* 外轮廓与高光 */}
      <polygon
        points={pts(
          gem === 'white'
            ? [
                [-46, -6],
                [-24, -30],
                [24, -30],
                [46, -6],
                [0, 44],
              ]
            : outline(gem),
        )}
        fill="none"
        stroke={pal[0]}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {sparkle && (
        <>
          <path d={SPARK} transform="translate(-16 -24) scale(0.9)" fill="#fff" opacity="0.95" />
          <path d={SPARK} transform="translate(20 10) scale(0.45)" fill="#fff" opacity="0.7" />
        </>
      )}
    </g>
  );
});

function outline(gem: Gem): P[] {
  const f = FACETS[gem];
  if (gem === 'blue') return ring(8, 34, 44, -90);
  if (gem === 'red') return ring(10, 42, 42, -90);
  if (gem === 'green') return f.slice(0, 8).map((x) => x.p[0]);
  return ring(6, 44, 44, -90);
}

/** 金币（黄金宝石） */
function Coin() {
  const id = useId().replace(/:/g, '');
  const pal = GEM_PAL.gold;
  return (
    <g>
      <defs>
        <radialGradient id={`gc${id}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={pal[2]} />
          <stop offset="0.45" stopColor={pal[1]} />
          <stop offset="1" stopColor={pal[0]} />
        </radialGradient>
      </defs>
      <circle r="44" fill={`url(#gc${id})`} stroke={pal[0]} strokeWidth="2.4" />
      <circle r="35" fill="none" stroke={pal[2]} strokeWidth="1.6" opacity="0.8" />
      <circle r="33" fill="none" stroke={pal[0]} strokeWidth="1" opacity="0.5" />
      {/* 浮雕王冠 */}
      <path
        d="M-19 9-22-12-10-2 0-17 10-2 22-12 19 9Z"
        fill={pal[1]}
        stroke={pal[0]}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect
        x="-19"
        y="9"
        width="38"
        height="7"
        rx="1.5"
        fill={pal[1]}
        stroke={pal[0]}
        strokeWidth="1.6"
      />
      <path d="M-19 9-22-12-10-2 0-17" fill="none" stroke={pal[2]} strokeWidth="1" opacity="0.8" />
      {[-22, 0, 22].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy={i === 1 ? -17 : -12}
          r="2.6"
          fill={pal[2]}
          stroke={pal[0]}
          strokeWidth="0.8"
        />
      ))}
      <path d={SPARK} transform="translate(-22 -26) scale(0.8)" fill="#fff" opacity="0.9" />
    </g>
  );
}

/** 宝石图标（独立 SVG） */
export function GemIcon({
  gem,
  className = '',
  style,
}: {
  gem: Token;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="-50 -50 100 100"
      className={`gg-gem ${className}`}
      style={style}
      aria-hidden="true"
    >
      {gem === 'gold' ? <Coin /> : <GemShape gem={gem} />}
    </svg>
  );
}

/* ============================ 宝石筹码 ============================ */

export function GemToken({
  gem,
  count,
  size,
  onClick,
  selected,
  disabled,
  dim,
  attrs,
  title,
}: {
  gem: Token;
  count?: number;
  size?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  selected?: number;
  disabled?: boolean;
  dim?: boolean;
  attrs?: Record<string, string | number>;
  title?: string;
}) {
  const cls = `ggt t-${gem} ${dim ? 'is-dim' : ''} ${selected ? 'is-selected' : ''}`;
  const style = size ? ({ '--t': size } as CSSProperties) : undefined;
  const inner = (
    <>
      <span className="ggt__rim" />
      <span className="ggt__face">
        <GemIcon gem={gem} />
      </span>
      {count !== undefined && <span className="ggt__count num">{count}</span>}
      {!!selected && <span className="ggt__sel num">+{selected}</span>}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={onClick}
      disabled={disabled}
      title={title ?? GEM_LABEL[gem]}
      aria-label={GEM_LABEL[gem]}
      {...attrs}
    >
      {inner}
    </button>
  ) : (
    <span className={cls} style={style} title={title ?? GEM_LABEL[gem]} {...attrs}>
      {inner}
    </span>
  );
}

/** 小号的折扣牌（持有的发展卡数量） */
export function BonusChip({ gem, n }: { gem: Gem; n: number }) {
  return (
    <span className={`ggbc g-${gem} ${n ? '' : 'is-zero'}`} title={`${GEM_LABEL[gem]}折扣 ${n}`}>
      <GemIcon gem={gem} />
      <b className="num">{n}</b>
    </span>
  );
}

/* ============================ 发展卡插画 ============================ */

const crystal = (
  cx: number,
  base: number,
  w: number,
  h: number,
  rot: number,
  pal: [string, string, string],
  key: string,
) => {
  const tip = base - h - w * 0.55;
  return (
    <g key={key} transform={`rotate(${rot} ${cx} ${base})`}>
      <polygon
        points={pts([
          [cx - w / 2, base],
          [cx - w / 2, base - h],
          [cx, tip],
          [cx, base],
        ])}
        fill={pal[2]}
      />
      <polygon
        points={pts([
          [cx, base],
          [cx, tip],
          [cx + w / 2, base - h],
          [cx + w / 2, base],
        ])}
        fill={pal[1]}
      />
      <polygon
        points={pts([
          [cx - w / 2, base - h],
          [cx, tip],
          [cx + w / 2, base - h],
          [cx, base - h + w * 0.18],
        ])}
        fill={mix(pal[2], '#ffffff', 0.35)}
        opacity="0.9"
      />
      <polyline
        points={pts([
          [cx - w / 2, base],
          [cx - w / 2, base - h],
          [cx, tip],
          [cx + w / 2, base - h],
          [cx + w / 2, base],
        ])}
        fill="none"
        stroke={pal[0]}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <line
        x1={cx - w / 4}
        y1={base - 2}
        x2={cx - w / 4}
        y2={base - h + 2}
        stroke="#fff"
        strokeWidth="0.8"
        opacity="0.55"
      />
    </g>
  );
};

/** Ⅰ 矿脉：岩洞里长出的晶簇 */
function MineScene({ gem, id }: { gem: Gem; id: string }) {
  const pal = GEM_PAL[gem];
  const [top, bottom] = TINT[gem];
  const glow = gem === 'black' ? '#b7b9e0' : pal[2];
  return (
    <>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id={`gl${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={glow} stopOpacity="0.85" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="140" fill={`url(#bg${id})`} />
      {/* 洞顶的岩壁 */}
      <path
        d="M0 0H100V30Q88 40 80 34T62 42Q52 30 40 38T18 32Q8 40 0 34Z"
        fill="#000"
        opacity="0.18"
      />
      <ellipse cx="64" cy="96" rx="44" ry="40" fill={`url(#gl${id})`} />
      <path
        d="M0 140V104Q12 96 22 102L34 94Q46 90 54 98L66 92Q80 86 90 94L100 90V140Z"
        fill="#6b5f55"
      />
      {crystal(56, 112, 12, 34, -16, pal, 'a')}
      {crystal(84, 110, 10, 26, 18, pal, 'b')}
      {crystal(70, 116, 16, 46, 2, pal, 'c')}
      {crystal(44, 118, 8, 16, -30, pal, 'd')}
      <path d="M0 140V116Q14 108 28 114T52 112Q64 106 78 114T100 110V140Z" fill="#3f3630" />
      <path
        d="M0 116Q14 108 28 114T52 112Q64 106 78 114T100 110"
        fill="none"
        stroke="#8a7a6c"
        strokeWidth="1.2"
        opacity="0.6"
      />
      {/* 矿镐 */}
      <g transform="translate(22 108) rotate(-28)" opacity="0.85">
        <rect x="-1.2" y="-2" width="2.4" height="22" rx="1" fill="#7a5532" />
        <path
          d="M-12 -3Q0 -9 12 -3L10 -1Q0 -5 -10 -1Z"
          fill="#9aa3ad"
          stroke="#4b5158"
          strokeWidth="0.6"
        />
      </g>
      <path d={SPARK} transform="translate(60 70) scale(0.55)" fill="#fff" />
      <path d={SPARK} transform="translate(88 78) scale(0.35)" fill="#fff" opacity="0.8" />
    </>
  );
}

/** Ⅱ 工坊：天鹅绒垫上的镶金胸针 */
function WorkshopScene({ gem, id }: { gem: Gem; id: string }) {
  const [top, bottom] = TINT[gem];
  const velvet = gem === 'red' ? '#2a2550' : '#5c1c2e';
  return (
    <>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={mix(top, '#fff4dc', 0.4)} />
          <stop offset="1" stopColor={mix(bottom, '#3a2410', 0.25)} />
        </linearGradient>
        <linearGradient id={`au${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b0" />
          <stop offset="0.5" stopColor="#d9a031" />
          <stop offset="1" stopColor="#8a5a10" />
        </linearGradient>
        <radialGradient id={`vv${id}`} cx="0.45" cy="0.3" r="0.8">
          <stop offset="0" stopColor={mix(velvet, '#ffffff', 0.25)} />
          <stop offset="1" stopColor={mix(velvet, '#000000', 0.4)} />
        </radialGradient>
      </defs>
      <rect width="100" height="140" fill={`url(#bg${id})`} />
      {/* 窗外的光 */}
      {[-30, -12, 6, 24].map((a) => (
        <path
          key={a}
          d="M78 -6L70 140H92Z"
          transform={`rotate(${a} 78 -6)`}
          fill="#fff"
          opacity="0.08"
        />
      ))}
      {/* 天鹅绒软垫 */}
      <path
        d="M22 116Q20 100 38 98H84Q100 100 98 116Q100 130 84 132H38Q20 130 22 116Z"
        fill={`url(#vv${id})`}
      />
      <path d="M30 104Q60 112 92 104" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.2" />
      {[24, 96].map((x) => (
        <g key={x} transform={`translate(${x} 118)`}>
          <circle r="2.6" fill="url(#au${id})" />
          <path d="M-2 2L-3 12H3L2 2Z" fill="url(#au${id})" opacity="0.9" />
        </g>
      ))}
      {/* 胸针：金托、爪镶、花丝 */}
      <g transform="translate(60 72) scale(1.2)">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          return (
            <circle
              key={i}
              cx={Math.cos(a) * 27}
              cy={Math.sin(a) * 27}
              r="3.4"
              fill="none"
              stroke={`url(#au${id})`}
              strokeWidth="1.6"
            />
          );
        })}
        <circle r="23" fill="none" stroke={`url(#au${id})`} strokeWidth="4.5" />
        <circle r="23" fill="none" stroke="#6e4508" strokeWidth="0.6" opacity="0.6" />
        <g transform="scale(0.4)">
          <GemShape gem={gem} />
        </g>
        {[45, 135, 225, 315].map((d) => {
          const a = (d * Math.PI) / 180;
          return (
            <circle
              key={d}
              cx={Math.cos(a) * 17}
              cy={Math.sin(a) * 17}
              r="2.4"
              fill={`url(#au${id})`}
              stroke="#6e4508"
              strokeWidth="0.5"
            />
          );
        })}
        <path d="M-6 25 0 38 6 25" fill={`url(#au${id})`} />
        <circle cy="40" r="4" fill="#fbf7ef" stroke="#c8b9a0" strokeWidth="0.6" />
      </g>
      <path d={SPARK} transform="translate(44 58) scale(0.5)" fill="#fff" />
    </>
  );
}

/** Ⅲ 王冠：帷幕下镶着宝石的王冠 */
function CrownScene({ gem, id }: { gem: Gem; id: string }) {
  const [top, bottom] = TINT[gem];
  const curtain = gem === 'red' ? '#1e2a5a' : '#6a1420';
  return (
    <>
      <defs>
        <radialGradient id={`bg${id}`} cx="0.6" cy="0.55" r="0.75">
          <stop offset="0" stopColor={mix(top, '#fff8e0', 0.5)} />
          <stop offset="1" stopColor={mix(bottom, '#000', 0.2)} />
        </radialGradient>
        <linearGradient id={`au${id}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff3bd" />
          <stop offset="0.45" stopColor="#e3ad38" />
          <stop offset="1" stopColor="#7d4f0b" />
        </linearGradient>
        <linearGradient id={`cu${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={mix(curtain, '#000', 0.35)} />
          <stop offset="0.5" stopColor={mix(curtain, '#fff', 0.15)} />
          <stop offset="1" stopColor={mix(curtain, '#000', 0.35)} />
        </linearGradient>
      </defs>
      <rect width="100" height="140" fill={`url(#bg${id})`} />
      {/* 金色光芒 */}
      {Array.from({ length: 12 }, (_, i) => (
        <path
          key={i}
          d="M60 78L56 0H64Z"
          transform={`rotate(${i * 30} 60 78)`}
          fill="#ffe7a0"
          opacity="0.13"
        />
      ))}
      {/* 帷幕 */}
      <path d="M0 0H100V12Q84 22 66 14Q50 24 34 14Q18 22 0 12Z" fill={`url(#cu${id})`} />
      <path d="M0 0H18Q14 40 22 70Q12 74 0 72Z" fill={`url(#cu${id})`} />
      <path
        d="M0 12Q18 22 34 14Q50 24 66 14Q84 22 100 12"
        fill="none"
        stroke="#e7b84a"
        strokeWidth="1.4"
      />
      {/* 大理石台座 */}
      <path d="M34 118H88L84 126H38Z" fill="#e7e2d8" />
      <rect x="38" y="126" width="46" height="14" fill="#d3ccbe" />
      <path d="M34 118H88" stroke="#fff" strokeWidth="1" opacity="0.7" />
      {/* 王冠 */}
      <g transform="translate(61 96)">
        <path
          d="M-30 18-34-16-18 0-8-22 0-8 8-22 18 0 34-16 30 18Z"
          fill={`url(#au${id})`}
          stroke="#6b4208"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M-30 18-34-16-18 0-8-22 0-8"
          fill="none"
          stroke="#fff3bd"
          strokeWidth="0.9"
          opacity="0.8"
        />
        <rect
          x="-31"
          y="14"
          width="62"
          height="11"
          rx="2"
          fill={`url(#au${id})`}
          stroke="#6b4208"
          strokeWidth="1.2"
        />
        {[-34, -8, 8, 34].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={i === 1 || i === 2 ? -22 : -16}
            r="3.4"
            fill="#fbf7ef"
            stroke="#bfae8f"
            strokeWidth="0.7"
          />
        ))}
        {[-22, 22].map((x) => (
          <circle
            key={x}
            cx={x}
            cy="19.5"
            r="2.6"
            fill="#fbf7ef"
            stroke="#bfae8f"
            strokeWidth="0.6"
          />
        ))}
        <g transform="translate(0 6) scale(0.32)">
          <GemShape gem={gem} />
        </g>
      </g>
      <path d={SPARK} transform="translate(46 70) scale(0.6)" fill="#fff" />
      <path d={SPARK} transform="translate(86 62) scale(0.4)" fill="#fff" opacity="0.8" />
    </>
  );
}

const SCENES = { 1: MineScene, 2: WorkshopScene, 3: CrownScene } as const;

export const CardArt = memo(function CardArt({ gem, level }: { gem: Gem; level: gg.Level }) {
  const id = useId().replace(/:/g, '');
  const Scene = SCENES[level];
  return (
    <svg
      className="ggc__art"
      viewBox="0 0 100 140"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <Scene gem={gem} id={id} />
    </svg>
  );
});

/* ============================ 发展卡 ============================ */

export function GemCard({
  card,
  w,
  className = '',
  style,
  onClick,
  disabled,
  attrs,
  children,
  title,
}: {
  card: Card;
  w?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  attrs?: Record<string, string | number>;
  children?: ReactNode;
  title?: string;
}) {
  const cls = `ggc lv-${card.level} g-${card.bonus} ${className}`;
  const s = { ...(w ? { '--w': w } : null), ...style } as CSSProperties;
  const label = `${['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][card.level]} 级${GEM_LABEL[card.bonus]}卡${card.points ? `，${card.points} 声望` : ''}`;
  const inner = (
    <>
      <span className="ggc__frame">
        <CardArt gem={card.bonus} level={card.level} />
        <span className="ggc__band">
          <b className="ggc__pts">{card.points || ''}</b>
          <GemIcon gem={card.bonus} className="ggc__bonus" />
        </span>
        <span className="ggc__cost">
          {GEMS.filter((g) => card.cost[g]).map((g) => (
            <span key={g} className={`ggc__chip c-${g}`}>
              <b>{card.cost[g]}</b>
            </span>
          ))}
        </span>
        <span className="ggc__lv" aria-hidden="true">
          {Array.from({ length: card.level }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </span>
      {children}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={cls}
      style={s}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      {...attrs}
    >
      {inner}
    </button>
  ) : (
    <span className={cls} style={s} role="img" aria-label={label} title={title} {...attrs}>
      {inner}
    </span>
  );
}

const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'];

/** 牌背 */
export function GemCardBack({
  level,
  w,
  count,
  onClick,
  disabled,
  title,
  attrs,
}: {
  level: gg.Level;
  w?: string;
  count?: number;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  attrs?: Record<string, string | number>;
}) {
  const cls = `ggk lv-${level} ${count === 0 ? 'is-empty' : ''}`;
  const style = w ? ({ '--w': w } as CSSProperties) : undefined;
  const gems: Gem[] =
    level === 1 ? ['green'] : level === 2 ? ['blue', 'red'] : ['red', 'white', 'blue'];
  const inner = (
    <span className="ggk__frame">
      <span className="ggk__pattern" />
      <span className="ggk__medal">
        <svg viewBox="-50 -50 100 100" aria-hidden="true">
          <circle r="44" className="ggk__ring" />
          <circle r="38" className="ggk__ring is-thin" />
          {gems.map((g, i) => (
            <g
              key={g}
              transform={`translate(${(i - (gems.length - 1) / 2) * 24} -8) scale(${gems.length === 1 ? 0.42 : gems.length === 2 ? 0.32 : 0.26})`}
            >
              <GemShape gem={g} sparkle={false} />
            </g>
          ))}
          <text y="30" textAnchor="middle" className="ggk__num">
            {ROMAN[level]}
          </text>
        </svg>
      </span>
      <span className="ggk__title">宝石商会</span>
      {count !== undefined && <span className="ggk__count num">{count}</span>}
    </span>
  );
  return onClick ? (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={onClick}
      disabled={disabled}
      title={title}
      {...attrs}
    >
      {inner}
    </button>
  ) : (
    <span className={cls} style={style} title={title} {...attrs}>
      {inner}
    </span>
  );
}

/* ============================ 贵族 ============================ */

export function NobleTile({
  noble,
  w,
  onClick,
  className = '',
  attrs,
}: {
  noble: gg.GgNoble;
  w?: string;
  onClick?: () => void;
  className?: string;
  attrs?: Record<string, string | number>;
}) {
  const id = useId().replace(/:/g, '');
  const needs = GEMS.filter((g) => noble.need[g]);
  const main = GEM_PAL[needs[0]];
  const style = w ? ({ '--w': w } as CSSProperties) : undefined;
  const inner = (
    <>
      <span className="ggn__side">
        <b className="ggn__pts">{noble.points}</b>
        {needs.map((g) => (
          <span key={g} className={`ggn__need g-${g}`}>
            <b>{noble.need[g]}</b>
          </span>
        ))}
      </span>
      <svg className="ggn__crest" viewBox="0 0 60 70" aria-hidden="true">
        <defs>
          <linearGradient id={`sh${id}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor={mix(main[1], '#ffffff', 0.15)} />
            <stop offset="1" stopColor={main[0]} />
          </linearGradient>
          <linearGradient id={`au${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1b0" />
            <stop offset="0.5" stopColor="#d9a031" />
            <stop offset="1" stopColor="#7d4f0b" />
          </linearGradient>
        </defs>
        {/* 月桂 */}
        {[-1, 1].map((d) => (
          <g key={d} transform={`translate(30 0) scale(${d} 1)`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <ellipse
                key={i}
                cx={-23 + i * 1.2}
                cy={60 - i * 9}
                rx="2.2"
                ry="5"
                transform={`rotate(${-35 + i * 9} ${-23 + i * 1.2} ${60 - i * 9})`}
                fill="#6f8f4a"
                stroke="#3f5a26"
                strokeWidth="0.5"
              />
            ))}
          </g>
        ))}
        <path
          d="M14 20H46V40Q46 56 30 64Q14 56 14 40Z"
          fill={`url(#sh${id})`}
          stroke={`url(#au${id})`}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path
          d="M17 23H43V40Q43 53 30 60"
          fill="none"
          stroke="#fff"
          strokeWidth="0.7"
          opacity="0.35"
        />
        <path
          d="M18 18 16 6 23 12 30 2 37 12 44 6 42 18Z"
          fill={`url(#au${id})`}
          stroke="#6b4208"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        {[16, 30, 44].map((x, i) => (
          <circle key={x} cx={x} cy={i === 1 ? 2 : 6} r="1.6" fill="#fbf7ef" />
        ))}
        <text x="30" y="47" textAnchor="middle" className="ggn__char">
          {noble.name[0]}
        </text>
      </svg>
      <span className="ggn__name">{noble.name}</span>
    </>
  );
  const cls = `ggn ${className}`;
  return onClick ? (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={onClick}
      title={noble.name}
      {...attrs}
    >
      {inner}
    </button>
  ) : (
    <span
      className={cls}
      style={style}
      title={`${noble.name}：${needs.map((g) => `${GEM_LABEL[g]}×${noble.need[g]}`).join('、')}`}
      {...attrs}
    >
      {inner}
    </span>
  );
}

/** 大厅卡片插画 */
export function GemGuildArt() {
  const cards: Card[] = [
    {
      id: 1,
      level: 1,
      bonus: 'green',
      points: 0,
      cost: { white: 1, blue: 1, green: 0, red: 1, black: 1 },
    },
    {
      id: 2,
      level: 3,
      bonus: 'red',
      points: 4,
      cost: { white: 0, blue: 0, green: 0, red: 3, black: 7 },
    },
    {
      id: 3,
      level: 2,
      bonus: 'blue',
      points: 2,
      cost: { white: 0, blue: 0, green: 5, red: 3, black: 0 },
    },
  ];
  return (
    <div className="gg-art">
      {cards.map((c, i) => (
        <GemCard key={c.id} card={c} w="58px" style={{ '--i': i - 1 } as CSSProperties} />
      ))}
    </div>
  );
}
