import type { Card } from '@park/engine';
import { Rng, ddz } from '@park/engine';
import { RotateCw } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { CardRow, Hand } from '../../components/Hand';
import { PlayingCard } from '../../components/PlayingCard';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { signed } from '../../lib/format';
import { playSound } from '../../lib/sound';
import { settings } from '../../lib/store';
import { CountChip, MoveZone, useHintCycle, useSelection, useTurnCue } from '../shared/trick';
import './doudizhu.css';

type Ctl = GameController<ddz.DdzView, ddz.DdzAction>;

const VALUE_LABEL: Record<number, string> = {
  17: '大',
  16: '小',
  15: '2',
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
};

function CardCounter({ v }: { v: ddz.DdzView }) {
  const left = new Map<number, number>();
  for (let x = 3; x <= 15; x++) left.set(x, 4);
  left.set(16, 1);
  left.set(17, 1);
  for (const c of [...v.played, ...v.hand])
    left.set(ddz.ddzValue(c), left.get(ddz.ddzValue(c))! - 1);
  const order = [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3];
  return (
    <div className="counter" aria-label="记牌器">
      {order.map((x) => {
        const n = left.get(x)!;
        return (
          <span
            key={x}
            className={n === 0 ? 'is-zero' : n >= 4 || (x >= 16 && n === 1) ? 'is-full' : ''}
          >
            <em>{VALUE_LABEL[x] ?? x}</em>
            <b className="num">{n}</b>
          </span>
        );
      })}
    </div>
  );
}

