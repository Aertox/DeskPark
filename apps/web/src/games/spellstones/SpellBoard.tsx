import type { ss } from '@park/engine';
import { ss as SS } from '@park/engine';
import { Dices } from 'lucide-react';
import type { CSSProperties, MouseEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Seat } from '../../components/Seat';
import { Button, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { signed } from '../../lib/format';
import { useSeatScale } from '../../lib/media';
import { playSound } from '../../lib/sound';
import { useCompact, useTurnCue } from '../shared/trick';
import { BOARD_ART, LifeTokens, SPELL_UI, Stone, Wizard } from './spells';
import './spellstones.css';

type Ctl = GameController<ss.SsView, ss.SsAction>;
type Spell = ss.Spell;
type View = ss.SsView;
type CastEvent = Extract<ss.SsEvent, { type: 'cast' | 'fail' }>;

/* ---------------- 图版几何（单位：board.svg 的 viewBox 760×900） ---------------- */
const MAT_W = 760;
const MAT_H = 900;
const RATIO = MAT_W / MAT_H;
const px = (x: number) => `${(x / MAT_W) * 100}%`;
const py = (y: number) => `${(y / MAT_H) * 100}%`;
/** 第 k 行（k 号咒语，共 k 格）第 i 格的中心 */
const cellAt = (k: Spell, i: number) => ({ x: 144 + 64 * i, y: 64 + (8 - k) * 101 });
/** 计分轨道：第 0 层是山脚的起点，1–8 层是图版上的金币 */
const TRACK: readonly (readonly [number, number])[] = [
  [228, 850],
  [294, 818],
  [352, 790],
  [410, 802],
  [468, 774],
  [526, 786],
  [584, 758],
  [642, 770],
  [700, 742],
];
/** 城堡里备用的猫头鹰魔法石 */
const CASTLE: readonly (readonly [number, number])[] = [
  [622, 452],
  [666, 452],
  [622, 516],
  [666, 516],
];

/* ---------------- 座位排布 ---------------- */
type Side = 'top' | 'left' | 'right';
interface Slot {
  side: Side;
  /** 侧边座位的垂直位置（占牌桌高度的比例） */
  y: number;
}
/** 对手从左手边开始顺时针排：左侧（下 → 上）、上方、右侧（上 → 下） */
function slotsFor(k: number, compact: boolean): Slot[] {
  const L = (y: number): Slot => ({ side: 'left', y });
  const R = (y: number): Slot => ({ side: 'right', y });
  const T: Slot = { side: 'top', y: 0 };
  if (k === 1) return compact ? [L(0.5)] : [T];
  if (k === 2) return [L(0.45), R(0.45)];
  // 矮屏上同一侧叠两位时尽量拉开，立绘才不会和上方的木架重叠
  if (k === 3) return compact ? [L(0.78), L(0.22), R(0.45)] : [L(0.58), T, R(0.58)];
  return compact ? [L(0.78), L(0.22), R(0.22), R(0.78)] : [L(0.74), L(0.26), R(0.26), R(0.74)];
}

/** 监听元素尺寸（回调 ref，元素出现 / 消失时自动挂载） */
function useBox() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) {
      setBox({ w: 0, h: 0 });
      return;
    }
    const update = () =>
      setBox((b) =>
        b.w === el.offsetWidth && b.h === el.offsetHeight
          ? b
          : { w: el.offsetWidth, h: el.offsetHeight },
      );
    ro.current = new ResizeObserver(update);
    ro.current.observe(el);
    update();
  }, []);
  return [ref, box] as const;
}

const spellLabel = (s: Spell) => `${s}号${SS.SPELL_NAME[s]}`;

