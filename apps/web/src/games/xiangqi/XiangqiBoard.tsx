import type { xq } from '@park/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { playSound } from '../../lib/sound';
import { DuelActions, DuelLayout, DuelResult, MoveList, PlayerCard } from '../shared/duel';
import { GridBoard } from '../shared/grid';
import { useTurnCue } from '../shared/trick';
import { XqBoardBg, XqPiece } from './pieces';
import './xiangqi.css';

type Ctl = GameController<xq.XqView, xq.XqAction>;
type Color = xq.XqColor;

const REASON: Record<xq.XqEndReason, string> = {
  checkmate: '将死',
  stalemate: '困毙：对方无子可走',
  resign: '认输',
  perpetual: '长将判负',
  repetition: '同一局面反复出现，判和',
  idle: '60 回合双方都没有吃子，判和',
  material: '双方都没有能过河进攻的棋子，判和',
  length: '对局过长，判和',
};
const ORDER: xq.XqType[] = ['r', 'h', 'c', 'a', 'e', 'p', 'k'];
const colorName = (c: Color) => (c === 'r' ? '红方' : '黑方');
/** 棋盘 9×10，加上四周 1.6%（按宽度算）的木框 */
const XQ_ASPECT = 1 / ((1 - 0.032) * (10 / 9) + 0.032);

export default function XiangqiBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat;
  const spectator = me === null;
  const myColor: Color = spectator ? v.colors[0] : v.colors[me];
  const over = v.phase === 'over';
  const myTurn = !spectator && !over && v.turn === me;
  useTurnCue(myTurn);
  const [flipped, setFlipped] = useState(false);
  const flip = (myColor === 'b') !== flipped;

  const center = (sq: number): [number, number] => {
    const f = sq % 9;
    const r = Math.floor(sq / 9);
    return flip ? [8 - f + 0.5, r + 0.5] : [f + 0.5, 9 - r + 0.5];
  };
  const hit = (x: number, y: number) => {
    const col = Math.round(x - 0.5);
    const row = Math.round(y - 0.5);
    if (col < 0 || col > 8 || row < 0 || row > 9) return null;
    if (Math.hypot(x - (col + 0.5), y - (row + 0.5)) > 0.5) return null;
    const f = flip ? 8 - col : col;
    const r = flip ? row : 9 - row;
    return r * 9 + f;
  };

  const send = (a: xq.XqAction) => {
    const err = ctl.act(a);
    if (err) toast(err, 'error');
  };

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
    const by: Record<Color, xq.XqType[]> = { r: [], b: [] };
    for (const m of v.moves) if (m.captured) by[m.color].push(m.captured);
    for (const c of ['r', 'b'] as Color[])
      by[c].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return by;
  }, [v.moves]);

  const opp = spectator ? 1 : 1 - me;
  const mineSeat = spectator ? 0 : me;
  const colorOf = (s: number) => v.colors[s];
  const capturedRow = (s: number) => {
    const list = captured[colorOf(s)];
    if (!list.length) return undefined;
    const enemy: Color = colorOf(s) === 'r' ? 'b' : 'r';
    return list.map((t, i) => (
      <span key={i} className="xb-cap">
        <XqPiece t={t} c={enemy} />
      </span>
    ));
  };
  const badge = (s: number) => (
    <>
      <i className={`xb-swatch is-${colorOf(s)}`} />
      {colorName(colorOf(s))}
    </>
  );

  const status = (() => {
    if (over) return { text: '对局结束', cls: '' };
    if (myTurn)
      return {
        text: v.check !== null ? '被将军！快应将' : '轮到你走',
        cls: v.check !== null ? 'is-alert' : 'is-mine',
      };
    if (spectator) return { text: `${colorName(colorOf(v.turn))}走`, cls: '' };
    return {
      text: ctl.players[v.turn].isBot ? '电脑思考中…' : `等待 ${ctl.players[v.turn].name}…`,
      cls: '',
    };
  })();

  const [showResult, setShowResult] = useState(true);
  useEffect(() => {
    if (over) setShowResult(true);
  }, [over]);
  const r = v.result;
  const won = r && !spectator ? (r.winner === null ? null : r.winner === me) : null;
  const title = !r
    ? ''
    : r.winner === null
      ? '和棋'
      : spectator
        ? `${colorName(colorOf(r.winner))}获胜`
        : r.winner === me
          ? '你赢了'
          : '你输了';
  const sub = !r
    ? ''
    : r.reason === 'resign'
      ? `${r.winner === me ? '对方' : '你'}认输了`
      : r.reason === 'perpetual'
        ? `${colorName(colorOf(r.winner === null ? 0 : 1 - r.winner))}长将，判负`
        : r.reason === 'checkmate' || r.reason === 'stalemate'
          ? `${REASON[r.reason]} · 共 ${Math.ceil(v.moves.length / 2)} 回合`
          : REASON[r.reason];

  const board = (
    <div className="xb-frame">
      <GridBoard
        width={9}
        height={10}
        pieces={v.pieces}
        center={center}
        hit={hit}
        pieceSize={0.92}
        renderPiece={(p) => <XqPiece t={p.t} c={p.c} />}
        legal={myTurn ? v.legal : []}
        isMine={(p) => p.c === myColor}
        onMove={(from, to) => send({ type: 'move', from, to })}
        lastMove={last ? { from: last.from, to: last.to } : null}
        check={v.check}
        background={<XqBoardBg />}
        mark="point"
        overlay={
          last?.check && !over ? (
            <span key={v.moves.length} className="xb-flash">
              将军
            </span>
          ) : undefined
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
      <MoveList moves={v.moves.map((m) => m.text)} />
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
      <DuelLayout aspect={XQ_ASPECT} board={board} side={side} className="xb" />
      <DuelResult
        ctl={ctl}
        open={over && showResult}
        onClose={() => setShowResult(false)}
        won={won}
        title={title}
        sub={sub}
      />
    </>
  );
}
