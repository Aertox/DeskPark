import { CHARACTER_ID_PATTERN, CHARACTER_PREFIX, isAvatarId } from '@park/protocol';
import { useCallback, useSyncExternalStore } from 'react';
import { characterForName, getCharacter } from '../components/pixel/characters';
import { settings } from './store';

/**
 * 虚拟角色库：图片放在 apps/web/public/characters/，由 manifest.json 列出。
 * 格式说明见 apps/web/public/characters/README.md。
 */
export interface VirtualCharacter {
  id: string;
  name: string;
  /** 精灵图：所有帧等宽、从左到右横向排列 */
  file: string;
  group?: string;
  /** 小头像（聊天、顶栏等处）的底色 */
  bg?: string;
  /** 单帧宽高（像素） */
  frameW: number;
  frameH: number;
  frames: number;
  fps: number;
  /** 小头像裁切区域：第 1 帧中的正方形 [x, y, 边长] */
  face: [number, number, number];
  /** 头顶位置（帧内像素行），用于把按钮、气泡放在头顶 */
  top: number;
  /** 若是某个像素头像的全身像，则为该头像 id；否则是可单独选择的额外角色 */
  avatar?: string;
}

interface State {
  status: 'idle' | 'loading' | 'ready' | 'error';
  list: VirtualCharacter[];
}

let state: State = { status: 'idle', list: [] };
const listeners = new Set<() => void>();
const FILE_PATTERN = /^[\w-]+\.(png|webp|gif|svg)$/i;
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

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
      const r = raw as Record<string, unknown>;
      const [frameW, frameH] = Array.isArray(r.frame) ? r.frame.map(Number) : [NaN, NaN];
      if (!isInt(frameW, 8, 512) || !isInt(frameH, 8, 512)) continue;
      const frames = isInt(r.frames, 1, 64) ? r.frames : 1;
      const fps = isInt(r.fps, 1, 30) ? r.fps : 6;
      const side = Math.min(frameW, frameH);
      let face: [number, number, number] = [Math.round((frameW - side) / 2), 0, side];
      if (Array.isArray(r.face) && r.face.length === 3) {
        const [x, y, s] = r.face.map(Number);
        if (isInt(s, 4, side) && isInt(x, 0, frameW - s) && isInt(y, 0, frameH - s))
          face = [x, y, s];
      }
      list.push({
        id: c.id,
        name: typeof c.name === 'string' && c.name ? c.name.slice(0, 16) : c.id,
        file: c.file,
        group: typeof c.group === 'string' ? c.group.slice(0, 12) : undefined,
        bg: typeof c.bg === 'string' && COLOR_PATTERN.test(c.bg) ? c.bg : undefined,
        frameW,
        frameH,
        frames,
        fps,
        face,
        top: isInt(r.top, 0, frameH - 1) ? r.top : 0,
        avatar:
          typeof r.avatar === 'string' &&
          !r.avatar.startsWith(CHARACTER_PREFIX) &&
          isAvatarId(r.avatar)
            ? r.avatar
            : undefined,
      });
    }
    set({ status: 'ready', list });
  } catch {
    set({ status: 'error', list: [] });
  }
}

/** 当前已加载的角色库（非 React 场景使用） */
export const charactersNow = (): VirtualCharacter[] => state.list;

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

/** 立绘显示高度：尽量取整数倍设备像素，保持像素边缘整齐 */
export function figureHeight(c: VirtualCharacter, target: number): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const k = Math.round((target * dpr) / c.frameH);
  const snapped = (k * c.frameH) / dpr;
  return k >= 2 && Math.abs(snapped - target) <= target * 0.18 ? snapped : target;
}

/** 某个玩家的全身像：额外角色直接取用；像素头像取对应的全身像；没有形象时按名字稳定挑一个 */
export function figureFor(
  list: VirtualCharacter[],
  avatar: string | null | undefined,
  name: string,
): VirtualCharacter | undefined {
  if (avatar?.startsWith(CHARACTER_PREFIX)) return findCharacter(list, avatar);
  const id = getCharacter(avatar)?.id ?? characterForName(name).id;
  return list.find((c) => c.avatar === id);
}

/** 返回查找函数：虚拟形象模式关闭时恒为 undefined */
export function useFigureLookup() {
  const list = useCharacters();
  const { figures } = settings.use();
  return useCallback(
    (avatar: string | null | undefined, name: string) =>
      figures ? figureFor(list, avatar, name) : undefined,
    [list, figures],
  );
}

export function useFigure(avatar: string | null | undefined, name: string) {
  return useFigureLookup()(avatar, name);
}
