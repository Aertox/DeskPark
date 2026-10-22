import type { AnyGame, TableSeat } from '@park/engine';
import { Table, getGame, normalizeOptions } from '@park/engine';
import type {
  ChatMessage,
  ClientMessage,
  RoomSnapshot,
  SeatInfo,
  ServerMessage,
} from '@park/protocol';
import {
  AVATARS,
  CHAT_HISTORY,
  EMOTES,
  cleanChatText,
  cleanPlayerName,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isAvatarId,
  normalizeRoomCode,
} from '@park/protocol';
import { randomBytes } from 'node:crypto';

/** 一个连接到服务器的玩家（以 token 识别，断线重连后身份不变）。 */
export interface Client {
  id: string;
  token: string;
  name: string;
  avatar?: string;
  send: ((msg: ServerMessage) => void) | null;
  roomCode: string | null;
  lastSeen: number;
  /** 最近的发言时间，用于限流 */
  chatTimes?: number[];
  /** 最近加入失败（房间号不存在）的时间，防止穷举房间号 */
  joinFails?: number[];
}

interface SeatState extends SeatInfo {
  /** 断线时间，用于等待阶段清理座位 */
  disconnectedAt?: number;
}

export interface ServerConfig {
  turnTimeoutMs: number;
  /** 等待中的房间里，断线多久后释放座位 */
  seatGraceMs: number;
  /** 房间里没有在线真人多久后删除 */
  roomIdleMs: number;
  log?: (...args: unknown[]) => void;
}

export const DEFAULT_CONFIG: ServerConfig = {
  turnTimeoutMs: 30_000,
  seatGraceMs: 120_000,
  roomIdleMs: 15 * 60_000,
};

function humanSeat(c: Client): SeatState {
  return { kind: 'human', playerId: c.id, name: c.name, avatar: c.avatar, connected: true };
}

/** 电脑座位：挑一个房间里还没人用的形象，名字取自形象 */
function botSeat(seats: SeatInfo[]): SeatState {
  const used = new Set(seats.map((x) => x.avatar));
  const free = AVATARS.filter((a) => !used.has(a.id));
  const pool = free.length ? free : AVATARS;
  const a = pool[Math.floor(Math.random() * pool.length)];
  return { kind: 'bot', name: a.botName, avatar: a.id };
}

function randomId(bytes = 9): string {
  return randomBytes(bytes).toString('base64url');
}

function cleanName(name: unknown): string {
  return cleanPlayerName(name) || '玩家';
}

const EMOTE_SET = new Set<string>(EMOTES);
const JOIN_FAIL_WINDOW_MS = 60_000;
const JOIN_FAIL_LIMIT = 8;

