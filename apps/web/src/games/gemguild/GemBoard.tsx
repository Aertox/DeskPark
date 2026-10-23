import type { gg } from '@park/engine';
import { gg as GG } from '@park/engine';
import { Crown, Gem as GemIco, Layers } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { useSeatScale } from '../../lib/media';
import { playSound } from '../../lib/sound';
import { useCompact, useTurnCue } from '../shared/trick';
import { BonusChip, GEMS, GEM_LABEL, GemCard, GemCardBack, GemToken, NobleTile } from './art';
import './gemguild.css';

type Ctl = GameController<gg.GgView, gg.GgAction>;
type Gem = gg.Gem;
type Token = gg.Token;
type Card = gg.GgCard;
type View = gg.GgView;
const TOKENS: readonly Token[] = [...GEMS, 'gold'];
const LEVELS: readonly gg.Level[] = [3, 2, 1];

function useBox() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    const update = () =>
      setBox((b) =>
        b.w === el.clientWidth && b.h === el.clientHeight
          ? b
          : { w: el.clientWidth, h: el.clientHeight },
      );
    ro.current = new ResizeObserver(update);
    ro.current.observe(el);
    update();
  }, []);
  return [ref, box] as const;
}

/**
 * 牌宽只在变化超过 2px 时更新，并取整：防止布局在两个相差不到一像素的尺寸之间来回切换（画面抖动）。
 */
function useStableSize(target: number): number {
  const [size, setSize] = useState(() => Math.round(target));
  useEffect(() => {
    if (Math.abs(target - size) >= 2) setSize(Math.round(target));
  }, [target, size]);
  return Math.abs(target - size) >= 2 ? Math.round(target) : size;
}

/** 持有的宝石与折扣：每种颜色一列（折扣牌在上，宝石在下） */
function Holdings({ p, size }: { p: gg.GgPlayerView; size: string }) {
  return (
    <span className="gg-hold" style={{ '--t': size } as CSSProperties}>
      {TOKENS.map((t) => (
        <span key={t} className="gg-hold__col">
          {t !== 'gold' ? (
            <BonusChip gem={t} n={p.bonuses[t]} />
          ) : (
            <span className="gg-hold__gap" />
          )}
          <GemToken gem={t} size={size} count={p.tokens[t]} dim={p.tokens[t] === 0} />
        </span>
      ))}
    </span>
  );
}

interface Flyer {
  key: string;
  from: DOMRect;
  to: DOMRect;
  node: ReactNode;
  delay: number;
}

type Focus =
  | { kind: 'card'; card: Card; reserved: boolean; owner: number }
  | { kind: 'deck'; level: gg.Level }
  | null;

