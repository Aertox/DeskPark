import type { Card } from '@park/engine';
import type { hc } from '@park/engine';
import { useState } from 'react';
import { Hand } from '../../components/Hand';
import { PlayingCard } from '../../components/PlayingCard';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { useCompact, useSelection, useTurnCue } from '../shared/trick';
import './highcard.css';

type Ctl = GameController<hc.HcView, hc.HcAction>;

/** 比大小：示例玩法的界面，代码刻意保持简短，便于参考。 */
export default function HighcardBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat ?? 0;
  const spectator = ctl.seat === null;
  const others = ctl.players.map((_, s) => s).filter((s) => s !== me || spectator);
  const choosing = v.phase === 'choose' && !spectator && !v.hasChosen[me];
  const [sel, setSel] = useSelection(v.hand, `${v.round}-${v.trick}`);
  const [, force] = useState(0);
  useTurnCue(choosing);

  const play = () => {
    const id = [...sel][0];
    if (id === undefined) return;
    const err = ctl.act({ type: 'choose', card: id });
    if (err) toast(err, 'error');
    force((x) => x + 1);
  };

  const trickCard = (s: number): { card: Card | null; down: boolean } | null => {
    if (v.lastTrick) return { card: v.lastTrick.cards[s], down: false };
    if (s === me && v.myChoice) return { card: v.myChoice, down: false };
    return v.hasChosen[s] ? { card: null, down: true } : null;
  };

  const ranking = ctl.players.map((_, s) => s).sort((a, b) => v.scores[b] - v.scores[a]);

  // 圆桌座位：对手分布在左 → 上 → 右的半圈，自己在下方
  const compact = useCompact();
  const n = others.length;
  // 矮屏：出牌位排成一行，自己的在最右
  const slots = n + (spectator ? 0 : 1);
  const rowX = (i: number) => 50 + (i - (slots - 1) / 2) * Math.min(12, 66 / slots);
  const angleOf = (i: number) => (n === 1 ? 270 : 180 + (i * 180) / (n - 1)) * (Math.PI / 180);
  const cardEl = (s: number) => {
    const t = trickCard(s);
    const won = v.lastTrick?.winners.includes(s);
    return t ? (
      <PlayingCard
        key={`${v.round}-${v.trick}-${t.down}`}
        card={t.card}
        faceDown={t.down}
        highlight={won}
        w="var(--cw-sm)"
        className="hc__flip"
      />
    ) : (
      <span className="hc__empty" />
    );
  };
  const seatEl = (s: number, side: 'top' | 'bottom' | 'left' | 'right' = 'top') => {
    const won = v.lastTrick?.winners.includes(s);
    return (
      <Seat
        player={ctl.players[s]}
        active={v.phase === 'choose' && !v.hasChosen[s]}
        size={58}
        sub={<span className="num">{v.scores[s]} 分</span>}
        tag={won ? '+1' : undefined}
        bubbleSide={side}
      />
    );
  };

  return (
    <div className="hc">
      <div className="info-chips top-info">
        <span className="chip">
          第 <b className="num">{v.round}</b> / {v.options.rounds} 局
        </span>
        <span className="chip">
          第 <b className="num">{v.trick}</b> / 5 墩
        </span>
      </div>

      <div className="hc__arena">
        <div className="hc__table" />
        {others.map((s, i) => {
          const a = angleOf(i);
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          const side = cos < -0.3 ? 'right' : cos > 0.3 ? 'left' : 'bottom';
          const won = v.lastTrick?.winners.includes(s);
          const top = sin < -0.5;
          // 座位以脚底为锚点放在椭圆上；出牌位朝向桌子中心（矮屏上，上方座位的牌放在旁边）
          const seatPos = {
            left: `${50 + 43 * cos}%`,
            top: `${(compact ? 82 : 70) + (compact ? 30 : 38) * sin}%`,
          };
          // 矮屏：对手的牌在桌子中间排成一行（顺序与座位一致），避免与座位重叠
          const cardPos = compact
            ? { left: `${rowX(i)}%`, top: '74%' }
            : { left: `${50 + 23 * cos}%`, top: `${58 + 18 * sin}%` };
          return (
            <div key={s}>
              <div className={`hc__seat ${won ? 'is-won' : ''}`} style={seatPos}>
                {seatEl(s, top ? (compact ? 'left' : 'bottom') : side)}
              </div>
              <div className="hc__card" style={cardPos}>
                {cardEl(s)}
              </div>
            </div>
          );
        })}
        {!spectator && (
          <div
            className="hc__card is-mine"
            style={compact ? { left: `${rowX(n)}%`, top: '74%' } : { left: '50%', top: '81%' }}
          >
            {cardEl(me)}
          </div>
        )}
      </div>

      {!spectator && (
        <div className="hc__dock">
          <div className={`hc__me ${v.lastTrick?.winners.includes(me) ? 'is-won' : ''}`}>
            {seatEl(me, 'right')}
          </div>
          <div className="hc__hand">
            <div className="action-bar">
              {choosing ? (
                <Button variant="felt-primary" disabled={sel.size === 0} onClick={play}>
                  出这张
                </Button>
              ) : (
                <span className="action-hint">
                  {v.phase === 'reveal' ? '亮牌！' : '等待其他玩家出牌…'}
                </span>
              )}
            </div>
            <Hand
              cards={v.hand}
              selected={sel}
              onChange={choosing ? setSel : undefined}
              single
              disabled={!choosing}
              dealKey={v.round}
            />
          </div>
        </div>
      )}

      {v.phase === 'matchOver' && (
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
            <div className={`result__title ${ranking[0] === me ? 'is-win' : 'is-lose'}`}>
              {v.scores[ranking[0]] === v.scores[me] && !spectator
                ? '你赢了'
                : `${ctl.players[ranking[0]].name} 获胜`}
            </div>
            <table className="result__table">
              <tbody>
                {ranking.map((s) => (
                  <tr key={s} className={s === me && !spectator ? 'is-me' : ''}>
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
                    <td className="num">{v.scores[s]} 分</td>
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
