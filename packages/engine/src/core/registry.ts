import type { AnyGame } from './types';

/**
 * 玩法注册表。新增玩法只需实现 GameDefinition 并在这里（或运行时）注册即可，
 * 前端大厅、设置表单与联机服务器都会自动识别。
 */
const games = new Map<string, AnyGame>();

export function registerGame(def: AnyGame): void {
  if (games.has(def.meta.id)) throw new Error(`game "${def.meta.id}" already registered`);
  games.set(def.meta.id, def);
}

export function getGame(id: string): AnyGame | undefined {
  return games.get(id);
}

export function listGames(): AnyGame[] {
  return [...games.values()];
}

/** 用默认值补齐、并校验来自客户端的设置。 */
export function normalizeOptions(def: AnyGame, input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = { ...def.defaultOptions };
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  for (const field of def.optionFields) {
    const v = src[field.key];
    if (field.type === 'toggle') {
      if (typeof v === 'boolean') out[field.key] = v;
    } else if (field.choices.some((c) => c.value === v)) {
      out[field.key] = v;
    }
  }
  return out;
}
