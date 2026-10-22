import { describe, expect, it } from 'vitest';
import { parseDecision, withTimeout } from '../src/lib/ai/agent';

describe('AI 决策解析', () => {
  it('标准 JSON', () => {
    expect(parseDecision('{"pick": 3, "say": "看我的"}', 5)).toEqual({ pick: 3, say: '看我的' });
  });
  it('夹杂说明文字或代码块', () => {
    expect(parseDecision('我选第二个。\n```json\n{"pick":2,"say":""}\n```', 4)).toEqual({
      pick: 2,
      say: '',
    });
  });
  it('超出范围或无效时返回 null', () => {
    expect(parseDecision('{"pick": 9}', 4)).toBeNull();
    expect(parseDecision('随便出吧', 4)).toBeNull();
    expect(parseDecision('{"pick": "1.5"}', 4)).toBeNull();
  });
  it('宽松解析：只有编号', () => {
    expect(parseDecision('pick: 4', 6)).toEqual({ pick: 4, say: '' });
  });
  it('发言会被截断', () => {
    const d = parseDecision(JSON.stringify({ pick: 1, say: '话'.repeat(100) }), 2);
    expect([...d!.say]).toHaveLength(40);
  });
});

describe('超时信号', () => {
  it('超时后中止', async () => {
    const s = withTimeout(20);
    expect(s.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(s.aborted).toBe(true);
  });
  it('外部取消会传递过来', () => {
    const ctrl = new AbortController();
    const s = withTimeout(10_000, ctrl.signal);
    ctrl.abort();
    expect(s.aborted).toBe(true);
  });
});

describe('AI 决策解析：边界', () => {
  it('只回一个数字', () => {
    expect(parseDecision(' 2 ', 3)).toEqual({ pick: 2, say: '' });
  });
  it('不会从推理文字里乱抓数字', () => {
    expect(parseDecision('对手还剩 3 张，我觉得应该保守', 5)).toBeNull();
  });
  it('表情不会被截成半个字符', () => {
    const d = parseDecision(JSON.stringify({ pick: 1, say: '😀'.repeat(50) }), 2);
    expect(d!.say).toBe('😀'.repeat(40));
  });
});