/** 宝石商会牌桌 */
export default function GemBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat ?? 0;
  const spectator = ctl.seat === null;
  const compact = useCompact();
  const scale = useSeatScale();
  const over = v.phase === 'over';
  const myTurn = !spectator && !over && v.turn === me;
  useTurnCue(myTurn);
  const mine = v.players[me];
  const name = (s: number) => (s === me && !spectator ? '你' : ctl.players[s].name);

  const send = (action: gg.GgAction) => {
    const err = ctl.act(action);
    if (err) toast(err, 'error');
    return !err;
  };

  // ---- 尺寸：按可用空间算牌宽 ----
  const [tableRef, box] = useBox();
  const cw = useStableSize(Math.max(40, Math.min(200, box.w / 6.4, box.h / 5.5)));

  // ---- 拿宝石：点供应区的筹码挑选 ----
  const [sel, setSel] = useState<Gem[]>([]);
  useEffect(() => setSel([]), [v.turn, v.turnNo, v.phase]);
  const pickGem = (g: Gem) => {
    if (!myTurn || v.phase !== 'play') return;
    playSound('select');
    setSel((s) => {
      if (s.length === 1 && s[0] === g) return v.bank[g] >= 4 ? [g, g] : [];
      if (s.length === 2 && s[0] === g && s[1] === g) return [];
      if (s.includes(g)) return s.filter((x) => x !== g);
      if (s.length === 2 && s[0] === s[1]) return [g];
      if (s.length >= 3) return s;
      return [...s, g];
    });
  };
  const takeErr = sel.length ? GG.takeError(v.bank, sel) : '先点供应区的宝石';
  const selCount = (g: Gem) => sel.filter((x) => x === g).length;

  // ---- 查看 / 购买 / 预留 ----
  const [focus, setFocus] = useState<Focus>(null);
  useEffect(() => setFocus(null), [v.turnNo, v.phase]);
  const holder = useMemo(() => ({ tokens: mine.tokens, cards: mine.cards }), [mine]);
  const canBuy = (c: Card) => myTurn && v.phase === 'play' && !!GG.payment(holder, c);

  // ---- 飞行动画 ----
  const rootRef = useRef<HTMLDivElement>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const seenSeq = useRef(v.events.at(-1)?.seq ?? 0);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const rectOf = (sel2: string) =>
    rootRef.current?.querySelector<HTMLElement>(sel2)?.getBoundingClientRect() ?? null;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fresh = v.events.filter((e) => e.seq > seenSeq.current);
    if (fresh.length) {
      seenSeq.current = fresh.at(-1)!.seq;
      const add: Flyer[] = [];
      const tw = `${Math.round(cw * 0.42)}px`;
      const playerRect = (s: number) => rectOf(`[data-player="${s}"]`);
      const tokensFly = (
        m: gg.TokenMap,
        from: (t: Token) => DOMRect | null,
        to: (t: Token) => DOMRect | null,
        key: string,
        base = 0,
      ) => {
        let k = 0;
        for (const t of TOKENS)
          for (let i = 0; i < m[t]; i++) {
            const a = from(t);
            const b = to(t);
            if (a && b)
              add.push({
                key: `${key}-${t}-${i}`,
                from: a,
                to: b,
                delay: base + k++ * 70,
                node: <GemToken gem={t} size={tw} />,
              });
          }
      };
      for (const e of fresh) {
        switch (e.type) {
          case 'take':
            playSound('chip');
            tokensFly(
              e.gems,
              (t) => rectOf(`[data-bank="${t}"]`),
              () => playerRect(e.seat),
              `${e.seq}`,
            );
            break;
          case 'buy': {
            playSound('play');
            const from = rects.current.get(`c${e.card.id}`);
            const to = playerRect(e.seat);
            if (from && to)
              add.push({
                key: `${e.seq}c`,
                from,
                to,
                delay: 0,
                node: <GemCard card={e.card} w={`${from.width}px`} />,
              });
            tokensFly(
              e.paid,
              () => playerRect(e.seat),
              (t) => rectOf(`[data-bank="${t}"]`),
              `${e.seq}p`,
              120,
            );
            break;
          }
          case 'reserve': {
            playSound('deal');
            const from =
              (e.card && rects.current.get(`c${e.card.id}`)) || rectOf(`[data-deck="${e.level}"]`);
            const to = playerRect(e.seat);
            if (from && to)
              add.push({
                key: `${e.seq}r`,
                from,
                to,
                delay: 0,
                node:
                  e.card && !e.blind ? (
                    <GemCard card={e.card} w={`${from.width}px`} />
                  ) : (
                    <GemCardBack level={e.level} w={`${from.width}px`} />
                  ),
              });
            if (e.gold)
              tokensFly(
                { ...GG.emptyTokens(), gold: 1 },
                () => rectOf('[data-bank="gold"]'),
                () => playerRect(e.seat),
                `${e.seq}g`,
                80,
              );
            break;
          }
          case 'discard':
            tokensFly(
              e.gems,
              () => playerRect(e.seat),
              (t) => rectOf(`[data-bank="${t}"]`),
              `${e.seq}`,
            );
            break;
          case 'noble': {
            playSound('win');
            const from = rects.current.get(`n${e.noble.id}`);
            const to = playerRect(e.seat);
            if (from && to)
              add.push({
                key: `${e.seq}n`,
                from,
                to,
                delay: 0,
                node: <NobleTile noble={e.noble} w={`${from.width}px`} />,
              });
            break;
          }
          case 'final':
            playSound('bomb');
            break;
          default:
            break;
        }
      }
      if (add.length) setFlyers((f) => [...f, ...add]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.events]);
  // 记下这一帧每张牌、每位贵族的位置（上面的动画用上一帧的位置）
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const map = new Map<string, DOMRect>();
    root
      .querySelectorAll<HTMLElement>('[data-card]')
      .forEach((el) => map.set(`c${el.dataset.card}`, el.getBoundingClientRect()));
    root
      .querySelectorAll<HTMLElement>('[data-noble]')
      .forEach((el) => map.set(`n${el.dataset.noble}`, el.getBoundingClientRect()));
    rects.current = map;
  });
  const doneFlyer = useCallback(
    (key: string) => setFlyers((f) => f.filter((x) => x.key !== key)),
    [],
  );

  const eventText = (e: gg.GgEvent): string => {
    const tok = (m: gg.TokenMap) =>
      TOKENS.filter((t) => m[t])
        .map((t) => `${GEM_LABEL[t]}${m[t] > 1 ? `×${m[t]}` : ''}`)
        .join('、');
    switch (e.type) {
      case 'take':
        return `${name(e.seat)}拿了 ${tok(e.gems)}`;
      case 'reserve':
        return `${name(e.seat)}预留了${e.blind ? `一张 ${'ⅠⅡⅢ'[e.level - 1]} 级牌` : `${GEM_LABEL[e.card!.bonus]}卡`}${e.gold ? '，拿到黄金' : ''}`;
      case 'buy':
        return `${name(e.seat)}买下${e.reserved ? '预留的' : ''} ${'ⅠⅡⅢ'[e.card.level - 1]} 级${GEM_LABEL[e.card.bonus]}卡${e.card.points ? `（+${e.card.points}）` : ''}`;
      case 'discard':
        return `${name(e.seat)}退回 ${tok(e.gems)}`;
      case 'noble':
        return `${e.noble.name}拜访了${name(e.seat)}（+3）`;
      case 'pass':
        return `${name(e.seat)}无事可做，跳过`;
      case 'final':
        return `${name(e.seat)}达到 ${v.options.target} 声望！打完这一轮结束`;
    }
  };

  const hint = (): string => {
    if (over) return '';
    if (!myTurn) return `等待 ${ctl.players[v.turn].name}…`;
    if (v.phase === 'discard') return `宝石超过 10 颗，请退回 ${v.discard} 颗`;
    if (v.phase === 'noble') return '有多位贵族想来拜访，选一位';
    if (sel.length) return takeErr ?? `拿取 ${sel.map((g) => GEM_LABEL[g]).join('、')}`;
    return '点宝石挑选，或点一张牌购买 / 预留';
  };

  const others = Array.from({ length: v.players.length }, (_, s) => s).filter(
    (s) => s !== me || spectator,
  );
  const tw = `${Math.round(cw * 0.6)}px`;

  return (
    <div className="gg" ref={rootRef} style={{ '--k': scale, '--cw': `${cw}px` } as CSSProperties}>
      <div className="info-chips top-info">
        <span className="chip">
          第 <b className="num">{Math.ceil(v.turnNo / v.players.length)}</b> 轮
        </span>
        <span className="chip is-gold">
          目标 <b className="num">{v.options.target}</b> 声望
        </span>
        {v.lastRound && !over && <span className="chip gg-final">最后一轮</span>}
      </div>

      <div className="gg__main">
        <div className="gg__table" ref={tableRef}>
          {box.w > 0 && (
            <div className="gg__layout">
              <div className="gg__bank" aria-label="宝石供应区">
                {TOKENS.map((t) => (
                  <GemToken
                    key={t}
                    gem={t}
                    size={tw}
                    count={v.bank[t]}
                    dim={v.bank[t] === 0}
                    selected={t !== 'gold' ? selCount(t) : 0}
                    onClick={
                      t !== 'gold' && myTurn && v.phase === 'play' ? () => pickGem(t) : undefined
                    }
                    disabled={v.bank[t] === 0}
                    attrs={{ 'data-bank': t }}
                    title={
                      t === 'gold'
                        ? '黄金：预留发展卡时获得，可以当任意宝石用'
                        : `${GEM_LABEL[t]}：剩 ${v.bank[t]} 颗`
                    }
                  />
                ))}
              </div>
              <div className="gg__right">
                <div className="gg__nobles">
                  {v.nobles.map((n) => (
                    <NobleTile
                      key={n.id}
                      noble={n}
                      w={`${cw * 0.82}px`}
                      attrs={{ 'data-noble': n.id }}
                    />
                  ))}
                </div>
                {LEVELS.map((l) => (
                  <div key={l} className="gg__row">
                    <GemCardBack
                      level={l}
                      w={`${cw}px`}
                      count={v.deckCounts[l - 1]}
                      onClick={
                        myTurn && v.phase === 'play' && v.deckCounts[l - 1] > 0
                          ? () => setFocus({ kind: 'deck', level: l })
                          : undefined
                      }
                      title={`${'ⅠⅡⅢ'[l - 1]} 级牌堆：剩 ${v.deckCounts[l - 1]} 张`}
                      attrs={{ 'data-deck': l }}
                    />
                    {v.market[l - 1].map((c, i) =>
                      c ? (
                        <GemCard
                          key={c.id}
                          card={c}
                          w={`${cw}px`}
                          className={`gg-deal ${canBuy(c) ? 'is-buyable' : ''}`}
                          onClick={() =>
                            setFocus({ kind: 'card', card: c, reserved: false, owner: -1 })
                          }
                          attrs={{ 'data-card': c.id }}
                        />
                      ) : (
                        <span key={`e${i}`} className="gg__empty" />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="gg__side">
          {others.map((s) => {
            const p = v.players[s];
            return (
              <div
                key={s}
                className={`gg-opp ${v.turn === s && !over ? 'is-turn' : ''}`}
                data-player={s}
              >
                <Seat
                  player={ctl.players[s]}
                  active={v.turn === s && !over}
                  deadline={ctl.deadlines[s]}
                  size={compact ? 26 : 34}
                  className="gg-opp__seat"
                  sub={
                    <span className="gg-opp__sub">
                      <Layers size={11} />
                      {p.cards.length}
                    </span>
                  }
                />
                <div className="gg-opp__body">
                  <div className="gg-opp__top">
                    <span className="gg-opp__extra">
                      {p.reserved.map((c, i) =>
                        c ? (
                          <GemCard
                            key={c.id}
                            card={c}
                            w={compact ? '18px' : '24px'}
                            onClick={() =>
                              setFocus({ kind: 'card', card: c, reserved: true, owner: s })
                            }
                          />
                        ) : (
                          <GemCardBack
                            key={`b${i}`}
                            level={1}
                            w={compact ? '18px' : '24px'}
                            title="盲抽预留的牌"
                          />
                        ),
                      )}
                      {p.nobles.map((n) => (
                        <span key={n.id} className="gg-mini-noble" title={n.name}>
                          <Crown size={12} />
                        </span>
                      ))}
                    </span>
                    <span className="gg-pts">
                      <b className="num">{p.points}</b>
                      <small>声望</small>
                    </span>
                  </div>
                  {/* 宝石大小随屏幕放大，但不超过面板宽度（容器查询单位） */}
                  <Holdings
                    p={p}
                    size={compact ? 'min(17px, 14cqw)' : 'min(calc(26px * var(--k, 1)), 14cqw)'}
                  />
                </div>
              </div>
            );
          })}
          {!compact && (
            <ol className="gg-log">
              {[...v.events]
                .reverse()
                .slice(0, 6)
                .map((e) => (
                  <li key={e.seq}>{eventText(e)}</li>
                ))}
            </ol>
          )}
        </aside>
      </div>

      {!spectator && (
        <div className={`gg__dock ${myTurn ? 'is-turn' : ''}`} data-player={me}>
          <div className="gg-me">
            <Seat
              player={ctl.players[me]}
              active={myTurn}
              deadline={ctl.deadlines[me]}
              size={46}
              layout="row"
              figureOverflow
              sub={
                <span className="gg-opp__sub">
                  <Layers size={11} />
                  {mine.cards.length} 张牌
                </span>
              }
            />
            <span className="gg-pts is-me">
              <b className="num">{mine.points}</b>
              <small>声望</small>
            </span>
          </div>
          <Holdings p={mine} size={compact ? '26px' : 'calc(34px * var(--k, 1))'} />
          <div className="gg-me__reserved">
            {mine.reserved.map((c) =>
              c ? (
                <GemCard
                  key={c.id}
                  card={c}
                  w={compact ? '46px' : 'calc(64px * var(--k, 1))'}
                  className={canBuy(c) ? 'is-buyable' : ''}
                  onClick={() => setFocus({ kind: 'card', card: c, reserved: true, owner: me })}
                  attrs={{ 'data-card': c.id }}
                />
              ) : null,
            )}
            {mine.nobles.map((n) => (
              <NobleTile key={n.id} noble={n} w={compact ? '40px' : 'calc(56px * var(--k, 1))'} />
            ))}
          </div>
          <div className="gg-actions">
            <span className="action-hint">{hint()}</span>
            {myTurn && v.phase === 'play' && sel.length > 0 && (
              <div className="gg-actions__row">
                <span className="gg-sel">
                  {sel.map((g, i) => (
                    <GemToken key={i} gem={g} size="26px" />
                  ))}
                </span>
                <Button size="sm" variant="felt" onClick={() => setSel([])}>
                  清除
                </Button>
                <Button
                  size="sm"
                  variant="felt-primary"
                  disabled={!!takeErr}
                  onClick={() => send({ type: 'take', gems: sel }) && setSel([])}
                >
                  <GemIco size={14} /> 拿取
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {focus && (
        <FocusSheet
          focus={focus}
          v={v}
          me={me}
          myTurn={myTurn}
          holder={holder}
          send={send}
          onClose={() => setFocus(null)}
          ctl={ctl}
        />
      )}
      {myTurn && v.phase === 'discard' && (
        <DiscardSheet need={v.discard} tokens={mine.tokens} send={send} />
      )}
      {myTurn && v.phase === 'noble' && (
        <Sheet
          open
          dismissible={false}
          title="贵族来访"
          subtitle="同时满足多位贵族的要求，选一位（每回合只能迎来一位）"
        >
          <div className="gg-noble-pick">
            {v.nobles
              .filter((n) => v.nobleChoices.includes(n.id))
              .map((n) => (
                <NobleTile
                  key={n.id}
                  noble={n}
                  w="120px"
                  onClick={() => send({ type: 'noble', id: n.id })}
                />
              ))}
          </div>
        </Sheet>
      )}

      <div className="gg-flyers" aria-hidden="true">
        {flyers.map((f) => (
          <FlyNode key={f.key} f={f} onDone={doneFlyer} />
        ))}
      </div>

      {over && <GameOver v={v} ctl={ctl} me={me} spectator={spectator} />}
    </div>
  );
}

function FocusSheet({
  focus,
  v,
  me,
  myTurn,
  holder,
  send,
  onClose,
  ctl,
}: {
  focus: NonNullable<Focus>;
  v: View;
  me: number;
  myTurn: boolean;
  holder: { tokens: gg.TokenMap; cards: Card[] };
  send: (a: gg.GgAction) => boolean;
  onClose: () => void;
  ctl: Ctl;
}) {
  const reservedFull = v.players[me].reserved.length >= 3;
  const canAct = myTurn && v.phase === 'play';
  if (focus.kind === 'deck') {
    const l = focus.level;
    return (
      <Sheet
        open
        title={`盲抽预留：${'ⅠⅡⅢ'[l - 1]} 级牌`}
        subtitle="从牌堆顶抽一张放进你的预留区，其他人看不到是哪张"
        onClose={onClose}
        footer={
          <Button
            variant="primary"
            block
            disabled={!canAct || reservedFull}
            onClick={() => send({ type: 'reserve', level: l }) && onClose()}
          >
            {reservedFull
              ? '已经预留 3 张了'
              : `预留${v.bank.gold ? '，并拿 1 颗黄金' : '（黄金已经拿完）'}`}
          </Button>
        }
      >
        <div className="gg-focus">
          <GemCardBack level={l} w="150px" count={v.deckCounts[l - 1]} />
        </div>
      </Sheet>
    );
  }
  const c = focus.card;
  const own = focus.reserved && focus.owner === me;
  const pay = GG.payment(holder, c);
  const short = GG.shortfall(holder, c);
  const fromMarket = !focus.reserved;
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${'ⅠⅡⅢ'[c.level - 1]} 级 · ${GEM_LABEL[c.bonus]}${c.points ? ` · ${c.points} 声望` : ''}`}
      subtitle={
        focus.reserved && !own
          ? `${ctl.players[focus.owner].name}预留的牌`
          : '买下后永久提供 1 颗该色宝石的折扣'
      }
      footer={
        (fromMarket || own) && canAct ? (
          <>
            {fromMarket && (
              <Button
                disabled={reservedFull}
                onClick={() => send({ type: 'reserve', card: c.id }) && onClose()}
              >
                {reservedFull ? '预留已满' : `预留${v.bank.gold ? ' +1 黄金' : ''}`}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!pay}
              onClick={() => send({ type: 'buy', card: c.id }) && onClose()}
            >
              {pay ? '买下' : `还差 ${short.total} 颗`}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="gg-focus">
        <GemCard card={c} w="168px" />
        {(fromMarket || own) && (
          <div className="gg-focus__pay">
            <div className="gg-focus__label">{pay ? '需要支付' : '还缺'}</div>
            <div className="gg-focus__tokens">
              {pay
                ? TOKENS.filter((t) => pay[t]).map((t) => (
                    <GemToken key={t} gem={t} count={pay[t]} size="40px" />
                  ))
                : GEMS.filter((g) => short.missing[g]).map((g) => (
                    <GemToken key={g} gem={g} count={short.missing[g]} size="40px" />
                  ))}
              {pay && TOKENS.every((t) => !pay[t]) && (
                <span className="gg-focus__free">折扣已经抵掉全部价格，免费！</span>
              )}
            </div>
            {!pay && holder.tokens.gold > 0 && (
              <div className="gg-focus__note">已算上你的 {holder.tokens.gold} 颗黄金</div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function DiscardSheet({
  need,
  tokens,
  send,
}: {
  need: number;
  tokens: gg.TokenMap;
  send: (a: gg.GgAction) => boolean;
}) {
  const [pick, setPick] = useState<gg.TokenMap>(GG.emptyTokens);
  const count = GG.tokenTotal(pick);
  return (
    <Sheet
      open
      dismissible={false}
      title={`退回 ${need} 颗宝石`}
      subtitle="回合结束时手里最多只能有 10 颗。点宝石选择要退回的"
      footer={
        <Button
          variant="primary"
          block
          disabled={count !== need}
          onClick={() => send({ type: 'discard', gems: pick })}
        >
          退回（{count} / {need}）
        </Button>
      }
    >
      <div className="gg-discard">
        {TOKENS.map((t) => (
          <div key={t} className="gg-discard__col">
            <GemToken
              gem={t}
              size="48px"
              count={tokens[t] - pick[t]}
              dim={tokens[t] === 0}
              disabled={tokens[t] - pick[t] <= 0 || count >= need}
              onClick={() => setPick({ ...pick, [t]: pick[t] + 1 })}
            />
            <button
              type="button"
              className="gg-discard__undo"
              disabled={!pick[t]}
              onClick={() => setPick({ ...pick, [t]: pick[t] - 1 })}
            >
              {pick[t] ? `退 ${pick[t]}（撤销）` : ' '}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function FlyNode({ f, onDone }: { f: Flyer; onDone: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth || f.from.width;
    const dx = f.to.left + f.to.width / 2 - (f.from.left + f.from.width / 2);
    const dy = f.to.top + f.to.height / 2 - (f.from.top + f.from.height / 2);
    const end = Math.max(0.25, Math.min(1, 40 / w));
    const anim = el.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(1.06)`,
          opacity: 1,
          offset: 0.45,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${end})`, opacity: 0.15 },
      ],
      { duration: 640, delay: f.delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' },
    );
    anim.onfinish = () => onDone(f.key);
    return () => anim.cancel();
  }, [f, onDone]);
  return (
    <div ref={ref} className="gg-flyer" style={{ left: f.from.left, top: f.from.top }}>
      {f.node}
    </div>
  );
}

function GameOver({
  v,
  ctl,
  me,
  spectator,
}: {
  v: View;
  ctl: Ctl;
  me: number;
  spectator: boolean;
}) {
  const winners = v.winners ?? [];
  const won = winners.includes(me) && !spectator;
  useEffect(() => {
    if (!spectator) playSound(won ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Sheet
      open
      dismissible={false}
      wide
      footer={
        <>
          <Button onClick={() => ctl.leave()}>返回大厅</Button>
          {ctl.canRestart && (
            <Button variant="primary" onClick={() => ctl.restart()}>
              再来一局
            </Button>
          )}
        </>
      }
    >
      <div className="result">
        <div className={`result__title ${won ? 'is-win' : 'is-lose'}`}>
          {winners.length > 1
            ? `${winners.map((s) => (s === me && !spectator ? '你' : ctl.players[s].name)).join('、')} 并列第一`
            : won
              ? '你成为了最负盛名的宝石商'
              : `${ctl.players[winners[0]].name} 获胜`}
        </div>
        <div className="result__sub">
          共 {Math.ceil(v.turnNo / v.players.length)} 轮 · 同分时买的发展卡少的获胜
        </div>
        <table className="result__table">
          <thead>
            <tr>
              <th>商人</th>
              <th>折扣</th>
              <th className="num">发展卡</th>
              <th className="num">贵族</th>
              <th className="num">声望</th>
            </tr>
          </thead>
          <tbody>
            {v.ranking!.map((s) => {
              const p = v.players[s];
              return (
                <tr key={s} className={s === me && !spectator ? 'is-me' : ''}>
                  <td>
                    <span className="result__who">
                      <Avatar name={ctl.players[s].name} avatar={ctl.players[s].avatar} size={26} />
                      {ctl.players[s].name}
                      {winners.includes(s) && <span className="mini-tag">获胜</span>}
                    </span>
                  </td>
                  <td>
                    <span className="gg-res-bonus">
                      {GEMS.map((g) => (
                        <BonusChip key={g} gem={g} n={p.bonuses[g]} />
                      ))}
                    </span>
                  </td>
                  <td className="num">{p.cards.length}</td>
                  <td className="num">{p.nobles.length}</td>
                  <td className="num">{p.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
