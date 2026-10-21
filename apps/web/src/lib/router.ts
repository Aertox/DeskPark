import { useSyncExternalStore } from 'react';

/** 基于 hash 的极简路由，兼容静态托管与 App WebView。 */
export type Route =
  | { name: 'home' }
  | { name: 'play'; gameId: string }
  | { name: 'room'; code: string }
  | { name: 'gallery' };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'play' && parts[1]) return { name: 'play', gameId: parts[1] };
  if (parts[0] === 'room' && parts[1]) return { name: 'room', code: parts[1].toUpperCase() };
  if (parts[0] === 'gallery' && import.meta.env.DEV) return { name: 'gallery' };
  return { name: 'home' };
}

let current = parse(location.hash);
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse(location.hash);
  listeners.forEach((l) => l());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function navigate(path: string, replace = false): void {
  const hash = path.startsWith('#') ? path : `#${path}`;
  if (replace) {
    history.replaceState(null, '', hash);
    current = parse(hash);
    listeners.forEach((l) => l());
  } else {
    location.hash = hash;
  }
}

export function roomLink(code: string): string {
  return `${location.origin}${location.pathname}#/room/${code}`;
}