class Room {
  seats: SeatState[];
  spectators = new Set<string>();
  table: Table | null = null;
  status: RoomSnapshot['status'] = 'waiting';
  matchNo = 0;
  lastActive = Date.now();
  chat: ChatMessage[] = [];
  private chatSeq = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    readonly hub: Hub,
    readonly code: string,
    public def: AnyGame,
    public options: Record<string, unknown>,
    seatCount: number,
    public hostId: string,
  ) {
    this.seats = Array.from({ length: seatCount }, () => ({ kind: 'empty' }) as SeatState);
  }

  seatOf(clientId: string): number | null {
    const i = this.seats.findIndex((s) => s.kind === 'human' && s.playerId === clientId);
    return i >= 0 ? i : null;
  }

  memberIds(): string[] {
    const ids = this.seats.filter((s) => s.kind === 'human').map((s) => s.playerId!);
    return [...new Set([...ids, ...this.spectators])];
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      gameId: this.def.meta.id,
      options: this.options,
      hostId: this.hostId,
      status: this.status,
      seats: this.seats.map(({ kind, name, avatar, playerId, connected, auto }) => ({
        kind,
        name,
        avatar,
        playerId,
        connected,
        auto,
      })),
      spectators: this.spectators.size,
      matchNo: this.matchNo,
    };
  }

  postChat(msg: Omit<ChatMessage, 'id' | 'at'>): void {
    const message: ChatMessage = { ...msg, id: ++this.chatSeq, at: Date.now() };
    this.chat.push(message);
    if (this.chat.length > CHAT_HISTORY) this.chat.shift();
    for (const id of this.memberIds()) {
      this.hub.clientById(id)?.send?.({ t: 'chat', code: this.code, message });
    }
  }

  system(text: string): void {
    this.postChat({ kind: 'system', text });
  }

  sendChatHistory(clientId: string): void {
    this.hub
      .clientById(clientId)
      ?.send?.({ t: 'chatHistory', code: this.code, messages: this.chat });
  }

  broadcastRoom(): void {
    const room = this.snapshot();
    for (const id of this.memberIds()) {
      const c = this.hub.clientById(id);
      c?.send?.({ t: 'room', room, you: { seat: this.seatOf(id), isHost: id === this.hostId } });
    }
  }

  sendGame(clientId: string): void {
    const t = this.table;
    const c = this.hub.clientById(clientId);
    if (!t || !c?.send) return;
    const seat = this.seatOf(clientId);
    c.send({
      t: 'game',
      matchNo: this.matchNo,
      version: t.version,
      seat,
      view: t.view(seat),
      deadlines: { ...t.deadlines },
      serverTime: Date.now(),
      over: t.isOver(),
      last: t.lastAction
        ? {
            seat: t.lastAction.seat,
            type: String((t.lastAction.action as { type?: unknown })?.type ?? ''),
          }
        : null,
    });
  }

  broadcastGame(): void {
    for (const id of this.memberIds()) this.sendGame(id);
  }

  hasOnlineHumans(): boolean {
    return this.memberIds().some((id) => !!this.hub.clientById(id)?.send);
  }

  start(): string | null {
    const humans = this.seats.filter((s) => s.kind === 'human').length;
    if (humans === 0) return '至少需要一名玩家';
    this.seats.forEach((st, idx) => {
      if (st.kind === 'empty') this.seats[idx] = botSeat(this.seats);
    });
    this.table?.dispose();
    this.unsubscribe?.();
    const tableSeats: TableSeat[] = this.seats.map((s) => ({
      name: s.name ?? '玩家',
      avatar: s.avatar,
      isBot: s.kind === 'bot',
      auto: !!s.auto,
      connected: s.kind === 'bot' ? true : !!(s.playerId && this.hub.clientById(s.playerId)?.send),
    }));
    this.table = new Table(this.def, tableSeats, this.options, {
      humanTimeoutMs: this.hub.config.turnTimeoutMs,
      onError: (e) => this.hub.config.log?.('[table]', this.code, e),
    });
    this.matchNo++;
    this.status = 'playing';
    this.unsubscribe = this.table.subscribe(() => {
      this.lastActive = Date.now();
      if (this.table?.isOver() && this.status === 'playing') {
        this.status = 'finished';
        this.broadcastRoom();
      }
      this.broadcastGame();
    });
    this.table.start();
    this.broadcastRoom();
    this.broadcastGame();
    return null;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.table?.dispose();
    this.table = null;
  }
}

/** 管理所有客户端与房间。与传输层解耦，便于测试。 */
export class Hub {
  private clientsByToken = new Map<string, Client>();
  private clientsById = new Map<string, Client>();
  rooms = new Map<string, Room>();

  constructor(readonly config: ServerConfig = DEFAULT_CONFIG) {}

  clientById(id: string): Client | undefined {
    return this.clientsById.get(id);
  }

  stats() {
    return {
      rooms: this.rooms.size,
      clients: [...this.clientsById.values()].filter((c) => c.send).length,
    };
  }

  /** 新连接：返回该连接的消息处理器与断开回调。 */
  connect(send: (msg: ServerMessage) => void) {
    let client: Client | null = null;
    const onMessage = (raw: unknown) => {
      let msg: ClientMessage;
      try {
        msg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ClientMessage;
      } catch {
        return send({ t: 'error', message: '消息格式错误' });
      }
      if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return;
      if (msg.t === 'ping') return send({ t: 'pong', serverTime: Date.now() });
      if (msg.t === 'hello') {
        // 同一连接换了身份：先让旧身份下线，避免它一直显示在线
        const prev = client;
        client = this.hello(msg, send);
        if (prev && prev !== client) this.detach(prev, send);
        return;
      }
      if (!client) return send({ t: 'error', message: '请先连接', code: 'no-hello' });
      client.lastSeen = Date.now();
      try {
        this.handle(client, msg);
      } catch (e) {
        this.config.log?.('[hub] error handling', msg.t, e);
        send({ t: 'error', message: '服务器内部错误' });
      }
    };
    const onClose = () => {
      if (client) this.detach(client, send);
    };
    return { onMessage, onClose };
  }

