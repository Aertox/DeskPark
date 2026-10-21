import type { Card } from '@park/engine';
import { Rng, gd } from '@park/engine';
import { RotateCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CardRow, Hand } from '../../components/Hand';
import { PlayingCard } from '../../components/PlayingCard';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { playSound } from '../../lib/sound';
import { CountChip, MoveZone, useHintCycle, useSelection, useTurnCue } from '../shared/trick';
import './guandan.css';

type Ctl = GameController<gd.GdView, gd.GdAction>;

const PLACE = ['头游', '二游', '三游', '末游'];
const lv = (n: number) => gd.LEVEL_LABEL(n);

export default function GuandanBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const players = ctl.players;
  const spectator = ctl.seat === null;
  const me = ctl.seat ?? 0;
  const right = (me + 1) % 4;
  const top = (me + 2) % 4;
  const left = (me + 3) % 4;
  const myTeam = gd.teamOf(me);
  const level = v.level;
  const isWild = useCallback((c: Card) => gd.isWild(c, level), [level]);

  const over = v.phase === 'roundOver' || v.phase === 'matchOver';
  const playing = v.phase === 'playing';
  const myTurn = !spectator && playing && v.turn === me;
  const myReturn =
    v.phase === 'tribute' ? v.tribute?.returns.find((r) => r.from === me && !r.card) : undefined;
  const target = playing && v.lastPlay ? v.lastPlay.pattern : null;
  const leading = playing && !v.lastPlay;

  const [sel, setSel] = useSelection(v.hand, `${v.round}-${v.phase === 'tribute'}`);
  useTurnCue(myTurn || !!myReturn);

  const candidates = useMemo(() => {
    if (!myTurn) return [] as number[][];
    const cands = gd.gdCandidates(v.hand, level, target);
    const power = (p: gd.GdPattern) => gd.bombPower(p);
    cands.sort(
      (a, b) =>
        power(a.pattern) - power(b.pattern) ||
        a.wilds - b.wilds ||
        a.pattern.main - b.pattern.main ||
        b.cards.length - a.cards.length,
    );
    const list = cands.map((c) => c.cards.map((x) => x.id));
    if (leading) {
      const a = ctl.def.bot(v, me, new Rng(7)) as gd.GdAction;
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
  const pattern = myTurn && selected.length ? gd.resolveGd(selected, level, target) : null;

  const lastKey = v.lastPlay ? v.lastPlay.cards.map((c) => c.id).join(',') : '';
  useEffect(() => {
    if (v.lastPlay && gd.isBombPattern(v.lastPlay.pattern)) playSound('bomb');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastKey]);
  const resultRound = useRef(0);
  useEffect(() => {
    const r = v.result;
    if (!r || resultRound.current === r.round || spectator) return;
    resultRound.current = r.round;
    playSound(r.winTeam === myTeam ? 'win' : 'lose');
  }, [v.result, myTeam, spectator]);

  const act = (a: gd.GdAction) => {
    const err = ctl.act(a);
    if (err) toast(err, 'error');
    return !err;
  };

  const groupKey = useCallback(
    (c: Card) => (gd.isWild(c, level) ? 'wild' : gd.gdValue(c, level)),
    [level],
  );

  const placeOf = (s: number) => {
    const i = v.finished.indexOf(s);
    return i >= 0 && !over ? PLACE[i] : undefined;
  };
  const moveOf = (s: number) => (playing ? v.lastMoves[s] : null);

  const seatEl = (s: number, side: 'left' | 'right' | 'top') => (
    <Seat
      player={players[s]}
      active={v.turn === s && playing}
      deadline={ctl.deadlines[s]}
      tag={placeOf(s)}
      sub={<CountChip n={v.handCounts[s]} warnAt={6} />}
      layout={side === 'top' ? 'row' : 'column'}
      bubble={v.jiefeng === s && playing && !v.lastPlay ? '接风' : undefined}
      bubbleSide={side === 'left' ? 'right' : side === 'right' ? 'left' : 'bottom'}
      className={gd.teamOf(s) === myTeam ? 'is-ally' : ''}
    />
  );

  const returnCard = selected[0];
  const returnOk =
    !!returnCard &&
    returnCard.suit !== 'J' &&
    (returnCard.rank <= 10 || !v.hand.some((c) => c.suit !== 'J' && c.rank <= 10));

  return (
    <div className="gd">
      <div className="rotate-tip">
        <RotateCw size={12} /> 横屏体验更佳
      </div>
      <div className="gd__info info-chips top-info">
        <span className="chip">
          第 <b className="num">{v.round}</b> 局
        </span>
        <span className="chip is-gold">
          本局打 <b>{lv(level)}</b>
        </span>
        <span className={`chip ${v.levelTeam === myTeam ? 'is-gold' : ''}`}>
          {spectator ? '南北' : '我方'} <b>{lv(v.levels[myTeam])}</b>
        </span>
        <span className={`chip ${v.levelTeam !== myTeam ? 'is-gold' : ''}`}>
          {spectator ? '东西' : '对方'} <b>{lv(v.levels[1 - myTeam])}</b>
        </span>
      </div>

      <div className="gd__seat is-left">{seatEl(left, 'left')}</div>
      <div className="gd__seat is-right">{seatEl(right, 'right')}</div>

      <div className="gd__center">
        <div className="gd__top">{seatEl(top, 'top')}</div>
        <div className="gd__zone is-top">
          <MoveZone move={moveOf(top)} from="top" isWild={isWild} />
        </div>
        <div className="gd__zone is-left">
          <MoveZone move={moveOf(left)} from="left" isWild={isWild} />
        </div>
        <div className="gd__zone is-right">
          <MoveZone move={moveOf(right)} from="right" isWild={isWild} />
        </div>
        <div className="gd__zone is-me">
          <MoveZone move={moveOf(me)} from="bottom" isWild={isWild} />
        </div>
        {v.tribute && (v.phase === 'tribute' || (playing && v.lastMoves.every((m) => !m))) && (
          <div className="tribute">
            {v.tribute.anti ? (
              <span>抗贡：进贡方持有两张大王，免于进贡</span>
            ) : (
              <>
                {v.tribute.pays.map((p, i) => (
                  <div key={`p${i}`} className="tribute__row">
                    <span>
                      {players[p.from].name} <em>进贡</em> {players[p.to].name}
                    </span>
                    <PlayingCard card={p.card} w="var(--cw-xs)" wild={isWild(p.card)} />
                  </div>
                ))}
                {v.tribute.returns.map((r, i) => (
                  <div key={`r${i}`} className="tribute__row">
                    <span>
                      {players[r.from].name} <em>还贡</em> {players[r.to].name}
                    </span>
                    {r.card ? (
                      <PlayingCard card={r.card} w="var(--cw-xs)" />
                    ) : (
                      <span className="tribute__wait">选择中…</span>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className="gd__me">
        <div className="gd__myseat">
          <Seat
            player={players[me]}
            active={myTurn}
            deadline={ctl.deadlines[me]}
            tag={placeOf(me)}
            layout="row"
            size={40}
            sub={<CountChip n={v.handCounts[me]} warnAt={0} />}
          />
        </div>
        {myReturn && (
          <div className="action-bar">
            <span className="action-hint">
              选择一张 <b>10 或以下</b> 的牌还给 {players[myReturn.to].name}
            </span>
            <Button
              variant="felt-primary"
              disabled={!returnOk}
              onClick={() =>
                returnCard && act({ type: 'return', card: returnCard.id }) && setSel(new Set())
              }
            >
              还贡
            </Button>
          </div>
        )}
        {myTurn && (
          <div className="action-bar">
            {!leading && candidates.length === 0 ? (
              <Button
                variant="felt-primary"
                onClick={() => act({ type: 'pass' }) && setSel(new Set())}
              >
                要不起
              </Button>
            ) : (
              <>
                {!leading && (
                  <Button variant="felt" onClick={() => act({ type: 'pass' }) && setSel(new Set())}>
                    不出
                  </Button>
                )}
                <Button
                  variant="felt"
                  onClick={() => {
                    const h = nextHint();
                    if (h) setSel(new Set(h));
                  }}
                >
                  提示
                </Button>
                <Button
                  variant="felt-primary"
                  disabled={!pattern}
                  onClick={() => act({ type: 'play', cards: [...sel] }) && setSel(new Set())}
                >
                  出牌
                </Button>
                {pattern && <span className="pattern-tag">{gd.GD_KIND_NAME[pattern.kind]}</span>}
              </>
            )}
          </div>
        )}
        {!myTurn && !myReturn && playing && !spectator && v.turn !== null && (
          <div className="action-hint">
            {v.hand.length === 0 ? '你已出完，' : ''}等待 <b>{players[v.turn]?.name}</b> 出牌
          </div>
        )}
        {v.phase === 'tribute' && !myReturn && !spectator && (
          <div className="action-hint">等待还贡…</div>
        )}
      </div>

      <div className="gd__hand">
        {!spectator && (
          <Hand
            cards={v.hand}
            selected={sel}
            onChange={myTurn || myReturn ? setSel : playing ? setSel : undefined}
            layout="stacks"
            groupKey={groupKey}
            isWild={isWild}
            single={!!myReturn}
            dealKey={v.round}
          />
        )}
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
  v: gd.GdView;
  me: number;
  spectator: boolean;
}) {
  const r = v.result!;
  const myTeam = gd.teamOf(me);
  const win = r.winTeam === myTeam;
  const matchOver = v.phase === 'matchOver';
  const readyCount = v.ready.filter(Boolean).length;
  const teamName = (t: number) =>
    spectator ? (t === 0 ? '南北' : '东西') : t === myTeam ? '我方' : '对方';
  const title = matchOver
    ? spectator
      ? `${teamName(r.winTeam)}获胜`
      : win
        ? '过 A 成功'
        : '对方过 A'
    : spectator
      ? `${teamName(r.winTeam)}胜`
      : win
        ? '胜利'
        : '失利';

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
            {v.ready[me] ? `等待其他玩家 ${readyCount}/4` : '继续下一局'}
          </Button>
        )
      }
    >
      <div className="result">
        <div className={`result__title ${win || spectator ? 'is-win' : 'is-lose'}`}>{title}</div>
        <div className="result__sub">
          第 {r.round} 局 · 打 {lv(r.level)}
          {r.matchWon ? ' · 赢得整场' : ` · ${teamName(r.winTeam)}升 ${r.up} 级`}
        </div>
        <div className="gd-order">
          {r.order.map((s, i) => (
            <div key={s} className={`gd-order__item ${gd.teamOf(s) === r.winTeam ? 'is-win' : ''}`}>
              <span className="gd-order__place">{PLACE[i]}</span>
              <Avatar name={ctl.players[s].name} size={34} />
              <strong>{ctl.players[s].name}</strong>
              <small>{teamName(gd.teamOf(s))}</small>
            </div>
          ))}
        </div>
        <div className="gd-levels">
          {[myTeam, 1 - myTeam].map((t) => (
            <div key={t}>
              <span>{teamName(t)}</span>
              <b>
                {lv(r.levelsBefore[t])}
                {r.levelsAfter[t] !== r.levelsBefore[t] && <> → {lv(r.levelsAfter[t])}</>}
              </b>
            </div>
          ))}
        </div>
        {v.revealed && (
          <div className="result__hands">
            {[0, 1, 2, 3]
              .filter((s) => v.revealed![s].length > 0 && s !== me)
              .map((s) => (
                <div className="result__hand" key={s}>
                  <span>{ctl.players[s].name}</span>
                  <CardRow
                    cards={v.revealed![s]}
                    w="var(--cw-xs)"
                    overlap={0.5}
                    isWild={(c) => gd.isWild(c, v.level)}
                  />
                </div>
              ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
