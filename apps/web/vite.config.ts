import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverPort = Number(process.env.PARK_SERVER_PORT) || 8787;

/** 跨域隔离：棋类导师的多线程引擎需要（与生产服务器一致） */
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  preview: { headers: isolation },
  worker: { format: 'es' },
  server: {
    headers: isolation,
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
});
