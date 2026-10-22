import type { Table } from '@park/engine';
import { Rng, randomSeed } from '@park/engine';
import { getCharacter } from '../../components/pixel/characters';
import { charactersNow, findCharacter } from '../characters';
import { decide } from './agent';
import { aiEvents, aiSpeech } from './events';
import { CHAT_RATE, aiReady, aiSettings } from './settings';

/** 形象名：像素头像或额外角色 */
export function characterName(avatar: string | undefined): string | undefined {
  return getCharacter(avatar)?.name ?? findCharacter(charactersNow(), avatar)?.name;
}

/** 某个座位是否可以由 AI 接管（玩法支持 + 是电脑玩家） */
export function aiCapable(table: Table, seat: number): boolean {
  return !!table.def.aiPrompt && !!table.seats[seat]?.isBot;
}

/**
 * Table 的 delegate：AI 接管的电脑座位轮到行动时，把它的 view 交给大模型选择。
 * 返回 null 表示这一步交给规则电脑（未开启、未配置、或只有一种选择）。
 */
export function aiTurn(table: Table, seat: number): Promise<unknown> | null {
  const s = table.seats[seat];
  if (!s?.ai || !aiReady()) return null;
  const prompt = table.def.aiPrompt?.(table.view(seat), seat, new Rng(randomSeed()));
  if (!prompt || prompt.options.length <= 1) return null;
  const wantSay = Math.random() < CHAT_RATE[aiSettings.get().chat];
  return decide(
    prompt,
    table.def.meta.name,
    { name: s.name, character: characterName(s.avatar) },
    wantSay,
  ).then(
    ({ index, say }) => {
      if (say) {
        aiSpeech.say(seat, say);
        aiEvents.emit({ type: 'say', seat, text: say });
      }
      return prompt.options[index].action;
    },
    (e: unknown) => {
      aiEvents.emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      throw e;
    },
  );
}
