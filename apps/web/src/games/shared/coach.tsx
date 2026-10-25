import type { CoachMove, CoachReport } from '@park/engine';
import { ch, xq } from '@park/engine';
import type { ch as CH, xq as XQ } from '@park/engine';
import { GraduationCap, Lightbulb, Send, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import type { CoachGame, CoachView } from '../../lib/coach/analyze';
import { SOURCE_NAME, analyze, threats, warm } from '../../lib/coach/analyze';
import { askCoach, coachLlmReady, explainWithLlm } from '../../lib/coach/llm';
import { settings } from '../../lib/store';
import './coach.css';

/**
 * 棋类导师：和电脑下棋时，你在棋盘上选好一步，导师先帮你看看——
 * 引擎（Stockfish / Fairy-Stockfish，加载不了时用内置引擎）判断好坏，再讲清楚为什么；
 * 配置了大模型时，还会用更自然的话讲一遍，并回答追问。
 */

type Phase = 'idle' | 'thinking' | 'ready' | 'error';

interface CoachState {
  phase: Phase;
  /** try = 点评学生想走的一步；hint = 学生要提示 */
  mode: 'try' | 'hint';
  move: CoachMove | null;
  report: CoachReport | null;
  source: string;
  error?: string;
  llm: { status: 'off' | 'loading' | 'done' | 'error'; text: string };
  chat: { q: string; a: string }[];
  asking: boolean;
}

const EMPTY: CoachState = {
  phase: 'idle',
  mode: 'try',
  move: null,
  report: null,
  source: '',
  llm: { status: 'off', text: '' },
  chat: [],
  asking: false,
};

function contextOf(game: CoachGame, view: CoachView): string {
  const recent = view.moves
    .slice(-8)
    .map((m) => ('san' in m ? m.san : (m as XQ.XqMoveRec).text))
    .join(' ');
  if (game === 'chess') {
    const v = view as CH.ChView;
    const me = v.side === 'w' ? '白方' : '黑方';
    return `国际象棋，学生执${me}，轮到学生走。局面（FEN）：${ch.toFen(ch.toBoard(v), Math.floor(v.moves.length / 2) + 1)}。最近的着法：${recent || '（开局）'}`;
  }
  const v = view as XQ.XqView;
  const me = v.side === 'r' ? '红方' : '黑方';
  return `中国象棋，学生执${me}，轮到学生走。局面（FEN，大写为红方）：${xq.xiangqiFen(xq.toBoard(v))}。最近的着法：${recent || '（开局）'}`;
}

export function useCoach(
  game: CoachGame,
  view: CoachView,
  opts: { eligible: boolean; myTurn: boolean },
) {
  const { coach: enabled } = settings.use();
  const active = enabled && opts.eligible;
  const [st, setSt] = useState<CoachState>(EMPTY);
  const token = useRef(0);

  // 局面变了（走了一步、悔棋）就重新开始
  const key = `${view.moves.length}-${view.turn}-${view.phase}`;
  useEffect(() => {
    token.current++;
    setSt(EMPTY);
  }, [key]);

  const run = useCallback(
    (move: CoachMove | null) => {
      const my = ++token.current;
      setSt({ ...EMPTY, phase: 'thinking', mode: move ? 'try' : 'hint', move });
      analyze(game, view, move)
        .then(({ analysis, report }) => {
          if (token.current !== my) return;
          const llm = coachLlmReady();
          setSt((s) => ({
            ...s,
            phase: 'ready',
            report,
            source: SOURCE_NAME[analysis.source],
            llm: { status: llm ? 'loading' : 'off', text: '' },
          }));
          if (!llm) return;
          explainWithLlm(game, contextOf(game, view), report.facts)
            .then(
              (text) =>
                token.current === my && setSt((s) => ({ ...s, llm: { status: 'done', text } })),
            )
            .catch(
              () =>
                token.current === my &&
                setSt((s) => ({ ...s, llm: { status: 'error', text: '' } })),
            );
        })
        .catch((e) => {
          if (token.current === my)
            setSt((s) => ({ ...s, phase: 'error', error: String(e?.message ?? e) }));
        });
    },
    [game, view],
  );

  const ask = useCallback(
    (q: string) => {
      const report = st.report;
      if (!report || !q.trim()) return;
      const my = token.current;
      setSt((s) => ({ ...s, asking: true }));
      askCoach(game, contextOf(game, view), report.facts, st.chat, q.trim())
        .then(
          (a) =>
            token.current === my &&
            setSt((s) => ({ ...s, asking: false, chat: [...s.chat, { q: q.trim(), a }] })),
        )
        .catch(
          () =>
            token.current === my &&
            setSt((s) => ({
              ...s,
              asking: false,
              chat: [...s.chat, { q: q.trim(), a: '（大模型没有回应，稍后再试）' }],
            })),
        );
    },
    [game, view, st.report, st.chat],
  );

  const notes = useMemo(
    () => (active && opts.myTurn ? threats(game, view).slice(0, 2) : []),
    [active, opts.myTurn, game, view],
  );

  // 打开导师就先把引擎载入，第一次分析不用等下载
  useEffect(() => {
    if (active) warm(game);
  }, [active, game]);

  return {
    enabled,
    eligible: opts.eligible,
    active,
    state: st,
    /** 学生想走的这步交给导师；导师没开时返回 false，由调用方直接走 */
    propose: (move: CoachMove) => {
      if (!active || !opts.myTurn) return false;
      run(move);
      return true;
    },
    hint: () => run(null),
    clear: () => {
      token.current++;
      setSt(EMPTY);
    },
    ask,
    setEnabled: (on: boolean) => settings.set({ coach: on }),
    arrows:
      st.report?.arrows ??
      (st.move && st.phase === 'thinking'
        ? [{ from: st.move.from, to: st.move.to, kind: 'try' as const }]
        : []),
    idleNotes: st.phase === 'idle' ? notes : [],
  };
}

export type Coach = ReturnType<typeof useCoach>;

const GRADE_TONE: Record<string, string> = {
  best: 'is-best',
  good: 'is-good',
  ok: 'is-ok',
  inaccuracy: 'is-warn',
  mistake: 'is-bad',
  blunder: 'is-bad',
};

/** 局面评估：现在（按最佳着法走）→ 走了这步之后 */
function Outlook({ report: r }: { report: CoachReport }) {
  const { best, user } = r.outlook;
  if (!best && !user) return null;
  const same = user === null || user === best || r.grade === 'best' || r.grade === 'good';
  const tone = r.grade ? GRADE_TONE[r.grade] : '';
  return (
    <p className="coach__eval" title="引擎对局面的判断：现在 → 走了这步之后">
      <span>局面</span>
      {same ? (
        <b className={tone}>{user ?? best}</b>
      ) : (
        <>
          {best}
          <i>→</i>
          <b className={tone}>{user}</b>
        </>
      )}
    </p>
  );
}

export function CoachPanel({
  coach,
  myTurn,
  onCommit,
}: {
  coach: Coach;
  myTurn: boolean;
  onCommit: (m: CoachMove) => void;
}) {
  const st = coach.state;
  const [q, setQ] = useState('');
  // 有新内容（结论、讲解、回答）时滚到底
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = body.current;
    if (el && (st.chat.length || st.llm.status === 'done')) el.scrollTop = el.scrollHeight;
  }, [st.chat.length, st.llm.status, st.asking]);
  if (!coach.active) {
    return (
      <button type="button" className="coach-off" onClick={() => coach.setEnabled(true)}>
        <GraduationCap size={16} />
        <span>
          <b>开启导师</b>
          <small>每一步先帮你看看能不能走、为什么</small>
        </span>
      </button>
    );
  }
  const r = st.report;
  return (
    <section className="coach" aria-label="导师">
      <header className="coach__head">
        <GraduationCap size={16} />
        <b>导师</b>
        {st.source && <span className="coach__src">{st.source}</span>}
        <button
          type="button"
          className="coach__x"
          onClick={() => coach.setEnabled(false)}
          title="关闭导师"
        >
          <X size={14} />
        </button>
      </header>

      <div className="coach__body" ref={body}>
        {st.phase === 'idle' &&
          (myTurn ? (
            <>
              <p className="coach__lead">轮到你了。先在棋盘上选一步，我帮你看看能不能走。</p>
              {coach.idleNotes.map((n) => (
                <p key={n} className="coach__warn">
                  ⚠ {n}
                </p>
              ))}
              <Button size="sm" variant="felt" onClick={coach.hint}>
                <Lightbulb size={14} /> 没思路？给我提示
              </Button>
            </>
          ) : (
            <p className="coach__lead is-dim">等对方走完，轮到你时我再来帮你。</p>
          ))}

        {st.phase === 'thinking' && (
          <p className="coach__lead">
            <span className="coach__spin" />
            {st.mode === 'hint' ? '正在找好棋…' : '正在分析这一步…'}
          </p>
        )}

        {st.phase === 'error' && (
          <>
            <p className="coach__warn">分析失败：{st.error}</p>
            <Button size="sm" variant="felt" onClick={coach.clear}>
              知道了
            </Button>
          </>
        )}

        {st.phase === 'ready' && r && (
          <>
            <div className={`coach__verdict ${r.grade ? GRADE_TONE[r.grade] : 'is-hint'}`}>
              {r.title}
            </div>
            <Outlook report={r} />
            <ul className="coach__points">
              {r.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {r.bestLine && r.grade !== 'best' && (
              <p className="coach__line">
                <span>参考变化</span> {r.bestLine}
              </p>
            )}
            {st.llm.status === 'loading' && (
              <p className="coach__llm is-loading">
                <span className="coach__dots">
                  <i />
                  <i />
                  <i />
                </span>
                导师正在组织语言…
              </p>
            )}
            {st.llm.status === 'done' && <p className="coach__llm">{st.llm.text}</p>}
            {st.chat.map((c, i) => (
              <div key={i} className="coach__qa">
                <p className="coach__q">{c.q}</p>
                <p className="coach__a">{c.a}</p>
              </div>
            ))}
          </>
        )}
      </div>
      {st.phase === 'ready' && r && (
        <footer className="coach__foot">
          {st.llm.status !== 'off' && (
            <form
              className="coach__ask"
              onSubmit={(e) => {
                e.preventDefault();
                coach.ask(q);
                setQ('');
              }}
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={st.asking ? '导师正在回答…' : '有不懂的，问问导师'}
                disabled={st.asking}
                maxLength={120}
              />
              <button type="submit" disabled={st.asking || !q.trim()} aria-label="发送">
                <Send size={14} />
              </button>
            </form>
          )}
          <div className="coach__actions">
            {st.mode === 'try' && st.move ? (
              <>
                <Button size="sm" variant="felt" onClick={coach.clear}>
                  换一步
                </Button>
                <Button
                  size="sm"
                  variant={r.grade === 'mistake' || r.grade === 'blunder' ? 'felt' : 'felt-primary'}
                  onClick={() => onCommit(st.move!)}
                >
                  {r.grade === 'mistake' || r.grade === 'blunder' ? '我还是要走' : '就走这步'}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="felt" onClick={coach.clear}>
                好的，我自己想想
              </Button>
            )}
          </div>
        </footer>
      )}
    </section>
  );
}
