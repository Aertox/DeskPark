import type { ClientMessage, ServerMessage } from '@park/protocol';
import { AVATARS, PROTOCOL_VERSION } from '@park/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../src/server';

type Srv = ReturnType<typeof startServer>;
let server: Srv;
let port = 0;

beforeAll(async () => {
  server = startServer({
    port: 0,
    host: '127.0.0.1',
    staticDir: null,
    config: { turnTimeoutMs: 5000 },
  });
  port = await server.ready;
});
afterAll(async () => {
  await server.close();
});

class TestClient {
  ws: WebSocket;
  inbox: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] =
    [];
  opened: Promise<void>;

  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.opened = new Promise((r) => this.ws.once('open', () => r()));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMessage;
      this.inbox.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(m)) {
          w.resolve(m);
          return false;
        }
        return true;
      });
    });
  }
  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }
  wait<T extends ServerMessage['t']>(
    t: T,
    pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
    ms = 4000,
  ) {
    return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
      const found = this.inbox.find(
        (m) => m.t === t && pred(m as Extract<ServerMessage, { t: T }>),
      );
      if (found) return resolve(found as Extract<ServerMessage, { t: T }>);
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), ms);
      this.waiters.push({
        pred: (m) => m.t === t && pred(m as Extract<ServerMessage, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        },
      });
    });
  }
  close() {
    this.ws.close();
  }
}

describe('联机服务器', () => {
  it('创建房间、加入、补电脑并开局', async () => {
    const a = new TestClient();
    const b = new TestClient();
    await Promise.all([a.opened, b.opened]);
    a.send({
      t: 'hello',
      token: 'token-aaaaaaaaaaaaaaaa',
      name: '甲',
      avatar: 'hero-pig',
      v: PROTOCOL_VERSION,
    });
    b.send({ t: 'hello', token: 'token-bbbbbbbbbbbbbbbb', name: '乙', v: PROTOCOL_VERSION });
    await a.wait('welcome');
    await b.wait('welcome');

    a.send({ t: 'create', gameId: 'doudizhu' });
    const created = await a.wait('room');
    expect(created.you.isHost).toBe(true);
    const code = created.room.code;
    expect(code).toHaveLength(4);

    b.send({ t: 'join', code: code.toLowerCase() });
    const joined = await b.wait(
      'room',
      (m) => m.room.seats.filter((s) => s.kind === 'human').length === 2,
    );
    expect(joined.you.seat).toBe(1);

    a.send({ t: 'bot', seat: 2, add: true });
    const withBot = await a.wait('room', (m) => m.room.seats[2].kind === 'bot');
    // 电脑拿到一个形象，名字取自该形象；房主的形象同步给了其他人
    const bot = withBot.room.seats[2];
    expect(AVATARS.find((x) => x.id === bot.avatar)?.botName).toBe(bot.name);
    expect(withBot.room.seats[0].avatar).toBe('hero-pig');

    b.send({ t: 'start' });
    await b.wait('error', (m) => m.message.includes('房主'));

    a.send({ t: 'start' });
    const gameA = await a.wait('game');
    const gameB = await b.wait('game');
    expect(gameA.seat).toBe(0);
    expect(gameB.seat).toBe(1);
    const viewA = gameA.view as { hand: unknown[] };
    const viewB = gameB.view as { hand: { id: number }[] };
    expect(viewA.hand).toHaveLength(17);
    // 每个人只能看到自己的手牌
    expect(JSON.stringify(viewA)).not.toContain(`"id":${viewB.hand[0].id},"suit"`);

    // 断线重连后恢复座位与视图
    b.close();
    await a.wait('room', (m) => m.room.seats[1].connected === false);
    const b2 = new TestClient();
    await b2.opened;
    b2.send({ t: 'hello', token: 'token-bbbbbbbbbbbbbbbb', name: '乙', v: PROTOCOL_VERSION });
    const back = await b2.wait('room');
    expect(back.you.seat).toBe(1);
    await b2.wait('game');
    a.close();
    b2.close();
  });

  it('加入不存在的房间会报错', async () => {
    const c = new TestClient();
    await c.opened;
    c.send({ t: 'hello', token: 'token-cccccccccccccccc', name: '丙', v: PROTOCOL_VERSION });
    c.send({ t: 'join', code: 'ZZZZ' });
    const err = await c.wait('error');
    expect(err.message).toContain('不存在');
    c.close();
  });

  it('全电脑对手时对局会自动推进', async () => {
    const d = new TestClient();
    await d.opened;
    d.send({ t: 'hello', token: 'token-dddddddddddddddd', name: '丁', v: PROTOCOL_VERSION });
    d.send({ t: 'create', gameId: 'highcard', seats: 2 });
    await d.wait('room');
    d.send({ t: 'start' });
    const first = await d.wait('game');
    const view = first.view as { hand: { id: number }[] };
    d.send({ t: 'act', action: { type: 'choose', card: view.hand[0].id } });
    const later = await d.wait(
      'game',
      (m) => (m.view as { phase: string }).phase === 'reveal',
      5000,
    );
    expect(later.version).toBeGreaterThan(first.version);
    d.close();
  });
});
