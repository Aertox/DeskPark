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

/** 发给好友的邀请文字：谁邀请你玩什么、房间号、还差几人，链接单独一行（方便聊天软件识别） */
export function inviteText(opts: {
  from: string;
  game: string;
  code: string;
  open: number;
}): string {
  const need = opts.open > 0 ? `，还差 ${opts.open} 人` : '';
  return `${opts.from} 邀请你来闲亭玩「${opts.game}」（房间号 ${opts.code}${need}），点开链接就能加入：\n${roomLink(opts.code)}`;
}