  /** 某个连接断开（或改用别的身份）：把该身份标记为离线 */
  private detach(client: Client, send: (msg: ServerMessage) => void): void {
    if (client.send !== send) return;
    client.send = null;
    client.lastSeen = Date.now();
    const room = client.roomCode ? this.rooms.get(client.roomCode) : undefined;
    if (!room) return;
    const seat = room.seatOf(client.id);
    if (seat !== null) {
      room.seats[seat].connected = false;
      room.seats[seat].disconnectedAt = Date.now();
      room.table?.setConnected(seat, false);
    }
    room.broadcastRoom();
  }

  private hello(
    msg: Extract<ClientMessage, { t: 'hello' }>,
    send: (m: ServerMessage) => void,
  ): Client {
    if (msg.v !== PROTOCOL_VERSION) {
      send({ t: 'error', message: '客户端版本过旧，请刷新页面', code: 'version' });
    }
    const token =
      typeof msg.token === 'string' && msg.token.length >= 16
        ? msg.token.slice(0, 64)
        : randomId(18);
    let client = this.clientsByToken.get(token);
    if (!client) {
      client = {
        id: randomId(),
        token,
        name: cleanName(msg.name),
        avatar: isAvatarId(msg.avatar) ? msg.avatar : undefined,
        send: null,
        roomCode: null,
        lastSeen: Date.now(),
      };
      this.clientsByToken.set(token, client);
      this.clientsById.set(client.id, client);
    } else {
      client.name = cleanName(msg.name);
      if (isAvatarId(msg.avatar)) client.avatar = msg.avatar;
    }
    // 同一身份在新页面登录：旧连接让位
    if (client.send && client.send !== send)
      client.send({ t: 'error', message: '已在其他页面登录', code: 'replaced' });
    client.send = send;
    client.lastSeen = Date.now();
    send({ t: 'welcome', playerId: client.id, name: client.name });

    const room = client.roomCode ? this.rooms.get(client.roomCode) : undefined;
    if (room) {
      const seat = room.seatOf(client.id);
      if (seat !== null) {
        room.seats[seat].connected = true;
        room.seats[seat].name = client.name;
        room.seats[seat].avatar = client.avatar;
        delete room.seats[seat].disconnectedAt;
        room.table?.setConnected(seat, true);
      }
      room.broadcastRoom();
      room.sendGame(client.id);
      room.sendChatHistory(client.id);
    } else {
      client.roomCode = null;
    }
    return client;
  }

  private error(c: Client, message: string, code?: string): void {
    c.send?.({ t: 'error', message, ...(code ? { code } : {}) });
  }

