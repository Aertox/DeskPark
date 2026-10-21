import { tx } from '@park/engine';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayingCard } from '../../components/PlayingCard';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { findCharacter, useCharacters } from '../../lib/characters';
import { formatChips, signed } from '../../lib/format';
import { playSound } from '../../lib/sound';
import { useCompact, useTurnCue } from '../shared/trick';
import './texas.css';

type Ctl = GameController<tx.TxView, tx.TxAction>;

const STREET: Record<tx.TxStreet, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
};

const ACTION_TEXT: Record<tx.TxActionTag, string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  bet: '下注',
  raise: '加注',
  allin: '全下',
  sb: '小盲',
  bb: '大盲',
};

function Chips({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span className={`txchips ${className}`}>
      <i />
      <span className="num">{formatChips(amount)}</span>
    </span>
  );
}

export default function TexasBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const n = v.players.length;
  const spectator = ctl.seat === null;
  const me = ctl.seat ?? 0;
  const mine = v.players[me];
  const myTurn = !spectator && !!v.me;
  const [raiseOpen, setRaiseOpen] = useState(false);
  const compact = useCompact();
  const characters = useCharacters();
  const [raiseTo, setRaiseTo] = useState(0);
  useTurnCue(myTurn);

  useEffect(() => {
    if (!myTurn) setRaiseOpen(false);
  }, [myTurn]);

  const result = v.phase !== 'betting' ? v.result : null;
  const winners = new Set(result?.pots.flatMap((p) => p.winners) ?? []);
  const shown = new Map(result?.shown.map((h) => [h.seat, h]) ?? []);
  const highlight = useMemo(() => {
    const ids = new Set<number>();
    if (!result?.showdown) return ids;
    for (const h of result.shown) if (winners.has(h.seat)) h.best.forEach((c) => ids.add(c.id));
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const resultHand = useRef(0);
  useEffect(() => {
    if (!result || resultHand.current === result.handNo || spectator) return;
    resultHand.current = result.handNo;
    if (result.won[me] > 0) playSound('win');
  }, [result, me, spectator]);

  const act = (a: tx.TxAction) => {
    const err = ctl.act(a);
    if (err) toast(err, 'error');
    else setRaiseOpen(false);
  };

  const myHandName = useMemo(() => {
    if (!mine.hole || v.board.length < 3) return null;
    return tx.handName(tx.scoreHand([...mine.hole, ...v.board]));
  }, [mine.hole, v.board]);

  // 座位分布在椭圆上，自己在正下方，顺时针为下家
  const pos = (s: number) => {
    const k = (s - me + n) % n;
    const a = ((90 + (k * 360) / n) * Math.PI) / 180;
    return { x: 50 + 47 * Math.cos(a), y: 50 + 44 * Math.sin(a), a };
  };

  const opts = v.me;
  const pot = v.totalPot;
  const presets = opts
    ? [
        { label: '最小', to: opts.minRaiseTo },
        { label: '½ 池', to: v.currentBet + Math.round(pot / 2) },
        { label: '¾ 池', to: v.currentBet + Math.round((pot * 3) / 4) },
        { label: '1 池', to: v.currentBet + pot },
        { label: '全下', to: opts.maxRaiseTo },
      ].map((p) => ({ ...p, to: Math.max(opts.minRaiseTo, Math.min(opts.maxRaiseTo, p.to)) }))
    : [];

  const openRaise = () => {
    if (!opts) return;
    setRaiseTo(presets[1]?.to ?? opts.minRaiseTo);
    setRaiseOpen(true);
  };

  return (
    <div className="tx">
      <div className="tx__info info-chips top-info">
        <span className="chip">
          第 <b className="num">{v.handNo}</b> 手
        </span>
        <span className="chip">
          盲注{' '}
          <b className="num">
            {formatChips(v.sb)}/{formatChips(v.bb)}
          </b>
        </span>
        {v.nextBlindUpAt && (
          <span className="chip">
            第 <b className="num">{v.nextBlindUpAt}</b> 手涨盲
          </span>
        )}
      </div>

      <div className="tx__felt">
        <div className="tx__oval">
          <div className="tx__center">
            <div className="tx__pot">
              <span>
                {v.phase === 'betting' ? STREET[v.street] : result?.showdown ? '摊牌' : '本手结束'}
              </span>
              <Chips
                amount={
                  v.phase === 'betting'
                    ? pot
                    : (result?.pots.reduce((a, p) => a + p.amount, 0) ?? 0)
                }
                className="is-pot"
              />
            </div>
            <div className="tx__board">
              {[0, 1, 2, 3, 4].map((i) =>
                v.board[i] ? (
                  <PlayingCard
                    key={v.board[i].id}
                    card={v.board[i]}
                    w="var(--tx-board-w)"
                    className="tx__bcard"
                    highlight={highlight.has(v.board[i].id)}
                    dim={!!result?.showdown && highlight.size > 0 && !highlight.has(v.board[i].id)}
                  />
                ) : (
                  <span key={`e${i}`} className="tx__slot" />
                ),
              )}
            </div>
            {result && (
              <div className="tx__winner">
                {result.pots.map((p, i) => (
                  <div key={i}>
                    {p.winners.map((s) => ctl.players[s].name).join('、')}
                    <span> 赢得 </span>
                    <b className="num">{formatChips(p.amount)}</b>
                    {result.showdown && shown.get(p.winners[0]) && (
                      <em>{shown.get(p.winners[0])!.name}</em>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {v.players.map((p, s) => {
          if (s === me && !spectator) return null;
          const { x, y: y0, a } = pos(s);
          // 全身立绘的头部会探出座位上沿，顶部座位下移，避免压到信息栏
          const y =
            y0 < 20 && findCharacter(characters, ctl.players[s].avatar)
              ? y0 + (compact ? 9 : 13)
              : y0;
          const h = shown.get(s);
          const side = x < 50 ? 'right' : 'left';
          const below = y < 50;
          return (
            <div key={s}>
              <div
                className={`tx__seat ${p.out ? 'is-out' : ''} ${below ? 'is-upper' : 'is-lower'} ${x <= 50 ? 'on-left' : 'on-right'}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <Seat
                  player={ctl.players[s]}
                  active={v.turn === s}
                  deadline={ctl.deadlines[s]}
                  dim={p.folded || p.out}
                  size={50}
                  layout="row"
                  figureOverflow
                  tag={winners.has(s) && result ? '赢' : undefined}
                  sub={p.out ? '出局' : <span className="num">{formatChips(p.stack)}</span>}
                  bubble={
                    p.lastAction &&
                    v.phase === 'betting' &&
                    p.lastAction.tag !== 'sb' &&
                    p.lastAction.tag !== 'bb'
                      ? ACTION_TEXT[p.lastAction.tag]
                      : undefined
                  }
                  bubbleSide={side}
                >
                  {s === v.dealer && <span className="tx__dealer">D</span>}
                  {p.inHand && !h && (
                    <div className="tx__backs" aria-label="手牌">
                      <PlayingCard faceDown w="var(--tx-back-w)" />
                      <PlayingCard faceDown w="var(--tx-back-w)" />
                    </div>
                  )}
                </Seat>
                {h && (
                  <div className="tx__shown">
                    <div className="tx__hole">
                      {h.cards.map((c) => (
                        <PlayingCard
                          key={c.id}
                          card={c}
                          w="var(--tx-hole-w)"
                          highlight={highlight.has(c.id)}
                        />
                      ))}
                    </div>
                    <span className="tx__handname">{h.name}</span>
                  </div>
                )}
              </div>
              {p.bet > 0 && v.phase === 'betting' && (
                <div
                  className="tx__bet"
                  style={
                    compact && y !== y0
                      ? // 矮屏上顶部座位已下移，筹码放到座位左侧，避免压住底池
                        { left: `calc(${x}% - 104px)`, top: `calc(${y}% + 8px)` }
                      : {
                          left: `calc(${x}% - ${Math.cos(a) * (compact ? 112 : 140)}px)`,
                          top: `calc(${y}% - ${Math.sin(a) * (compact ? 40 : 58) + (below ? -1 : 1) * (compact ? 14 : 10)}px)`,
                        }
                  }
                >
                  <Chips amount={p.bet} />
                </div>
              )}
            </div>
          );
        })}
        {!spectator && mine.bet > 0 && v.phase === 'betting' && (
          <div className="tx__bet is-mine" style={{ left: '50%', top: 'calc(94% - 28px)' }}>
            <Chips amount={mine.bet} />
          </div>
        )}
      </div>

      {!spectator && (
        <div className="tx__dock">
          <div className="tx__me">
            <Seat
              player={ctl.players[me]}
              active={myTurn}
              deadline={ctl.deadlines[me]}
              dim={mine.folded && !mine.out}
              size={52}
              layout="row"
              tag={winners.has(me) && result ? '赢' : undefined}
              sub={mine.out ? '已出局' : <span className="num">{formatChips(mine.stack)}</span>}
            >
              {me === v.dealer && <span className="tx__dealer">D</span>}
            </Seat>
            <div className="tx__myhole">
              {mine.hole?.map((c) => (
                <PlayingCard
                  key={c.id}
                  card={c}
                  highlight={highlight.has(c.id)}
                  dim={mine.folded}
                />
              ))}
            </div>
            <div className="tx__mystatus">
              {mine.folded && !mine.out && <span>已弃牌</span>}
              {mine.allIn && <span className="is-gold">全下</span>}
              {myHandName && !mine.folded && <span>{shown.get(me)?.name ?? myHandName}</span>}
              {result && result.net[me] !== 0 && (
                <span className={result.net[me] > 0 ? 'is-gold' : ''}>
                  {signed(result.net[me])}
                </span>
              )}
            </div>
          </div>

          <div className="tx__actions">
            {myTurn && opts && !raiseOpen && (
              <div className="action-bar">
                <Button variant="felt" onClick={() => act({ type: 'fold' })}>
                  弃牌
                </Button>
                {opts.canCheck ? (
                  <Button variant="felt" onClick={() => act({ type: 'check' })}>
                    过牌
                  </Button>
                ) : (
                  <Button variant="felt" onClick={() => act({ type: 'call' })}>
                    {opts.toCall >= mine.stack ? '全下' : '跟注'} {formatChips(opts.toCall)}
                  </Button>
                )}
                {opts.canRaise && (
                  <Button variant="felt-primary" onClick={openRaise}>
                    {v.currentBet === 0 ? '下注' : '加注'}
                  </Button>
                )}
              </div>
            )}
            {myTurn && opts && raiseOpen && (
              <div className="raise">
                <div className="raise__presets">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      className={raiseTo === p.to ? 'is-on' : ''}
                      onClick={() => setRaiseTo(p.to)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="raise__row">
                  <input
                    type="range"
                    min={opts.minRaiseTo}
                    max={opts.maxRaiseTo}
                    step={Math.max(1, v.sb)}
                    value={raiseTo}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    style={
                      {
                        '--fill': `${((raiseTo - opts.minRaiseTo) / Math.max(1, opts.maxRaiseTo - opts.minRaiseTo)) * 100}%`,
                      } as CSSProperties
                    }
                  />
                  <Button variant="felt" size="sm" onClick={() => setRaiseOpen(false)}>
                    取消
                  </Button>
                  <Button
                    variant="felt-primary"
                    size="sm"
                    onClick={() =>
                      act(
                        raiseTo >= opts.maxRaiseTo
                          ? { type: 'allin' }
                          : { type: 'raise', to: raiseTo },
                      )
                    }
                  >
                    {raiseTo >= opts.maxRaiseTo ? '全下' : v.currentBet === 0 ? '下注' : '加注到'}{' '}
                    {formatChips(raiseTo)}
                  </Button>
                </div>
              </div>
            )}
            {v.phase === 'handOver' && !mine.out && (
              <div className="action-bar">
                <Button
                  variant="felt-primary"
                  disabled={v.ready[me]}
                  onClick={() => ctl.act({ type: 'ready' })}
                >
                  {v.ready[me] ? '等待其他玩家…' : '下一手'}
                </Button>
              </div>
            )}
            {!myTurn && v.phase === 'betting' && v.turn !== null && (
              <div className="action-hint">
                等待 <b>{ctl.players[v.turn]?.name}</b>
              </div>
            )}
            {mine.out && v.phase !== 'gameOver' && (
              <div className="action-bar">
                <span className="action-hint">你已出局，可以继续观战</span>
                {ctl.canRestart && ctl.mode === 'local' && (
                  <Button variant="felt-primary" size="sm" onClick={() => ctl.restart()}>
                    重新开始
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {v.phase === 'gameOver' && v.ranking && (
        <Sheet
          open
          dismissible={false}
          footer={
            <>
              <Button onClick={() => ctl.leave()}>返回大厅</Button>
              {ctl.canRestart && (
                <Button variant="primary" onClick={() => ctl.restart()}>
                  再来一场
                </Button>
              )}
            </>
          }
        >
          <div className="result">
            <div className={`result__title ${v.ranking[0] === me ? 'is-win' : 'is-lose'}`}>
              {v.ranking[0] === me && !spectator
                ? '你赢下了全部筹码'
                : `${ctl.players[v.ranking[0]].name} 获胜`}
            </div>
            <div className="result__sub">共进行 {v.handNo} 手</div>
            <table className="result__table">
              <tbody>
                {v.ranking.map((s, i) => (
                  <tr key={s} className={s === me && !spectator ? 'is-me' : ''}>
                    <td style={{ width: 40 }} className="num">
                      {i + 1}
                    </td>
                    <td>
                      <span className="result__who">
                        <Avatar
                          name={ctl.players[s].name}
                          avatar={ctl.players[s].avatar}
                          size={26}
                        />
                        {ctl.players[s].name}
                      </span>
                    </td>
                    <td className="num">{formatChips(v.players[s].stack)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      )}
    </div>
  );
}
