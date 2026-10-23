import type { hi } from '@park/engine';
import type { LucideProps } from 'lucide-react';
import {
  BrickWall,
  Crown,
  Magnet,
  Mountain,
  Route,
  Sparkles,
  Swords,
  TreePine,
  Wheat,
} from 'lucide-react';
import type { ComponentType, CSSProperties, MouseEvent, ReactNode } from 'react';
import './art.css';

type Res = hi.Res;
type Terrain = hi.Terrain;

/** 四位玩家的棋子颜色：红、蓝、橙、白 */
export const PCOLOR = ['#d8443c', '#2f6fd0', '#e8902a', '#f3efe6'] as const;
export const PCOLOR_NAME = ['红', '蓝', '橙', '白'] as const;
export const pcolor = (seat: number) => PCOLOR[seat % 4];

/** 羊：lucide 没有，自己画一只 */
function SheepIcon({ size = 24, color = 'currentColor', strokeWidth = 2, ...rest }: LucideProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M7.5 15.5c-2 0-3.4-1.5-3.4-3.3 0-1.4.9-2.6 2.2-3 .3-1.6 1.7-2.8 3.4-2.8 1 0 1.9.4 2.5 1.1a3.4 3.4 0 0 1 5.2 1.6 3 3 0 0 1 .5 5.9c-.5.3-1 .5-1.6.5Z" />
      <path d="M8.5 15.5v3M14.5 15.5v3" />
      <path d="M19 9.6c1.2.2 2 1 2 2.1 0 .8-.5 1.4-1.2 1.7" />
    </svg>
  );
}

export const RES_ICON: Record<Res, ComponentType<LucideProps>> = {
  wood: TreePine,
  brick: BrickWall,
  sheep: SheepIcon,
  wheat: Wheat,
  ore: Mountain,
};
export const RES_LABEL: Record<Res, string> = {
  wood: '木材',
  brick: '砖块',
  sheep: '羊毛',
  wheat: '小麦',
  ore: '矿石',
};

export const DEV_ICON: Record<hi.DevKind, ComponentType<LucideProps>> = {
  knight: Swords,
  vp: Crown,
  road: Route,
  plenty: Sparkles,
  monopoly: Magnet,
};

/** 资源牌：渐变底色 + 白色图标，右下角是张数 */
export function ResCard({
  res,
  count,
  size = 'md',
  onClick,
  disabled,
  selected,
  badge,
  className = '',
  style,
}: {
  res: Res;
  count?: number;
  size?: 'xs' | 'sm' | 'md';
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  selected?: boolean;
  badge?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const Icon = RES_ICON[res];
  const inner = (
    <>
      <span className="hic__shine" />
      <Icon className="hic__icon" strokeWidth={2} />
      {size !== 'xs' && <span className="hic__name">{RES_LABEL[res]}</span>}
      {count !== undefined && <span className="hic__count num">{count}</span>}
      {badge}
    </>
  );
  const cls = `hic res-${res} hic--${size} ${selected ? 'is-selected' : ''} ${count === 0 ? 'is-empty' : ''} ${className}`;
  return onClick ? (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      style={style}
      title={RES_LABEL[res]}
    >
      {inner}
    </button>
  ) : (
    <span className={cls} style={style} title={RES_LABEL[res]}>
      {inner}
    </span>
  );
}

const DEV_LABEL: Record<hi.DevKind, string> = {
  knight: '骑士',
  vp: '分数卡',
  road: '道路建设',
  plenty: '丰收之年',
  monopoly: '垄断',
};
export const devLabel = (k: hi.DevKind) => DEV_LABEL[k];

/** 发展卡：深紫底、金色图标 */
export function DevCard({
  kind,
  count,
  onClick,
  disabled,
  title,
  fresh,
}: {
  kind: hi.DevKind | null;
  count?: number;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  /** 本回合刚买的 */
  fresh?: boolean;
}) {
  const Icon = kind ? DEV_ICON[kind] : Crown;
  const cls = `hid ${kind ? `dev-${kind}` : 'is-back'} ${fresh ? 'is-fresh' : ''}`;
  const inner = (
    <>
      <span className="hid__frame" />
      <Icon className="hid__icon" strokeWidth={1.8} />
      <span className="hid__name">{kind ? DEV_LABEL[kind] : '发展卡'}</span>
      {count !== undefined && count > 1 && <span className="hid__count num">×{count}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>
      {inner}
    </button>
  ) : (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}

/** 骰子面 */
export function Die({ value, rolling }: { value: number; rolling?: boolean }) {
  const dots: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [
      [7, 7],
      [17, 17],
    ],
    3: [
      [7, 7],
      [12, 12],
      [17, 17],
    ],
    4: [
      [7, 7],
      [17, 7],
      [7, 17],
      [17, 17],
    ],
    5: [
      [7, 7],
      [17, 7],
      [12, 12],
      [7, 17],
      [17, 17],
    ],
    6: [
      [7, 6.5],
      [17, 6.5],
      [7, 12],
      [17, 12],
      [7, 17.5],
      [17, 17.5],
    ],
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className={`hi-die ${rolling ? 'is-rolling' : ''}`}
      aria-label={`${value} 点`}
    >
      <rect x="1" y="1" width="22" height="22" rx="5" className="hi-die__face" />
      {dots[value]?.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.2" className={value === 1 ? 'is-red' : ''} />
      ))}
    </svg>
  );
}

