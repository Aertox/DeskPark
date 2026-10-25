import type { ch } from '@park/engine';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { playSound } from '../../lib/sound';
import { CoachPanel, useCoach } from '../shared/coach';
import { DuelActions, DuelLayout, DuelResult, MoveList, PlayerCard } from '../shared/duel';
import { GridBoard } from '../shared/grid';
import { useTurnCue } from '../shared/trick';
import { ChessPiece } from './pieces';
import './chess.css';

type Ctl = GameController<ch.ChView, ch.ChAction>;
type Color = ch.ChColor;

const VALUE: Record<ch.ChType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = 'abcdefgh';

const REASON: Record<ch.ChEndReason, string> = {
  checkmate: '将死',
  stalemate: '逼和：没有合法走法，又没有被将军',
  resign: '认输',
  repetition: '同一局面出现三次，判和',
  fifty: '50 回合内双方都没有吃子或动兵，判和',
  material: '双方都没有足够的子力将死对方，判和',
  length: '对局过长，判和',
};

/** 棋盘背景：8×8 格子 + 坐标 */
const ChessBg = memo(function ChessBg({ flip }: { flip: boolean }) {
  const cells = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const dark = (row + col) % 2 === 1;
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={col}
          y={row}
          width="1"
          height="1"
          className={dark ? 'cb-dark' : 'cb-light'}
        />,
      );
    }
  const files = Array.from({ length: 8 }, (_, col) => FILES[flip ? 7 - col : col]);
  const ranks = Array.from({ length: 8 }, (_, row) => String(flip ? row + 1 : 8 - row));
  return (
    <svg viewBox="0 0 8 8" className="cb-bg" aria-hidden="true">
      <defs>
        <radialGradient id="cb-light" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#fff8e8" stopOpacity="0.22" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </radialGradient>
      </defs>
      {cells}
      <rect width="8" height="8" fill="url(#cb-light)" />
      {files.map((f, col) => (
        <text
          key={f}
          x={col + 0.93}
          y="7.92"
          className={(7 + col) % 2 === 1 ? 'cb-coord on-dark' : 'cb-coord on-light'}
          textAnchor="end"
        >
          {f}
        </text>
      ))}
      {ranks.map((r, row) => (
        <text
          key={r}
          x="0.06"
          y={row + 0.24}
          className={row % 2 === 1 ? 'cb-coord on-dark' : 'cb-coord on-light'}
        >
          {r}
        </text>
      ))}
    </svg>
  );
});

