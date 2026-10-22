import type { ss } from '@park/engine';
import { ss as SS } from '@park/engine';
import { Dices, Heart, KeyRound } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { signed } from '../../lib/format';
import { useSeatScale } from '../../lib/media';
import { playSound } from '../../lib/sound';
import { useCompact, useTurnCue } from '../shared/trick';
import { SPELL_UI, Stone } from './spells';
import './spellstones.css';

type Ctl = GameController<ss.SsView, ss.SsAction>;
type Spell = ss.Spell;

function Hearts({ life }: { life: number }) {
  return (
    <span className="ss-hearts" aria-label={`生命 ${life}`}>
      {Array.from({ length: SS.MAX_LIFE }, (_, i) => (
        <Heart key={i} size={11} strokeWidth={2.4} fill={i < life ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

const spellLabel = (s: Spell) => `${s}号${SS.SPELL_NAME[s]}`;

/** 魔法出包牌桌 */
export default function SpellBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat ?? 0;
  const spectator = ctl.seat === null;
  const n = v.players.length;
  const compact = useCompact();
  const scale = useSeatScale();
  const myTurn = !spectator && v.phase === 'play' && v.turn === me;
  useTurnCue(myTurn);
  const odds = useMemo(() => (spectator ? null : SS.rackOdds(v, me)), [v, me, spectator]);
  const name = (s: number) => (s === me && !spectator ? '你' : ctl.players[s].name);

  // 最近一条施法事件：音效、气泡、生命飘字
  const last = [...v.events].reverse().find((e) => e.type !== 'end');
  const lastSeq = useRef(last?.seq ?? 0);
  useEffect(() => {
    if (!last || last.seq <= lastSeq.current) return;
    lastSeq.current = last.seq;
    if (last.type === 'fail') playSound('pass');
    else playSound(last.spell === 1 ? 'bomb' : 'play');
  }, [last]);
  const fresh = last && v.events.at(-1)?.seq === last.seq ? last : null;
  const deltaOf = (s: number) =>
    fresh?.type === 'cast'
      ? (fresh.deltas.find((d) => d.seat === s)?.delta ?? 0)
      : fresh?.type === 'fail' && fresh.seat === s
        ? -fresh.loss
        : 0;
  const bubbleOf = (s: number) =>
    last && last.seat === s && v.phase === 'play'
      ? last.type === 'cast'
        ? `${SS.SPELL_NAME[last.spell]}！`
        : `${SS.SPELL_NAME[last.spell]} · 失败`
      : undefined;

  const cast = (spell: Spell) => {
    const err = ctl.act({ type: 'cast', spell });
    if (err) toast(err, 'error');
  };
  const stop = () => {
    const err = ctl.act({ type: 'stop' });
    if (err) toast(err, 'error');
  };

  // 圆桌：对手从左（下家）经上方到右（上家）
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);
  const k = others.length;
  // 两位对手时放在左上、右上，避免上方整片空着
  const angleOf = (i: number) =>
    (k === 1 ? 270 : k === 2 ? 225 + i * 90 : 180 + (i * 180) / (k - 1)) * (Math.PI / 180);
  const relOf = (s: number) =>
    n === 2 ? '对手' : s === (me + 1) % n ? '下家' : s === (me + n - 1) % n ? '上家' : undefined;

  const seatSub = (s: number) => (
    <span className="ss-sub">
      <Hearts life={v.players[s].life} />
      <span className="num">{v.players[s].score} 分</span>
      {v.players[s].secretCount > 0 && (
        <span className="ss-sub__secret" title="秘密石">
          <KeyRound size={11} strokeWidth={2.4} />
          {v.players[s].secretCount}
        </span>
      )}
    </span>
  );

  const rackOf = (s: number, size: 'xs' | 'sm' | 'md') => {
    const p = v.players[s];
    const stones = p.rack ?? Array.from({ length: p.rackCount }, () => null);
    return (
      <div className="ss-rack">
        {stones.map((x, i) => (
          <Stone key={x ? x.id : `b${i}`} spell={x ? x.spell : null} size={size} />
        ))}
      </div>
    );
  };

  // 法阵：每种咒语已施放 / 移出 / 总数
  const circle = SS.SPELLS.map((s) => ({
    spell: s,
    cast: v.board.filter((x) => x.spell === s).length,
    removed: v.removed.filter((x) => x.spell === s).length,
  }));

  const eventText = (e: ss.SsEvent | undefined) => {
    if (!e) return v.phase === 'play' ? `${name(v.turn!)} 先手` : '';
    if (e.type === 'end') return `${name(e.seat)} 结束回合${e.drew ? `，补了 ${e.drew} 块` : ''}`;
    if (e.type === 'fail') {
      return `${name(e.seat)} 宣告 ${spellLabel(e.spell)}——没有这块石头，施法失败${e.roll ? `，掷出 ${e.roll}` : ''}，生命 −${e.loss}`;
    }
    const parts = e.deltas.map((d) => `${name(d.seat)} ${signed(d.delta)}`);
    if (e.spell === 4) parts.push(e.secret ? '拿走一块秘密石' : '秘密石已经被拿光了');
    return `${name(e.seat)} 施放 ${spellLabel(e.spell)}${e.roll ? `，掷出 ${e.roll}` : ''}${parts.length ? `：${parts.join('，')}` : ''}`;
  };
  const headline = v.events.at(-1);

  return (
    <div className="ss" style={{ '--k': scale } as CSSProperties}>
      <div className="ss__info info-chips top-info">
        <span className="chip">
          第 <b className="num">{v.round}</b> 轮
        </span>
        <span className="chip">
          目标 <b className="num">{v.options.target}</b> 分
        </span>
        <span className="chip">
          牌库 <b className="num">{v.poolCount}</b>
        </span>
        <span className="chip">
          秘密石 <b className="num">{v.secretCount}</b>
        </span>
        {v.removed.length > 0 && (
          <span className="chip" title="人数较少时开局公开移出的魔法石，已计入法阵">
            移出 <b className="num">{v.removed.length}</b>
          </span>
        )}
      </div>

      <div className="ss__arena">
        <div className="ss__table" />
        {others.map((s, i) => {
          const a = angleOf(i);
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          // 上方座位的气泡放在右侧，不挡住它面前的石头
          const side = cos < -0.3 ? 'right' : cos > 0.3 ? 'left' : 'right';
          const d = deltaOf(s);
          return (
            <div
              key={s}
              className={`ss__opp ${v.turn === s ? 'is-turn' : ''}`}
              style={{
                left: `${50 + 42 * cos}%`,
                top: `${(compact ? 86 : 76) + (compact ? 32 : 40) * sin}%`,
              }}
            >
              <Seat
                player={ctl.players[s]}
                active={v.turn === s}
                deadline={ctl.deadlines[s]}
                size={58}
                sub={seatSub(s)}
                tag={relOf(s)}
                tagTone="plain"
                bubble={bubbleOf(s)}
                bubbleSide={side}
              />
              {rackOf(s, compact ? 'xs' : 'sm')}
              {d !== 0 && (
                <span key={fresh!.seq} className={`ss-float ${d > 0 ? 'is-up' : ''}`}>
                  {signed(d)}
                </span>
              )}
            </div>
          );
        })}

        <div className="ss__center">
          <div className="ss-circle" aria-label="法阵">
            {circle.map((c) => (
              <div
                key={c.spell}
                className="ss-circle__col"
                title={`${spellLabel(c.spell)}：共 ${c.spell} 块，已施放 ${c.cast}${c.removed ? `，开局移出 ${c.removed}` : ''}`}
              >
                <Stone
                  spell={c.spell}
                  size={compact ? 'xs' : 'md'}
                  dim={c.cast + c.removed === 0}
                />
                <span className="ss-circle__count num">
                  {c.cast + c.removed}
                  <small>/{c.spell}</small>
                </span>
              </div>
            ))}
          </div>
          <div
            key={headline?.seq ?? 0}
            className={`ss-banner ${headline?.type === 'fail' ? 'is-fail' : ''}`}
          >
            {headline && headline.type !== 'end' && headline.roll !== undefined && (
              <span className="ss-die" title="骰子">
                <Dices size={14} />
                <b className="num">{headline.roll}</b>
              </span>
            )}
            {eventText(headline)}
          </div>
        </div>
      </div>

      <div className="ss__dock">
        {!spectator && (
          <div className="ss__me">
            <Seat
              player={ctl.players[me]}
              active={myTurn}
              deadline={ctl.deadlines[me]}
              size={50}
              layout="row"
              sub={seatSub(me)}
              bubble={bubbleOf(me)}
              bubbleSide="top"
            />
            <div className="ss__mine">
              {rackOf(me, compact ? 'sm' : 'md')}
              {(v.players[me].secrets?.length ?? 0) > 0 && (
                <div className="ss__secrets" title="你的秘密石（只有你能看到，本轮存活每块 +1 分）">
                  <KeyRound size={12} />
                  {v.players[me].secrets!.map((x) => (
                    <Stone key={x.id} spell={x.spell} size="xs" />
                  ))}
                </div>
              )}
            </div>
            {deltaOf(me) !== 0 && (
              <span key={fresh!.seq} className={`ss-float is-me ${deltaOf(me) > 0 ? 'is-up' : ''}`}>
                {signed(deltaOf(me))}
              </span>
            )}
          </div>
        )}
        {!spectator && v.phase === 'play' && (
          <div className="ss__spells">
            <div className="ss__hint">
              {myTurn
                ? v.chainMin === null
                  ? '轮到你：宣告一个咒语'
                  : `成功！可以继续宣告 ${v.chainMin} 号或更大的咒语，或者结束回合`
                : `等待 ${ctl.players[v.turn!].name} 施法…`}
              {myTurn && v.castThisTurn > 0 && (
                <Button size="sm" variant="felt" onClick={stop}>
                  结束回合
                </Button>
              )}
            </div>
            <div className="ss-spellbar">
              {SS.SPELLS.map((s) => {
                const o = odds?.find((x) => x.spell === s);
                const locked = v.chainMin !== null && s < v.chainMin;
                const none = !!o && o.unknown === 0;
                return (
                  <button
                    key={s}
                    className={`ss-spell ${none ? 'is-none' : ''} ${locked ? 'is-locked' : ''}`}
                    disabled={!myTurn || locked}
                    onClick={() => cast(s)}
                    title={`${spellLabel(s)}：${SS.SPELL_EFFECT[s]}`}
                    style={{ '--c': SPELL_UI[s].color } as CSSProperties}
                  >
                    <Stone spell={s} size="sm" />
                    <span className="ss-spell__text">
                      <b>{SS.SPELL_NAME[s]}</b>
                      <small>{SPELL_UI[s].short}</small>
                    </span>
                    {o && (
                      <span
                        className="ss-spell__odds"
                        title={`下落不明 ${o.unknown} 块，推算你面前有的概率约 ${Math.round(o.chance * 100)}%`}
                      >
                        <i style={{ width: `${Math.round(o.chance * 100)}%` }} />
                        <em className="num">{none ? '无' : `${Math.round(o.chance * 100)}%`}</em>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {v.phase !== 'play' && v.result && (
        <RoundResult ctl={ctl} v={v} me={me} spectator={spectator} />
      )}
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
  v: ss.SsView;
  me: number;
  spectator: boolean;
}) {
  const r = v.result!;
  const matchOver = v.phase === 'matchOver';
  const n = v.players.length;
  const order = matchOver ? v.ranking! : Array.from({ length: n }, (_, s) => s);
  const who = (s: number) => (s === me && !spectator ? '你' : ctl.players[s].name);
  const reason =
    r.reason === 'empty'
      ? `${who(r.winner!)} 打空了面前的魔法石`
      : r.reason === 'knockout'
        ? `${who(r.winner!)} 击倒了 ${r.knocked.map(who).join('、')}`
        : `${r.knocked.map(who).join('、')} 施法失误倒下了`;
  const won = matchOver ? order[0] === me : r.winner === me || (r.points[me] ?? 0) > 1;
  const readyCount = v.ready.filter(Boolean).length;
  useEffect(() => {
    if (!spectator) playSound(won ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.round]);

  return (
    <Sheet
      open
      dismissible={false}
      wide
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
            {v.ready[me] ? `等待其他玩家 ${readyCount}/${n}` : '下一轮'}
          </Button>
        )
      }
    >
      <div className="result">
        <div className={`result__title ${won && !spectator ? 'is-win' : 'is-lose'}`}>
          {matchOver
            ? order[0] === me && !spectator
              ? '你赢得了这场魔法对决'
              : `${ctl.players[order[0]].name} 获胜`
            : r.winner === null
              ? '本轮没有赢家'
              : r.winner === me && !spectator
                ? '你赢下了本轮'
                : `${ctl.players[r.winner].name} 赢下本轮`}
        </div>
        <div className="result__sub">
          第 {r.round} 轮 · {reason}
        </div>
        <table className="result__table">
          <thead>
            <tr>
              <th>玩家</th>
              <th>本轮</th>
              <th className="num">得分</th>
              <th className="num">总分</th>
            </tr>
          </thead>
          <tbody>
            {order.map((s) => {
              const p = v.players[s];
              return (
                <tr key={s} className={s === me && !spectator ? 'is-me' : ''}>
                  <td>
                    <span className="result__who">
                      <Avatar name={ctl.players[s].name} avatar={ctl.players[s].avatar} size={26} />
                      {ctl.players[s].name}
                    </span>
                  </td>
                  <td className="ss-res">
                    {s === r.winner && <span className="mini-tag">赢家</span>}
                    {r.knocked.includes(s) && <span className="mini-tag is-plain">倒下</span>}
                    {r.secretPoints[s] > 0 && (
                      <span className="mini-tag is-plain">秘密石 +{r.secretPoints[s]}</span>
                    )}
                    <span className="ss-res__rack">
                      {(p.rack ?? []).map((x) => (
                        <Stone key={x.id} spell={x.spell} size="xs" />
                      ))}
                    </span>
                  </td>
                  <td className={`num ${r.points[s] > 0 ? 'delta-pos' : ''}`}>+{r.points[s]}</td>
                  <td className="num">{p.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
