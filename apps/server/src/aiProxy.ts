import { lookup } from 'node:dns/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';

/**
 * AI 接口转发：浏览器直连大模型接口被跨域拦截时，由本服务器原样转发。
 *
 * 安全约束：
 * - 只转发两个固定端点：Anthropic `/v1/messages` 与 OpenAI 兼容 `/chat/completions`；
 * - 目标必须是 https 域名（不接受 IP 字面量、localhost），解析结果不能是内网 / 回环地址；
 * - 限制请求体大小、超时与每个 IP 的频率；不记录、不保存任何 Key。
 * 设置环境变量 AI_PROXY=off 可关闭。
 */

const ROUTES = {
  anthropic: {
    path: '/v1/messages',
    headers: ['x-api-key', 'anthropic-version', 'anthropic-beta'],
  },
  openai: { path: '/chat/completions', headers: ['authorization'] },
} as const;

const PREFIX = '/api/ai-proxy/';
const MAX_BODY = 256 * 1024;
const MAX_RESPONSE = 2 * 1024 * 1024;
const TIMEOUT_MS = 90_000;
const RATE_PER_MIN = 40;

export const aiProxyEnabled = () => process.env.AI_PROXY !== 'off';
export const isAiProxyPath = (url: string | undefined) => !!url && url.startsWith(PREFIX);

const hits = new Map<string, { start: number; n: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > 60_000) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > 60_000) hits.delete(k);
    return false;
  }
  return ++h.n > RATE_PER_MIN;
}

/** 内网、回环、链路本地等地址 */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const x = ip.toLowerCase();
  return (
    x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || /^fe[89ab]/.test(x)
  );
}

/** 校验目标地址，返回规范化后的 base URL；不合法时抛出给前端看的错误信息 */
export async function checkTarget(raw: string | undefined): Promise<URL> {
  let url: URL;
  try {
    url = new URL(String(raw ?? ''));
  } catch {
    throw new Error('目标接口地址无效');
  }
  if (url.protocol !== 'https:') throw new Error('只能转发到 https 接口');
  if (url.username || url.password) throw new Error('目标地址不能包含账号密码');
  if (url.port && url.port !== '443') throw new Error('只能转发到默认 443 端口');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) || host === 'localhost' || host.endsWith('.localhost') || !host.includes('.')) {
    throw new Error('只能转发到公网域名');
  }
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('无法解析目标域名');
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error('不能转发到内网地址');
  return url;
}

function send(res: ServerResponse, status: number, body: unknown, cors: Record<string, string>) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...cors });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function handleAiProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cors: Record<string, string> = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '600',
  };
  if (req.method === 'OPTIONS') {
    const asked = String(req.headers['access-control-request-headers'] ?? '');
    res.writeHead(204, { ...cors, 'access-control-allow-headers': asked.slice(0, 1000) });
    res.end();
    return;
  }
  if (!aiProxyEnabled())
    return send(res, 404, { error: { message: '本服务器未开启 AI 转发' } }, cors);
  if (req.method !== 'POST') return send(res, 405, { error: { message: '只支持 POST' } }, cors);

  const rest = (req.url ?? '').slice(PREFIX.length).split('?')[0];
  const kind = rest.split('/')[0] as keyof typeof ROUTES;
  const route = ROUTES[kind];
  if (!route || `/${rest.slice(kind.length + 1)}` !== route.path) {
    return send(res, 404, { error: { message: '不支持的转发路径' } }, cors);
  }
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (rateLimited(ip)) return send(res, 429, { error: { message: '转发请求太频繁' } }, cors);

  let target: URL;
  let body: Buffer;
  try {
    target = await checkTarget(req.headers['x-ai-target'] as string | undefined);
    body = await readBody(req);
  } catch (e) {
    return send(res, 400, { error: { message: (e as Error).message } }, cors);
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  for (const h of route.headers) {
    const v = req.headers[h];
    if (typeof v === 'string') headers[h] = v;
  }
  const upstream = `${target.origin}${target.pathname.replace(/\/+$/, '')}${route.path}`;
  try {
    const r = await fetch(upstream, {
      method: 'POST',
      headers,
      body: new Uint8Array(body),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_RESPONSE)
      return send(res, 502, { error: { message: '上游响应过大' } }, cors);
    res.writeHead(r.status, {
      'content-type': r.headers.get('content-type') ?? 'application/json',
      ...cors,
    });
    res.end(buf);
  } catch {
    send(res, 502, { error: { message: '无法连接上游 AI 接口' } }, cors);
  }
}