/* ============================ 地图美术（SVG，单位 = 六边形半径） ============================ */

export const TERRAIN_FILL: Record<Terrain, [string, string]> = {
  wood: ['#4d9a5a', '#23603a'],
  brick: ['#e08452', '#a24c2b'],
  sheep: ['#b4dc7c', '#73ad49'],
  wheat: ['#f5d667', '#d6a12c'],
  ore: ['#a7b2c0', '#66717f'],
  desert: ['#efdfb3', '#cdb37a'],
};

const pine = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-0.025" y="0.1" width="0.05" height="0.09" fill="#5b3a1f" />
    <path d="M0 -0.24 0.13 -0.04H0.06L0.16 0.12H-0.16L-0.06 -0.04H-0.13Z" fill="#1f5230" />
    <path d="M0 -0.24 0.13 -0.04H0.06L0.16 0.12H0Z" fill="#2c6e41" />
  </g>
);
const sheep = (x: number, y: number, s = 1, flip = false) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <path
      d="M-0.07 0.06v0.06M0.05 0.06v0.06"
      stroke="#3a3a3a"
      strokeWidth="0.025"
      strokeLinecap="round"
    />
    <ellipse cx="0" cy="0.02" rx="0.13" ry="0.085" fill="#fbfaf4" />
    <circle cx="-0.07" cy="-0.03" r="0.05" fill="#fbfaf4" />
    <circle cx="0.03" cy="-0.045" r="0.055" fill="#fbfaf4" />
    <ellipse cx="0.14" cy="-0.01" rx="0.045" ry="0.035" fill="#3a3a3a" />
  </g>
);
const tuft = (x: number, y: number) => (
  <path
    d={`M${x - 0.05} ${y}q0.02 -0.07 0.03 -0.01M${x} ${y}q0 -0.09 0.015 -0.01M${x + 0.04} ${y}q0.03 -0.06 0.02 0`}
    stroke="#4f8a33"
    strokeWidth="0.018"
    fill="none"
    strokeLinecap="round"
  />
);
const wheatStalk = (x: number, y: number, s = 1) => (
  <g
    transform={`translate(${x} ${y}) scale(${s})`}
    stroke="#9a6a10"
    strokeWidth="0.018"
    strokeLinecap="round"
  >
    <path d="M0 0.16V-0.12" fill="none" />
    {[-0.1, -0.04, 0.02].map((dy) => (
      <g key={dy}>
        <ellipse
          cx="-0.03"
          cy={dy}
          rx="0.028"
          ry="0.015"
          transform={`rotate(-35 -0.03 ${dy})`}
          fill="#f9e7a0"
        />
        <ellipse
          cx="0.03"
          cy={dy}
          rx="0.028"
          ry="0.015"
          transform={`rotate(35 0.03 ${dy})`}
          fill="#f9e7a0"
        />
      </g>
    ))}
    <ellipse cx="0" cy="-0.15" rx="0.015" ry="0.028" fill="#f9e7a0" />
  </g>
);
const peak = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-0.26 0.14 0 -0.24 0.26 0.14Z" fill="#7b8696" />
    <path d="M0 -0.24 0.26 0.14H0.04Z" fill="#5d6776" />
    <path d="M0 -0.24 0.09 -0.11 0.04 -0.08 0 -0.12 -0.04 -0.07 -0.09 -0.11Z" fill="#f6f8fb" />
  </g>
);
const mound = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-0.24 0.1Q0 -0.22 0.24 0.1Z" fill="#b85a33" />
    <path d="M0 -0.06Q0.16 -0.02 0.24 0.1H0.05Z" fill="#9a4526" opacity="0.7" />
  </g>
);
const bricks = (x: number, y: number) => (
  <g transform={`translate(${x} ${y})`} fill="#c9633a" stroke="#7a321a" strokeWidth="0.012">
    <rect x="-0.12" y="0.02" width="0.11" height="0.055" rx="0.01" />
    <rect x="0.005" y="0.02" width="0.11" height="0.055" rx="0.01" />
    <rect x="-0.06" y="-0.04" width="0.11" height="0.055" rx="0.01" />
  </g>
);
const dune = (y: number, w: number, x = 0) => (
  <path
    d={`M${x - w} ${y}q${w / 2} -0.09 ${w} 0t${w} 0`}
    stroke="#c9a868"
    strokeWidth="0.022"
    fill="none"
    strokeLinecap="round"
  />
);

