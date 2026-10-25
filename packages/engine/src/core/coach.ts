/**
 * 导师（棋类教练）的通用部分：分析结果的格式、评级与分数换算。
 * 具体的「为什么」由各个棋的 coach.ts 根据局面生成；外部引擎（Stockfish 等）与内置引擎
 * 都把结果整理成这里的格式。
 */

/** 分数（走子方视角）：cp 为百分之一兵（象棋里同样以小卒为单位），mate 为几步杀（负数表示被杀） */
export interface CoachScore {
  cp?: number;
  mate?: number;
}

export interface CoachMove {
  from: number;
  to: number;
  promo?: string;
}

export interface CoachLine {
  move: CoachMove;
  score: CoachScore;
  /** 主要变化，pv[0] 就是 move */
  pv: CoachMove[];
}

export interface CoachAnalysis {
  /** 最好的几步（按分数从高到低） */
  best: CoachLine[];
  /** 学生想走的这步；只要提示时为 null */
  user: CoachLine | null;
  source: 'stockfish' | 'fairy' | 'local';
}

export type CoachGrade = 'best' | 'good' | 'ok' | 'inaccuracy' | 'mistake' | 'blunder';

export const GRADE_NAME: Record<CoachGrade, string> = {
  best: '最佳',
  good: '好棋',
  ok: '还行',
  inaccuracy: '不精确',
  mistake: '失误',
  blunder: '大错',
};

export interface CoachArrow {
  from: number;
  to: number;
  kind: 'try' | 'best' | 'reply';
}

export interface CoachReport {
  grade: CoachGrade | null;
  /** 和最佳着法差了多少（cp） */
  loss: number;
  /** 一句话结论 */
  title: string;
  /** 具体原因 */
  points: string[];
  /** 最佳着法（记谱 + 说明） */
  best: string;
  /** 最佳着法之后的主要变化 */
  bestLine: string;
  arrows: CoachArrow[];
  /** 局面评估（用文字）：按最佳着法走之后 / 按学生这步走之后（只要提示时为 null） */
  outlook: { best: string; user: string | null };
  /** 交给大模型的事实摘要 */
  facts: string;
}

const MATE_CP = 100000;

/** 把分数换成可以比较的数：杀棋比任何子力优势都大，越快的杀越大 */
export function scoreCp(s: CoachScore): number {
  if (s.mate !== undefined) {
    if (s.mate === 0) return -MATE_CP;
    return s.mate > 0 ? MATE_CP - s.mate * 100 : -MATE_CP - s.mate * 100;
  }
  return s.cp ?? 0;
}

/**
 * 把分数说成初学者听得懂的话（走子方视角）。
 * 不直接给数字：Stockfish 的分数按胜率换算，「5 分」并不等于 5 个兵，容易误会。
 */
export function scoreWords(s: CoachScore): string {
  if (s.mate !== undefined) {
    if (s.mate > 0) return `你有 ${s.mate} 步杀`;
    return s.mate === 0 ? '你已被将死' : `对方有 ${-s.mate} 步杀`;
  }
  const v = s.cp ?? 0;
  const a = Math.abs(v);
  if (a < 40) return '大致均势';
  const [up, down] =
    a < 120
      ? ['稍占上风', '稍处下风']
      : a < 300
        ? ['占优', '落后']
        : a < 700
          ? ['明显占优', '明显落后']
          : ['优势很大', '劣势很大'];
  return `你${v > 0 ? up : down}`;
}

export function gradeOf(
  best: CoachScore,
  user: CoachScore,
  isBest: boolean,
): { grade: CoachGrade; loss: number } {
  const b = scoreCp(best);
  const u = scoreCp(user);
  const loss = Math.max(0, b - u);
  if (isBest || loss <= 10) return { grade: 'best', loss };
  // 本来有杀、走了以后没杀了：至少算失误
  if (best.mate !== undefined && best.mate > 0 && !(user.mate !== undefined && user.mate > 0))
    return { grade: u > 300 ? 'mistake' : 'blunder', loss };
  // 走了以后被杀
  if (user.mate !== undefined && user.mate < 0 && !(best.mate !== undefined && best.mate < 0))
    return { grade: 'blunder', loss };
  // 大优势时少赚一点没那么要紧
  const scale = b > 500 ? 2 : 1;
  const l = loss / scale;
  if (l <= 40) return { grade: 'good', loss };
  if (l <= 90) return { grade: 'ok', loss };
  if (l <= 180) return { grade: 'inaccuracy', loss };
  if (l <= 350) return { grade: 'mistake', loss };
  return { grade: 'blunder', loss };
}

export const sameMove = (a: CoachMove, b: CoachMove) =>
  a.from === b.from && a.to === b.to && (a.promo ?? '') === (b.promo ?? '');

/** 内置搜索返回的分数（±MATE 附近表示杀棋）换成 CoachScore */
export function fromSearchScore(s: number, mate: number): CoachScore {
  if (Math.abs(s) > mate - 1000) {
    const plies = mate - Math.abs(s);
    const moves = Math.max(1, Math.ceil(plies / 2));
    return { mate: s > 0 ? moves : -moves };
  }
  return { cp: Math.round(s) };
}
