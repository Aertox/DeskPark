import type { CoachAnalysis, CoachLine, CoachMove, CoachReport } from '../../core/coach';
import { GRADE_NAME, fromSearchScore, gradeOf, sameMove, scoreWords } from '../../core/coach';
import { Rng } from '../../core/rng';
import {
  ADVISOR,
  Board,
  CANNON,
  ELEPHANT,
  HORSE,
  KING,
  PAWN,
  ROOK,
  fileOf,
  mFrom,
  mTo,
  notation,
  rankOf,
} from './board';
import { MATE, search } from './search';

/** 中国象棋导师：根据引擎分析讲清楚这步行不行、为什么 */

const NAME: Record<number, [string, string]> = {
  [KING]: ['帅', '将'],
  [ADVISOR]: ['仕', '士'],
  [ELEPHANT]: ['相', '象'],
  [HORSE]: ['马', '马'],
  [ROOK]: ['车', '车'],
  [CANNON]: ['炮', '炮'],
  [PAWN]: ['兵', '卒'],
};
const WORTH: Record<number, number> = {
  [KING]: 0,
  [ADVISOR]: 2,
  [ELEPHANT]: 2,
  [HORSE]: 4,
  [ROOK]: 9,
  [CANNON]: 4.5,
  [PAWN]: 1,
};
const nameOf = (t: number, side: 1 | -1) => NAME[t][side === 1 ? 0 : 1];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function toPackedXq(b: Board, m: CoachMove): number | null {
  return b.legal().find((x) => mFrom(x) === m.from && mTo(x) === m.to) ?? null;
}
const fromPacked = (m: number): CoachMove => ({ from: mFrom(m), to: mTo(m) });

function lineText(b: Board, pv: CoachMove[], max = 5): string {
  const out: string[] = [];
  let made = 0;
  for (const mv of pv.slice(0, max)) {
    const m = toPackedXq(b, mv);
    if (m === null) break;
    out.push(notation(b, m));
    b.make(m);
    made++;
  }
  for (let i = 0; i < made; i++) b.unmake();
  return out.join(' ');
}

const worthAt = (b: Board, sq: number) => {
  const p = b.sq[sq];
  const t = Math.abs(p);
  if (t === PAWN) {
    const crossed = p > 0 ? rankOf(sq) >= 5 : rankOf(sq) <= 4;
    return crossed ? 2 : 1;
  }
  return WORTH[t] ?? 0;
};

function materialSwing(b: Board, pv: CoachMove[], plies: number) {
  const me = b.side;
  let net = 0;
  let made = 0;
  let firstLoss: { piece: number; by: number; sq: number } | null = null;
  for (const mv of pv.slice(0, plies)) {
    const m = toPackedXq(b, mv);
    if (m === null) break;
    const victim = Math.abs(b.sq[mTo(m)]);
    const value = victim ? worthAt(b, mTo(m)) : 0;
    if (b.side === me) net += value;
    else {
      net -= value;
      if (victim && !firstLoss)
        firstLoss = { piece: victim, by: Math.abs(b.sq[mFrom(m)]), sq: mTo(m) };
    }
    b.make(m);
    made++;
  }
  for (let i = 0; i < made; i++) b.unmake();
  return { net, firstLoss };
}

/** 被威胁的棋子：被对方攻击，没人保护、或攻击它的子更便宜 */
export function threatenedXq(b: Board, side: 1 | -1): { sq: number; piece: number; by: number }[] {
  const enemy = side === 1 ? -1 : 1;
  const flipped = new Board(b.sq, enemy);
  const caps = flipped.pseudo([], true);
  const out: { sq: number; piece: number; by: number }[] = [];
  for (let sq = 0; sq < 90; sq++) {
    const p = b.sq[sq] * side;
    if (p <= 0 || p === KING) continue;
    const attackers = caps.filter((m) => mTo(m) === sq).map((m) => Math.abs(b.sq[mFrom(m)]));
    if (!attackers.length) continue;
    const cost = (t: number) => (t === KING ? 100 : WORTH[t]);
    const cheapest = Math.min(...attackers.map(cost));
    const defended = b.attacked(sq, side);
    if (!defended || cheapest < worthAt(b, sq))
      out.push({ sq, piece: p, by: attackers.find((t) => cost(t) === cheapest)! });
  }
  return out.sort((x, y) => worthAt(b, y.sq) - worthAt(b, x.sq));
}

/** 「三路的马」这样的位置说法（走子方视角的纵线编号） */
const where = (sq: number, side: 1 | -1) => {
  const f = fileOf(sq);
  return side === 1 ? `${'零一二三四五六七八九'[9 - f]}路` : `${f + 1} 路`;
};

/** 轮到走子方时，哪些棋子正受到威胁（界面上的提醒） */
export function threatNotesXq(b: Board): string[] {
  const side = b.side as 1 | -1;
  return threatenedXq(b, side).map(
    (t) => `你${where(t.sq, side)}的${nameOf(t.piece, side)}正受到威胁`,
  );
}