/** 地形插画：元素绕着中心摆，中间留给数字圆片 */
export const TERRAIN_ART: Record<Terrain, ReactNode> = {
  wood: (
    <>
      {pine(-0.5, -0.36, 1.05)}
      {pine(-0.18, -0.62, 0.85)}
      {pine(0.22, -0.6, 0.95)}
      {pine(0.55, -0.3, 1.1)}
      {pine(-0.6, 0.18, 0.9)}
      {pine(0.62, 0.24, 0.85)}
      {pine(-0.3, 0.52, 1)}
      {pine(0.3, 0.55, 0.9)}
    </>
  ),
  sheep: (
    <>
      {tuft(-0.55, -0.15)}
      {tuft(0.35, -0.62)}
      {tuft(0.6, 0.12)}
      {tuft(-0.2, 0.66)}
      {tuft(-0.3, -0.6)}
      {sheep(-0.42, -0.4, 1.15)}
      {sheep(0.44, -0.3, 1, true)}
      {sheep(0.36, 0.48, 1.1)}
      {sheep(-0.5, 0.36, 0.95, true)}
    </>
  ),
  wheat: (
    <>
      <path
        d="M-0.8 -0.3h1.6M-0.8 -0.18h1.6M-0.8 0.5h1.6M-0.8 0.62h1.6"
        stroke="#e3b23d"
        strokeWidth="0.03"
        opacity="0.6"
      />
      {wheatStalk(-0.5, -0.42, 1.2)}
      {wheatStalk(-0.2, -0.6, 1.1)}
      {wheatStalk(0.18, -0.6, 1.15)}
      {wheatStalk(0.5, -0.38, 1.2)}
      {wheatStalk(-0.55, 0.28, 1.05)}
      {wheatStalk(0.56, 0.3, 1.1)}
      {wheatStalk(-0.18, 0.56, 1)}
      {wheatStalk(0.2, 0.58, 1.05)}
    </>
  ),
  brick: (
    <>
      {mound(-0.42, -0.38, 1.2)}
      {mound(0.3, -0.52, 1)}
      {mound(0.58, 0.18, 1.05)}
      {mound(-0.55, 0.32, 0.95)}
      {mound(0.05, 0.6, 1.1)}
      {bricks(0.52, -0.22)}
      {bricks(-0.25, 0.6)}
    </>
  ),
  ore: (
    <>
      {peak(-0.4, -0.38, 1.25)}
      {peak(0.32, -0.5, 1.05)}
      {peak(0.6, 0.12, 0.85)}
      {peak(-0.6, 0.22, 0.8)}
      {peak(0.12, 0.52, 1)}
    </>
  ),
  desert: (
    <>
      {dune(-0.45, 0.2, -0.3)}
      {dune(-0.2, 0.18, 0.35)}
      {dune(0.45, 0.22, -0.35)}
      {dune(0.6, 0.15, 0.25)}
      <g transform="translate(0.5 -0.42)" fill="#5e8f45">
        <rect x="-0.025" y="-0.14" width="0.05" height="0.26" rx="0.025" />
        <path
          d="M-0.025 0h-0.05a0.02 0.02 0 0 1-0.02-0.02v-0.07"
          stroke="#5e8f45"
          strokeWidth="0.04"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M0.025 -0.04h0.05a0.02 0.02 0 0 0 0.02-0.02v-0.06"
          stroke="#5e8f45"
          strokeWidth="0.04"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      <ellipse cx="-0.45" cy="0.2" rx="0.07" ry="0.04" fill="#b89a60" />
      <ellipse cx="0.2" cy="0.58" rx="0.05" ry="0.03" fill="#b89a60" />
    </>
  ),
};

