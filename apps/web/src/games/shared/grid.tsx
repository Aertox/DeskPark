import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import './grid.css';

/**
 * 棋盘通用部件：棋子图层 + 选子 / 拖子 / 落子 + 高亮。
 * 坐标用「格」作单位：棋盘宽 width 格、高 height 格；每个落点给出中心坐标（已考虑翻转）。
 * 国际象棋落在格子中间，中国象棋落在交叉点上，都能用同一套。
 */

export interface GridMove {
  from: number;
  to: number;
  capture: boolean;
}

export interface GridPiece {
  id: number;
}

export interface GridBoardProps<P extends GridPiece> {
  width: number;
  height: number;
  pieces: readonly (P | null)[];
  /** 落点的中心（格），已按观看方向翻转 */
  center: (sq: number) => [number, number];
  /** 坐标（格）落在哪个点上 */
  hit: (x: number, y: number) => number | null;
  /** 棋子大小（格） */
  pieceSize: number;
  renderPiece: (p: P) => ReactNode;
  /** 自己能走的步（不是自己的回合时传空） */
  legal: readonly GridMove[];
  isMine: (p: P) => boolean;
  onMove: (from: number, to: number) => void;
  lastMove?: { from: number; to: number } | null;
  check?: number | null;
  /** 棋盘背景（铺满） */
  background: ReactNode;
  /** 高亮的形状：方格 / 交叉点 */
  mark: 'square' | 'point';
  className?: string;
  /** 落子时的提示动画（例如「将军」） */
  overlay?: ReactNode;
  /** 箭头：导师标出的着法 */
  arrows?: readonly { from: number; to: number; kind: 'try' | 'best' | 'reply' }[];
}