function features(b: Board, m: number): string[] {
  const out: string[] = [];
  const side = b.side;
  const t = Math.abs(b.sq[mFrom(m)]);
  const victim = Math.abs(b.sq[mTo(m)]);
  const fr = rankOf(mFrom(m));
  const home = side === 1 ? 0 : 9;
  if (victim) out.push(`吃掉对方的${nameOf(victim, side === 1 ? -1 : 1)}`);
  if (t === ROOK && fr === home) out.push('把车从底线开出来，车是最强的子，越早出动越好');
  if (t === HORSE && fr === home) out.push('跳马出动，马要早一点跳出来');
  if (t === CANNON && fileOf(mTo(m)) === 4 && fileOf(mFrom(m)) !== 4)
    out.push('炮架到中路，形成「当头炮」，直接瞄准对方的将');
  if (t === PAWN) {
    const crossedBefore = side === 1 ? fr >= 5 : fr <= 4;
    const crossedAfter = side === 1 ? rankOf(mTo(m)) >= 5 : rankOf(mTo(m)) <= 4;
    if (!crossedBefore && crossedAfter) out.push('兵过河，过河兵可以左右走，威力大增');
  }
  b.make(m);
  if (b.inCheck()) out.push('将军，逼对方先应将');
  b.unmake();
  const saved = threatenedXq(b, side).find((x) => x.sq === mFrom(m));
  if (saved) out.push(`把受到威胁的${nameOf(saved.piece, side)}转移到安全的位置`);
  return out;
}

export function explainXiangqi(board: Board, analysis: CoachAnalysis): CoachReport {
  const b = board;
  const me = b.side;
  const enemy: 1 | -1 = me === 1 ? -1 : 1;
  const best = analysis.best[0];
  const bestM = best ? toPackedXq(b, best.move) : null;
  const bestDesc = bestM !== null ? notation(b, bestM) : '';
  const bestLine = best ? lineText(b, best.pv) : '';
  const points: string[] = [];
  const arrows: CoachReport['arrows'] = [];
  const threats = threatenedXq(b, me);

  if (!analysis.user) {
    if (bestM !== null) {
      arrows.push({ from: mFrom(bestM), to: mTo(bestM), kind: 'best' });
      if (best.score.mate !== undefined && best.score.mate > 0)
        points.push(`这里有杀棋：${best.score.mate} 步之内可以将死对方`);
      const why = features(b, bestM);
      if (why.length) points.push(`这步的好处：${why.join('；')}`);
      if (threats.length)
        points.push(
          `注意：你${where(threats[0].sq, me)}的${nameOf(threats[0].piece, me)}正受到威胁`,
        );
    }
    return {
      grade: null,
      loss: 0,
      title: bestDesc ? `可以考虑「${bestDesc}」` : '没有找到好的建议',
      points,
      best: bestDesc,
      bestLine,
      arrows,
      outlook: { best: best ? scoreWords(best.score) : '', user: null },
      facts: `引擎推荐 ${bestDesc}，主要变化：${bestLine}。${points.join('。')}`,
    };
  }

  const user = analysis.user;
  const um = toPackedXq(b, user.move)!;
  const isBest = !!best && sameMove(best.move, user.move);
  const { grade, loss } = best
    ? gradeOf(best.score, user.score, isBest)
    : { grade: 'good' as const, loss: 0 };
  const userDesc = notation(b, um);
  arrows.push({ from: mFrom(um), to: mTo(um), kind: 'try' });

  let replyDesc = '';
  const replyMv = user.pv[1];
  if (replyMv) {
    b.make(um);
    const rm = toPackedXq(b, replyMv);
    if (rm !== null) {
      replyDesc = notation(b, rm);
      arrows.push({ from: mFrom(rm), to: mTo(rm), kind: 'reply' });
    }
    b.unmake();
  }

  if (user.score.mate !== undefined && user.score.mate > 0)
    points.push(`漂亮！这步之后 ${user.score.mate} 步之内可以将死对方`);
  if (user.score.mate !== undefined && user.score.mate < 0)
    points.push(
      `走这步之后，对方 ${-user.score.mate} 步之内可以将死你${replyDesc ? `，从「${replyDesc}」开始` : ''}`,
    );
  if (
    best?.score.mate !== undefined &&
    best.score.mate > 0 &&
    !(user.score.mate !== undefined && user.score.mate > 0)
  )
    points.push(`你错过了杀棋：${bestLine}，${best.score.mate} 步之内可以将死对方`);

  const swing = materialSwing(b, user.pv, 4);
  if (swing.firstLoss && swing.net <= -1.5) {
    const l = swing.firstLoss;
    points.push(
      `这步之后对方可以用${nameOf(l.by, enemy)}吃掉你${where(l.sq, me)}的${nameOf(l.piece, me)}，算下来净丢约 ${fmt(-swing.net)} 分子力`,
    );
  } else {
    const gain = Math.abs(b.sq[mTo(um)]);
    if (gain && swing.net >= 1.5)
      points.push(`吃掉对方的${nameOf(gain, enemy)}，净赚约 ${fmt(swing.net)} 分子力`);
  }
  const ignored = threats.find((x) => x.sq !== mFrom(um) && swing.firstLoss?.sq === x.sq);
  if (ignored) points.push(`对方之前就在威胁你的${nameOf(ignored.piece, me)}，这步没有处理`);

  // 常见问题
  const t = Math.abs(b.sq[mFrom(um)]);
  if (t === KING && !isBest && loss > 40) points.push('没事别动帅（将），帅离开中间更容易被将军');
  if (!isBest && bestM !== null && grade !== 'best' && grade !== 'good') {
    arrows.push({ from: mFrom(bestM), to: mTo(bestM), kind: 'best' });
    const why = features(b, bestM);
    points.push(`更好的是「${bestDesc}」${why.length ? `：${why.join('；')}` : ''}`);
  }
  if (!points.length) {
    if (isBest) points.push('这正是引擎认为最好的一步');
    else if (grade === 'good') points.push(`和最佳着法「${bestDesc}」差不多，放心走`);
    else points.push(`这步之后${scoreWords(user.score)}`);
  }

  const title = `${GRADE_NAME[grade]}：${userDesc}`;
  const facts = [
    `学生（${me === 1 ? '红方' : '黑方'}）想走「${userDesc}」，引擎评级：${GRADE_NAME[grade]}。`,
    `走这步后局面：${scoreWords(user.score)}；最佳着法「${bestDesc}」后：${best ? scoreWords(best.score) : '未知'}。`,
    replyDesc
      ? `对方的最佳应着：「${replyDesc}」；这步之后的主要变化：${lineText(b, user.pv)}。`
      : '',
    `最佳着法的主要变化：${bestLine}。`,
    `依据引擎得出的要点：${points.join('；')}。`,
  ].join('');
  const outlook = { best: best ? scoreWords(best.score) : '', user: scoreWords(user.score) };
  return { grade, loss, title, points, best: bestDesc, bestLine, arrows, outlook, facts };
}

