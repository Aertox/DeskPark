# 部署指南

闲亭是**一个 Node 进程**：它同时提供网页、WebSocket 联机服务（`/ws`）和健康检查（`/healthz`）。
推荐用 Docker 部署：镜像基于 node:22-alpine，应用本身不到 1 MB，空闲内存占用约 50 MB，1 核 1 GB 的轻量服务器即可。

- 镜像：`ghcr.io/solitern/deskpark`（`latest` 跟随 main 分支；发版标签如 `0.3.0`；`sha-xxxxxxx` 对应每次提交）
- 架构：`linux/amd64`、`linux/arm64`
- 每次推送到 main，GitHub Actions 会构建镜像、启动容器做冒烟测试，通过后再发布。

## 一、最快上手（本机或任意服务器）

```bash
git clone https://github.com/solitern/DeskPark.git
cd DeskPark
cp .env.example .env
docker compose pull && docker compose up -d
```

打开 `http://服务器IP:8787` 即可游玩。改端口：把 `.env` 里的 `HTTP_PORT` 改成想要的值（例如 `80`），再执行 `docker compose up -d`。

不想用预构建镜像、要在本机构建：

```bash
docker compose up -d --build
```

## 二、云服务器部署（腾讯云 / 阿里云轻量应用服务器等）

1. **系统**：Ubuntu 22.04 / 24.04 或 Debian 12。
2. **安装 Docker**：

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker "$USER"   # 重新登录后生效，之后不用 sudo
   ```

3. **获取部署文件并启动**：同「一、最快上手」。
4. **放行端口**：在云控制台的「防火墙 / 安全组」中放行 `.env` 里的 `HTTP_PORT`（默认 8787，TCP）。
5. 访问 `http://服务器公网IP:8787`，把房间号或邀请链接发给朋友即可联机。

## 三、绑定域名并启用 HTTPS

仓库自带 Caddy 叠加配置，会自动申请并续期免费证书，同时代理网页与 WebSocket。

1. 把域名（例如 `game.example.com`）的 **A 记录**解析到服务器公网 IP。
   - 中国大陆的服务器使用域名对外提供网页服务需要完成 **ICP 备案**。
2. 安全组放行 **80** 与 **443**（TCP，443 建议同时放行 UDP 以启用 HTTP/3）。
3. 编辑 `.env`：

   ```ini
   DOMAIN=game.example.com
   HTTP_BIND=127.0.0.1   # 8787 只对本机开放，外部统一走 HTTPS
   ```

4. 启动：

   ```bash
   docker compose -f docker-compose.yml -f deploy/docker-compose.https.yml up -d
   ```

打开 `https://game.example.com` 即可。证书保存在 Docker 卷 `caddy_data` 中，重建容器不会丢失。

已经有 Nginx 的话也可以不用 Caddy，关键是转发 WebSocket 升级头：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 600s;
}
```

## 四、日常运维

| 操作                  | 命令                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| 更新到最新版          | `docker compose pull && docker compose up -d`                                             |
| 固定 / 回滚到某个版本 | `.env` 中设置 `DESKPARK_IMAGE=ghcr.io/solitern/deskpark:0.3.0`，再 `docker compose up -d` |
| 查看日志              | `docker compose logs -f deskpark`                                                         |
| 查看状态与健康检查    | `docker compose ps`、`curl localhost:8787/healthz`                                        |
| 停止                  | `docker compose down`                                                                     |
| 清理旧镜像            | `docker image prune -f`                                                                   |

启用了 HTTPS 叠加配置时，以上命令都要带上两个 `-f` 参数，例如：

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.https.yml pull
docker compose -f docker-compose.yml -f deploy/docker-compose.https.yml up -d
```

## 五、国内网络

- **拉取 GHCR 镜像慢 / 失败**：可以在服务器上直接本地构建，并让构建过程使用 npm 国内镜像：

  ```ini
  # .env
  NPM_REGISTRY=https://registry.npmmirror.com
  ```

  ```bash
  docker compose up -d --build
  ```

- **拉取基础镜像 `node:22-alpine`、`caddy:2-alpine` 慢**：在 `/etc/docker/daemon.json` 中配置云厂商提供的镜像加速地址（`registry-mirrors`），然后 `sudo systemctl restart docker`。
- 也可以在能访问外网的机器上 `docker save` 导出镜像，上传后 `docker load` 导入。

## 六、配置项

| 变量              | 默认值                             | 说明                                                            |
| ----------------- | ---------------------------------- | --------------------------------------------------------------- |
| `HTTP_PORT`       | `8787`                             | 对外端口                                                        |
| `HTTP_BIND`       | `0.0.0.0`                          | 监听地址；配合 HTTPS 时设为 `127.0.0.1`                         |
| `TURN_TIMEOUT_MS` | `30000`                            | 联机时每一步的时限，超时由电脑代打                              |
| `AI_PROXY`        | 开启                               | 设为 `off` 关闭 AI 接口转发（见下方「AI 人机」）                |
| `TRUST_PROXY`     | 空                                 | 部署在反向代理之后时设为 `1`，按 X-Forwarded-For 识别真实 IP    |
| `MAX_CONN_PER_IP` | `20`                               | 每个 IP 同时的联机连接数上限                                    |
| `DESKPARK_IMAGE`  | `ghcr.io/solitern/deskpark:latest` | 使用的镜像与版本                                                |
| `NPM_REGISTRY`    | 空                                 | 本地构建时使用的 npm 源                                         |
| `VITE_SERVER_URL` | 空                                 | 网页与服务器分开部署时，网页连接的 WebSocket 地址（构建时生效） |
| `DOMAIN`          | 空                                 | 启用 HTTPS 时的域名                                             |

### AI 人机与接口转发

AI 人机由玩家在网页「设置 → AI 人机」中填写自己的接口与 Key，Key 只保存在玩家的浏览器里。
浏览器直连接口被跨域（CORS）拦截时，玩家可以开启「经服务器转发」，由本服务器的 `/api/ai-proxy/` 原样转发：

- 只转发 Anthropic `/v1/messages` 与 OpenAI 兼容 `/chat/completions` 两个端点；
- 目标必须是 https 公网域名（拒绝 IP、localhost 与解析到内网的域名），有请求大小、超时与每 IP 频率限制；
- 不记录、不保存任何 Key 与内容。

不需要这个功能时，在 `.env` 中设置 `AI_PROXY=off`。

## 七、不用 Docker

```bash
npm ci
npm run build
PORT=8787 npm start
```

可以用 systemd 守护进程（示例 `/etc/systemd/system/deskpark.service`）：

```ini
[Unit]
Description=DeskPark
After=network.target

[Service]
WorkingDirectory=/opt/DeskPark
Environment=PORT=8787 NODE_ENV=production
ExecStart=/usr/bin/node apps/server/dist/main.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

## 八、注意事项

- **房间与对局保存在内存中**：重启或更新容器会结束正在进行的联机对局（玩家会自动重连，但需要重新建房）。建议在没人游玩时更新。持久化已列入路线图。
- **只运行一个实例**：房间状态不在多个进程之间共享，不要同时开多个副本做负载均衡。
- **单人模式不依赖服务器**：网页本身是纯静态资源，也可以单独部署到任意静态托管（此时只能玩单人模式）。
