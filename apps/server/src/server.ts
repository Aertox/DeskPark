import type { ServerMessage } from '@park/protocol';
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { handleAiProxy, isAiProxyPath } from './aiProxy';
import type { ServerConfig } from './rooms';
import { DEFAULT_CONFIG, Hub } from './rooms';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StartOptions {
  port: number;
  host?: string;
  staticDir?: string | null;
  config?: Partial<ServerConfig>;
}

function defaultStaticDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  return resolve(here, '../../web/dist');
}

function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(root, rel));
  const inside = file.startsWith(root + sep);
  const target =
    inside && existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
  if (!existsSync(target)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Web 客户端尚未构建。请先运行 npm run build，或使用 npm run dev 进行开发。');
    return;
  }
  const ext = extname(target);
  const immutable = target.startsWith(join(root, 'assets') + sep);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(target).pipe(res);
}

export function startServer(opts: StartOptions) {
  const config: ServerConfig = { ...DEFAULT_CONFIG, ...opts.config };
  const hub = new Hub(config);
  const staticDir = opts.staticDir === null ? null : resolve(opts.staticDir ?? defaultStaticDir());

  const http = createHttpServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...hub.stats() }));
      return;
    }
    if (isAiProxyPath(req.url)) {
      void handleAiProxy(req, res);
      return;
    }
    if (!staticDir) {
      res.writeHead(404);
      res.end();
      return;
    }
    serveStatic(staticDir, req, res);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (socket) => {
    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const { onMessage, onClose } = hub.connect(send);
    // 简单限流：每秒最多 30 条消息
    let windowStart = Date.now();
    let count = 0;
    socket.on('message', (data) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > 30) return;
      onMessage(data.toString());
    });
    socket.on('close', onClose);
    socket.on('error', () => socket.close());
  });

  // 心跳：清理僵尸连接
  const alive = new WeakSet<object>();
  wss.on('connection', (socket) => {
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
  });
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, 30_000);
  const sweeper = setInterval(() => hub.sweep(), 30_000);

  const ready = new Promise<number>((resolveReady) => {
    http.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      const addr = http.address();
      resolveReady(typeof addr === 'object' && addr ? addr.port : opts.port);
    });
  });

  const close = async () => {
    clearInterval(heartbeat);
    clearInterval(sweeper);
    hub.dispose();
    for (const s of wss.clients) s.terminate();
    await new Promise<void>((r) => wss.close(() => r()));
    await new Promise<void>((r) => http.close(() => r()));
  };

  return { hub, ready, close, staticDir };
}
