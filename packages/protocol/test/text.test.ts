import { describe, expect, it } from 'vitest';
import { CHAT_MAX_LENGTH, cleanChatText, cleanPlayerName } from '../src';

describe('文本清理', () => {
  it('去掉控制字符与不可见字符，合并空白', () => {
    expect(cleanChatText('  你好\u0000\n\t世界  ')).toBe('你好 世界');
    expect(cleanChatText('a​b‮c⁦d﻿')).toBe('abcd');
    expect(cleanChatText('\u0085x')).toBe('x');
    expect(cleanChatText(42)).toBe('');
  });
  it('保留组合表情所需的零宽连接符', () => {
    expect(cleanChatText('👨‍👩‍👧')).toBe('👨‍👩‍👧');
  });
  it('按字符截断', () => {
    expect([...cleanChatText('字'.repeat(500))]).toHaveLength(CHAT_MAX_LENGTH);
    expect(cleanPlayerName('一二三四五六七八九十甲乙丙丁')).toBe('一二三四五六七八九十甲乙');
  });
  it('昵称不能借方向控制符伪装', () => {
    expect(cleanPlayerName('‮管理员')).toBe('管理员');
    expect(cleanPlayerName('​​')).toBe('');
  });
});
