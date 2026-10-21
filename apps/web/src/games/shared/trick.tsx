import type { Card } from '@park/engine';
import { useEffect, useRef, useState } from 'react';
import { CardRow } from '../../components/Hand';
import { playSound } from '../../lib/sound';
import { vibrate } from '../../lib/platform';

export function CountChip({ n, warnAt = 2 }: { n: number; warnAt?: number }) {
  return (
    <span className={`count-chip ${n > 0 && n <= warnAt ? 'is-warn' : ''}`}>
      <i />
      {n}
    </span>
  );
}

export type TrickMove = { type: 'play'; cards: Card[] } | { type: 'pass' } | null;

export function MoveZone({
  move,
  from,
  isWild,
  passText = '不出',
  w,
}: {
  move: TrickMove;
  from: 'left' | 'right' | 'top' | 'bottom';
  isWild?: (c: Card) => boolean;
  passText?: string;
  w?: string;
}) {
  if (!move) return null;
  if (move.type === 'pass') return <span className="pass-label">{passText}</span>;
  return (
    <CardRow
      key={move.cards.map((c) => c.id).join(',')}
      cards={move.cards}
      from={from}
      isWild={isWild}
      w={w}
    />
  );
}

/** 手牌选择状态：手牌变化时自动剔除已不存在的牌，resetKey 变化时清空。 */
export function useSelection(hand: Card[], resetKey: unknown) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const ids = hand.map((c) => c.id).join(',');
  useEffect(() => {
    setSel((prev) => {
      const alive = new Set(hand.map((c) => c.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  useEffect(() => {
    setSel(new Set());
  }, [resetKey]);
  return [sel, setSel] as const;
}

/** 轮到自己时提示音 + 轻微震动 */
export function useTurnCue(myTurn: boolean) {
  const prev = useRef(false);
  useEffect(() => {
    if (myTurn && !prev.current) {
      playSound('turn');
      vibrate(15);
    }
    prev.current = myTurn;
  }, [myTurn]);
}

/** 依次循环的提示 */
export function useHintCycle<T>(candidates: T[], resetKey: unknown) {
  const idx = useRef(0);
  useEffect(() => {
    idx.current = 0;
  }, [resetKey]);
  return () => {
    if (candidates.length === 0) return null;
    const c = candidates[idx.current % candidates.length];
    idx.current++;
    return c;
  };
}

export { useCompact } from '../../lib/media';
