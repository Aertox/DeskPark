# ---- 构建 ----
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

# ---- 运行：服务器为单文件 bundle，无需 node_modules ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 STATIC_DIR=/app/web
COPY --from=build /src/apps/server/dist/main.js ./server.js
COPY --from=build /src/apps/web/dist ./web
EXPOSE 8787
USER node
CMD ["node", "server.js"]
