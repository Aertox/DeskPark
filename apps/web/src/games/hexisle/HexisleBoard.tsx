import type { hi } from '@park/engine';
import { hi as HI } from '@park/engine';
import { Award, Dices, Handshake, Layers, Minus, Plus, Route, Swords } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Seat } from '../../components/Seat';
import { Button, Segmented, Sheet, toast } from '../../components/ui';
import type { GameController } from '../../lib/controller';
import { playSound } from '../../lib/sound';
import { useSeatScale } from '../../lib/media';
import { useCompact, useTurnCue } from '../shared/trick';
import { DevCard, Die, RES_LABEL, ResCard, devLabel, pcolor } from './art';
import { HexBoard } from './HexBoard';
import './hexisle.css';

type Ctl = GameController<hi.HiView, hi.HiAction>;
type Res = hi.Res;
type ResMap = hi.ResMap;
type View = hi.HiView;
type Mode = 'road' | 'settlement' | 'city' | null;

const R = HI.RESOURCES;
const emptyRes = HI.emptyRes;
const total = HI.resTotal;
const { HEX_VERTS } = HI.geo;

function CostChips({ cost }: { cost: Partial<ResMap> }) {
  return (
    <span className="hi-cost">
      {R.flatMap((r) =>
        Array.from({ length: cost[r] ?? 0 }, (_, i) => (
          <ResCard key={`${r}${i}`} res={r} size="xs" />
        )),
      )}
    </span>
  );
}

function ResLine({ m }: { m: ResMap }) {
  return (
    <span className="hi-resline">
      {R.filter((r) => m[r]).map((r) => (
        <span key={r} className="hi-resline__item">
          <ResCard res={r} size="xs" />
          <b className="num">×{m[r]}</b>
        </span>
      ))}
    </span>
  );
}

function Stepper({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <span className="hi-step">
      <button
        type="button"
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
        aria-label="减少"
      >
        <Minus size={12} />
      </button>
      <b className="num">{value}</b>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="增加"
      >
        <Plus size={12} />
      </button>
    </span>
  );
}

