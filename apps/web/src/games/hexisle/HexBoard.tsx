import type { hi } from '@park/engine';
import { hi as HI } from '@park/engine';
import { memo } from 'react';
import { PCOLOR, RES_ICON, Settlement, TERRAIN_ART, TERRAIN_FILL, hexPoints, pcolor } from './art';

const { EDGES, HEX_CENTER, HEX_EDGES, VERTICES } = HI.geo;
type Terrain = hi.Terrain;

const RES_DOT: Record<hi.Res, string> = {
  wood: '#2f7a45',
  brick: '#c0582f',
  sheep: '#7fb44a',
  wheat: '#d9a52a',
  ore: '#6f7a8a',
};

/** 平顶六边形（海面外框） */
const flatHex = (r: number) =>
  [0, 60, 120, 180, 240, 300]
    .map((d) => {
      const a = (d * Math.PI) / 180;
      return `${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`;
    })
    .join(' ');

/** 港口：海岸边的中点、朝外的方向 */
const PORT_GEO = HI.geo.PORT_EDGES.map((e) => {
  const [a, b] = EDGES[e];
  const m = { x: (VERTICES[a].x + VERTICES[b].x) / 2, y: (VERTICES[a].y + VERTICES[b].y) / 2 };
  const h = HEX_EDGES.findIndex((es) => es.includes(e));
  const c = HEX_CENTER[h];
  const len = Math.hypot(m.x - c.x, m.y - c.y);
  const n = { x: (m.x - c.x) / len, y: (m.y - c.y) / len };
  return { e, a, b, m, n };
});

const seg = (e: number, cut = 0.18) => {
  const [a, b] = EDGES[e];
  const p = VERTICES[a];
  const q = VERTICES[b];
  return {
    x1: p.x + (q.x - p.x) * cut,
    y1: p.y + (q.y - p.y) * cut,
    x2: q.x - (q.x - p.x) * cut,
    y2: q.y - (q.y - p.y) * cut,
  };
};

/** 静态部分（海、地形、港口）单独缓存，棋子变化时不必重画 */
const Terrain = memo(function Terrain({ hexes, ports }: { hexes: hi.HiHex[]; ports: hi.HiPort[] }) {
  return (
    <>
      <polygon className="hi-sea" points={flatHex(5.42)} />
      <polygon className="hi-sea__line" points={flatHex(5.05)} />
      <g className="hi-tiles">
        {hexes.map((h, i) => {
          const c = HEX_CENTER[i];
          return (
            <g key={i}>
              <polygon
                points={hexPoints(c.x, c.y, 0.965)}
                fill={`url(#hi-g-${h.terrain})`}
                className="hi-tile"
              />
              <g transform={`translate(${c.x} ${c.y})`}>{TERRAIN_ART[h.terrain]}</g>
            </g>
          );
        })}
      </g>
      {ports.map((p, i) => {
        const g = PORT_GEO.find((x) => x.e === p.edge)!;
        const tip = { x: g.m.x + g.n.x * 0.4, y: g.m.y + g.n.y * 0.4 };
        const badge = { x: g.m.x + g.n.x * 0.68, y: g.m.y + g.n.y * 0.68 };
        const Icon = p.kind === 'any' ? null : RES_ICON[p.kind];
        return (
          <g key={i} className="hi-port">
            {[g.a, g.b].map((v) => (
              <line
                key={v}
                x1={VERTICES[v].x}
                y1={VERTICES[v].y}
                x2={tip.x}
                y2={tip.y}
                className="hi-port__pier"
              />
            ))}
            <circle cx={badge.x} cy={badge.y} r="0.27" className="hi-port__badge" />
            {Icon ? (
              <>
                <circle
                  cx={badge.x}
                  cy={badge.y - 0.06}
                  r="0.13"
                  fill={RES_DOT[p.kind as hi.Res]}
                />
                <Icon
                  x={badge.x - 0.09}
                  y={badge.y - 0.15}
                  size={0.18}
                  color="#fff"
                  strokeWidth={2.4}
                />
                <text x={badge.x} y={badge.y + 0.2} className="hi-port__text" textAnchor="middle">
                  2:1
                </text>
              </>
            ) : (
              <text
                x={badge.x}
                y={badge.y + 0.07}
                className="hi-port__text is-any"
                textAnchor="middle"
              >
                3:1
              </text>
            )}
          </g>
        );
      })}
      {hexes.map((h, i) => {
        if (!h.num) return null;
        const c = HEX_CENTER[i];
        const pips = HI.PIPS[h.num];
        const hot = h.num === 6 || h.num === 8;
        return (
          <g key={`n${i}`} transform={`translate(${c.x} ${c.y})`} className="hi-token">
            <circle r="0.34" cy="0.03" fill="#000" opacity="0.25" />
            <circle r="0.33" className="hi-token__disc" />
            <text
              y="0.07"
              textAnchor="middle"
              className={`hi-num ${hot ? 'is-hot' : ''}`}
              fontSize={hot ? 0.33 : 0.3}
            >
              {h.num}
            </text>
            {Array.from({ length: pips }, (_, k) => (
              <circle
                key={k}
                cx={(k - (pips - 1) / 2) * 0.065}
                cy="0.19"
                r="0.022"
                className={hot ? 'hi-pip is-hot' : 'hi-pip'}
              />
            ))}
          </g>
        );
      })}
    </>
  );
});