interface Peek {
  spell: Spell;
  x: number;
  y: number;
  w: number;
}

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

  // ---- 最近一次施法：音效、气泡、生命飘字、法术特写 ----
  const last = useMemo(
    () => [...v.events].reverse().find((e): e is CastEvent => e.type !== 'end'),
    [v.events],
  );
  const mountSeq = useRef(v.events.at(-1)?.seq ?? 0);
  const soundSeq = useRef(mountSeq.current);
  useEffect(() => {
    if (!last || last.seq <= soundSeq.current) return;
    soundSeq.current = last.seq;
    if (last.type === 'fail') playSound('pass');
    else playSound(last.spell === 1 ? 'bomb' : 'play');
  }, [last]);
  // 出包或打空后回合会立刻结束（紧跟一条「结束回合」），特写与飘字仍然要播放；按 seq 作 key，不会重播
  const fresh = last && last.seq > mountSeq.current ? last : null;
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
        : `${SS.SPELL_NAME[last.spell]}……出包`
      : undefined;

  const cast = (spell: Spell) => {
    setPeek(null);
    const err = ctl.act({ type: 'cast', spell });
    if (err) toast(err, 'error');
  };
  const stop = () => {
    const err = ctl.act({ type: 'stop' });
    if (err) toast(err, 'error');
  };

  // ---- 点击魔法石查看魔法效果 ----
  const [peek, setPeek] = useState<Peek | null>(null);
  const openPeek = useCallback((spell: Spell, e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPeek({ spell, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width });
  }, []);
  const closePeek = useCallback(() => setPeek(null), []);

  // ---- 排布：图版居中，对手围坐在两侧 / 上方 ----
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);
  const slots = slotsFor(others.length, compact);
  const hasTop = slots.some((s) => s.side === 'top');
  const [arenaRef, arena] = useBox();
  const [topRef, topBox] = useBox();
  const W = arena.w;
  const H = arena.h;
  const topH = hasTop ? topBox.h + 10 : 0;
  let bh = Math.max(0, H - topH);
  let bw = bh * RATIO;
  const maxW = W * (compact ? 0.36 : 0.44);
  if (bw > maxW) {
    bw = maxW;
    bh = bw / RATIO;
  }
  const bx = (W - bw) / 2;
  const by = topH + (H - topH - bh) / 2;
  const colW = (W - bw) / 2;

  // 矮屏上标签会压住名字；座位本身就在左右两侧，不再显示
  const relOf = (s: number) =>
    spectator || compact
      ? undefined
      : n === 2
        ? '对手'
        : s === (me + 1) % n
          ? '左手边'
          : s === (me + n - 1) % n
            ? '右手边'
            : undefined;

  const seatSub = (s: number) => (
    <span className="ss-sub">
      <LifeTokens seat={s} life={v.players[s].life} size={compact ? 10 : 13} />
      <span className="ss-sub__lv">第 {Math.min(SS.TARGET, v.players[s].score)} 层</span>
    </span>
  );

  const floatEl = (s: number, extra = '') => {
    const d = deltaOf(s);
    return d !== 0 ? (
      <span key={fresh!.seq} className={`ss-float ${d > 0 ? 'is-up' : ''} ${extra}`}>
        {signed(d)}
      </span>
    ) : null;
  };

  /** 某位玩家面前的魔法石：别人的看得见（可点击），自己的只看得到背面 */
  const rackOf = (s: number, size: 'xs' | 'sm' | 'md') => {
    const p = v.players[s];
    if (p.rack) {
      return p.rack.map((x) => (
        <Stone
          key={x.id}
          spell={x.spell}
          size={size}
          onClick={(e) => openPeek(x.spell, e)}
          attrs={{ 'data-stone-id': x.id }}
        />
      ));
    }
    const ids = s === me && !spectator ? v.myRack : [];
    return Array.from({ length: p.rackCount }, (_, i) => (
      <Stone
        key={ids[i] ?? `b${i}`}
        spell={null}
        size={size}
        title={s === me ? '你看不到自己的魔法石' : undefined}
        attrs={ids[i] !== undefined ? { 'data-stone-id': ids[i] } : undefined}
      />
    ));
  };
  /** 盖在面前的猫头鹰魔法石：别人的是背面，自己的看得到 */
  const owlsOf = (s: number) => {
    const p = v.players[s];
    if (p.secretCount === 0) return null;
    return (
      <span className="ss-owls" title={`猫头鹰魔法石 ×${p.secretCount}：本轮存活每块多上 1 层`}>
        {p.secrets
          ? p.secrets.map((x) => (
              <Stone key={x.id} spell={x.spell} size="xs" onClick={(e) => openPeek(x.spell, e)} />
            ))
          : Array.from({ length: p.secretCount }, (_, i) => (
              <Stone key={i} spell={null} size="xs" />
            ))}
      </span>
    );
  };

  // ---- 图版上的魔法石：开局公开的在前，之后按施放顺序排进对应的一行 ----
  const placed = useMemo(() => {
    const out: { id: number; spell: Spell; i: number; removed: boolean }[] = [];
    for (const k of SS.SPELLS) {
      const row = [
        ...v.removed.filter((x) => x.spell === k).map((x) => ({ x, removed: true })),
        ...v.board.filter((x) => x.spell === k).map((x) => ({ x, removed: false })),
      ];
      row.forEach(({ x, removed }, i) => out.push({ id: x.id, spell: k, i, removed }));
    }
    return out;
  }, [v.board, v.removed]);

  // ---- 魔法石飞上图版（FLIP）：记住上一帧每块石头的位置 ----
  const rootRef = useRef<HTMLDivElement>(null);
  const rackRects = useRef(new Map<number, DOMRect>());
  const seenBoard = useRef<Set<number> | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || W === 0) return;
    const seen = seenBoard.current;
    const next = new Set<number>();
    root.querySelectorAll<HTMLElement>('[data-board-stone]').forEach((el) => {
      const id = Number(el.dataset.boardStone);
      next.add(id);
      if (!seen || seen.has(id)) return;
      const from = rackRects.current.get(id);
      const to = el.getBoundingClientRect();
      if (from && to.width > 0) {
        const dx = from.left + from.width / 2 - (to.left + to.width / 2);
        const dy = from.top + from.height / 2 - (to.top + to.height / 2);
        // 飞行途中整块图版提到座位上层，石头不会从别人的木架下面穿过
        const mat = el.closest<HTMLElement>('.ss-mat');
        mat?.classList.add('is-flying');
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})` },
            { transform: 'translate(0, 0) scale(1.3)', offset: 0.7 },
            { transform: 'none' },
          ],
          { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' },
        ).onfinish = () => mat?.classList.remove('is-flying');
      } else {
        el.animate(
          [
            { opacity: 0, transform: 'scale(.5)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: 320,
            easing: 'ease-out',
          },
        );
      }
    });
    seenBoard.current = next;
    const rects = new Map<number, DOMRect>();
    root
      .querySelectorAll<HTMLElement>('[data-stone-id]')
      .forEach((el) => rects.set(Number(el.dataset.stoneId), el.getBoundingClientRect()));
    rackRects.current = rects;
  });

  // ---- 本轮结束：先看完最后一击与指示物前进，再弹出结算 ----
  const resultKey = v.result && v.phase !== 'play' ? `${v.result.round}-${v.phase}` : '';
  const [shownKey, setShownKey] = useState(resultKey);
  useEffect(() => {
    if (!resultKey) return;
    const t = setTimeout(() => setShownKey(resultKey), 1500);
    return () => clearTimeout(t);
  }, [resultKey]);

  const eventText = (e: ss.SsEvent | undefined) => {
    if (!e) return v.phase === 'play' ? `第 ${v.round} 轮开始，${name(v.turn!)} 先手` : '';
    if (e.type === 'end') return `${name(e.seat)} 结束回合${e.drew ? `，补了 ${e.drew} 块` : ''}`;
    if (e.type === 'fail') {
      return `${name(e.seat)} 喊「${spellLabel(e.spell)}」——出包！${e.roll ? `火龙反噬掷出 ${e.roll}，` : ''}生命 −${e.loss}`;
    }
    const parts = e.deltas.map((d) => `${name(d.seat)} ${signed(d.delta)}`);
    if (e.spell === 4)
      parts.push(e.secret ? '拿到一块猫头鹰魔法石' : '城堡里的猫头鹰魔法石已经拿光了');
    return `${name(e.seat)} 施放 ${spellLabel(e.spell)}${e.roll ? `，掷出 ${e.roll}` : ''}${parts.length ? `：${parts.join('，')}` : ''}`;
  };
  const headline = v.events.at(-1);

  // 同一层的指示物错开摆放
  const tokens = v.players.map((p, s) => {
    const lv = Math.min(SS.TARGET, p.score);
    const same = v.players
      .map((q, t) => (Math.min(SS.TARGET, q.score) === lv ? t : -1))
      .filter((t) => t >= 0);
    const j = same.indexOf(s);
    const [x, y] = TRACK[lv];
    return { s, lv, x: x + (j - (same.length - 1) / 2) * 18, y: y - (j % 2) * 10 };
  });

  return (
    <div className="ss" ref={rootRef} style={{ '--k': scale } as CSSProperties}>
      <div className="ss__info info-chips top-info">
        <span className="chip">
          第 <b className="num">{v.round}</b> 轮
        </span>
        <span className="chip">
          牌库 <b className="num">{v.poolCount}</b>
        </span>
        <span className="chip" title="城堡里备用的猫头鹰魔法石">
          城堡猫头鹰 <b className="num">{v.secretCount}</b>
        </span>
        <span className="chip is-gold">
          目标 <b className="num">第 {SS.TARGET} 层</b>
        </span>
      </div>

      <div className={`ss__arena ${W === 0 ? 'is-measuring' : ''}`} ref={arenaRef}>
        <div
          className="ss-mat"
          style={{ left: bx, top: by, width: bw, height: bh, '--mw': `${bw}px` } as CSSProperties}
        >
          <img className="ss-mat__bg" src={BOARD_ART} alt="" draggable={false} />
          {SS.SPELLS.map((k) => (
            <button
              key={k}
              type="button"
              className="ss-mat__row"
              style={{ left: px(30), top: py(16 + (8 - k) * 101), width: px(82), height: py(94) }}
              onClick={(e) => openPeek(k, e)}
              title={`${spellLabel(k)}：点击查看魔法效果`}
              aria-label={spellLabel(k)}
            />
          ))}
          {placed.map((c) => {
            const { x, y } = cellAt(c.spell, c.i);
            return (
              <div
                key={c.id}
                className={`ss-mat__cell ${c.removed ? 'is-removed' : ''}`}
                style={{ left: px(x), top: py(y) }}
                data-board-stone={c.id}
              >
                <Stone
                  spell={c.spell}
                  size="fill"
                  dim={c.removed}
                  onClick={(e) => openPeek(c.spell, e)}
                  title={c.removed ? `${spellLabel(c.spell)}（开局公开）` : undefined}
                />
              </div>
            );
          })}
          {CASTLE.slice(0, v.secretCount).map(([x, y], i) => (
            <div
              key={i}
              className="ss-mat__owl"
              style={{ left: px(x), top: py(y) }}
              title={`城堡里还有 ${v.secretCount} 块猫头鹰魔法石`}
            >
              <Stone spell={null} size="fill" />
            </div>
          ))}
          {tokens.map((t) => (
            <div
              key={t.s}
              className={`ss-mat__token ${v.turn === t.s ? 'is-turn' : ''}`}
              style={{ left: px(t.x), top: py(t.y), zIndex: 3 + t.s }}
              title={`${ctl.players[t.s].name} · 第 ${t.lv} 层`}
            >
              <Wizard seat={t.s} />
            </div>
          ))}
          {fresh && <SpellFlash key={fresh.seq} e={fresh} who={name(fresh.seat)} />}
        </div>

        {W > 0 &&
          others.map((s, i) => {
            const slot = slots[i];
            const pos: CSSProperties =
              slot.side === 'top'
                ? { left: '50%', top: 0 }
                : { left: slot.side === 'left' ? colW / 2 : W - colW / 2, top: slot.y * H };
            return (
              <div
                key={s}
                ref={slot.side === 'top' ? topRef : undefined}
                className={`ss-opp side-${slot.side} ${v.turn === s ? 'is-turn' : ''}`}
                style={pos}
              >
                <Seat
                  player={ctl.players[s]}
                  active={v.turn === s}
                  deadline={ctl.deadlines[s]}
                  size={56}
                  layout={compact ? 'row' : 'column'}
                  sub={seatSub(s)}
                  tag={relOf(s)}
                  tagTone="plain"
                  bubble={bubbleOf(s)}
                  bubbleSide={slot.side === 'left' ? 'right' : 'left'}
                />
                <div className="ss-rack">
                  {rackOf(s, compact ? 'xs' : 'md')}
                  {owlsOf(s)}
                </div>
                {floatEl(s)}
              </div>
            );
          })}
      </div>

      <div className="ss__dock">
        <div className="ss__me">
          <Seat
            player={ctl.players[me]}
            active={v.phase === 'play' && v.turn === me}
            deadline={ctl.deadlines[me]}
            size={50}
            layout="row"
            sub={seatSub(me)}
            bubble={bubbleOf(me)}
            bubbleSide="top"
          />
          <div className="ss-rack is-mine">
            {rackOf(me, compact ? 'sm' : 'md')}
            {owlsOf(me)}
          </div>
          {floatEl(me, 'is-me')}
        </div>
        <div className="ss__spells">
          <div className="ss__hint">
            {(!compact || !myTurn) && <span className="ss-log">{eventText(headline)}</span>}
            {myTurn && (
              <span className="ss-cue">
                {v.chainMin === null
                  ? '轮到你：喊出一个咒语'
                  : `成功！可以继续喊 ${v.chainMin} 号或更大的（还能 ${SS.MAX_CHAIN - v.castThisTurn} 次）`}
              </span>
            )}
            {myTurn && v.castThisTurn > 0 && (
              <Button size="sm" variant="felt" onClick={stop}>
                结束回合
              </Button>
            )}
          </div>
          {!spectator && v.phase === 'play' && (
            <div className="ss-spellbar">
              {SS.SPELLS.map((s) => {
                const o = odds?.find((x) => x.spell === s);
                const locked = v.chainMin !== null && s < v.chainMin;
                const none = !!o && o.unknown === 0;
                const pctText = o ? `${Math.round(o.chance * 100)}%` : '';
                return (
                  <button
                    key={s}
                    className={`ss-spell ${none ? 'is-none' : ''} ${locked ? 'is-locked' : ''}`}
                    disabled={!myTurn || locked}
                    onClick={() => cast(s)}
                    title={`喊「${spellLabel(s)}」：${SS.SPELL_EFFECT[s]}${o ? `\n下落不明 ${o.unknown} 块，推算你面前有的概率约 ${pctText}` : ''}`}
                    style={{ '--c': SPELL_UI[s].color } as CSSProperties}
                  >
                    <Stone spell={s} size={compact ? 'xs' : 'sm'} />
                    <span className="ss-spell__text">
                      <b>{SS.SPELL_NAME[s]}</b>
                      <small>{SPELL_UI[s].short}</small>
                    </span>
                    {o && (
                      <span className="ss-spell__odds">
                        <i style={{ width: pctText }} />
                        <em className="num">{none ? '无' : pctText}</em>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {peek && (
        <PeekCard peek={peek} v={v} me={me} spectator={spectator} odds={odds} onClose={closePeek} />
      )}

      {v.phase !== 'play' && v.result && shownKey === resultKey && (
        <RoundResult ctl={ctl} v={v} me={me} spectator={spectator} />
      )}
    </div>
  );
}

/** 施法特写：魔法石放大、掷骰结果，出包时盖上印章 */
function SpellFlash({ e, who }: { e: CastEvent; who: string }) {
  return (
    <div className={`ss-flash ${e.type === 'fail' ? 'is-fail' : ''}`} aria-hidden="true">
      <span className="ss-flash__stone">
        <Stone spell={e.spell} size="fill" />
        {e.type === 'fail' && <span className="ss-flash__stamp">出包</span>}
      </span>
      <span className="ss-flash__text">
        <b>{who}</b>{' '}
        {e.type === 'fail' ? `喊「${SS.SPELL_NAME[e.spell]}」` : SS.SPELL_NAME[e.spell]}
        {e.roll !== undefined && (
          <span className="ss-die">
            <Dices size={13} />
            <b className="num">{e.roll}</b>
          </span>
        )}
      </span>
    </div>
  );
}

/** 点击魔法石弹出的效果卡 */
function PeekCard({
  peek,
  v,
  me,
  spectator,
  odds,
  onClose,
}: {
  peek: Peek;
  v: View;
  me: number;
  spectator: boolean;
  odds: ss.SpellOdds[] | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 10;
    let left = peek.x + peek.w / 2 + gap;
    if (left + w > window.innerWidth - 8) left = peek.x - peek.w / 2 - gap - w;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    const top = Math.max(8, Math.min(window.innerHeight - h - 8, peek.y - h / 2));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }, [peek]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const k = peek.spell;
  const count = (list: { spell: Spell }[] | null | undefined) =>
    list?.filter((x) => x.spell === k).length ?? 0;
  const onBoard = count(v.board);
  const removed = count(v.removed);
  const inRacks = v.players.reduce((a, p) => a + count(p.rack), 0);
  const mine = spectator ? 0 : count(v.players[me].secrets);
  const unknown = Math.max(0, k - onBoard - removed - inRacks - mine);
  const o = odds?.find((x) => x.spell === k);

  return (
    <div
      ref={ref}
      className="ss-peek"
      role="dialog"
      aria-label={`${k} 号 ${SS.SPELL_NAME[k]}`}
      style={{ '--c': SPELL_UI[k].color } as CSSProperties}
    >
      <Stone spell={k} size="xl" className="ss-peek__stone" />
      <div className="ss-peek__body">
        <div className="ss-peek__title">
          <span className="num">{k}</span> 号 · {SS.SPELL_NAME[k]}
        </div>
        <p className="ss-peek__effect">{SS.SPELL_EFFECT[k]}</p>
        <div className="ss-peek__stats">
          <span>
            共 <b className="num">{k}</b> 块
          </span>
          <span>
            图版上 <b className="num">{onBoard}</b>
          </span>
          {removed > 0 && (
            <span>
              开局公开 <b className="num">{removed}</b>
            </span>
          )}
          <span>
            别人面前 <b className="num">{inRacks}</b>
          </span>
          {mine > 0 && (
            <span>
              你的猫头鹰石 <b className="num">{mine}</b>
            </span>
          )}
          <span>
            下落不明 <b className="num">{unknown}</b>
          </span>
        </div>
        {o && v.phase === 'play' && (
          <div className="ss-peek__odds">
            推算你面前有：<b className="num">{Math.round(o.chance * 100)}%</b>
          </div>
        )}
      </div>
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
  const n = v.players.length;
  const order = matchOver ? v.ranking! : Array.from({ length: n }, (_, s) => s);
  const winners = v.winners ?? [];
  const who = (s: number) => (s === me && !spectator ? '你' : ctl.players[s].name);
  const reason =
    r.reason === 'empty'
      ? `牌库用完，${who(r.winner!)} 最先打空了面前的魔法石`
      : r.reason === 'knockout'
        ? `${who(r.winner!)} 击倒了 ${r.knocked.map(who).join('、')}`
        : `${r.knocked.map(who).join('、')} 喊错咒语，被魔法反噬倒下`;
  const won = matchOver ? winners.includes(me) : r.winner === me;
  const readyCount = v.ready.filter(Boolean).length;
  useEffect(() => {
    if (!spectator) playSound(won || (!matchOver && (r.points[me] ?? 0) > 0) ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.round]);

  const title = matchOver
    ? winners.length > 1
      ? `${winners.map(who).join('、')} 共同获胜`
      : winners[0] === me && !spectator
        ? '你最先登上第 8 层'
        : `${ctl.players[winners[0] ?? order[0]].name} 获胜`
    : r.winner === null
      ? '本轮没有赢家'
      : r.winner === me && !spectator
        ? '你赢下了本轮'
        : `${ctl.players[r.winner].name} 赢下本轮`;

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
        <div className={`result__title ${won && !spectator ? 'is-win' : 'is-lose'}`}>{title}</div>
        <div className="result__sub">
          第 {r.round} 轮 · {reason}
        </div>
        <table className="result__table">
          <thead>
            <tr>
              <th>魔法师</th>
              <th>本轮</th>
              <th className="num">前进</th>
              <th className="num">层数</th>
            </tr>
          </thead>
          <tbody>
            {order.map((s) => {
              const p = v.players[s];
              return (
                <tr key={s} className={s === me && !spectator ? 'is-me' : ''}>
                  <td>
                    <span className="result__who">
                      <Wizard seat={s} size={26} />
                      {ctl.players[s].name}
                    </span>
                  </td>
                  <td className="ss-res">
                    {matchOver && winners.includes(s) && <span className="mini-tag">获胜</span>}
                    {s === r.winner && <span className="mini-tag">本轮赢家</span>}
                    {r.knocked.includes(s) && <span className="mini-tag is-plain">倒下</span>}
                    {r.secretPoints[s] > 0 && (
                      <span className="mini-tag is-plain">猫头鹰 +{r.secretPoints[s]}</span>
                    )}
                    <span className="ss-res__rack">
                      {(p.rack ?? []).map((x) => (
                        <Stone key={x.id} spell={x.spell} size="xs" />
                      ))}
                    </span>
                  </td>
                  <td className={`num ${r.points[s] > 0 ? 'delta-pos' : ''}`}>+{r.points[s]}</td>
                  <td className="num">{Math.min(SS.TARGET, p.score)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