  private handle(c: Client, msg: ClientMessage): void {
    const room = c.roomCode ? this.rooms.get(c.roomCode) : undefined;
    switch (msg.t) {
      case 'rename': {
        c.name = cleanName(msg.name);
        if (isAvatarId(msg.avatar)) c.avatar = msg.avatar;
        if (room) {
          const seat = room.seatOf(c.id);
          if (seat !== null) {
            room.seats[seat].name = c.name;
            room.seats[seat].avatar = c.avatar;
            if (room.table)
              Object.assign(room.table.seats[seat], { name: c.name, avatar: c.avatar });
          }
          room.broadcastRoom();
        }
        return;
      }
      case 'create': {
        const def = getGame(String(msg.gameId));
        if (!def) return this.error(c, '未知玩法');
        if (room) this.leave(c, room);
        const seatCount = Math.max(
          def.meta.minPlayers,
          Math.min(def.meta.maxPlayers, Number(msg.seats) || def.meta.defaultPlayers),
        );
        const code = this.newCode();
        const r = new Room(this, code, def, normalizeOptions(def, msg.options), seatCount, c.id);
        r.seats[0] = humanSeat(c);
        this.rooms.set(code, r);
        c.roomCode = code;
        this.config.log?.('[room] created', code, def.meta.id, 'by', c.name);
        r.broadcastRoom();
        r.sendChatHistory(c.id);
        return;
      }
      case 'join': {
        const code = normalizeRoomCode(String(msg.code ?? ''));
        const now = Date.now();
        const fails = (c.joinFails ?? []).filter((t) => now - t < JOIN_FAIL_WINDOW_MS);
        if (fails.length >= JOIN_FAIL_LIMIT) {
          c.joinFails = fails;
          return this.error(c, '尝试太频繁了，请稍后再试');
        }
        const r = this.rooms.get(code);
        if (!r) {
          c.joinFails = [...fails, now];
          return this.error(c, `房间 ${code || ''} 不存在或已解散`, 'no-room');
        }
        if (room && room !== r) this.leave(c, room);
        c.roomCode = code;
        const isNew = r.seatOf(c.id) === null && !r.spectators.has(c.id);
        if (isNew) {
          const empty = r.status === 'waiting' ? r.seats.findIndex((s) => s.kind === 'empty') : -1;
          if (empty >= 0) r.seats[empty] = humanSeat(c);
          else r.spectators.add(c.id);
        }
        r.lastActive = Date.now();
        r.broadcastRoom();
        r.sendGame(c.id);
        if (isNew) r.system(`${c.name} 加入了房间${r.seatOf(c.id) === null ? '（观战）' : ''}`);
        r.sendChatHistory(c.id);
        return;
      }
      case 'leave': {
        if (room) this.leave(c, room);
        c.send?.({ t: 'left' });
        return;
      }
    }

    if (!room) return this.error(c, '你不在房间中');
    const isHost = room.hostId === c.id;
    const seat = room.seatOf(c.id);
    const waiting = room.status !== 'playing';

    switch (msg.t) {
      case 'sit': {
        if (!waiting) return this.error(c, '对局进行中不能换座');
        const target = room.seats[Number(msg.seat)];
        if (!target || target.kind !== 'empty') return this.error(c, '这个座位不可用');
        if (seat !== null) room.seats[seat] = { kind: 'empty' };
        room.spectators.delete(c.id);
        room.seats[Number(msg.seat)] = humanSeat(c);
        room.broadcastRoom();
        return;
      }
      case 'bot': {
        if (!isHost) return this.error(c, '只有房主可以操作');
        if (!waiting) return this.error(c, '对局进行中');
        const i = Number(msg.seat);
        const s = room.seats[i];
        if (!s) return;
        if (msg.add && s.kind === 'empty') {
          room.seats[i] = botSeat(room.seats);
        } else if (!msg.add && s.kind === 'bot') {
          room.seats[i] = { kind: 'empty' };
        } else if (!msg.add && s.kind === 'human' && s.playerId !== c.id) {
          // 房主移出玩家（转为观战）
          room.spectators.add(s.playerId!);
          room.seats[i] = { kind: 'empty' };
        }
        room.broadcastRoom();
        return;
      }
      case 'configure': {
        if (!isHost) return this.error(c, '只有房主可以修改设置');
        if (!waiting) return this.error(c, '对局进行中');
        if (msg.options)
          room.options = normalizeOptions(room.def, { ...room.options, ...msg.options });
        if (msg.seats !== undefined) {
          const n = Math.max(
            room.def.meta.minPlayers,
            Math.min(room.def.meta.maxPlayers, Number(msg.seats)),
          );
          while (room.seats.length < n) room.seats.push({ kind: 'empty' });
          while (room.seats.length > n) {
            const last = room.seats[room.seats.length - 1];
            if (last.kind === 'human') {
              const free = room.seats.findIndex((s) => s.kind === 'empty');
              if (free < 0 || free >= n) break;
              room.seats[free] = last;
            }
            room.seats.pop();
          }
        }
        room.broadcastRoom();
        return;
      }
      case 'start': {
        if (!isHost) return this.error(c, '只有房主可以开始');
        if (room.status === 'playing') return this.error(c, '对局已经开始');
        // 观战者在重新开局时自动入座空位
        for (const id of [...room.spectators]) {
          const empty = room.seats.findIndex((s) => s.kind === 'empty');
          const sc = this.clientById(id);
          if (empty < 0 || !sc?.send) break;
          room.seats[empty] = humanSeat(sc);
          room.spectators.delete(id);
        }
        const err = room.start();
        if (err) this.error(c, err);
        return;
      }
      case 'act': {
        if (seat === null || !room.table) return this.error(c, '你没有参与这局');
        const err = room.table.act(seat, msg.action);
        if (err) {
          this.error(c, err);
          room.sendGame(c.id);
        }
        return;
      }
      case 'auto': {
        if (seat === null) return;
        room.seats[seat].auto = !!msg.on;
        room.table?.setAuto(seat, !!msg.on);
        room.broadcastRoom();
        return;
      }
      case 'chat': {
        const text = cleanChatText(msg.text);
        if (!text) return;
        const now = Date.now();
        const times = (c.chatTimes ?? []).filter((t) => now - t < 8000);
        if (times.length >= 6 || (times.length && now - times[times.length - 1] < 500)) {
          c.chatTimes = times;
          return this.error(c, '发言太快了，歇一会儿吧');
        }
        times.push(now);
        c.chatTimes = times;
        room.lastActive = now;
        room.postChat({ kind: 'user', text, name: c.name, avatar: c.avatar, playerId: c.id, seat });
        return;
      }
      case 'emote': {
        if (seat === null) return;
        const emote = String(msg.emote);
        if (!EMOTE_SET.has(emote)) return;
        for (const id of room.memberIds()) {
          this.clientById(id)?.send?.({ t: 'emote', seat, emote, name: c.name });
        }
        return;
      }
    }
  }