export interface HexBoardProps {
  view: hi.HiView;
  spotsV?: number[];
  spotsE?: number[];
  spotsH?: number[];
  onVertex?: (v: number) => void;
  onEdge?: (e: number) => void;
  onHex?: (h: number) => void;
  /** 刚掷出的点数，对应地块闪一下 */
  rolled?: { sum: number; key: number } | null;
}

export function HexBoard({
  view,
  spotsV = [],
  spotsE = [],
  spotsH = [],
  onVertex,
  onEdge,
  onHex,
  rolled,
}: HexBoardProps) {
  const robber = HEX_CENTER[view.robber];
  return (
    <svg className="hi-board" viewBox="-5.55 -4.85 11.1 9.7" preserveAspectRatio="xMidYMid meet">
      <defs>
        {(Object.keys(TERRAIN_FILL) as Terrain[]).map((t) => (
          <linearGradient key={t} id={`hi-g-${t}`} x1="0.1" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor={TERRAIN_FILL[t][0]} />
            <stop offset="1" stopColor={TERRAIN_FILL[t][1]} />
          </linearGradient>
        ))}
        <radialGradient id="hi-sea" cx="0.5" cy="0.45" r="0.62">
          <stop offset="0" stopColor="#4aa3cf" />
          <stop offset="0.75" stopColor="#2a74a6" />
          <stop offset="1" stopColor="#1b557f" />
        </radialGradient>
      </defs>
      <Terrain hexes={view.hexes} ports={view.ports} />

      {rolled &&
        view.hexes.map((h, i) =>
          h.num === rolled.sum ? (
            <polygon
              key={`${rolled.key}-${i}`}
              points={hexPoints(HEX_CENTER[i].x, HEX_CENTER[i].y, 0.93)}
              className={`hi-hot ${i === view.robber ? 'is-blocked' : ''}`}
            />
          ) : null,
        )}

      {view.roads.map((owner, e) => {
        if (owner === null) return null;
        const s = seg(e);
        return (
          <g key={`r${e}-${owner}`} className="hi-road">
            <line {...s} className="hi-road__edge" />
            <line {...s} stroke={pcolor(owner)} className="hi-road__fill" />
          </g>
        );
      })}

      {view.buildings.map((b, v) =>
        b ? (
          <g key={`b${v}-${b.owner}-${b.city}`} className="hi-pop">
            <Settlement x={VERTICES[v].x} y={VERTICES[v].y} color={pcolor(b.owner)} city={b.city} />
          </g>
        ) : null,
      )}

      <g
        key={`rob${view.robber}`}
        className="hi-robber hi-pop"
        transform={`translate(${robber.x + 0.36} ${robber.y - 0.24})`}
      >
        <ellipse cx="0" cy="0.2" rx="0.16" ry="0.05" fill="#000" opacity="0.35" />
        <path
          d="M-0.13 0.2C-0.13 0.04-0.07-0.04 0-0.06 0.07-0.04 0.13 0.04 0.13 0.2Z"
          fill="#2c2d35"
        />
        <circle cy="-0.12" r="0.08" fill="#2c2d35" />
        <circle cx="-0.025" cy="-0.14" r="0.022" fill="#fff" opacity="0.35" />
      </g>

      {/* 可以点的地方 */}
      {spotsH.map((h) => (
        <polygon
          key={`sh${h}`}
          points={hexPoints(HEX_CENTER[h].x, HEX_CENTER[h].y, 0.9)}
          className="hi-spot-hex"
          onClick={() => onHex?.(h)}
        />
      ))}
      {spotsE.map((e) => {
        const s = seg(e, 0.2);
        return (
          <g key={`se${e}`} className="hi-spot-edge" onClick={() => onEdge?.(e)}>
            <line
              {...s}
              className="hi-spot-edge__glow"
              stroke={view.seat !== null ? PCOLOR[view.seat % 4] : '#fff'}
            />
            <line {...seg(e, 0.05)} className="hi-spot-edge__hit" />
          </g>
        );
      })}
      {spotsV.map((v) => (
        <g key={`sv${v}`} className="hi-spot" onClick={() => onVertex?.(v)}>
          <circle cx={VERTICES[v].x} cy={VERTICES[v].y} r="0.13" className="hi-spot__dot" />
          <circle cx={VERTICES[v].x} cy={VERTICES[v].y} r="0.3" className="hi-spot__hit" />
        </g>
      ))}
    </svg>
  );
}
