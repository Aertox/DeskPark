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
