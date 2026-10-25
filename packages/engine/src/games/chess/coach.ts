import type { CoachAnalysis, CoachLine, CoachMove, CoachReport } from '../../core/coach';
import { GRADE_NAME, fromSearchScore, gradeOf, sameMove, scoreWords } from '../../core/coach';
import { Rng } from '../../core/rng';
import {
  BISHOP,
  Board,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  F_CASTLE,
  F_EP,
  mFlag,
  mFrom,
  mPromo,
  mTo,
  san,
} from './board';
import { MATE, search } from './search';
import { squareName } from './shared';

/**
 * 国际象棋导师：根据引擎分析生成「这步行不行、为什么」。
 * 所有说法都来自对局面的实际计算（引擎变化、吃子、被攻击的棋子），不靠猜。
 */

const NAME = ['', '兵', '马', '象', '车', '后', '王'];
const WORTH = [0, 1, 3, 3, 5, 9, 0];
const PROMO_CODE: Record<string, number> = { q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT };
const PROMO_CHAR = ['', '', 'n', 'b', 'r', 'q'];

export function toPacked(b: Board, m: CoachMove): number | null {
  for (const x of b.legal()) {
    if (mFrom(x) !== m.from || mTo(x) !== m.to) continue;
    const pr = mPromo(x);
    if (pr ? PROMO_CODE[m.promo ?? 'q'] === pr : !m.promo) return x;
  }
  return null;
}
const fromPacked = (m: number): CoachMove => {
  const pr = mPromo(m);
  return { from: mFrom(m), to: mTo(m), ...(pr ? { promo: PROMO_CHAR[pr] } : {}) };
};

/** 记谱 + 白话：Nf3（马 g1→f3） */
function describe(b: Board, m: number): string {
  const t = Math.abs(b.sq[mFrom(m)]);
  return `${san(b, m)}（${NAME[t]} ${squareName(mFrom(m))}→${squareName(mTo(m))}）`;
}

/** 依次走完一串着法，返回记谱 */
function lineText(b: Board, pv: CoachMove[], max = 5): string {
  const out: string[] = [];
  let made = 0;
  for (const mv of pv.slice(0, max)) {
    const m = toPacked(b, mv);
    if (m === null) break;
    out.push(san(b, m));
    b.make(m);
    made++;
  }
  for (let i = 0; i < made; i++) b.unmake();
  return out.join(' ');
}