/** 尖顶六边形的六个角（半径 r） */
export const hexPoints = (cx: number, cy: number, r: number) =>
  [-30, 30, 90, 150, 210, 270]
    .map((d) => {
      const a = (d * Math.PI) / 180;
      return `${(cx + r * Math.cos(a)).toFixed(4)},${(cy + r * Math.sin(a)).toFixed(4)}`;
    })
    .join(' ');

/** 村庄与城市（以路口为中心） */
export function Settlement({
  x,
  y,
  color,
  city,
}: {
  x: number;
  y: number;
  color: string;
  city?: boolean;
}) {
  const dark = color === PCOLOR[3] ? '#3b3b3b' : '#1c1d22';
  return city ? (
    <g transform={`translate(${x} ${y})`} className="hi-piece">
      <path
        d="M-0.27 0.15V-0.06L-0.14 -0.2-0.01 -0.06V-0.02H0.27V0.15Z"
        fill={color}
        stroke={dark}
        strokeWidth="0.035"
        strokeLinejoin="round"
      />
      <path d="M-0.27 0.15V-0.06L-0.14 -0.2-0.01 -0.06V0.15Z" fill="#000" opacity="0.12" />
      <rect x="0.07" y="0.04" width="0.06" height="0.06" fill={dark} opacity="0.55" />
      <rect x="-0.17" y="0" width="0.06" height="0.07" fill={dark} opacity="0.55" />
    </g>
  ) : (
    <g transform={`translate(${x} ${y})`} className="hi-piece">
      <path
        d="M-0.16 0.13V-0.03L0 -0.18 0.16 -0.03V0.13Z"
        fill={color}
        stroke={dark}
        strokeWidth="0.035"
        strokeLinejoin="round"
      />
      <path d="M0 -0.18 0.16 -0.03V0.13H0Z" fill="#000" opacity="0.12" />
      <rect x="-0.035" y="0.03" width="0.07" height="0.1" fill={dark} opacity="0.55" />
    </g>
  );
}

/** 大厅卡片插画：七块地拼成的小岛 */
export function HexArt() {
  const tiles: { x: number; y: number; t: Terrain; n?: number }[] = [
    { x: 0, y: 0, t: 'wheat', n: 6 },
    { x: 1.732, y: 0, t: 'wood', n: 4 },
    { x: -1.732, y: 0, t: 'ore', n: 9 },
    { x: 0.866, y: -1.5, t: 'sheep', n: 10 },
    { x: -0.866, y: -1.5, t: 'brick', n: 5 },
    { x: 0.866, y: 1.5, t: 'ore', n: 8 },
    { x: -0.866, y: 1.5, t: 'sheep', n: 3 },
  ];
  return (
    <svg className="hi-art" viewBox="-2.9 -2.7 5.8 5.4" aria-hidden="true">
      <defs>
        {(Object.keys(TERRAIN_FILL) as Terrain[]).map((t) => (
          <linearGradient key={t} id={`hia-${t}`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor={TERRAIN_FILL[t][0]} />
            <stop offset="1" stopColor={TERRAIN_FILL[t][1]} />
          </linearGradient>
        ))}
      </defs>
      {tiles.map((h, i) => (
        <g key={i}>
          <polygon
            points={hexPoints(h.x, h.y, 0.97)}
            fill={`url(#hia-${h.t})`}
            stroke="#00000022"
            strokeWidth="0.04"
            strokeLinejoin="round"
          />
          <g transform={`translate(${h.x} ${h.y})`}>{TERRAIN_ART[h.t]}</g>
          {h.n && (
            <g transform={`translate(${h.x} ${h.y})`}>
              <circle r="0.3" fill="#f7eed6" stroke="#c9b083" strokeWidth="0.03" />
              <text
                y="0.11"
                textAnchor="middle"
                className={`hi-num ${h.n === 6 || h.n === 8 ? 'is-hot' : ''}`}
                fontSize="0.32"
              >
                {h.n}
              </text>
            </g>
          )}
        </g>
      ))}
      <Settlement x={0.866} y={-0.5} color={PCOLOR[0]} />
      <Settlement x={-0.866} y={0.5} color={PCOLOR[1]} city />
    </svg>
  );
}
