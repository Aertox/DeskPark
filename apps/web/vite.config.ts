import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverPort = Number(process.env.PARK_SERVER_PORT) || 8787;

export default defineConfig({
  plugins: [react()],
  server: {
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