/** 拓岛记牌桌 */
export default function HexisleBoard({ ctl }: { ctl: Ctl }) {
  const v = ctl.view!;
  const me = ctl.seat ?? 0;
  const spectator = ctl.seat === null;
  const compact = useCompact();
  const scale = useSeatScale();
  const mine = v.players[me];
  const hand = mine.hand ?? emptyRes();
  const name = (s: number) => (s === me && !spectator ? '你' : ctl.players[s].name);
  const over = v.phase === 'over';
  const myTurn = !spectator && !over && v.turn === me && v.phase !== 'discard';
  const iDiscard = !spectator && v.phase === 'discard' && v.discard[me] > 0;
  const iRespond = !spectator && !!v.trade && v.trade.waiting.includes(me);
  useTurnCue((myTurn && !v.trade) || iDiscard || iRespond);

  const [mode, setMode] = useState<Mode>(null);
  const [panel, setPanel] = useState<null | 'trade' | 'plenty' | 'monopoly'>(null);
  const [victimPick, setVictimPick] = useState<{ hex: number; victims: number[] } | null>(null);
  useEffect(() => {
    if (!myTurn || v.phase !== 'main' || v.trade) setMode(null);
  }, [myTurn, v.phase, v.trade]);

  const send = (action: hi.HiAction) => {
    const err = ctl.act(action);
    if (err) toast(err, 'error');
    return !err;
  };

  // ---- 地图上可以点的位置 ----
  const spots = useMemo(() => {
    const out = { v: [] as number[], e: [] as number[], h: [] as number[] };
    if (spectator || over) return out;
    if (v.phase === 'setup' && v.turn === me) {
      if (v.setupVertex === null) out.v = HI.settlementSpots(v, me, true);
      else out.e = HI.roadSpots(v, me);
    } else if (myTurn && v.phase === 'roadBuilding') out.e = HI.roadSpots(v, me);
    else if (myTurn && v.phase === 'robber') {
      out.h = v.hexes.map((_, h) => h).filter((h) => h !== v.robber && friendlyOk(v, h));
    } else if (myTurn && v.phase === 'main' && !v.trade) {
      if (mode === 'road') out.e = HI.roadSpots(v, me);
      if (mode === 'settlement') out.v = HI.settlementSpots(v, me, false);
      if (mode === 'city') out.v = HI.citySpots(v, me);
    }
    return out;
  }, [v, me, spectator, over, myTurn, mode]);

  const onVertex = (at: number) => {
    if (v.phase === 'setup') send({ type: 'settle', at });
    else if (mode === 'city' && send({ type: 'city', at })) setMode(null);
    else if (mode === 'settlement' && send({ type: 'settle', at })) setMode(null);
  };
  const onEdge = (at: number) => {
    if (!send({ type: 'road', at })) return;
    // 连续修路：钱还够就保持修路模式
    const left = { ...hand, wood: hand.wood - 1, brick: hand.brick - 1 };
    if (mode === 'road' && !(left.wood >= 1 && left.brick >= 1)) setMode(null);
  };
  const onHex = (h: number) => {
    const victims = new Set<number>();
    for (const x of HEX_VERTS[h]) {
      const b = v.buildings[x];
      if (b && b.owner !== me && v.players[b.owner].cards > 0) victims.add(b.owner);
    }
    const list = [...victims];
    if (list.length > 1) setVictimPick({ hex: h, victims: list });
    else
      send(list.length ? { type: 'robber', hex: h, victim: list[0] } : { type: 'robber', hex: h });
  };

  // ---- 事件：音效、骰子、产出提示 ----
  const lastSeq = useRef(v.events.at(-1)?.seq ?? 0);
  const [rolled, setRolled] = useState<{ sum: number; key: number } | null>(null);
  const [gains, setGains] = useState<{ key: number; gains: ResMap[] } | null>(null);
  useEffect(() => {
    const fresh = v.events.filter((e) => e.seq > lastSeq.current);
    if (!fresh.length) return;
    lastSeq.current = fresh.at(-1)!.seq;
    for (const e of fresh) {
      switch (e.type) {
        case 'roll':
          playSound('deal');
          setRolled({ sum: e.dice[0] + e.dice[1], key: e.seq });
          break;
        case 'produce':
          if (e.gains.some((g) => total(g) > 0)) {
            playSound('chip');
            setGains({ key: e.seq, gains: e.gains });
          }
          break;
        case 'place':
          playSound('play');
          break;
        case 'robber':
        case 'steal':
          playSound('bomb');
          break;
        case 'trade':
          if (e.partner !== null) playSound('chip');
          break;
        case 'award':
          if (e.seat !== null) playSound('select');
          break;
        default:
          break;
      }
    }
  }, [v.events]);
  useEffect(() => {
    if (!gains) return;
    const t = setTimeout(() => setGains(null), 2600);
    return () => clearTimeout(t);
  }, [gains]);
  const lastRoll = useMemo(
    () => [...v.events].reverse().find((e) => e.type === 'roll'),
    [v.events],
  );

  const eventText = (e: hi.HiEvent): string => {
    switch (e.type) {
      case 'place':
        return `${name(e.seat)}${e.what === 'road' ? '修了一条路' : e.what === 'city' ? '升级了一座城市' : '建了一个村庄'}`;
      case 'roll':
        return `${name(e.seat)}掷出 ${e.dice[0]} + ${e.dice[1]} = ${e.dice[0] + e.dice[1]}`;
      case 'produce': {
        const parts = e.gains
          .map((g, s) =>
            total(g)
              ? `${name(s)} ${R.filter((r) => g[r])
                  .map((r) => `${RES_LABEL[r]}×${g[r]}`)
                  .join(' ')}`
              : '',
          )
          .filter(Boolean);
        return parts.length ? `产出：${parts.join('；')}` : '这次没有产出';
      }
      case 'discard':
        return `${name(e.seat)}弃了 ${total(e.cards)} 张牌`;
      case 'robber':
        return `${name(e.seat)}移动了强盗`;
      case 'steal':
        return `${name(e.seat)}从${name(e.victim)}手里抽了${e.res ? `一张${RES_LABEL[e.res]}` : '一张牌'}`;
      case 'buy':
        return `${name(e.seat)}买了一张发展卡${e.kind ? `（${devLabel(e.kind)}）` : ''}`;
      case 'dev':
        if (e.kind === 'plenty')
          return `${name(e.seat)}打出丰收之年，拿了 ${e.res!.map((r) => RES_LABEL[r]).join('、')}`;
        if (e.kind === 'monopoly')
          return `${name(e.seat)}打出垄断：${RES_LABEL[e.res![0]]}，拿走 ${e.taken} 张`;
        return `${name(e.seat)}打出${devLabel(e.kind)}`;
      case 'bank':
        return `${name(e.seat)}用 ${e.count} 张${RES_LABEL[e.give]}换了 1 张${RES_LABEL[e.get]}`;
      case 'offer':
        return `${name(e.seat)}发起交易`;
      case 'trade':
        return e.partner === null
          ? `${name(e.seat)}的交易没有成交`
          : `${name(e.seat)}与${name(e.partner)}成交`;
      case 'award':
        return e.seat === null
          ? `${e.what === 'road' ? '最长道路' : '最大军队'}暂时没人持有`
          : `${name(e.seat)}拿到${e.what === 'road' ? '最长道路' : '最大军队'}（+2 分）`;
      case 'end':
        return `${name(e.seat)}结束回合`;
    }
  };

  // ---- 提示与操作 ----
  const hint = (): string => {
    if (over) return '';
    if (iDiscard) return `掷出 7：你要弃掉 ${v.discard[me]} 张牌`;
    if (iRespond) return `${ctl.players[v.trade!.from].name}向你发起交易`;
    if (!myTurn) {
      if (v.phase === 'discard') return '等待其他人弃牌…';
      if (v.trade) return `${ctl.players[v.trade.from].name}的交易等待回应…`;
      return `等待 ${ctl.players[v.turn].name}${v.phase === 'setup' ? '摆放' : ''}…`;
    }
    switch (v.phase) {
      case 'setup':
        return v.setupVertex === null
          ? `开局第 ${v.setupRound} 轮：在发光的路口放一个村庄${v.setupRound === 2 ? '（旁边的地形各给你 1 张资源）' : ''}`
          : '修一条连着这个村庄的路';
      case 'roll':
        return '掷骰子开始你的回合（也可以先打出骑士）';
      case 'robber':
        return '把强盗移到另一块地上（会挡住那块地的产出）';
      case 'roadBuilding':
        return `道路建设：免费修路，还剩 ${v.freeRoads} 条`;
      case 'main':
        if (v.trade) return '等待其他人回应你的交易…';
        if (mode === 'road') return '点一条发光的边修路';
        if (mode === 'settlement') return '点一个发光的路口建村庄';
        if (mode === 'city') return '点自己的村庄升级为城市';
        return '建造、交易，或者结束回合';
      default:
        return '';
    }
  };

  const canBuild = (b: hi.Build) =>
    myTurn && v.phase === 'main' && !v.trade && HI.canAfford(viewState(v), me, b);
  const buildBtn = (b: 'road' | 'settlement' | 'city', label: string, icon: ReactNode) => {
    const can = canBuild(b);
    const spotsFor =
      b === 'road'
        ? HI.roadSpots(v, me)
        : b === 'settlement'
          ? HI.settlementSpots(v, me, false)
          : HI.citySpots(v, me);
    return (
      <button
        type="button"
        className={`hi-build ${mode === b ? 'is-on' : ''}`}
        disabled={!can || !spotsFor.length}
        onClick={() => setMode(mode === b ? null : b)}
        title={`${label}：${R.filter((r) => HI.COST[b][r])
          .map((r) => `${RES_LABEL[r]}×${HI.COST[b][r]}`)
          .join(' ')}`}
      >
        <span className="hi-build__name">
          {icon}
          {label}
        </span>
        <CostChips cost={HI.COST[b]} />
      </button>
    );
  };

  // 发展卡分组
  const devGroups = useMemo(() => {
    const m = new Map<hi.DevKind, { kind: hi.DevKind; count: number; ready: boolean }>();
    for (const d of mine.devs ?? []) {
      const g = m.get(d.kind) ?? { kind: d.kind, count: 0, ready: false };
      g.count++;
      if (d.bought < v.turnNo) g.ready = true;
      m.set(d.kind, g);
    }
    return [...m.values()];
  }, [mine.devs, v.turnNo]);
  const canPlayDev =
    myTurn && !v.devPlayed && (v.phase === 'roll' || (v.phase === 'main' && !v.trade));
  const playDev = (k: hi.DevKind) => {
    if (k === 'knight' || k === 'road') send({ type: 'dev', kind: k });
    else if (k === 'plenty' || k === 'monopoly') setPanel(k);
  };

  const dice = lastRoll?.type === 'roll' ? lastRoll.dice : null;

  return (
    <div className="hi" style={{ '--k': scale } as CSSProperties}>
      <div className="info-chips top-info">
        <span className="chip">
          第 <b className="num">{Math.max(1, v.turnNo)}</b> 回合
        </span>
        <span className="chip is-gold">
          目标 <b className="num">{v.options.target}</b> 分
        </span>
        <span className="chip">
          发展卡 <b className="num">{v.devLeft}</b>
        </span>
      </div>

      <div className="hi__main">
        <div className="hi__board">
          <HexBoard
            view={v}
            spotsV={spots.v}
            spotsE={spots.e}
            spotsH={spots.h}
            onVertex={onVertex}
            onEdge={onEdge}
            onHex={onHex}
            rolled={rolled}
          />
          {dice && (
            <div className="hi-dice" key={lastRoll!.seq} title={`掷出 ${dice[0] + dice[1]}`}>
              <Die value={dice[0]} rolling />
              <Die value={dice[1]} rolling />
              <b className="num">{dice[0] + dice[1]}</b>
            </div>
          )}
        </div>

        <aside className="hi__side">
          {v.players.map((p, s) => {
            const g = gains?.gains[s];
            return (
              <div
                key={s}
                className={`hi-player ${v.turn === s && !over ? 'is-turn' : ''} ${s === me && !spectator ? 'is-me' : ''}`}
                style={{ '--pc': pcolor(s) } as CSSProperties}
              >
                <Seat
                  player={ctl.players[s]}
                  active={
                    !over &&
                    (v.phase === 'discard'
                      ? v.discard[s] > 0
                      : v.trade
                        ? v.trade.waiting.includes(s)
                        : v.turn === s)
                  }
                  deadline={ctl.deadlines[s]}
                  size={40}
                  layout="row"
                  sub={
                    <span className="hi-player__stats">
                      <span title="手牌">
                        <Layers size={11} />
                        {p.cards}
                      </span>
                      <span title="发展卡">
                        <Award size={11} />
                        {p.devCount}
                      </span>
                      <span title="骑士">
                        <Swords size={11} />
                        {p.knights}
                      </span>
                      <span title="最长道路">
                        <Route size={11} />
                        {p.roadLength}
                      </span>
                    </span>
                  }
                  bubbleSide="left"
                />
                <div
                  className="hi-player__vp"
                  title={
                    p.vpTotal !== null && p.vpTotal !== p.vp
                      ? `含分数卡共 ${p.vpTotal} 分`
                      : undefined
                  }
                >
                  <b className="num">{p.vpTotal ?? p.vp}</b>
                  <small>分</small>
                </div>
                <div className="hi-player__tags">
                  {v.longestRoad === s && <span className="mini-tag">最长道路</span>}
                  {v.largestArmy === s && <span className="mini-tag">最大军队</span>}
                  {g && total(g) > 0 && (
                    <span className="hi-gain" key={gains!.key}>
                      +<ResLine m={g} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {!compact && (
            <ol className="hi-log">
              {[...v.events]
                .reverse()
                .filter((e) => e.type !== 'offer')
                .slice(0, 7)
                .map((e) => (
                  <li key={e.seq}>{eventText(e)}</li>
                ))}
            </ol>
          )}
        </aside>
      </div>

      <div className="hi__dock">
        {!spectator && (
          <div className="hi-hand">
            {R.map((r) => (
              <ResCard key={r} res={r} count={hand[r]} size={compact ? 'sm' : 'md'} />
            ))}
            {devGroups.length > 0 && <span className="hi-hand__sep" />}
            {devGroups.map((g) => (
              <DevCard
                key={g.kind}
                kind={g.kind}
                count={g.count}
                fresh={!g.ready && g.kind !== 'vp'}
                onClick={g.kind === 'vp' ? undefined : () => playDev(g.kind)}
                disabled={!canPlayDev || !g.ready}
                title={`${devLabel(g.kind)}：${HI.DEV_EFFECT[g.kind]}${!g.ready && g.kind !== 'vp' ? '（本回合刚买，下回合才能用）' : ''}`}
              />
            ))}
          </div>
        )}
        <div className="hi-actions">
          <span className="action-hint">{hint()}</span>
          <div className="hi-actions__row">
            {myTurn && v.phase === 'roll' && (
              <Button variant="felt-primary" onClick={() => send({ type: 'roll' })}>
                <Dices size={16} /> 掷骰子
              </Button>
            )}
            {myTurn && v.phase === 'roadBuilding' && (
              <Button size="sm" variant="felt" onClick={() => send({ type: 'end' })}>
                不修了
              </Button>
            )}
            {myTurn && v.phase === 'main' && !v.trade && (
              <>
                <div className="hi-builds">
                  {buildBtn('road', '道路', null)}
                  {buildBtn('settlement', '村庄', null)}
                  {buildBtn('city', '城市', null)}
                  <button
                    type="button"
                    className="hi-build"
                    disabled={!canBuild('dev')}
                    onClick={() => send({ type: 'buy' })}
                    title="发展卡：羊毛×1 小麦×1 矿石×1"
                  >
                    <span className="hi-build__name">发展卡</span>
                    <CostChips cost={HI.COST.dev} />
                  </button>
                </div>
                <Button size="sm" variant="felt" onClick={() => setPanel('trade')}>
                  <Handshake size={14} /> 交易
                </Button>
                <Button size="sm" variant="felt-primary" onClick={() => send({ type: 'end' })}>
                  结束回合
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {iRespond && <OfferCard v={v} ctl={ctl} me={me} send={send} />}
      {iDiscard && <DiscardSheet need={v.discard[me]} hand={hand} send={send} />}
      {victimPick && (
        <Sheet open title="从谁手里抽一张牌？" onClose={() => setVictimPick(null)}>
          <div className="hi-victims">
            {victimPick.victims.map((s) => (
              <button
                key={s}
                type="button"
                className="hi-victim"
                onClick={() => {
                  send({ type: 'robber', hex: victimPick.hex, victim: s });
                  setVictimPick(null);
                }}
              >
                <Avatar name={ctl.players[s].name} avatar={ctl.players[s].avatar} size={40} />
                <span>{ctl.players[s].name}</span>
                <small>
                  {v.players[s].cards} 张牌 · {v.players[s].vp} 分
                </small>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {panel === 'trade' && (
        <TradeSheet v={v} me={me} hand={hand} send={send} onClose={() => setPanel(null)} />
      )}
      {(panel === 'plenty' || panel === 'monopoly') && (
        <PickSheet kind={panel} bank={v.bank} send={send} onClose={() => setPanel(null)} />
      )}
      {over && <GameOver v={v} ctl={ctl} me={me} spectator={spectator} />}
    </div>
  );
}

/** 视图里足够判断「买不买得起」的部分 */
function viewState(v: View): hi.HiState {
  return {
    players: v.players.map((p) => ({
      hand: p.hand ?? emptyRes(),
      roads: p.roads,
      settlements: p.settlements,
      cities: p.cities,
    })),
    devDeck: { length: v.devLeft },
  } as unknown as hi.HiState;
}

function friendlyOk(v: View, hex: number): boolean {
  if (!v.options.friendly) return true;
  return HEX_VERTS[hex].every((x) => {
    const b = v.buildings[x];
    return !b || b.owner === v.turn || v.players[b.owner].vp > 2;
  });
}

function OfferCard({
  v,
  ctl,
  me,
  send,
}: {
  v: View;
  ctl: Ctl;
  me: number;
  send: (a: hi.HiAction) => boolean;
}) {
  const t = v.trade!;
  const hand = v.players[me].hand!;
  const can = R.every((r) => hand[r] >= t.want[r]);
  return (
    <div className="hi-offer" role="dialog" aria-label="交易邀请">
      <div className="hi-offer__who">
        <Avatar name={ctl.players[t.from].name} avatar={ctl.players[t.from].avatar} size={28} />
        <b>{ctl.players[t.from].name}</b> 想交易
      </div>
      <div className="hi-offer__deal">
        <span>
          你得到
          <ResLine m={t.give} />
        </span>
        <span>
          你付出
          <ResLine m={t.want} />
        </span>
      </div>
      <div className="hi-offer__btns">
        <Button size="sm" onClick={() => send({ type: 'reject' })}>
          拒绝
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!can}
          onClick={() => send({ type: 'accept' })}
        >
          接受
        </Button>
      </div>
    </div>
  );
}

function DiscardSheet({
  need,
  hand,
  send,
}: {
  need: number;
  hand: ResMap;
  send: (a: hi.HiAction) => boolean;
}) {
  const [pick, setPick] = useState<ResMap>(emptyRes);
  const count = total(pick);
  return (
    <Sheet
      open
      dismissible={false}
      title={`掷出了 7：弃掉 ${need} 张牌`}
      subtitle="手牌超过 7 张的人要弃掉一半"
      footer={
        <Button
          variant="primary"
          block
          disabled={count !== need}
          onClick={() => send({ type: 'discard', cards: pick })}
        >
          弃牌（{count} / {need}）
        </Button>
      }
    >
      <div className="hi-pickgrid">
        {R.map((r) => (
          <div key={r} className="hi-pickrow">
            <ResCard res={r} count={hand[r]} size="sm" />
            <Stepper
              value={pick[r]}
              max={Math.min(hand[r], need - count + pick[r])}
              onChange={(x) => setPick({ ...pick, [r]: x })}
            />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function PickSheet({
  kind,
  bank,
  send,
  onClose,
}: {
  kind: 'plenty' | 'monopoly';
  bank: ResMap;
  send: (a: hi.HiAction) => boolean;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<Res[]>([]);
  const need = kind === 'plenty' ? 2 : 1;
  const counts = emptyRes();
  for (const r of pick) counts[r]++;
  return (
    <Sheet
      open
      title={kind === 'plenty' ? '丰收之年：从银行拿 2 张资源' : '垄断：选一种资源'}
      subtitle={HI.DEV_EFFECT[kind]}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          block
          disabled={pick.length !== need}
          onClick={() => send({ type: 'dev', kind, res: pick }) && onClose()}
        >
          确定
        </Button>
      }
    >
      <div className="hi-pickline">
        {R.map((r) => (
          <ResCard
            key={r}
            res={r}
            count={kind === 'plenty' ? counts[r] || undefined : undefined}
            selected={counts[r] > 0}
            disabled={kind === 'plenty' && bank[r] <= counts[r]}
            onClick={() => {
              if (kind === 'monopoly') setPick([r]);
              else if (pick.length < 2) setPick([...pick, r]);
              else setPick([r]);
            }}
          />
        ))}
      </div>
      {kind === 'plenty' && pick.length > 0 && (
        <button type="button" className="hi-link" onClick={() => setPick([])}>
          重新选
        </button>
      )}
    </Sheet>
  );
}

function TradeSheet({
  v,
  me,
  hand,
  send,
  onClose,
}: {
  v: View;
  me: number;
  hand: ResMap;
  send: (a: hi.HiAction) => boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'bank' | 'player'>('bank');
  const rates = HI.tradeRates(v as unknown as hi.HiState, me);
  const [give, setGive] = useState<Res | null>(null);
  const [get, setGet] = useState<Res | null>(null);
  const [offerGive, setOfferGive] = useState<ResMap>(emptyRes);
  const [offerWant, setOfferWant] = useState<ResMap>(emptyRes);
  const left = HI.MAX_OFFERS - v.offersThisTurn;
  const validOffer =
    total(offerGive) > 0 &&
    total(offerWant) > 0 &&
    R.every((r) => !(offerGive[r] && offerWant[r])) &&
    left > 0;
  return (
    <Sheet open wide title="交易" onClose={onClose}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bank', label: '银行 / 港口' },
          { value: 'player', label: '和玩家交易' },
        ]}
      />
      {tab === 'bank' ? (
        <div className="hi-trade">
          <div className="hi-trade__label">给出（你的兑换比例）</div>
          <div className="hi-pickline">
            {R.map((r) => (
              <ResCard
                key={r}
                res={r}
                count={hand[r]}
                selected={give === r}
                disabled={hand[r] < rates[r]}
                onClick={() => setGive(r)}
                badge={<span className="hic__rate num">{rates[r]}:1</span>}
              />
            ))}
          </div>
          <div className="hi-trade__label">换取</div>
          <div className="hi-pickline">
            {R.map((r) => (
              <ResCard
                key={r}
                res={r}
                selected={get === r}
                disabled={r === give || v.bank[r] === 0}
                onClick={() => setGet(r)}
              />
            ))}
          </div>
          <Button
            variant="primary"
            block
            disabled={!give || !get || give === get || hand[give] < rates[give]}
            onClick={() => {
              if (give && get && send({ type: 'bank', give, get })) {
                if (hand[give] - rates[give] < rates[give]) setGive(null);
              }
            }}
          >
            {give && get
              ? `用 ${rates[give]} 张${RES_LABEL[give]}换 1 张${RES_LABEL[get]}`
              : '选择要给出和换取的资源'}
          </Button>
        </div>
      ) : (
        <div className="hi-trade">
          <div className="hi-trade__cols">
            <div>
              <div className="hi-trade__label">你给出</div>
              {R.map((r) => (
                <div key={r} className="hi-pickrow">
                  <ResCard res={r} count={hand[r]} size="sm" />
                  <Stepper
                    value={offerGive[r]}
                    max={hand[r]}
                    onChange={(x) => setOfferGive({ ...offerGive, [r]: x })}
                  />
                </div>
              ))}
            </div>
            <div>
              <div className="hi-trade__label">你想要</div>
              {R.map((r) => (
                <div key={r} className="hi-pickrow">
                  <ResCard res={r} size="sm" />
                  <Stepper
                    value={offerWant[r]}
                    max={4}
                    onChange={(x) => setOfferWant({ ...offerWant, [r]: x })}
                  />
                </div>
              ))}
            </div>
          </div>
          <Button
            variant="primary"
            block
            disabled={!validOffer}
            onClick={() => send({ type: 'offer', give: offerGive, want: offerWant }) && onClose()}
          >
            向所有人发起（本回合还能发起 {left} 次）
          </Button>
          <p className="hi-trade__note">
            付得起的人会收到邀请，最先接受的人成交；没人回应会自动作罢。
          </p>
        </div>
      )}
    </Sheet>
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
  const won = v.winner === me && !spectator;
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
          {won ? '你赢得了这座岛' : `${ctl.players[v.winner!].name} 获胜`}
        </div>
        <div className="result__sub">
          第 {v.turnNo} 回合 · 先到 {v.options.target} 分
        </div>
        <table className="result__table">
          <thead>
            <tr>
              <th>玩家</th>
              <th>得分构成</th>
              <th className="num">总分</th>
            </tr>
          </thead>
          <tbody>
            {v.ranking!.map((s) => {
              const p = v.players[s];
              const vpCards = p.devs?.filter((d) => d.kind === 'vp').length ?? 0;
              const parts = [
                p.settlements && `村庄 ${p.settlements}`,
                p.cities && `城市 ${p.cities}×2`,
                v.longestRoad === s && '最长道路 2',
                v.largestArmy === s && '最大军队 2',
                vpCards && `分数卡 ${vpCards}`,
              ].filter(Boolean);
              return (
                <tr key={s} className={s === me && !spectator ? 'is-me' : ''}>
                  <td>
                    <span className="result__who">
                      <span className="hi-swatch" style={{ '--pc': pcolor(s) } as CSSProperties} />
                      <Avatar name={ctl.players[s].name} avatar={ctl.players[s].avatar} size={26} />
                      {ctl.players[s].name}
                      {s === v.winner && <span className="mini-tag">获胜</span>}
                    </span>
                  </td>
                  <td className="hi-res-parts">{parts.join(' · ')}</td>
                  <td className="num">{p.vpTotal ?? p.vp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
