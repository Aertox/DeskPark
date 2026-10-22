/** AI 人机产生的事件：发言、出错、需要先配置 */
export type AiEvent =
  | { type: 'say'; seat: number; text: string }
  | { type: 'error'; message: string }
  | { type: 'needConfig' };

const listeners = new Set<(e: AiEvent) => void>();

export const aiEvents = {
  emit(e: AiEvent) {
    listeners.forEach((l) => l(e));
  },
  on(l: (e: AiEvent) => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** 各座位最近一句话（牌桌上显示几秒气泡） */
const SPEECH_MS = 5500;
let speech: Record<number, { text: string; at: number }> = {};
const speechListeners = new Set<() => void>();

export const aiSpeech = {
  get: () => speech,
  subscribe(l: () => void) {
    speechListeners.add(l);
    return () => {
      speechListeners.delete(l);
    };
  },
  say(seat: number, text: string) {
    const at = Date.now();
    speech = { ...speech, [seat]: { text, at } };
    speechListeners.forEach((l) => l());
    setTimeout(() => {
      if (speech[seat]?.at !== at) return;
      const next = { ...speech };
      delete next[seat];
      speech = next;
      speechListeners.forEach((l) => l());
    }, SPEECH_MS);
  },
  clear() {
    speech = {};
    speechListeners.forEach((l) => l());
  },
};
