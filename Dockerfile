# syntax=docker/dockerfile:1
# 闲亭 DeskPark —— 单镜像部署：Node 服务器同时提供网页与 WebSocket 联机服务。

ARG NODE_VERSION=22

# ---------- 构建 ----------
# 构建产物（JS bundle + 静态网页）与 CPU 架构无关，因此构建阶段固定在构建机的原生平台运行，
# 多架构镜像只需把产物复制进各自的运行时镜像，不必在模拟器里重复安装依赖与打包。
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build
WORKDIR /src
# 国内构建可传入 npm 镜像源，例如：--build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=""
# 网页与服务器分开部署时，可在构建时指定联机地址，例如 wss://game.example.com/ws
ARG VITE_SERVER_URL=""

COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
  && npm ci --no-audit --no-fund

COPY . .
RUN VITE_SERVER_URL="$VITE_SERVER_URL" npm run build

# ---------- 运行：服务器是单文件 bundle，镜像里不需要 node_modules ----------
FROM node:${NODE_VERSION}-alpine
LABEL org.opencontainers.image.title="DeskPark 闲亭" \
      org.opencontainers.image.description="简洁优雅的网页桌游：斗地主、掼蛋、德州扑克、四川麻将" \
      org.opencontainers.image.source="https://github.com/solitern/DeskPark" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    STATIC_DIR=/app/web \
    TURN_TIMEOUT_MS=30000

COPY --from=build --chown=node:node /src/apps/server/dist/main.js ./server.js
COPY --from=build --chown=node:node /src/apps/web/dist ./web

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
