import type { ClientMessage, RoomSnapshot, ServerMessage } from '@park/protocol';
import { PROTOCOL_VERSION } from '@park/protocol';
import { useSyncExternalStore } from 'react';
import { serverUrl } from './platform';
import { profile } from './store';

export type OnlineStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'offline';

export type GameMessage = Extract<ServerMessage, { t: 'game' }>;

export interface Emote {
  seat: number;
  emote: string;
  name: string;
  at: number;
}

export interface OnlineState {
  status: OnlineStatus;
  playerId: string | null;
  room: RoomSnapshot | null;
  you: { seat: number | null; isHost: boolean } | null;
  game: GameMessage | null;
  /** 服务器时间 - 本地时间 */
  clockOffset: number;
  error: { message: string; code?: string; at: number } | null;
  emotes: Emote[];
}

const initial: OnlineState = {
  status: 'idle',
  playerId: null,
  room: null,
  you: null,
  game: null,
  clockOffset: 0,
  error: null,
  emotes: [],
};

/** 联机客户端：自动重连（指数退避）、离线消息排队、状态可订阅。 */
class OnlineClient {
  private state: OnlineState = initial;
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private wanted = false;
  private retry = 0;
  private retryTimer: number | null = null;
  private queue: ClientMessage[] = [];
  private pingTimer: number | null = null;

  getState = () => this.state;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private patch(p: Partial<OnlineState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  connect(): void {
    this.wanted = true;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    )
      return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.patch({ status: this.retry > 0 ? 'reconnecting' : 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(serverUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      const { name, token, avatar } = profile.get();
      ws.send(
        JSON.stringify({
          t: 'hello',
          token,
          name,
          avatar,
          v: PROTOCOL_VERSION,
        } satisfies ClientMessage),
      );
      const pending = this.queue;
      this.queue = [];
      for (const m of pending) ws.send(JSON.stringify(m));
      this.patch({ status: 'open' });
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping' }), 20_000);
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws === ws) this.ws = null;
      if (this.wanted) this.scheduleReconnect();
      else this.patch({ status: 'idle' });
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect() {
    this.retry++;
    const delay = Math.min(8000, 400 * 2 ** Math.min(this.retry, 5));
    this.patch({ status: this.retry > 6 ? 'offline' : 'reconnecting' });
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (this.wanted) this.connect();
    }, delay);
  }

  /** 立即重试（例如用户点击"重新连接"） */
  reconnectNow(): void {
    this.retry = 0;
    this.connect();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (msg.t !== 'ping') {
      this.queue.push(msg);
      this.connect();
    }
  }

  /** 离开联机（回到大厅时调用） */
  disconnect(): void {
    this.wanted = false;
    this.queue = [];
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.patch({ ...initial });
  }

  clearError(): void {
    this.patch({ error: null });
  }

  private onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'welcome':
        this.patch({ playerId: m.playerId });
        break;
      case 'room': {
        const sameMatch = this.state.game && this.state.room?.code === m.room.code;
        this.patch({ room: m.room, you: m.you, game: sameMatch ? this.state.game : null });
        break;
      }
      case 'game':
        if (
          this.state.game &&
          this.state.game.matchNo === m.matchNo &&
          this.state.game.version > m.version
        )
          break;
        this.patch({ game: m, clockOffset: m.serverTime - Date.now() });
        break;
      case 'left':
        this.patch({ room: null, you: null, game: null });
        break;
      case 'error':
        this.patch({ error: { message: m.message, code: m.code, at: Date.now() } });
        if (m.code === 'replaced') {
          this.wanted = false;
          this.ws?.close();
        }
        break;
      case 'emote': {
        const now = Date.now();
        const emotes = [...this.state.emotes.filter((e) => now - e.at < 4000), { ...m, at: now }];
        this.patch({ emotes });
        break;
      }
      case 'pong':
        this.patch({ clockOffset: m.serverTime - Date.now() });
        break;
    }
  }
}

export const online = new OnlineClient();

export function useOnline(): OnlineState {
  return useSyncExternalStore(online.subscribe, online.getState, online.getState);
}

// 改名 / 换形象后同步给服务器
let last = `${profile.get().name}|${profile.get().avatar}`;
profile.subscribe(() => {
  const { name, avatar } = profile.get();
  const key = `${name}|${avatar}`;
  if (key !== last) {
    last = key;
    if (online.getState().status === 'open') online.send({ t: 'rename', name, avatar });
  }
});
