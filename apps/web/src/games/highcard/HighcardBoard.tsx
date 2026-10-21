import type { Card } from '@park/engine';
import type { hc } from '@park/engine';
import { useState } from 'react';
import { Hand } from '../../components/Hand';
import { PlayingCard } from '../../components/PlayingCard';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { useSelection, useTurnCue } from '../shared/trick';
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

  return (
    <div className="hc">
      <div className="info-chips">
        <span className="chip">
          第 <b className="num">{v.round}</b> / {v.options.rounds} 局
        </span>
        <span className="chip">
          第 <b className="num">{v.trick}</b> / 5 墩
        </span>
      </div>

      <div className="hc__arena">
        {[...others, ...(spectator ? [] : [me])].map((s) => {
          const t = trickCard(s);
          const won = v.lastTrick?.winners.includes(s);
          return (
            <div key={s} className={`hc__slot ${won ? 'is-won' : ''}`}>
              <Seat
                player={ctl.players[s]}
                active={v.phase === 'choose' && !v.hasChosen[s]}
                size={38}
                sub={<span className="num">{v.scores[s]} 分</span>}
                tag={won ? '+1' : undefined}
              />
              <div className="hc__card">
                {t ? (
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!spectator && (
        <div className="hc__dock">
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
                        <Avatar name={ctl.players[s].name} size={26} />
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