export function GridBoard<P extends GridPiece>({
  width,
  height,
  pieces,
  center,
  hit,
  pieceSize,
  renderPiece,
  legal,
  isMine,
  onMove,
  lastMove,
  check,
  background,
  mark,
  className = '',
  overlay,
  arrows = [],
}: GridBoardProps<P>) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ sq: number; x: number; y: number } | null>(null);
  const press = useRef<{
    sq: number;
    x: number;
    y: number;
    moved: boolean;
    wasSel: boolean;
  } | null>(null);

  // 回合变化后，选中的棋子如果已经不能走就当作没选
  const selRaw = sel;
  const active = selRaw !== null && legal.some((m) => m.from === selRaw) ? selRaw : null;

  const targets = useMemo(() => {
    if (active === null) return [];
    // 同一个目标可能有多种走法（例如兵升变成不同棋子），只标一次
    const seen = new Set<number>();
    return legal.filter((m) => m.from === active && !seen.has(m.to) && (seen.add(m.to), true));
  }, [legal, active]);
  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);

  const unitsAt = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const r = ref.current!.getBoundingClientRect();
      return [((clientX - r.left) / r.width) * width, ((clientY - r.top) / r.height) * height];
    },
    [width, height],
  );

  const tryMove = (from: number, to: number) => {
    if (legal.some((m) => m.from === from && m.to === to)) {
      setSel(null);
      onMove(from, to);
      return true;
    }
    return false;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const [x, y] = unitsAt(e.clientX, e.clientY);
    const sq = hit(x, y);
    if (sq === null) {
      setSel(null);
      return;
    }
    // 已选中棋子时点目标：直接走
    if (active !== null && sq !== active && tryMove(active, sq)) return;
    const p = pieces[sq];
    if (p && isMine(p) && movable.has(sq)) {
      press.current = { sq, x: e.clientX, y: e.clientY, moved: false, wasSel: active === sq };
      setSel(sq);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else setSel(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (!pr) return;
    if (!pr.moved && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 5) return;
    pr.moved = true;
    const [x, y] = unitsAt(e.clientX, e.clientY);
    setDrag({ sq: pr.sq, x, y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const pr = press.current;
    press.current = null;
    if (!pr) return;
    setDrag(null);
    if (pr.moved) {
      const [x, y] = unitsAt(e.clientX, e.clientY);
      const sq = hit(x, y);
      if (sq !== null && sq !== pr.sq && tryMove(pr.sq, sq)) return;
      return;
    }
    // 再点一次已选中的棋子：取消选择
    if (pr.wasSel) setSel(null);
  };

  const pos = (sq: number, size: number): CSSProperties => {
    const [cx, cy] = center(sq);
    return {
      left: `${((cx - size / 2) / width) * 100}%`,
      top: `${((cy - size / 2) / height) * 100}%`,
      width: `${(size / width) * 100}%`,
      height: `${(size / height) * 100}%`,
    };
  };

  const marks: { sq: number; cls: string }[] = [];
  if (lastMove) {
    marks.push({ sq: lastMove.from, cls: 'is-last' });
    marks.push({ sq: lastMove.to, cls: 'is-last' });
  }
  if (active !== null) marks.push({ sq: active, cls: 'is-sel' });
  if (check !== null && check !== undefined) marks.push({ sq: check, cls: 'is-check' });

  const ordered = pieces
    .map((p, sq) => (p ? { p, sq } : null))
    .filter((x): x is { p: P; sq: number } => !!x)
    .sort((a, b) => a.p.id - b.p.id);

  return (
    <div
      ref={ref}
      className={`gb mark-${mark} ${legal.length ? 'is-live' : ''} ${className}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        press.current = null;
        setDrag(null);
      }}
    >
      <div className="gb__bg">{background}</div>
      <div className="gb__marks" aria-hidden="true">
        {marks.map((m, i) => (
          <span key={`${m.cls}-${m.sq}-${i}`} className={`gb-mark ${m.cls}`} style={pos(m.sq, 1)} />
        ))}
      </div>
      <div className="gb__pieces">
        {ordered.map(({ p, sq }) => {
          const dragging = drag?.sq === sq;
          const style = dragging
            ? {
                ...pos(sq, pieceSize),
                left: `${((drag.x - pieceSize / 2) / width) * 100}%`,
                top: `${((drag.y - pieceSize / 2) / height) * 100}%`,
              }
            : pos(sq, pieceSize);
          return (
            <div
              key={p.id}
              className={`gb-piece ${dragging ? 'is-drag' : ''} ${active === sq ? 'is-sel' : ''} ${isMine(p) && movable.has(sq) ? 'is-movable' : ''}`}
              style={style}
            >
              {renderPiece(p)}
            </div>
          );
        })}
      </div>
      {arrows.length > 0 && (
        <svg className="gb__arrows" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <defs>
            {(['try', 'best', 'reply'] as const).map((k) => (
              <marker
                key={k}
                id={`gb-head-${k}`}
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="3.2"
                markerHeight="3.2"
                orient="auto-start-reverse"
              >
                <path d="M0 0 10 5 0 10Z" className={`gb-arrow__head is-${k}`} />
              </marker>
            ))}
          </defs>
          {arrows.map((a, i) => {
            const [x1, y1] = center(a.from);
            const [x2, y2] = center(a.to);
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            // 从棋子边上出发（不挡住棋子上的字），停在目标格中心前一点，箭头尖刚好落在格子里
            const s = Math.min(0.28, len / 4) / len;
            const k = Math.max(s, (len - 0.32) / len);
            return (
              <line
                key={`${a.kind}-${i}`}
                x1={x1 + (x2 - x1) * s}
                y1={y1 + (y2 - y1) * s}
                x2={x1 + (x2 - x1) * k}
                y2={y1 + (y2 - y1) * k}
                className={`gb-arrow is-${a.kind}`}
                markerEnd={`url(#gb-head-${a.kind})`}
              />
            );
          })}
        </svg>
      )}
      <div className="gb__targets" aria-hidden="true">
        {targets.map((m) => (
          <span
            key={m.to}
            className={`gb-target ${m.capture ? 'is-capture' : ''}`}
            style={pos(m.to, 1)}
          />
        ))}
      </div>
      {overlay}
    </div>
  );
}
