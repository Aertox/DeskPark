import { useSyncExternalStore } from 'react';

const COMPACT_QUERY = '(max-height: 500px)';
/** 横屏手机等矮屏幕 */
export function useCompact(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(COMPACT_QUERY);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
  );
}

/** 大屏幕上的座位放大倍数：1440×860 以下为 1，最大 1.5 */
function seatScale(): number {
  const s = Math.min(window.innerWidth / 1440, window.innerHeight / 860);
  return Math.round(Math.min(1.5, Math.max(1, s)) * 20) / 20;
}
export function useSeatScale(): number {
  return useSyncExternalStore((cb) => {
    window.addEventListener('resize', cb);
    return () => window.removeEventListener('resize', cb);
  }, seatScale);
}
