/**
 * 联机协议：客户端 ⇄ 服务器之间通过 WebSocket 发送 JSON 消息。
 * 服务器是权威方：客户端只发送"意图"（动作），服务器校验后推送各座位各自的视图。
 */

export const PROTOCOL_VERSION = 1;

export type SeatKind = 'empty' | 'human' | 'bot';

export interface SeatInfo {
  kind: SeatKind;
  name?: string;
  playerId?: string;
  connected?: boolean;
  /** 托管中 */
  auto?: boolean;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomSnapshot {
  code: string;
  gameId: string;
  options: Record<string, unknown>;
  hostId: string;
  status: RoomStatus;
  seats: SeatInfo[];
  /** 观战人数 */
  spectators: number;
  /** 当前对局序号，每次开局 +1 */
  matchNo: number;
}

export type ClientMessage =
  | { t: 'hello'; token: string; name: string; v: number }
  | { t: 'create'; gameId: string; options?: Record<string, unknown>; seats?: number }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'rename'; name: string }
  | { t: 'sit'; seat: number }
  | { t: 'bot'; seat: number; add: boolean }
  | { t: 'configure'; options?: Record<string, unknown>; seats?: number }
  | { t: 'start' }
  | { t: 'act'; action: unknown }
  | { t: 'auto'; on: boolean }
  | { t: 'emote'; emote: string }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'welcome'; playerId: string; name: string }
  | { t: 'room'; room: RoomSnapshot; you: { seat: number | null; isHost: boolean } }
  | {
      t: 'game';
      matchNo: number;
      version: number;
      seat: number | null;
      view: unknown;
      /** 各座位行动截止时间（服务器时间戳，毫秒） */
      deadlines: Record<number, number>;
      serverTime: number;
      over: boolean;
    }
  | { t: 'left' }
  | { t: 'error'; message: string; code?: string }
  | { t: 'emote'; seat: number; emote: string; name: string }
  | { t: 'pong'; serverTime: number };

export const EMOTES = ['👍', '😄', '😮', '😤', '🎉', '🙏'] as const;

/** 房间号字符集：去掉了容易混淆的 0/O、1/I/L */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}
