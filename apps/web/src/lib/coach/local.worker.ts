/// <reference lib="webworker" />
import type { CoachMove } from '@park/engine';
import { ch, xq } from '@park/engine';

/** 内置引擎的分析放在后台线程里跑，不卡住页面 */
interface Req {
  id: number;
  game: 'chess' | 'xiangqi';
  pos: never;
  user: CoachMove | null;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, game, pos, user } = e.data;
  try {
    const analysis =
      game === 'chess'
        ? ch.analyzeChessLocal(ch.toBoard(pos), user)
        : xq.analyzeXiangqiLocal(xq.toBoard(pos), user);
    self.postMessage({ id, analysis });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
