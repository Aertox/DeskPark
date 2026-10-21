import { useSyncExternalStore } from 'react';
import { randomToken, storage } from './platform';

/** 极简的可订阅存储（无需额外状态库），带本地持久化。 */
export function createStore<T extends object>(key: string, initial: T) {
  let value: T = { ...initial, ...storage.get<Partial<T>>(key, {}) };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch: Partial<T>) {
      value = { ...value, ...patch };
      storage.set(key, value);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use(): T {
      return useSyncExternalStore(this.subscribe, this.get, this.get);
    },
  };
}

export type FeltTheme = 'jade' | 'indigo' | 'wine' | 'graphite';
export type ColorTheme = 'system' | 'light' | 'dark';

export interface Settings {
  felt: FeltTheme;
  fourColor: boolean;
  sound: boolean;
  theme: ColorTheme;
  cardCounter: boolean;
}

export const settings = createStore<Settings>('park.settings', {
  felt: 'jade',
  fourColor: false,
  sound: true,
  theme: 'system',
  cardCounter: true,
});

const NAMES = [
  '清风',
  '明月',
  '青竹',
  '远山',
  '听雨',
  '南风',
  '初雪',
  '星河',
  '晚舟',
  '白露',
  '松间',
  '小满',
];

export interface Profile {
  name: string;
  token: string;
}

export const profile = createStore<Profile>('park.profile', {
  name: NAMES[Math.floor(Math.random() * NAMES.length)],
  token: randomToken(),
});
// 首次访问时把随机生成的身份写入本地
profile.set({});

/** 上次使用的各玩法设置 */
export const lastSetup = createStore<
  Record<string, { players: number; options: Record<string, unknown> }>
>('park.lastSetup', {});
