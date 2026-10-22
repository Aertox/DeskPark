/**
 * 联机协议：客户端 ⇄ 服务器之间通过 WebSocket 发送 JSON 消息。
 * 服务器是权威方：客户端只发送"意图"（动作），服务器校验后推送各座位各自的视图。
 */

export const PROTOCOL_VERSION = 1;

export type SeatKind = 'empty' | 'human' | 'bot';

export interface SeatInfo {
  kind: SeatKind;
  name?: string;
  /** 像素形象 id（见 AVATARS） */
  avatar?: string;
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

/** 房间聊天消息（服务器分配 id 与时间） */
export interface ChatMessage {
  id: number;
  kind: 'user' | 'system';
  text: string;
  at: number;
  name?: string;
  avatar?: string;
  playerId?: string;
  /** 发言者座位；观战者为 null */
  seat?: number | null;
}

export const CHAT_MAX_LENGTH = 100;
export const CHAT_HISTORY = 60;

/** 快捷语 */
export const QUICK_PHRASES = [
  '快点出牌吧～',
  '好牌！',
  '厉害厉害',
  '合作愉快',
  '不好意思，刚才网卡了',
  '手气不错',
  '再来一局？',
  '我先走一步啦',
] as const;

/** 控制字符（含 C1） */
// eslint-disable-next-line no-control-regex -- 有意去掉控制字符
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
/** 零宽、文字方向覆盖等不可见字符：可用来伪装名字（保留表情用的 U+200D） */
const INVISIBLE_CHARS = /[\u00ad\u200b\u200c\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;

function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  const s = input
    .replace(CONTROL_CHARS, ' ')
    .replace(INVISIBLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...s].slice(0, max).join('');
}

/** 清理聊天文本：去掉控制字符与不可见字符、合并空白、按字符截断 */
export function cleanChatText(input: unknown): string {
  return cleanText(input, CHAT_MAX_LENGTH);
}

export const NAME_MAX_LENGTH = 12;

/** 清理昵称：同上，最长 12 个字符；为空时返回空字符串 */
export function cleanPlayerName(input: unknown): string {
  return cleanText(input, NAME_MAX_LENGTH);
}

export type ClientMessage =
  | { t: 'hello'; token: string; name: string; avatar?: string; v: number }
  | { t: 'create'; gameId: string; options?: Record<string, unknown>; seats?: number }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'rename'; name: string; avatar?: string }
  | { t: 'sit'; seat: number }
  | { t: 'bot'; seat: number; add: boolean }
  | { t: 'configure'; options?: Record<string, unknown>; seats?: number }
  | { t: 'start' }
  | { t: 'act'; action: unknown }
  | { t: 'auto'; on: boolean }
  | { t: 'emote'; emote: string }
  | { t: 'chat'; text: string }
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
      /** 最近一次动作的座位与类型（不含具体内容，避免泄露隐藏信息） */
      last: { seat: number; type: string } | null;
    }
  | { t: 'left' }
  | { t: 'error'; message: string; code?: string }
  | { t: 'emote'; seat: number; emote: string; name: string }
  | { t: 'chat'; code: string; message: ChatMessage }
  | { t: 'chatHistory'; code: string; messages: ChatMessage[] }
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

/**
 * 像素形象：id 与电脑玩家使用的名字。像素画本身在 Web 客户端（apps/web/src/components/pixel）。
 * 新增形象时两边都要加；测试会校验它们一一对应。
 */
export const AVATARS = [
  { id: 'cyber-hacker', botName: '霓虹' },
  { id: 'cyber-ronin', botName: '零号' },
  { id: 'cyber-dj', botName: '电音' },
  { id: 'cyber-cat', botName: '喵七' },
  { id: 'xian-sword', botName: '青锋' },
  { id: 'xian-fox', botName: '九尾' },
  { id: 'xian-taoist', botName: '小道' },
  { id: 'xian-elder', botName: '老祖' },
  { id: 'xian-fairy', botName: '瑶池' },
  { id: 'hero-pig', botName: '猪小侠' },
  { id: 'anime-ninja', botName: '影' },
  { id: 'anime-magical', botName: '星光' },
  { id: 'anime-catgirl', botName: '咪咪' },
  { id: 'anime-samurai', botName: '一刀' },
  { id: 'anime-pilot', botName: '破晓' },
  { id: 'cute-panda', botName: '团团' },
  { id: 'cute-dino', botName: '嗷呜' },
  { id: 'cute-frog', botName: '呱呱' },
  { id: 'cute-ghost', botName: '飘飘' },
  { id: 'cute-robot', botName: '铁蛋' },
  { id: 'cute-chick', botName: '叽叽' },
  { id: 'cute-astronaut', botName: '星际' },
] as const;

export type AvatarId = (typeof AVATARS)[number]['id'];

/** 虚拟角色（图片角色库）使用 `vc:<id>` 作为形象 id */
export const CHARACTER_PREFIX = 'vc:';
export const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isAvatarId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (AVATARS.some((a) => a.id === id)) return true;
  return (
    id.startsWith(CHARACTER_PREFIX) && CHARACTER_ID_PATTERN.test(id.slice(CHARACTER_PREFIX.length))
  );
}
