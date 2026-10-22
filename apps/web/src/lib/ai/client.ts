import { serverUrl } from '../platform';
import { effectiveAi } from './settings';

export interface CompleteRequest {
  system: string;
  user: string;
  signal?: AbortSignal;
}

/** 本站服务器的 AI 转发入口（与联机服务器同源） */
function proxyBase(kind: 'anthropic' | 'openai'): string {
  const ws = new URL(serverUrl(), location.href);
  ws.protocol = ws.protocol === 'wss:' ? 'https:' : 'http:';
  return `${ws.origin}/api/ai-proxy/${kind}`;
}

/** 支持 effort 参数的 Claude 型号（较老的型号传 effort 会报错） */
const SUPPORTS_EFFORT = /^claude-(fable|mythos|opus|sonnet|haiku)-(5|4-[6-9])/;
/** 支持服务器端拒答回退（fallbacks: "default"）的型号 */
const SUPPORTS_FALLBACK = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;

export class AiError extends Error {}

/** 发起一次补全，返回模型输出的文字 */
export async function complete(req: CompleteRequest): Promise<string> {
  const cfg = effectiveAi();
  return cfg.protocol === 'anthropic' ? completeAnthropic(cfg, req) : completeOpenAI(cfg, req);
}

async function completeAnthropic(
  cfg: ReturnType<typeof effectiveAi>,
  req: CompleteRequest,
): Promise<string> {
  // 只有选择 Anthropic 格式时才加载 SDK
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: cfg.apiKey.trim(),
    baseURL: cfg.proxy ? proxyBase('anthropic') : cfg.baseUrl,
    defaultHeaders: cfg.proxy ? { 'x-ai-target': cfg.baseUrl } : undefined,
    // 用户自己的 Key、只存在本机浏览器：允许浏览器直连
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 60_000,
  });
  const params = {
    model: cfg.model,
    max_tokens: 16000,
    system: req.system,
    messages: [{ role: 'user' as const, content: req.user }],
    ...(SUPPORTS_EFFORT.test(cfg.model) ? { output_config: { effort: 'low' as const } } : {}),
  };
  const official = !cfg.proxy && new URL(cfg.baseUrl).hostname === 'api.anthropic.com';
  try {
    // 官方接口上为新型号开启服务器端拒答回退：被安全策略拒绝时自动换模型重试
    const res =
      official && SUPPORTS_FALLBACK.test(cfg.model)
        ? await client.beta.messages.create(
            { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
            { signal: req.signal },
          )
        : await client.messages.create(params, { signal: req.signal });
    if (res.stop_reason === 'refusal') throw new AiError('模型拒绝了这次请求');
    let text = '';
    for (const block of res.content) if (block.type === 'text') text += block.text;
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('API Key 无效');
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError('没有权限使用该模型');
    if (e instanceof Anthropic.NotFoundError) throw new AiError('找不到该模型或接口地址');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('请求太频繁，被限流了');
    if (e instanceof Anthropic.APIConnectionError) {
      throw new AiError(
        cfg.proxy ? '无法连接 AI 接口' : '无法连接 AI 接口（如遇跨域限制，可开启「经服务器转发」）',
      );
    }
    if (e instanceof Anthropic.APIError)
      throw new AiError(`接口返回 ${e.status ?? '错误'}：${e.message.slice(0, 80)}`);
    throw e;
  }
}

async function completeOpenAI(
  cfg: ReturnType<typeof effectiveAi>,
  req: CompleteRequest,
): Promise<string> {
  const url = cfg.proxy
    ? `${proxyBase('openai')}/chat/completions`
    : `${cfg.baseUrl}/chat/completions`;
  const messages = [
    { role: 'system', content: req.system },
    { role: 'user', content: req.user },
  ];
  const post = (body: Record<string, unknown>) =>
    fetch(url, {
      method: 'POST',
      signal: req.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey.trim()}`,
        ...(cfg.proxy ? { 'x-ai-target': cfg.baseUrl } : {}),
      },
      body: JSON.stringify({ model: cfg.model, messages, ...body }),
    });
  let res: Response;
  try {
    res = await post({ temperature: 0.8, max_tokens: 800 });
    // 部分新模型（推理模型）不接受 temperature / max_tokens：换成 max_completion_tokens 再试一次
    if (res.status === 400) {
      const text = await res
        .clone()
        .text()
        .catch(() => '');
      if (/max_tokens|temperature|max_completion_tokens|unsupported/i.test(text)) {
        res = await post({ max_completion_tokens: 2000 });
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError(
      cfg.proxy ? '无法连接 AI 接口' : '无法连接 AI 接口（如遇跨域限制，可开启「经服务器转发」）',
    );
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 100);
    if (res.status === 401) throw new AiError('API Key 无效');
    if (res.status === 404) throw new AiError('找不到该模型或接口地址');
    if (res.status === 429) throw new AiError('请求太频繁，被限流了');
    throw new AiError(`接口返回 ${res.status}${body ? `：${body}` : ''}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}