export default function DoudizhuBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const players = ctl.players;
  const spectator = ctl.seat === null;
  const me = ctl.seat ?? 0;
  const right = (me + 1) % 3;
  const left = (me + 2) % 3;
  const showCounter = settings.use().cardCounter;

  const over = v.phase === 'roundOver' || v.phase === 'matchOver';
  const myTurn = !spectator && v.turn === me && !over;
  const playing = v.phase === 'playing';
  const leading = playing && (!v.lastPlay || v.lastPlay.seat === me);
  const target = playing && v.lastPlay && v.lastPlay.seat !== me ? v.lastPlay.pattern : null;

  const [sel, setSel] = useSelection(v.hand, `${v.round}-${v.redeals}`);
  useTurnCue(myTurn);

  // 提示候选：领出时先给电脑建议，跟牌时按从小到大，炸弹最后
  const candidates = useMemo(() => {
    if (!myTurn || !playing) return [] as number[][];
    const combos = ddz.beatingCombos(ddz.countValues(v.hand), target);
    const isBomb = (k: string) => k === 'bomb' || k === 'rocket';
    combos.sort(
      (a, b) =>
        Number(isBomb(a.kind)) - Number(isBomb(b.kind)) ||
        a.main - b.main ||
        b.values.length - a.values.length,
    );
    const list = combos.map((c) => ddz.valuesToCards(v.hand, c.values).map((x) => x.id));
    if (leading) {
      const a = ctl.def.bot(v, me, new Rng(7)) as ddz.DdzAction;
      if (a.type === 'play') list.unshift(a.cards);
    }
    const seen = new Set<string>();
    return list.filter((ids) => {
      const k = [...ids].sort((x, y) => x - y).join(',');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.version, myTurn]);
  const nextHint = useHintCycle(candidates, `${ctl.version}`);

  const selected = v.hand.filter((c) => sel.has(c.id));
  const pattern = selected.length && playing ? ddz.resolvePlay(selected, target) : null;

  // 炸弹音效、结算音效
  const lastPlayKey = v.lastPlay ? v.lastPlay.cards.map((c) => c.id).join(',') : '';
  useEffect(() => {
    const k = v.lastPlay?.pattern.kind;
    if (k === 'bomb' || k === 'rocket') playSound('bomb');
  }, [lastPlayKey, v.lastPlay?.pattern.kind]);
  const resultRound = useRef(0);
  useEffect(() => {
    const r = v.result;
    if (!r || resultRound.current === r.round || spectator) return;
    resultRound.current = r.round;
    playSound(r.landlordWin === (r.landlord === me) ? 'win' : 'lose');
  }, [v.result, me, spectator]);

  const act = (a: ddz.DdzAction) => {
    const err = ctl.act(a);
    if (err) toast(err, 'error');
    return !err;
  };
  const doPlay = () => {
    if (act({ type: 'play', cards: [...sel] })) setSel(new Set());
  };
  const doPass = () => {
    if (act({ type: 'pass' })) setSel(new Set());
  };
  const doHint = () => {
    const h = nextHint();
    if (h) setSel(new Set(h));
    else toast('没有能大过上家的牌');
  };

  const role = (s: number) =>
    v.landlord === null ? undefined : s === v.landlord ? '地主' : '农民';
  const bidBubble = (s: number) => {
    if (v.phase !== 'bidding' || v.bids[s] === null) return undefined;
    return v.bids[s] === 0 ? '不叫' : `${v.bids[s]} 分`;
  };
  const moveOf = (s: number) => {
    const m = v.lastMoves[s];
    if (!m || !playing) return null;
    return m;
  };

  const opponent = (s: number, side: 'left' | 'right') => (
    <div className={`ddz__seat is-${side}`}>
      <Seat
        player={players[s]}
        active={v.turn === s && !over}
        deadline={ctl.deadlines[s]}
        tag={role(s)}
        tagTone={s === v.landlord ? 'gold' : 'plain'}
        sub={
          <span className="ddz__sub">
            <CountChip n={v.handCounts[s]} />
            <em>积分 {v.scores[s]}</em>
          </span>
        }
        bubble={bidBubble(s)}
        bubbleSide={side === 'left' ? 'right' : 'left'}
      />
    </div>
  );

  return (
    <div className="ddz">
      <div className="rotate-tip">
        <RotateCw size={12} /> 横屏体验更佳
      </div>
      <div className="ddz__info">
        <div className="ddz__bottom">
          {v.bottom
            ? v.bottom.map((c) => <PlayingCard key={c.id} card={c} w="var(--cw-xs)" />)
            : [0, 1, 2].map((i) => <PlayingCard key={i} faceDown w="var(--cw-xs)" />)}
        </div>
        <div className="info-chips">
          <span className="chip">
            第 <b className="num">{v.round}</b> 局{v.options.rounds ? ` / ${v.options.rounds}` : ''}
          </span>
          <span className="chip">
            底分 <b className="num">{v.options.baseScore * Math.max(1, v.currentBid)}</b>
          </span>
          <span className="chip is-gold">
            倍数 <b className="num">×{v.multiplier}</b>
          </span>
        </div>
      </div>

      {showCounter && !spectator && playing && <CardCounter v={v} />}

      {opponent(left, 'left')}
      {opponent(right, 'right')}

      <div className="ddz__center">
        <div className="ddz__zone is-left">
          <MoveZone move={moveOf(left)} from="left" />
        </div>
        <div className="ddz__zone is-right">
          <MoveZone move={moveOf(right)} from="right" />
        </div>
        <div className="ddz__zone is-me">
          <MoveZone move={moveOf(me)} from="bottom" />
        </div>
      </div>

      <div className="ddz__me">
        <div className="ddz__myseat">
          <Seat
            player={players[me]}
            active={v.turn === me && !over}
            deadline={ctl.deadlines[me]}
            tag={role(me)}
            tagTone={me === v.landlord ? 'gold' : 'plain'}
            sub={<span className="ddz__score">积分 {v.scores[me]}</span>}
            bubble={bidBubble(me)}
            bubbleSide="right"
            layout="row"
            size={40}
          />
        </div>
        {myTurn && v.phase === 'bidding' && (
          <div className="action-bar">
            <Button variant="felt" onClick={() => act({ type: 'bid', score: 0 })}>
              不叫
            </Button>
            {([1, 2, 3] as const).map((n) => (
              <Button
                key={n}
                variant={n === 3 ? 'felt-primary' : 'felt'}
                disabled={n <= v.currentBid}
                onClick={() => act({ type: 'bid', score: n })}
              >
                {n} 分
              </Button>
            ))}
          </div>
        )}
        {myTurn && playing && (
          <div className="action-bar">
            {!leading && candidates.length === 0 ? (
              <Button variant="felt-primary" onClick={doPass}>
                要不起
              </Button>
            ) : (
              <>
                {!leading && (
                  <Button variant="felt" onClick={doPass}>
                    不出
                  </Button>
                )}
                <Button variant="felt" onClick={doHint}>
                  提示
                </Button>
                <Button variant="felt-primary" disabled={!pattern} onClick={doPlay}>
                  出牌
                </Button>
                {pattern && <span className="pattern-tag">{ddz.DDZ_KIND_NAME[pattern.kind]}</span>}
              </>
            )}
          </div>
        )}
        {!myTurn && !over && !spectator && v.turn !== null && (
          <div className="action-hint">
            {v.phase === 'bidding' ? '叫分中' : '等待'} <b>{players[v.turn]?.name}</b>
            {v.phase === 'bidding' ? '' : ' 出牌'}
          </div>
        )}
        {v.redeals > 0 && v.phase === 'bidding' && v.bids.every((b) => b === null) && (
          <div className="action-hint">无人叫分，已重新发牌</div>
        )}
      </div>

      <div className="ddz__hand">
        {!spectator && (
          <Hand
            cards={v.hand}
            selected={sel}
            onChange={playing ? setSel : undefined}
            disabled={!playing}
            dealKey={`${v.round}-${v.redeals}`}
          />
        )}
        {spectator && <div className="action-hint spectate">观战中</div>}
      </div>

      {over && v.result && <RoundResult ctl={ctl} v={v} me={me} spectator={spectator} />}
    </div>
  );
}

function RoundResult({
  ctl,
  v,
  me,
  spectator,
}: {
  ctl: Ctl;
  v: ddz.DdzView;
  me: number;
  spectator: boolean;
}) {
  const r = v.result!;
  const iWon = r.landlordWin === (r.landlord === me);
  const matchOver = v.phase === 'matchOver';
  const readyCount = v.ready.filter(Boolean).length;
  const ranking = matchOver ? [0, 1, 2].sort((a, b) => v.scores[b] - v.scores[a]) : [0, 1, 2];
  const title = matchOver
    ? ranking[0] === me
      ? '本场冠军'
      : '本场结束'
    : spectator
      ? r.landlordWin
        ? '地主胜'
        : '农民胜'
      : iWon
        ? '胜利'
        : '失败';
  const details = [
    `地主 ${ctl.players[r.landlord].name}`,
    `叫 ${r.bid} 分`,
    r.bombs ? `炸弹 ${r.bombs}` : '',
    r.spring ? (r.landlordWin ? '春天' : '反春') : '',
    `×${r.multiplier}`,
  ].filter(Boolean);

  return (
    <Sheet
      open
      dismissible={false}
      footer={
        matchOver ? (
          <>
            <Button onClick={() => ctl.leave()}>返回大厅</Button>
            {ctl.canRestart && (
              <Button variant="primary" onClick={() => ctl.restart()}>
                再来一场
              </Button>
            )}
          </>
        ) : spectator ? undefined : (
          <Button
            variant="primary"
            disabled={v.ready[me]}
            onClick={() => ctl.act({ type: 'ready' })}
          >
            {v.ready[me] ? `等待其他玩家 ${readyCount}/3` : '继续下一局'}
          </Button>
        )
      }
    >
      <div className="result">
        <div
          className={`result__title ${iWon || (matchOver && ranking[0] === me) ? 'is-win' : 'is-lose'}`}
        >
          {title}
        </div>
        <div className="result__sub">
          第 {r.round} 局 · {details.join(' · ')}
        </div>
        <table className="result__table">
          <thead>
            <tr>
              <th>玩家</th>
              <th className="num">本局</th>
              <th className="num">总分</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((s) => (
              <tr key={s} className={s === me && !spectator ? 'is-me' : ''}>
                <td>
                  <span className="result__who">
                    <Avatar name={ctl.players[s].name} size={26} />
                    {ctl.players[s].name}
                    <span className={`mini-tag ${s === r.landlord ? '' : 'is-plain'}`}>
                      {s === r.landlord ? '地主' : '农民'}
                    </span>
                  </span>
                </td>
                <td className={`num ${r.deltas[s] >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                  {signed(r.deltas[s])}
                </td>
                <td className="num">{v.scores[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {v.revealed && (
          <div className="result__hands">
            {[0, 1, 2]
              .filter((s) => s !== me && v.revealed![s].length > 0)
              .map((s) => (
                <div className="result__hand" key={s}>
                  <span>{ctl.players[s].name}</span>
                  <CardRow cards={v.revealed![s] as Card[]} w="var(--cw-xs)" overlap={0.5} />
                </div>
              ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