export function analyzeXiangqiLocal(
  board: Board,
  user: CoachMove | null,
  nodes = 160000,
): CoachAnalysis {
  const rng = new Rng(1);
  const b = board;
  const root = search(b, { maxDepth: 7, nodes, noise: 0, rng });
  const ranked = [...root.scores].sort((x, y) => y[1] - x[1]);
  const lineFor = (m: number, s: number): CoachLine => {
    b.make(m);
    const reply = b.legal().length
      ? search(b, { maxDepth: 5, nodes: nodes / 3, noise: 0, rng }).move
      : null;
    b.unmake();
    return {
      move: fromPacked(m),
      score: fromSearchScore(s, MATE),
      pv:
        reply === null || reply === undefined
          ? [fromPacked(m)]
          : [fromPacked(m), fromPacked(reply)],
    };
  };
  const best = ranked.slice(0, 1).map(([m, s]) => lineFor(m, s));
  let userLine: CoachLine | null = null;
  if (user) {
    const um = toPackedXq(b, user);
    if (um !== null) {
      if (best[0] && sameMove(best[0].move, user)) userLine = best[0];
      else {
        b.make(um);
        let score: number;
        let reply: number | null = null;
        // 象棋里无子可走就算输
        if (!b.legal().length) score = MATE - 1;
        else {
          const r = search(b, { maxDepth: 7, nodes, noise: 0, rng });
          score = -r.score;
          reply = r.move;
        }
        b.unmake();
        userLine = {
          move: fromPacked(um),
          score: fromSearchScore(score, MATE),
          pv: reply === null ? [fromPacked(um)] : [fromPacked(um), fromPacked(reply)],
        };
      }
    }
  }
  return { best, user: userLine, source: 'local' };
}

/** 交给外部引擎（Fairy-Stockfish）的 FEN */
export function xiangqiFen(b: Board): string {
  const ch: Record<number, string> = {
    [KING]: 'k',
    [ADVISOR]: 'a',
    [ELEPHANT]: 'b',
    [HORSE]: 'n',
    [ROOK]: 'r',
    [CANNON]: 'c',
    [PAWN]: 'p',
  };
  const rows: string[] = [];
  for (let r = 9; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 9; f++) {
      const p = b.sq[r * 9 + f];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += p > 0 ? ch[p].toUpperCase() : ch[-p];
    }
    rows.push(row + (empty || ''));
  }
  return `${rows.join('/')} ${b.side === 1 ? 'w' : 'b'} - - 0 1`;
}