export default function ChessBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat;
  const spectator = me === null;
  const myColor: Color = spectator ? v.colors[0] : v.colors[me];
  const over = v.phase === 'over';
  const myTurn = !spectator && !over && v.turn === me;
  useTurnCue(myTurn);
  const [flipped, setFlipped] = useState(false);
  const flip = (myColor === 'b') !== flipped;
  const opp = spectator ? 1 : 1 - me;
  const mineSeat = spectator ? 0 : me;
  // 导师：只在和电脑下时出现
  const coach = useCoach('chess', v, { eligible: !spectator && !!ctl.players[opp]?.isBot, myTurn });

  const center = (sq: number): [number, number] => {
    const f = sq & 7;
    const r = sq >> 3;
    return flip ? [7 - f + 0.5, r + 0.5] : [f + 0.5, 7 - r + 0.5];
  };
  const hit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= 8 || y >= 8) return null;
    const col = Math.floor(x);
    const row = Math.floor(y);
    const f = flip ? 7 - col : col;
    const r = flip ? row : 7 - row;
    return r * 8 + f;
  };

  // 升变：先选棋子再走
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => setPromo(null), [v.moves.length]);
  const send = (a: ch.ChAction) => {
    const err = ctl.act(a);
    if (err) toast(err, 'error');
  };
  const commit = (m: { from: number; to: number; promo?: string }) =>
    send({
      type: 'move',
      from: m.from,
      to: m.to,
      ...(m.promo ? { promo: m.promo as ch.ChPromo } : {}),
    });
  /** 选好一步：开着导师就先给导师看，否则直接走 */
  const choose = (m: { from: number; to: number; promo?: ch.ChPromo }) => {
    if (!coach.propose(m)) commit(m);
  };
  const onMove = (from: number, to: number) => {
    const opts = v.legal.filter((m) => m.from === from && m.to === to);
    if (opts.some((m) => m.promo)) setPromo({ from, to });
    else choose({ from, to });
  };

  // 音效：吃子、将军、普通走子
  const seen = useRef(v.moves.length);
  useEffect(() => {
    if (v.moves.length > seen.current) {
      const last = v.moves.at(-1)!;
      playSound(last.check ? 'bomb' : last.captured ? 'chip' : 'play');
    }
    seen.current = v.moves.length;
  }, [v.moves]);

  const last = v.moves.at(-1);
  const captured = useMemo(() => {
    const by: Record<Color, ch.ChType[]> = { w: [], b: [] };
    for (const m of v.moves) if (m.captured) by[m.color].push(m.captured);
    const order: ch.ChType[] = ['q', 'r', 'b', 'n', 'p'];
    for (const c of ['w', 'b'] as Color[])
      by[c].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const score = (c: Color) => by[c].reduce((a, t) => a + VALUE[t], 0);
    return { by, diff: score('w') - score('b') };
  }, [v.moves]);

  const colorOf = (s: number) => v.colors[s];
  const capturedRow = (s: number) => {
    const c = colorOf(s);
    const list = captured.by[c];
    const lead = c === 'w' ? captured.diff : -captured.diff;
    return list.length || lead > 0 ? (
      <>
        {list.map((t, i) => (
          <span key={i} className="cb-cap">
            <ChessPiece t={t} c={c === 'w' ? 'b' : 'w'} />
          </span>
        ))}
        {lead > 0 && <span className="cb-lead num">+{lead}</span>}
      </>
    ) : undefined;
  };
  const badge = (s: number) => (
    <>
      <i className={`cb-swatch is-${colorOf(s)}`} />
      {colorOf(s) === 'w' ? '白方' : '黑方'}
    </>
  );

  const status = (() => {
    if (over) return { text: '对局结束', cls: '' };
    if (myTurn)
      return {
        text: v.check !== null ? '被将军！快解将' : '轮到你走',
        cls: v.check !== null ? 'is-alert' : 'is-mine',
      };
    if (spectator) return { text: `${colorOf(v.turn) === 'w' ? '白方' : '黑方'}走`, cls: '' };
    return {
      text: ctl.players[v.turn].isBot ? '电脑思考中…' : `等待 ${ctl.players[v.turn].name}…`,
      cls: '',
    };
  })();

  // 终局
  const [showResult, setShowResult] = useState(true);
  useEffect(() => {
    if (over) setShowResult(true);
  }, [over]);
  const r = v.result;
  const won = r && !spectator ? (r.winner === null ? null : r.winner === me) : null;
  const resultTitle = !r
    ? ''
    : r.winner === null
      ? '和棋'
      : spectator
        ? `${colorOf(r.winner) === 'w' ? '白方' : '黑方'}获胜`
        : r.winner === me
          ? '你赢了'
          : '你输了';
  const resultSub = !r
    ? ''
    : r.reason === 'resign'
      ? `${r.winner === me ? '对方' : '你'}认输了`
      : r.reason === 'checkmate'
        ? `${colorOf(r.winner!) === 'w' ? '白方' : '黑方'}将死对方 · 共 ${Math.ceil(v.moves.length / 2)} 回合`
        : REASON[r.reason];

  const board = (
    <div className="cb-frame">
      <GridBoard
        width={8}
        height={8}
        pieces={v.pieces}
        center={center}
        hit={hit}
        pieceSize={0.94}
        renderPiece={(p) => <ChessPiece t={p.t} c={p.c} />}
        legal={myTurn && !promo ? v.legal : []}
        isMine={(p) => p.c === myColor}
        onMove={onMove}
        lastMove={last ? { from: last.from, to: last.to } : null}
        check={v.check}
        background={<ChessBg flip={flip} />}
        mark="square"
        arrows={coach.active ? coach.arrows : undefined}
        overlay={
          <>
            {last?.check && !over && (
              <span key={v.moves.length} className="cb-flash">
                {last.san.endsWith('#') ? '将死' : '将军'}
              </span>
            )}
            {promo && (
              <div
                className="cb-promo"
                style={promoPos(center(promo.to))}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {(['q', 'n', 'r', 'b'] as ch.ChPromo[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="cb-promo__btn"
                    onClick={() => {
                      choose({ from: promo.from, to: promo.to, promo: t });
                      setPromo(null);
                    }}
                  >
                    <ChessPiece t={t} c={myColor} />
                  </button>
                ))}
                <button type="button" className="cb-promo__x" onClick={() => setPromo(null)}>
                  取消
                </button>
              </div>
            )}
          </>
        }
      />
    </div>
  );

  const side = (
    <>
      <PlayerCard
        ctl={ctl}
        seat={opp}
        badge={badge(opp)}
        active={!over && v.turn === opp}
        captured={capturedRow(opp)}
      />
      <div className={`duel-status ${status.cls}`}>{status.text}</div>
      {coach.eligible && !over && <CoachPanel coach={coach} myTurn={myTurn} onCommit={commit} />}
      <MoveList moves={v.moves.map((m) => m.san)} />
      {!spectator && (
        <DuelActions
          showUndo={ctl.players[opp].isBot}
          canUndo={v.canUndo}
          canResign={myTurn}
          onUndo={() => send({ type: 'undo' })}
          onResign={() => send({ type: 'resign' })}
          onFlip={() => setFlipped((x) => !x)}
        />
      )}
      <PlayerCard
        ctl={ctl}
        seat={mineSeat}
        badge={badge(mineSeat)}
        active={!over && v.turn === mineSeat}
        captured={capturedRow(mineSeat)}
      />
    </>
  );

  return (
    <>
      <DuelLayout aspect={1} board={board} side={side} className="cb" />
      <DuelResult
        ctl={ctl}
        open={over && showResult}
        onClose={() => setShowResult(false)}
        won={won}
        title={resultTitle}
        sub={resultSub}
      />
    </>
  );
}

/** 升变面板：贴着目标格，向棋盘内侧展开 */
function promoPos([cx, cy]: [number, number]) {
  const down = cy < 4;
  return {
    left: `${((cx - 0.5) / 8) * 100}%`,
    top: down ? `${((cy - 0.5) / 8) * 100}%` : undefined,
    bottom: down ? undefined : `${((8 - cy - 0.5) / 8) * 100}%`,
    flexDirection: (down ? 'column' : 'column-reverse') as 'column' | 'column-reverse',
  };
}
