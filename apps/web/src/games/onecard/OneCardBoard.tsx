import type { oc } from '@park/engine';
import { oc as OC } from '@park/engine';
import { Layers, Repeat2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { useSeatScale } from '../../lib/media';
import { playSound } from '../../lib/sound';
import { useCompact, useTurnCue } from '../shared/trick';
import { COLOR_HEX, COLOR_LABEL, CardView, cardName } from './cards';
import './onecard.css';

type Ctl = GameController<oc.OcView, oc.OcAction>;
type Card = oc.OcCard;
type Color = oc.OcColor;
type View = oc.OcView;

const COLOR_ORDER: Record<string, number> = { R: 0, Y: 1, G: 2, B: 3, W: 4 };
const KIND_ORDER: Record<oc.OcKind, number> = {
  num: 0,
  skip: 1,
  reverse: 2,
  draw2: 3,
  wild: 4,
  wild4: 5,
};
/** 手牌按颜色、点数排好，方便找牌 */
const sortHand = (cards: Card[]) =>
  [...cards].sort(
    (a, b) =>
      COLOR_ORDER[a.color ?? 'W'] - COLOR_ORDER[b.color ?? 'W'] ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.n ?? 0) - (b.n ?? 0) ||
      a.id - b.id,
  );

/** 弃牌堆里每张牌的固定歪斜角度，摆出真实牌堆的样子 */
const tilt = (id: number) => ((id * 47) % 25) - 12;

function useWidth() {
  const [w, setW] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(() => setW(el.clientWidth));
    ro.current.observe(el);
    setW(el.clientWidth);
  }, []);
  return [ref, w] as const;
}

