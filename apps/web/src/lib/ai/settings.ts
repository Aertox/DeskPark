import { createStore } from '../store';

/**
 * AI 人机设置：只保存在本机浏览器（localStorage），请求由浏览器直接发往用户填写的接口，
 * 或在开启「经服务器转发」时由本站服务器转发（服务器不保存 Key）。
 */
export type AiProtocol = 'anthropic' | 'openai';

export interface AiSettings {
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 发言频率：0 不说话 · 1 偶尔 · 2 适中 · 3 话痨 */
  chat: 0 | 1 | 2 | 3;
  /** 经本站服务器转发（解决跨域） */
  proxy: boolean;
}

export const aiSettings = createStore<AiSettings>('park.ai', {
  protocol: 'anthropic',
  baseUrl: '',
  apiKey: '',
  model: '',
  chat: 1,
  proxy: false,
});

export const AI_DEFAULTS: Record<AiProtocol, { baseUrl: string; model: string }> = {
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
};

/** 填了默认值之后的实际配置 */
export function effectiveAi(s: AiSettings = aiSettings.get()) {
  const d = AI_DEFAULTS[s.protocol];
  return {
    ...s,
    baseUrl: (s.baseUrl.trim() || d.baseUrl).replace(/\/+$/, ''),
    model: s.model.trim() || d.model,
  };
}

export function aiReady(s: AiSettings = aiSettings.get()): boolean {
  const e = effectiveAi(s);
  return !!e.apiKey.trim() && !!e.model;
}

/** 每次决策时顺便发言的概率 */
export const CHAT_RATE = [0, 0.12, 0.25, 0.45] as const;
