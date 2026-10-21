import { startServer } from './server';

const port = Number(process.env.PORT) || 8787;
const turnTimeoutMs = Number(process.env.TURN_TIMEOUT_MS) || 30_000;

const server = startServer({
  port,
  host: process.env.HOST,
  staticDir: process.env.STATIC_DIR,
  config: {
    turnTimeoutMs,
    log: (...args) => console.log(new Date().toISOString(), ...args),
  },
});

server.ready.then((p) => {
  console.log(`🏯 闲亭服务器已启动  http://localhost:${p}   (WebSocket: /ws)`);
  console.log(`   静态资源目录: ${server.staticDir}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close().finally(() => process.exit(0));
  });
}
