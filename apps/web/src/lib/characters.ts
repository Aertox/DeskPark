import { CHARACTER_ID_PATTERN, CHARACTER_PREFIX } from '@park/protocol';
import { useSyncExternalStore } from 'react';

/**
 * 虚拟角色库：图片放在 apps/web/public/characters/，由 manifest.json 列出。
 * 格式说明见 apps/web/public/characters/README.md。
 */
export interface VirtualCharacter {
  id: string;
  name: string;
  file: string;
  group?: string;
  bg?: string;
}

interface State {
  status: 'idle' | 'loading' | 'ready' | 'error';
  list: VirtualCharacter[];
}

let state: State = { status: 'idle', list: [] };
const listeners = new Set<() => void>();
const FILE_PATTERN = /^[\w-]+\.(png|webp|gif|svg)$/i;
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export const characterUrl = (c: VirtualCharacter) =>
  `${import.meta.env.BASE_URL}characters/${c.file}`;

export async function loadCharacters(): Promise<void> {
  if (state.status !== 'idle') return;
  set({ ...state, status: 'loading' });
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}characters/manifest.json`, {
      cache: 'no-cache',
    });
    const data = (await res.json()) as { characters?: unknown[] };
    const list: VirtualCharacter[] = [];
    for (const raw of data.characters ?? []) {
      const c = raw as Partial<VirtualCharacter>;
      if (typeof c.id !== 'string' || !CHARACTER_ID_PATTERN.test(c.id)) continue;
      if (typeof c.file !== 'string' || !FILE_PATTERN.test(c.file)) continue;
      if (list.some((x) => x.id === c.id)) continue;
      list.push({
        id: c.id,
        name: typeof c.name === 'string' && c.name ? c.name.slice(0, 16) : c.id,
        file: c.file,
        group: typeof c.group === 'string' ? c.group.slice(0, 12) : undefined,
        bg: typeof c.bg === 'string' && COLOR_PATTERN.test(c.bg) ? c.bg : undefined,
      });
    }
    set({ status: 'ready', list });
  } catch {
    set({ status: 'error', list: [] });
  }
}

export function useCharacters(): VirtualCharacter[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state.list,
  );
}

export function findCharacter(list: VirtualCharacter[], avatar: string | null | undefined) {
  if (!avatar?.startsWith(CHARACTER_PREFIX)) return undefined;
  const id = avatar.slice(CHARACTER_PREFIX.length);
  return list.find((c) => c.id === id);
}
