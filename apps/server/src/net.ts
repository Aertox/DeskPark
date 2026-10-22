import type { IncomingMessage } from 'node:http';

/**
 * 客户端 IP：部署在反向代理（如 Caddy）之后时设置 TRUST_PROXY=1，取 X-Forwarded-For 的第一个地址；
 * 否则直接使用连接地址（不信任可被伪造的请求头）。
 */
export function clientIp(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return req.socket.remoteAddress ?? 'unknown';
}
