import type {
  CoachAnalysis,
  CoachLine,
  CoachMove,
  CoachReport,
  ch as CH,
  xq as XQ,
} from '@park/engine';
import { ch, xq } from '@park/engine';
import { EngineUnavailable, discard, fairySupported, loadFairy, loadStockfish } from './engines';
import type { CoachGame, GoOptions, UciEngine, UciLine } from './uci';
import { fromUci, toUci } from './uci';

export type { CoachGame };
export type CoachView = CH.ChView | XQ.XqView;

export const SOURCE_NAME: Record<CoachAnalysis['source'], string> = {
  stockfish: 'Stockfish 19',
  fairy: 'Fairy-Stockfish',
  local: '内置引擎',
};

function lineFrom(game: CoachGame, l: UciLine): CoachLine | null {
  const pv = l.pv.map((x) => fromUci(game, x)).filter((x): x is CoachMove => !!x);
  if (!pv.length) return null;
  return { move: pv[0], score: l.mate !== undefined ? { mate: l.mate } : { cp: l.cp }, pv };
}

/* ---------------- 内置引擎（后台线程） ---------------- */
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (a: CoachAnalysis) => void; reject: (e: Error) => void }
>();
function localAnalyze(
  game: CoachGame,
  view: CoachView,
  user: CoachMove | null,
): Promise<CoachAnalysis> {
  if (!worker) {
    worker = new Worker(new URL('./local.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.error) p?.reject(new Error(e.data.error));
      else p?.resolve(e.data.analysis);
    };
  }
  const id = ++seq;
  const pos =
    game === 'chess'
      ? (({ pieces, side, castle, ep, half }) => ({ pieces, side, castle, ep, half }))(
          view as CH.ChView,
        )
      : (({ pieces, side }) => ({ pieces, side }))(view as XQ.XqView);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, game, pos, user });
  });
}

/* ---------------- 外部引擎 ---------------- */
async function engineFor(
  game: CoachGame,
): Promise<{ engine: UciEngine; source: CoachAnalysis['source'] } | null> {
  try {
    if (game === 'chess') return { engine: await loadStockfish(), source: 'stockfish' };
    if (fairySupported()) return { engine: await loadFairy(), source: 'fairy' };
  } catch (e) {
    if (!(e instanceof EngineUnavailable)) console.warn('[coach] 外部引擎不可用，改用内置引擎', e);
  }
  return null;
}

/** 预先载入引擎（失败无妨，分析时会退回内置引擎） */
export function warm(game: CoachGame): void {
  void engineFor(game);
}

/** 分析时长（毫秒）：先看整体，再单独算学生这步 */
const TIME = { overview: 900, user: 500 };

export async function analyze(
  game: CoachGame,
  view: CoachView,
  user: CoachMove | null,
): Promise<{ analysis: CoachAnalysis; report: CoachReport }> {
  const board = game === 'chess' ? ch.toBoard(view as CH.ChView) : xq.toBoard(view as XQ.XqView);
  const fen =
    game === 'chess'
      ? ch.toFen(board as InstanceType<typeof ch.Board>, Math.floor(view.moves.length / 2) + 1)
      : xq.xiangqiFen(board as InstanceType<typeof xq.Board>);
  const legalSet = new Set(view.legal.map((m) => `${m.from}-${m.to}`));
  const legalLine = (l: CoachLine | null): l is CoachLine =>
    !!l && legalSet.has(`${l.move.from}-${l.move.to}`);

  let analysis: CoachAnalysis | null = null;
  const ext = await engineFor(game);
  if (ext) {
    // 正常情况下到时就会返回；迟迟不返回说明引擎卡住了
    const go = (opts: GoOptions) =>
      Promise.race([
        ext.engine.analyze(fen, opts),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('引擎没有响应')), opts.movetime + 5000),
        ),
      ]);
    try {
      const lines = (await go({ multipv: 3, movetime: TIME.overview }))
        .map((l) => lineFrom(game, l))
        .filter(legalLine);
      let userLine: CoachLine | null = null;
      if (user) {
        const u = toUci(game, user);
        const hit = lines.find((l) => toUci(game, l.move) === u);
        if (hit) userLine = hit;
        else {
          const only = await go({ movetime: TIME.user, searchmoves: [u] });
          userLine = only.map((l) => lineFrom(game, l)).find(legalLine) ?? null;
        }
      }
      if (lines.length && (!user || userLine))
        analysis = { best: lines, user: userLine, source: ext.source };
    } catch (e) {
      console.warn('[coach] 外部引擎分析失败，改用内置引擎', e);
      discard(ext.source === 'fairy' ? 'fairy' : 'stockfish');
    }
  }
  analysis ??= await localAnalyze(game, view, user);
  const report =
    game === 'chess'
      ? ch.explainChess(
          board as InstanceType<typeof ch.Board>,
          analysis,
          Math.floor(view.moves.length / 2) + 1,
        )
      : xq.explainXiangqi(board as InstanceType<typeof xq.Board>, analysis);
  return { analysis, report };
}

/** 轮到学生时的提醒：被将军、有棋子正受到威胁 */
export function threats(game: CoachGame, view: CoachView): string[] {
  const out: string[] = [];
  if (game === 'chess') {
    if (view.check !== null)
      out.push('你正被将军：这一步必须解将——移动国王、用棋子挡住，或吃掉将军的棋子');
    return [...out, ...ch.threatNotes(ch.toBoard(view as CH.ChView))];
  }
  if (view.check !== null)
    out.push('你正被将军：这一步必须应将——动帅（将）、垫一个子挡住，或吃掉将军的棋子');
  return [...out, ...xq.threatNotesXq(xq.toBoard(view as XQ.XqView))];
}