/** 读取 CSS 长度的实际像素（例如 var(--ocw)） */
function useCssPx(expr: string, dep: unknown): number {
  const [px, setPx] = useState(80);
  useLayoutEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;width:${expr}`;
    document.querySelector('.oc')?.appendChild(probe);
    setPx(probe.getBoundingClientRect().width || 80);
    probe.remove();
  }, [expr, dep]);
  return px;
}

interface Flyer {
  key: string;
  from: DOMRect;
  to: DOMRect;
  delay: number;
}

/** 喊一张牌桌 */
export default function OneCardBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat ?? 0;
  const spectator = ctl.seat === null;
  const n = v.counts.length;
  const compact = useCompact();
  const scale = useSeatScale();
  const myTurn = !spectator && v.phase === 'play' && v.turn === me;
  useTurnCue(myTurn);
  const playable = useMemo(() => new Set(OC.playableIds(v)), [v]);
  const name = (s: number) => (s === me && !spectator ? '你' : ctl.players[s].name);
  const next = OC.stepSeat(v.turn ?? me, 1, v.dir, n);

  // ---- 喊「一张」：轮到自己且只剩两张时可以先喊 ----
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(false), [v.hand.length, v.round]);
  const canArm = myTurn && v.hand.length === 2 && !v.pending;
  const iForgot = !spectator && v.window?.seat === me;
  const canCatch =
    !spectator &&
    v.window !== null &&
    v.window.seat !== me &&
    (v.turn === me || !v.window.passed.includes(me));

  // ---- 出牌（万能牌先选颜色） ----
  const [picker, setPicker] = useState<number | null>(null);
  useEffect(() => setPicker(null), [v.turn, v.hand.length]);
  const send = (action: oc.OcAction) => {
    const err = ctl.act(action);
    if (err) toast(err, 'error');
  };
  const playCard = (card: Card, color?: Color) => {
    if (OC.isWild(card) && !color) {
      setPicker(card.id);
      return;
    }
    setPicker(null);
    send({ type: 'play', card: card.id, color, uno: armed && v.hand.length === 2 });
  };
  const drawCard = () => {
    if (myTurn && v.drawn === null) send({ type: 'draw' });
  };

  // ---- 排布：对手沿桌边围坐（左 → 上 → 右） ----
  const others = spectator
    ? Array.from({ length: n }, (_, s) => s)
    : Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);
  const k = others.length;
  // 人多时座位改成「头像 + 牌」横排，避免上下相邻的座位叠在一起
  const crowded = k >= 5 && !compact;
  const angleOf = (i: number) =>
    (k === 1 ? 270 : k === 2 ? 215 + i * 110 : 180 + (i * 180) / (k - 1)) * (Math.PI / 180);

  // ---- 动画：出牌飞向弃牌堆、摸牌从牌堆飞出 ----
  const rootRef = useRef<HTMLDivElement>(null);
  const pileRef = useRef<HTMLButtonElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const handRects = useRef(new Map<number, DOMRect>());
  const lastTop = useRef(v.top.id);
  const mountSeq = useRef(v.events.at(-1)?.seq ?? 0);
  const seenSeq = useRef(mountSeq.current);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const anchorRect = (s: number): DOMRect | null => {
    const root = rootRef.current;
    if (!root) return null;
    const el =
      s === me && !spectator
        ? root.querySelector<HTMLElement>('.oc-hand')
        : root.querySelector<HTMLElement>(`[data-anchor="${s}"]`);
    return el?.getBoundingClientRect() ?? null;
  };

  useLayoutEffect(() => {
    // 弃牌堆顶换了：从出牌人的位置飞过来
    if (v.top.id !== lastTop.current) {
      lastTop.current = v.top.id;
      const play = [...v.events].reverse().find((e) => e.type === 'play');
      const el = topRef.current;
      if (
        el &&
        play &&
        play.type === 'play' &&
        play.card.id === v.top.id &&
        play.seq > mountSeq.current
      ) {
        const from =
          play.seat === me && !spectator
            ? handRects.current.get(play.card.id)
            : anchorRect(play.seat);
        const to = el.getBoundingClientRect();
        if (from && to.width) {
          const dx = from.left + from.width / 2 - (to.left + to.width / 2);
          const dy = from.top + from.height / 2 - (to.top + to.height / 2);
          el.animate(
            [
              {
                transform: `translate(${dx}px, ${dy}px) rotate(${play.seat === me ? 0 : -25}deg) scale(${Math.max(0.35, from.width / to.width)})`,
              },
              { transform: 'translate(0, 0) rotate(4deg) scale(1.08)', offset: 0.75 },
              { transform: 'none' },
            ],
            { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' },
          );
        }
      }
    }
    // 记下手牌的位置，下一次出牌时用
    const map = new Map<number, DOMRect>();
    rootRef.current
      ?.querySelectorAll<HTMLElement>('.oc-hand [data-cid]')
      .forEach((el) => map.set(Number(el.dataset.cid), el.getBoundingClientRect()));
    handRects.current = map;
  });

  useEffect(() => {
    const fresh = v.events.filter((e) => e.seq > seenSeq.current);
    if (!fresh.length) return;
    seenSeq.current = fresh.at(-1)!.seq;
    const pile = pileRef.current?.getBoundingClientRect();
    const add: Flyer[] = [];
    for (const e of fresh) {
      if (e.type === 'play') {
        playSound(e.card.kind === 'wild4' || e.card.kind === 'draw2' ? 'bomb' : 'play');
      } else if (e.type === 'draw') {
        playSound('deal');
        const to = anchorRect(e.seat);
        if (pile && to)
          for (let i = 0; i < Math.min(e.count, 6); i++)
            add.push({ key: `${e.seq}-${i}`, from: pile, to, delay: i * 90 });
      } else if (e.type === 'catch' || e.type === 'challenge') {
        playSound('chip');
      } else if (e.type === 'uno') {
        playSound('select');
      } else if (e.type === 'skip' || e.type === 'reverse') {
        playSound('pass');
      }
    }
    if (add.length) setFlyers((f) => [...f, ...add]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.events]);
  const doneFlyer = useCallback(
    (key: string) => setFlyers((f) => f.filter((x) => x.key !== key)),
    [],
  );

  // ---- 每位玩家的最新动作气泡 ----
  const bubbleOf = (s: number): string | undefined => {
    if (v.phase !== 'play') return undefined;
    const recent = v.events.slice(-Math.max(3, n));
    for (let i = recent.length - 1; i >= 0; i--) {
      const e = recent[i];
      if (e.type === 'catch' && e.target === s) return `被抓！+${OC.UNO_PENALTY}`;
      if (e.type === 'catch' && e.seat === s) return '抓到了！';
      if (e.type === 'uno' && e.seat === s) return '一张！';
      if (e.type === 'challenge' && e.seat === s) return e.guilty ? '质疑成功！' : '质疑失败…';
      if (e.type === 'skip' && e.seat === s) return '跳过';
      if (e.type === 'draw' && e.seat === s) return e.reason === 'draw' ? '摸牌' : `+${e.count}`;
      if (e.type === 'keep' && e.seat === s) return '留着';
      if (e.type === 'play' && e.seat === s) return e.uno ? '一张！' : undefined;
    }
    return undefined;
  };
  const tagOf = (s: number) =>
    v.window?.seat === s ? '没喊！' : v.called[s] && v.counts[s] === 1 ? '一张' : undefined;

  const eventText = (e: oc.OcEvent | undefined): string => {
    if (!e) return '';
    switch (e.type) {
      case 'start':
        return `第 ${v.round} 局开始，翻出 ${cardName(e.card)}，${name(e.first)} 先出`;
      case 'play':
        return `${name(e.seat)} 出了 ${cardName(e.card)}${OC.isWild(e.card) && e.color ? `，指定${COLOR_LABEL[e.color]}色` : ''}${e.uno ? '，喊了「一张」' : ''}`;
      case 'draw':
        return e.reason === 'draw'
          ? `${name(e.seat)} 摸了一张牌`
          : e.reason === 'caught'
            ? `${name(e.seat)} 没喊一张被抓，罚摸 ${e.count} 张`
            : `${name(e.seat)} 摸 ${e.count} 张`;
      case 'keep':
        return `${name(e.seat)} 把摸到的牌留在手里`;
      case 'skip':
        return `${name(e.seat)} 被跳过`;
      case 'reverse':
        return '方向反转';
      case 'challenge':
        return e.guilty
          ? `${name(e.seat)} 质疑成功：${name(e.target)} 违规出 +4，罚摸 4 张`
          : `${name(e.seat)} 质疑失败，罚摸 6 张`;
      case 'catch':
        return `${name(e.seat)} 抓到 ${name(e.target)} 没喊一张`;
      case 'uno':
        return `${name(e.seat)} 补喊了「一张」`;
    }
  };
  const headline = [...v.events].reverse().find((e) => e.type !== 'skip' && e.type !== 'reverse');

  // ---- 本局结束：看完最后一张牌再弹结算 ----
  const resultKey = v.result && v.phase !== 'play' ? `${v.result.round}-${v.phase}` : '';
  const [shownKey, setShownKey] = useState(resultKey);
  useEffect(() => {
    if (!resultKey) return;
    const t = setTimeout(() => setShownKey(resultKey), 1300);
    return () => clearTimeout(t);
  }, [resultKey]);

  const pending = v.pending;
  const hint = (): string => {
    if (v.phase !== 'play') return '';
    if (iForgot) return '你只剩一张却没喊！快点「一张！」';
    if (!myTurn) return v.turn !== null ? `等待 ${ctl.players[v.turn].name} 出牌…` : '';
    if (pending) {
      const what = pending.kind === 'wild4' ? '万能 +4' : '+2';
      if (v.options.stack && playable.size)
        return `${name(pending.from)} 出了 ${what}：可以接着叠，或摸 ${pending.amount} 张`;
      return pending.challengeable
        ? `${name(pending.from)} 对你出了万能 +4：接受摸 4 张，还是质疑？`
        : `要摸 ${pending.amount} 张`;
    }
    if (v.drawn !== null) return '摸到一张能出的牌：打出，还是留着？';
    return playable.size ? '轮到你出牌' : '没有能出的牌，摸一张';
  };

  const sorted = useMemo(() => sortHand(v.hand), [v.hand]);
  const topColor = v.color;

  return (
    <div className="oc" ref={rootRef} style={{ '--k': scale } as CSSProperties}>
      <div className="info-chips top-info">
        <span className="chip">
          第 <b className="num">{v.round}</b> 局
        </span>
        <span className="chip">
          {v.options.target ? (
            <>
              目标 <b className="num">{v.options.target}</b> 分
            </>
          ) : (
            '单局决胜'
          )}
        </span>
        {v.options.stack && <span className="chip is-gold">叠加罚牌</span>}
        <span className="chip">
          牌堆 <b className="num">{v.pileCount}</b>
        </span>
      </div>

      <div className="oc__arena">
        <div
          className="oc__table"
          style={
            { '--glow': topColor ? COLOR_HEX[topColor] : 'rgba(255,255,255,.5)' } as CSSProperties
          }
        />
        {others.map((s, i) => {
          const a = angleOf(i);
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          const side = cos < -0.3 ? 'right' : cos > 0.3 ? 'left' : 'bottom';
          const count = v.counts[s];
          const shown = Math.min(count, compact ? 8 : 12);
          return (
            <div
              key={s}
              className={`oc-opp ${crowded ? 'is-row' : ''} ${v.turn === s ? 'is-turn' : ''} ${s === next && v.phase === 'play' ? 'is-next' : ''}`}
              style={{
                left: `${50 + 43 * cos}%`,
                top: `${(compact ? 84 : 72) + (compact ? 36 : crowded ? 47 : 40) * sin}%`,
              }}
            >
              <Seat
                player={ctl.players[s]}
                active={v.turn === s}
                deadline={ctl.deadlines[s]}
                size={crowded ? 42 : 54}
                layout={compact ? 'row' : 'column'}
                sub={
                  <span className="oc-sub">
                    <Layers size={11} strokeWidth={2.4} />
                    {count}
                    {v.options.target > 0 && (
                      <span className="oc-sub__score">{v.scores[s]} 分</span>
                    )}
                  </span>
                }
                tag={tagOf(s)}
                tagTone={v.window?.seat === s ? 'accent' : 'gold'}
                bubble={bubbleOf(s)}
                bubbleSide={side}
              />
              <div
                className="oc-fan"
                data-anchor={s}
                style={{ '--n': shown } as CSSProperties}
                aria-label={`${count} 张牌`}
              >
                {Array.from({ length: shown }, (_, j) => (
                  <CardView
                    key={j}
                    card={null}
                    style={{ '--j': j - (shown - 1) / 2 } as CSSProperties}
                  />
                ))}
                {count === 1 && v.called[s] && <span className="oc-fan__uno">一张！</span>}
              </div>
              {v.window?.seat === s && canCatch && (
                <button className="oc-catch is-mini" onClick={() => send({ type: 'catch' })}>
                  抓！
                </button>
              )}
            </div>
          );
        })}

        <div
          className={`oc__center ${v.dir === -1 ? 'is-ccw' : ''}`}
          style={{ '--glow': topColor ? COLOR_HEX[topColor] : 'transparent' } as CSSProperties}
        >
          <svg className="oc-ring" viewBox="0 0 200 120" aria-hidden="true">
            <defs>
              <marker
                id="oc-arrow"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0 0 10 5 0 10Z" fill="currentColor" />
              </marker>
            </defs>
            <path d="M34 30A86 46 0 0 1 166 30" markerEnd="url(#oc-arrow)" />
            <path d="M166 90A86 46 0 0 1 34 90" markerEnd="url(#oc-arrow)" />
          </svg>
          <button
            ref={pileRef}
            className={`oc-pile ${myTurn && v.drawn === null ? 'is-live' : ''}`}
            onClick={drawCard}
            disabled={!myTurn || v.drawn !== null}
            title={myTurn ? (pending ? `摸 ${pending.amount} 张` : '摸一张') : '牌堆'}
          >
            <CardView card={null} w="var(--ocp)" />
            <span className="oc-pile__count num">{v.pileCount}</span>
          </button>
          <div className="oc-discard">
            {v.under.map((c) => (
              <CardView
                key={c.id}
                card={c}
                w="var(--ocp)"
                className="oc-discard__under"
                style={{ rotate: `${tilt(c.id)}deg` } as CSSProperties}
              />
            ))}
            <div
              ref={topRef}
              className="oc-discard__top"
              style={{ rotate: `${tilt(v.top.id) / 2}deg` }}
            >
              <CardView card={v.top} w="var(--ocp)" />
            </div>
            {topColor && (
              <span
                className="oc-color"
                style={{ '--c': COLOR_HEX[topColor] } as CSSProperties}
                title={`当前颜色：${COLOR_LABEL[topColor]}`}
              >
                {COLOR_LABEL[topColor]}
              </span>
            )}
            {pending && <span className="oc-pending num">+{pending.amount}</span>}
          </div>
          <span className="oc-dir" title={v.dir === 1 ? '顺时针' : '逆时针'}>
            <Repeat2 size={13} />
            {v.dir === 1 ? '顺时针' : '逆时针'}
          </span>
        </div>
      </div>

      <div className="oc__dock">
        {!spectator && (
          <div className="oc__me">
            <Seat
              player={ctl.players[me]}
              active={myTurn}
              deadline={ctl.deadlines[me]}
              size={50}
              layout="row"
              sub={
                <span className="oc-sub">
                  <Layers size={11} strokeWidth={2.4} />
                  {v.hand.length}
                  {v.options.target > 0 && <span className="oc-sub__score">{v.scores[me]} 分</span>}
                </span>
              }
              tag={tagOf(me)}
              tagTone={iForgot ? 'accent' : 'gold'}
              bubble={bubbleOf(me)}
              bubbleSide="top"
            />
          </div>
        )}
        <div className="oc__hand">
          <div className="oc-actions">
            <span className={`action-hint ${iForgot ? 'is-alert' : ''}`}>{hint()}</span>
            {headline && v.phase === 'play' && !compact && (
              <span className="oc-log">{eventText(headline)}</span>
            )}
            {iForgot && (
              <button className="oc-uno is-alert" onClick={() => send({ type: 'uno' })}>
                一张！
              </button>
            )}
            {canArm && (
              <button
                className={`oc-uno ${armed ? 'is-on' : ''}`}
                onClick={() => {
                  setArmed((x) => !x);
                  playSound('select');
                }}
                aria-pressed={armed}
                title="出倒数第二张牌前先喊，否则可能被抓"
              >
                {armed ? '已喊一张' : '一张！'}
              </button>
            )}
            {canCatch && v.window && (
              <button className="oc-catch" onClick={() => send({ type: 'catch' })}>
                抓！{ctl.players[v.window.seat].name} 没喊
              </button>
            )}
            {myTurn && pending && (
              <>
                <Button size="sm" variant="felt" onClick={() => send({ type: 'draw' })}>
                  摸 {pending.amount} 张
                </Button>
                {pending.challengeable && (
                  <Button
                    size="sm"
                    variant="felt-primary"
                    onClick={() => send({ type: 'challenge' })}
                  >
                    质疑 +4
                  </Button>
                )}
              </>
            )}
            {myTurn && !pending && v.drawn !== null && (
              <Button size="sm" variant="felt" onClick={() => send({ type: 'keep' })}>
                留着
              </Button>
            )}
            {myTurn && !pending && v.drawn === null && (
              <Button
                size="sm"
                variant={playable.size ? 'felt' : 'felt-primary'}
                onClick={drawCard}
              >
                摸牌
              </Button>
            )}
          </div>
          {!spectator && (
            <Hand
              cards={sorted}
              playable={playable}
              active={myTurn}
              drawn={v.drawn}
              dealKey={v.round}
              onPlay={playCard}
            />
          )}
        </div>
      </div>

      {picker !== null && (
        <ColorPicker
          onPick={(c) => {
            const card = v.hand.find((x) => x.id === picker);
            if (card) playCard(card, c);
          }}
          onCancel={() => setPicker(null)}
        />
      )}

      <div className="oc-flyers" aria-hidden="true">
        {flyers.map((f) => (
          <FlyCard key={f.key} f={f} onDone={doneFlyer} />
        ))}
      </div>

      {v.phase !== 'play' && v.result && shownKey === resultKey && (
        <RoundResult ctl={ctl} v={v} me={me} spectator={spectator} />
      )}
    </div>
  );
}

/** 自己的手牌：扇形排开，能出的牌抬起，点一下就出 */
function Hand({
  cards,
  playable,
  active,
  drawn,
  dealKey,
  onPlay,
}: {
  cards: Card[];
  playable: Set<number>;
  active: boolean;
  drawn: number | null;
  dealKey: number;
  onPlay: (c: Card) => void;
}) {
  const [ref, width] = useWidth();
  const cw = useCssPx('var(--ocw)', width);
  const count = cards.length;
  const maxStep = cw * 0.74;
  const minStep = cw * 0.3;
  const step = count > 1 ? Math.max(minStep, Math.min(maxStep, (width - cw) / (count - 1))) : 0;
  const total = step * Math.max(0, count - 1) + cw;
  const x0 = Math.max(0, (width - total) / 2);
  return (
    <div ref={ref} className={`oc-hand ${active ? 'is-active' : ''}`}>
      {cards.map((c, i) => {
        const can = active && playable.has(c.id);
        return (
          <CardView
            key={`${dealKey}-${c.id}`}
            card={c}
            w="var(--ocw)"
            className={`oc-hand__card ${can ? 'is-playable' : active ? 'is-dim' : ''} ${drawn === c.id ? 'is-drawn' : ''}`}
            style={{ left: x0 + i * step, zIndex: i, animationDelay: `${Math.min(i * 40, 400)}ms` }}
            onClick={can ? () => onPlay(c) : undefined}
            attrs={{ 'data-cid': c.id }}
          />
        );
      })}
    </div>
  );
}

function ColorPicker({ onPick, onCancel }: { onPick: (c: Color) => void; onCancel: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onCancel]);
  return (
    <div className="oc-picker" role="dialog" aria-label="选择颜色" onClick={onCancel}>
      <div className="oc-picker__box" onClick={(e) => e.stopPropagation()}>
        <div className="oc-picker__title">选择接下来的颜色</div>
        <div className="oc-picker__grid">
          {OC.COLORS.map((c) => (
            <button
              key={c}
              className="oc-picker__btn"
              style={{ '--c': COLOR_HEX[c] } as CSSProperties}
              onClick={() => onPick(c)}
            >
              <span>{COLOR_LABEL[c]}</span>
            </button>
          ))}
        </div>
        <button className="oc-picker__cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

/** 从牌堆飞出的一张牌背 */
function FlyCard({ f, onDone }: { f: Flyer; onDone: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dx = f.to.left + f.to.width / 2 - (f.from.left + f.from.width / 2);
    const dy = f.to.top + f.to.height / 2 - (f.from.top + f.from.height / 2);
    const anim = el.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(14deg) scale(0.55)`, opacity: 0.2 },
      ],
      { duration: 520, delay: f.delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' },
    );
    anim.onfinish = () => onDone(f.key);
    return () => anim.cancel();
  }, [f, onDone]);
  return (
    <div
      ref={ref}
      className="oc-flyer"
      style={{ left: f.from.left, top: f.from.top, width: f.from.width }}
    >
      <CardView card={null} w={`${f.from.width}px`} />
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
  v: View;
  me: number;
  spectator: boolean;
}) {
  const r = v.result!;
  const matchOver = v.phase === 'matchOver';
  const n = v.counts.length;
  const order = matchOver ? v.ranking! : Array.from({ length: n }, (_, s) => s);
  const won = r.winner === me && !spectator;
  const readyCount = v.ready.filter(Boolean).length;
  useEffect(() => {
    if (!spectator) playSound(won ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.round]);
  const winnerName = won ? '你' : ctl.players[r.winner].name;
  const champion = matchOver ? v.ranking![0] : r.winner;

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
            {v.ready[me] ? `等待其他玩家 ${readyCount}/${n}` : '下一局'}
          </Button>
        )
      }
    >
      <div className="result">
        <div
          className={`result__title ${won || (matchOver && champion === me && !spectator) ? 'is-win' : 'is-lose'}`}
        >
          {matchOver && v.options.target
            ? champion === me && !spectator
              ? '你赢得了整场'
              : `${ctl.players[champion].name} 赢得整场`
            : won
              ? '你出完了！'
              : `${winnerName} 出完了手牌`}
        </div>
        <div className="result__sub">
          第 {r.round} 局 · {winnerName}拿下 <b>{r.points[r.winner]}</b> 分
          {v.options.target ? ` · 目标 ${v.options.target} 分` : ''}
        </div>
        <table className="result__table">
          <thead>
            <tr>
              <th>玩家</th>
              <th>剩下的牌</th>
              <th className="num">本局</th>
              {v.options.target > 0 && <th className="num">总分</th>}
            </tr>
          </thead>
          <tbody>
            {order.map((s) => (
              <tr key={s} className={s === me && !spectator ? 'is-me' : ''}>
                <td>
                  <span className="result__who">
                    <Avatar name={ctl.players[s].name} avatar={ctl.players[s].avatar} size={26} />
                    {ctl.players[s].name}
                  </span>
                </td>
                <td>
                  <span className="oc-res">
                    {s === r.winner ? (
                      <span className="mini-tag">出完</span>
                    ) : (
                      <>
                        {sortHand(r.hands[s]).map((c) => (
                          <CardView key={c.id} card={c} w="22px" />
                        ))}
                        <span className="oc-res__pts num">{r.handPoints[s]} 分</span>
                      </>
                    )}
                  </span>
                </td>
                <td className={`num ${r.points[s] > 0 ? 'delta-pos' : ''}`}>
                  {r.points[s] > 0 ? `+${r.points[s]}` : '—'}
                </td>
                {v.options.target > 0 && <td className="num">{v.scores[s]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
