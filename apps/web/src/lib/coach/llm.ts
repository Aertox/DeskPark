import { withTimeout } from '../ai/agent';
import { complete } from '../ai/client';
import { aiReady } from '../ai/settings';
import type { CoachGame } from './uci';

/**
 * 让大模型把引擎的结论讲成人话。所有事实都来自引擎分析，
 * 明确要求它不要自己算变化，避免讲错。
 */

export type LlmCoachGame = CoachGame | 'sichuan';

const GAME_NAME: Record<LlmCoachGame, string> = {
  chess: '国际象棋',
  xiangqi: '中国象棋',
  sichuan: '四川麻将（成都血战到底）',
};

const system = (game: LlmCoachGame) =>
  game === 'sichuan'
    ? `你是一位耐心、会鼓励人的${GAME_NAME[game]}教练，学生是业余初学者。` +
      '你会收到程序对学生当前局面的客观分析（向听数、有效进张、听牌与番数、对手动向）。请用中文回答：' +
      '先一句话说清楚该怎么做；再用学生听得懂的话讲原因，要具体到哪张牌；最后给一条以后可以记住的原则。' +
      '总共不超过 120 个字，不要用列表和标题。' +
      '只能依据分析里给出的数字和事实，不要自己推算；分析没提到的事不要编造，尤其不能猜别人手里有什么牌。'
    : `你是一位耐心、会鼓励人的${GAME_NAME[game]}教练，学生是业余初学者，正在和电脑对弈。` +
      '你会收到引擎对学生这一步（或当前局面）的客观分析。请用中文回答：' +
      '先一句话说明这步能不能走；再用学生听得懂的话讲清楚原因，要具体到棋子和位置；最后给一条以后可以记住的原则。' +
      '总共不超过 120 个字，不要用列表和标题。' +
      '只能依据分析里给出的着法和变化，不要自己推算新的变化；分析没提到的事不要编造。';

export const coachLlmReady = () => aiReady();

export async function explainWithLlm(
  game: LlmCoachGame,
  context: string,
  facts: string,
): Promise<string> {
  const text = await complete({
    system: system(game),
    user: `${context}\n\n${game === 'sichuan' ? '程序分析' : '引擎分析'}：${facts}`,
    signal: withTimeout(45000),
  });
  return text.trim();
}

export async function askCoach(
  game: LlmCoachGame,
  context: string,
  facts: string,
  history: { q: string; a: string }[],
  question: string,
): Promise<string> {
  const past = history.map((h) => `学生：${h.q}\n教练：${h.a}`).join('\n');
  const text = await complete({
    system:
      system(game).replace('总共不超过 120 个字', '回答不超过 150 个字') +
      (game === 'sichuan'
        ? '现在学生在追问，请针对问题回答；如果分析里没有足够信息判断，就直说不确定。'
        : '现在学生在追问，请针对问题回答；如果分析里没有足够信息判断，就直说不确定，并建议学生在棋盘上试走让引擎看看。'),
    user: `${context}\n\n${game === 'sichuan' ? '程序分析' : '引擎分析'}：${facts}\n\n${past ? `之前的对话：\n${past}\n\n` : ''}学生的问题：${question}`,
    signal: withTimeout(45000),
  });
  return text.trim();
}
