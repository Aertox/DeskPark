import type { AiPrompt } from '@park/engine';
import { complete } from './client';

export interface Persona {
  /** 牌桌上的名字 */
  name: string;
  /** 形象名，例如「白眉老祖」，用于确定说话风格 */
  character?: string;
}

const DECIDE_TIMEOUT_MS = 40_000;

function systemPrompt(game: string, p: Persona): string {
  return [
    `你正在桌游平台「闲亭」里玩${game}，扮演电脑玩家「${p.name}」${p.character ? `（形象是「${p.character}」）` : ''}。`,
    '每次我会给出当前局面和编号的候选动作，请认真分析局面，选出你认为最好的一个。候选里的第 1 项是规则电脑的建议，仅供参考。',
    '只输出一个 JSON 对象，不要输出其它任何文字：{"pick": 候选编号, "say": "要说的话"}',
  ].join('\n');
}

/** 从模型输出里取出 pick / say（兼容带说明文字或代码块的输出） */
export function parseDecision(text: string, count: number): { pick: number; say: string } | null {
  const json = text.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const obj = JSON.parse(json[0]) as { pick?: unknown; say?: unknown };
      const pick = Number(obj.pick);
      if (Number.isInteger(pick) && pick >= 1 && pick <= count) {
        return { pick, say: typeof obj.say === 'string' ? obj.say.trim().slice(0, 40) : '' };
      }
    } catch {
      /* 继续尝试下面的宽松解析 */
    }
  }
  const num = text.match(/"?pick"?\s*[:：]\s*(\d+)/) ?? text.match(/\b(\d{1,2})\b/);
  const pick = num ? Number(num[1]) : NaN;
  return Number.isInteger(pick) && pick >= 1 && pick <= count ? { pick, say: '' } : null;
}

/** 让模型从候选中选一个动作；wantSay 时顺便说一句话 */
export async function decide(
  prompt: AiPrompt,
  game: string,
  persona: Persona,
  wantSay: boolean,
  signal?: AbortSignal,
): Promise<{ index: number; say: string }> {
  const list = prompt.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
  const sayRule = wantSay
    ? 'say：这一手请顺便说一句符合你人设的话（不超过 20 个字，可以调侃、得意或叹气，但不要透露自己的手牌）。'
    : 'say：这一手不说话，填空字符串。';
  const text = await complete({
    system: systemPrompt(game, persona),
    user: `${prompt.situation}\n\n候选动作：\n${list}\n\n${sayRule}`,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(DECIDE_TIMEOUT_MS)])
      : AbortSignal.timeout(DECIDE_TIMEOUT_MS),
  });
  const d = parseDecision(text, prompt.options.length);
  if (!d) throw new Error('模型没有给出有效的选择');
  return { index: d.pick - 1, say: d.say };
}

/** 玩家在人机局里说话时，由一位 AI 人机回一句 */
export async function replyChat(
  game: string,
  persona: Persona,
  recent: { name: string; text: string }[],
): Promise<string> {
  const text = await complete({
    system: [
      `你正在桌游平台「闲亭」里玩${game}，扮演电脑玩家「${persona.name}」${persona.character ? `（形象是「${persona.character}」）` : ''}。`,
      '牌桌上有人在聊天。请用符合你人设的口吻回一句话：不超过 25 个字，轻松友好，不透露手牌。只输出这句话本身。',
    ].join('\n'),
    user: recent.map((m) => `${m.name}：${m.text}`).join('\n'),
    signal: AbortSignal.timeout(20_000),
  });
  return text
    .replace(/^["“「]|["”」]$/g, '')
    .trim()
    .slice(0, 40);
}

/** 设置页「测试连接」 */
export async function testConnection(): Promise<string> {
  const text = await complete({
    system: '你是连通性测试助手。',
    user: '请只回复两个字：你好',
    signal: AbortSignal.timeout(30_000),
  });
  return text.trim().slice(0, 30) || '（空回复）';
}
