/**
 * 卡旦岛的固定地图拓扑：19 块尖顶六边形（3-4-5-4-3 排列）、54 个路口（顶点）、72 条边。
 * 坐标单位为六边形外接圆半径；界面直接用这些坐标画 SVG。
 */

export interface Pt {
  x: number;
  y: number;
}

/** 轴坐标（q, r），按行从上到下、从左到右 */
export const HEX_AXIAL: readonly { q: number; r: number }[] = (() => {
  const out: { q: number; r: number }[] = [];
  for (let r = -2; r <= 2; r++)
    for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) out.push({ q, r });
  return out;
})();

const SQ3 = Math.sqrt(3);
export const HEX_CENTER: readonly Pt[] = HEX_AXIAL.map(({ q, r }) => ({
  x: SQ3 * (q + r / 2),
  y: 1.5 * r,
}));

/** 尖顶六边形的六个角：右上、右下、下、左下、左上、上 */
const CORNER_ANGLES = [-30, 30, 90, 150, 210, 270].map((d) => (d * Math.PI) / 180);

const key = (p: Pt) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

const built = (() => {
  const vertices: Pt[] = [];
  const index = new Map<string, number>();
  const hexVerts: number[][] = HEX_CENTER.map((c) =>
    CORNER_ANGLES.map((a) => {
      const p = { x: c.x + Math.cos(a), y: c.y + Math.sin(a) };
      const k = key(p);
      let i = index.get(k);
      if (i === undefined) {
        i = vertices.length;
        index.set(k, i);
        vertices.push({ x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4 });
      }
      return i;
    }),
  );
  const edges: [number, number][] = [];
  const edgeIndex = new Map<string, number>();
  const hexEdges: number[][] = hexVerts.map((vs) =>
    vs.map((a, i) => {
      const b = vs[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let e = edgeIndex.get(k);
      if (e === undefined) {
        e = edges.length;
        edgeIndex.set(k, e);
        edges.push(a < b ? [a, b] : [b, a]);
      }
      return e;
    }),
  );
  return { vertices, hexVerts, edges, hexEdges };
})();

export const VERTICES: readonly Pt[] = built.vertices;
export const EDGES: readonly (readonly [number, number])[] = built.edges;
export const HEX_VERTS: readonly (readonly number[])[] = built.hexVerts;
export const HEX_EDGES: readonly (readonly number[])[] = built.hexEdges;

export const VERT_HEXES: readonly (readonly number[])[] = VERTICES.map((_, v) =>
  HEX_VERTS.map((vs, h) => (vs.includes(v) ? h : -1)).filter((h) => h >= 0),
);
export const VERT_EDGES: readonly (readonly number[])[] = VERTICES.map((_, v) =>
  EDGES.map(([a, b], e) => (a === v || b === v ? e : -1)).filter((e) => e >= 0),
);
export const VERT_NEIGHBORS: readonly (readonly number[])[] = VERTICES.map((_, v) =>
  VERT_EDGES[v].map((e) => (EDGES[e][0] === v ? EDGES[e][1] : EDGES[e][0])),
);
/** 相邻的六边形（共用一条边） */
export const HEX_NEIGHBORS: readonly (readonly number[])[] = HEX_EDGES.map((es, h) =>
  HEX_EDGES.map((other, j) => (j !== h && other.some((e) => es.includes(e)) ? j : -1)).filter(
    (j) => j >= 0,
  ),
);

/** 海岸线上的边（只属于一块地形），按绕岛一周的顺序排列 */
export const COAST_EDGES: readonly number[] = (() => {
  const count = new Map<number, number>();
  for (const es of HEX_EDGES) for (const e of es) count.set(e, (count.get(e) ?? 0) + 1);
  const coast = [...count].filter(([, c]) => c === 1).map(([e]) => e);
  const angle = (e: number) => {
    const [a, b] = EDGES[e];
    const mx = (VERTICES[a].x + VERTICES[b].x) / 2;
    const my = (VERTICES[a].y + VERTICES[b].y) / 2;
    return Math.atan2(my, mx);
  };
  return coast.sort((a, b) => angle(a) - angle(b));
})();

/** 9 个港口所在的海岸边：间隔 3、3、4 交替，和实体版的框架一致 */
export const PORT_EDGES: readonly number[] = [0, 3, 6, 10, 13, 16, 20, 23, 26].map(
  (i) => COAST_EDGES[i],
);

/** 边的中点与朝外（海面）方向，用于画港口与道路 */
export function edgeMid(e: number): Pt {
  const [a, b] = EDGES[e];
  return { x: (VERTICES[a].x + VERTICES[b].x) / 2, y: (VERTICES[a].y + VERTICES[b].y) / 2 };
}