  private leave(c: Client, room: Room): void {
    const seat = room.seatOf(c.id);
    room.spectators.delete(c.id);
    if (seat !== null) {
      if (room.status === 'playing') {
        // 对局中离开：座位交给电脑
        room.seats[seat] = { kind: 'bot', name: `${c.name}(电脑)`, avatar: c.avatar };
        room.table?.setSeat(seat, { isBot: true, name: `${c.name}(电脑)` });
      } else {
        room.seats[seat] = { kind: 'empty' };
      }
    }
    c.roomCode = null;
    let newHost: Client | undefined;
    if (room.hostId === c.id) {
      const next = room.memberIds()[0];
      if (next) {
        room.hostId = next;
        newHost = this.clientById(next);
      }
    }
    if (room.memberIds().length === 0) {
      this.removeRoom(room);
    } else {
      room.broadcastRoom();
      room.system(
        `${c.name} 离开了房间${seat !== null && room.status === 'playing' ? '，由电脑接替' : ''}`,
      );
      if (newHost) room.system(`${newHost.name} 成为新房主`);
    }
  }

  private removeRoom(room: Room): void {
    room.dispose();
    this.rooms.delete(room.code);
    for (const id of room.memberIds()) {
      const c = this.clientById(id);
      if (c && c.roomCode === room.code) c.roomCode = null;
    }
    this.config.log?.('[room] removed', room.code);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      const bytes = randomBytes(ROOM_CODE_LENGTH);
      for (let i = 0; i < ROOM_CODE_LENGTH; i++)
        code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
  }

  /** 定期清理：释放长时间断线的等待座位、删除空闲房间、遗忘久未出现的身份。 */
  sweep(now = Date.now()): void {
    for (const room of [...this.rooms.values()]) {
      if (room.status !== 'playing') {
        let changed = false;
        room.seats.forEach((s, i) => {
          if (
            s.kind === 'human' &&
            s.connected === false &&
            s.disconnectedAt &&
            now - s.disconnectedAt > this.config.seatGraceMs
          ) {
            const c = this.clientById(s.playerId!);
            if (c && c.roomCode === room.code) c.roomCode = null;
            room.seats[i] = { kind: 'empty' };
            changed = true;
          }
        });
        if (changed) {
          if (!room.memberIds().includes(room.hostId) && room.memberIds()[0])
            room.hostId = room.memberIds()[0];
          room.broadcastRoom();
        }
      }
      if (!room.hasOnlineHumans() && now - room.lastActive > this.config.roomIdleMs)
        this.removeRoom(room);
      else if (room.hasOnlineHumans()) room.lastActive = Math.max(room.lastActive, now - 1);
    }
    for (const c of [...this.clientsById.values()]) {
      if (!c.send && !c.roomCode && now - c.lastSeen > 24 * 3600_000) {
        this.clientsById.delete(c.id);
        this.clientsByToken.delete(c.token);
      }
    }
  }

  dispose(): void {
    for (const r of this.rooms.values()) r.dispose();
    this.rooms.clear();
  }
}