/** 沿着变化走几步，统计双方吃掉的子力（以学生为正） */
function materialSwing(
  b: Board,
  pv: CoachMove[],
  plies: number,
): { net: number; firstLoss: { piece: number; by: number; sq: number } | null } {
  const me = b.side;
  let net = 0;
  let made = 0;
  let firstLoss: { piece: number; by: number; sq: number } | null = null;
  for (const mv of pv.slice(0, plies)) {
    const m = toPacked(b, mv);
    if (m === null) break;
    const victim = mFlag(m) & F_EP ? PAWN : Math.abs(b.sq[mTo(m)]);
    const value = WORTH[victim] + (mPromo(m) ? WORTH[mPromo(m)] - 1 : 0);
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

/** 被威胁的棋子：被对方攻击，并且没人保护、或攻击它的子更便宜 */
/** 轮到走子方时，哪些棋子正受到威胁（界面上的提醒） */
export function threatNotes(b: Board): string[] {
  return threatened(b, b.side as 1 | -1).map(
    (t) => `你在 ${squareName(t.sq)} 的${NAME[t.piece]}正受到威胁`,
  );
}

export function threatened(b: Board, side: 1 | -1): { sq: number; piece: number; by: number }[] {
  const enemy = side === 1 ? -1 : 1;
  const flipped = new Board(b.sq, enemy, 0, -1, 0);
  const caps = flipped.pseudo([], true);
  const out: { sq: number; piece: number; by: number }[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = b.sq[sq] * side;
    if (p <= 0 || p === KING) continue;
    const attackers = caps.filter((m) => mTo(m) === sq).map((m) => Math.abs(b.sq[mFrom(m)]));
    if (!attackers.length) continue;
    const cheapest = Math.min(...attackers.map((t) => WORTH[t] || 100));
    const defended = b.attacked(sq, side);
    if (!defended || cheapest < WORTH[p])
      out.push({ sq, piece: p, by: attackers.find((t) => (WORTH[t] || 100) === cheapest)! });
  }
  return out.sort((x, y) => WORTH[y.piece] - WORTH[x.piece]);
}

/** 好着法的特点 */
function features(b: Board, m: number, moveNo: number): string[] {
  const out: string[] = [];
  const t = Math.abs(b.sq[mFrom(m)]);
  const victim = mFlag(m) & F_EP ? PAWN : Math.abs(b.sq[mTo(m)]);
  if (mFlag(m) & F_CASTLE) out.push('王车易位：把王藏到安全的角落，同时让车走到中路');
  if (victim) out.push(`吃掉对方的${NAME[victim]}`);
  if (mPromo(m)) out.push(`兵升变为${NAME[mPromo(m)]}`);
  const homeRank = b.side === 1 ? 0 : 7;
  if ((t === KNIGHT || t === BISHOP) && mFrom(m) >> 3 === homeRank)
    out.push(`把${NAME[t]}从底线出动，加快出子`);
  const to = mTo(m);
  const f = to & 7;
  const r = to >> 3;
  if (moveNo <= 12 && f >= 2 && f <= 5 && r >= 2 && r <= 5 && t !== KING && t !== QUEEN)
    out.push('控制棋盘中心');
  // 走了以后将军
  b.make(m);
  if (b.inCheck()) out.push('将军，逼对方先应付');
  b.unmake();
  // 救走被威胁的子
  const before = threatened(b, b.side).find((x) => x.sq === mFrom(m));
  if (before) out.push(`把受到威胁的${NAME[before.piece]}挪到安全的地方`);
  return out;
}

export function explainChess(board: Board, analysis: CoachAnalysis, moveNo = 1): CoachReport {
  const b = board;
  const me = b.side;
  const best = analysis.best[0];
  const bestM = best ? toPacked(b, best.move) : null;
  const points: string[] = [];
  const arrows: CoachReport['arrows'] = [];
  const bestDesc = bestM !== null ? describe(b, bestM) : '';
  const bestLine = best ? lineText(b, best.pv) : '';
  const threats = threatened(b, me);

  // 只要提示
  if (!analysis.user) {
    if (bestM !== null) {
      arrows.push({ from: mFrom(bestM), to: mTo(bestM), kind: 'best' });
      const why = features(b, bestM, moveNo);
      if (best.score.mate !== undefined && best.score.mate > 0)
        points.push(`这里有杀棋：${best.score.mate} 步之内可以将死对方`);
      if (why.length) points.push(`这步的好处：${why.join('；')}`);
      if (threats.length)
        points.push(
          `注意：你的${NAME[threats[0].piece]}（${squareName(threats[0].sq)}）正受到威胁`,
        );
    }
    return {
      grade: null,
      loss: 0,
      title: bestDesc ? `可以考虑 ${bestDesc}` : '没有找到好的建议',
      points,
      best: bestDesc,
      bestLine,
      arrows,
      outlook: { best: best ? scoreWords(best.score) : '', user: null },
      facts: `引擎推荐 ${bestDesc}，主要变化：${bestLine}。${points.join('。')}`,
    };
  }

  const user = analysis.user;
  const um = toPacked(b, user.move)!;
  const isBest = !!best && sameMove(best.move, user.move);
  const { grade, loss } = best
    ? gradeOf(best.score, user.score, isBest)
    : { grade: 'good' as const, loss: 0 };
  const userDesc = describe(b, um);
  arrows.push({ from: mFrom(um), to: mTo(um), kind: 'try' });

  // 对方的最佳应着
  const replyMv = user.pv[1];
  let replyDesc = '';
  if (replyMv) {
    b.make(um);
    const rm = toPacked(b, replyMv);
    if (rm !== null) {
      replyDesc = describe(b, rm);
      arrows.push({ from: mFrom(rm), to: mTo(rm), kind: 'reply' });
    }
    b.unmake();
  }

  // 杀棋
  if (user.score.mate !== undefined && user.score.mate > 0)
    points.push(`漂亮！这步之后 ${user.score.mate} 步之内可以将死对方`);
  if (user.score.mate !== undefined && user.score.mate < 0)
    points.push(
      `走这步之后，对方 ${-user.score.mate} 步之内可以将死你${replyDesc ? `，从 ${replyDesc} 开始` : ''}`,
    );
  if (
    best?.score.mate !== undefined &&
    best.score.mate > 0 &&
    !(user.score.mate !== undefined && user.score.mate > 0)
  )
    points.push(`你错过了杀棋：${bestLine}，${best.score.mate} 步之内可以将死对方`);

  // 子力得失（沿着这步之后的主要变化看 4 步）
  const swing = materialSwing(b, user.pv, 4);
  const gain = Math.abs(b.sq[mTo(um)]);
  if (swing.firstLoss && swing.net <= -2) {
    const l = swing.firstLoss;
    points.push(
      `这步之后对方可以用${NAME[l.by]}吃掉你在 ${squareName(l.sq)} 的${NAME[l.piece]}，算下来净丢约 ${-swing.net} 分子力`,
    );
  } else if (gain && swing.net >= 2)
    points.push(`吃掉对方的${NAME[gain]}，净赚约 ${swing.net} 分子力`);

  // 本来就有的威胁没处理
  const ignored = threats.find((x) => x.sq !== mFrom(um) && swing.firstLoss?.sq === x.sq);
  if (ignored)
    points.push(
      `对方之前就在威胁你的${NAME[ignored.piece]}（${squareName(ignored.sq)}），这步没有处理`,
    );

  // 开局常见问题
  const t = Math.abs(b.sq[mFrom(um)]);
  if (moveNo <= 8 && t === QUEEN && !isBest && loss > 40)
    points.push('开局太早出后，容易被对方一边出子一边追着打');
  if (t === KING && !(mFlag(um) & F_CASTLE) && b.castle & (me === 1 ? 3 : 12) && !isBest)
    points.push('王走动以后就不能再王车易位了');

  // 更好的走法
  if (!isBest && bestM !== null && grade !== 'best' && grade !== 'good') {
    arrows.push({ from: mFrom(bestM), to: mTo(bestM), kind: 'best' });
    const why = features(b, bestM, moveNo);
    points.push(`更好的是 ${bestDesc}${why.length ? `：${why.join('；')}` : ''}`);
  }
  if (!points.length) {
    if (isBest) points.push('这正是引擎认为最好的一步');
    else if (grade === 'good') points.push(`和最佳着法 ${bestDesc} 差不多，放心走`);
    else points.push(`这步之后${scoreWords(user.score)}`);
  }

  const title = `${GRADE_NAME[grade]}：${userDesc}`;
  const facts = [
    `学生想走 ${userDesc}，引擎评级：${GRADE_NAME[grade]}。`,
    `走这步后局面：${scoreWords(user.score)}；最佳着法 ${bestDesc} 后：${best ? scoreWords(best.score) : '未知'}。`,
    replyDesc ? `对方的最佳应着：${replyDesc}；这步之后的主要变化：${lineText(b, user.pv)}。` : '',
    `最佳着法的主要变化：${bestLine}。`,
    `依据引擎得出的要点：${points.join('；')}。`,
  ].join('');
  const outlook = { best: best ? scoreWords(best.score) : '', user: scoreWords(user.score) };
  return { grade, loss, title, points, best: bestDesc, bestLine, arrows, outlook, facts };
}

/** 内置引擎的分析（外部引擎加载不了时用） */
export function analyzeChessLocal(
  board: Board,
  user: CoachMove | null,
  nodes = 160000,
): CoachAnalysis {
  const rng = new Rng(1);
  const b = board;
  const root = search(b, { maxDepth: 7, nodes, noise: 0, rng });
  const ranked = [...root.scores].sort((x, y) => y[1] - x[1]);
  const lineFor = (m: number, s: number): CoachLine => {
    // 再看一步对方的应着，凑出两步的变化
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
    const um = toPacked(b, user);
    if (um !== null) {
      if (best[0] && sameMove(best[0].move, user)) userLine = best[0];
      else {
        b.make(um);
        let score: number;
        let reply: number | null = null;
        if (!b.legal().length) score = b.inCheck() ? MATE - 1 : 0;
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
