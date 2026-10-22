import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTarget, isPrivateAddress } from '../src/aiProxy';
import { startServer } from '../src/server';

let server: ReturnType<typeof startServer>;
let base = '';

beforeAll(async () => {
  server = startServer({ port: 0, host: '127.0.0.1', staticDir: null });
  base = `http://127.0.0.1:${await server.ready}`;
});
afterAll(async () => {
  await server.close();
});

const post = (path: string, target: string) =>
  fetch(`${base}/api/ai-proxy/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ai-target': target },
    body: '{}',
  });

describe('AI 转发的安全限制', () => {
  it('识别内网与回环地址', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.8',
      '169.254.169.254',
      '::1',
      'fd00::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111'])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('只接受 https 公网域名', async () => {
    await expect(checkTarget('http://api.example.com')).rejects.toThrow('https');
    await expect(checkTarget('https://127.0.0.1')).rejects.toThrow('公网域名');
    await expect(checkTarget('https://localhost')).rejects.toThrow('公网域名');
    await expect(checkTarget('https://user:pw@api.example.com')).rejects.toThrow('账号密码');
    await expect(checkTarget('https://api.example.com:8443')).rejects.toThrow('443');
    await expect(checkTarget('not a url')).rejects.toThrow('无效');
  });

  it('拒绝不支持的路径与非法目标', async () => {
    let r = await post('openai/models', 'https://api.example.com/v1');
    expect(r.status).toBe(404);
    r = await post('anthropic/v1/complete', 'https://api.example.com');
    expect(r.status).toBe(404);
    r = await post('openai/chat/completions', 'http://169.254.169.254');
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: { message: string } }).error.message).toContain('https');
  });

  it('响应跨域预检', async () => {
    const r = await fetch(`${base}/api/ai-proxy/openai/chat/completions`, {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'authorization,content-type,x-ai-target' },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('access-control-allow-headers')).toContain('authorization');
  });
});
