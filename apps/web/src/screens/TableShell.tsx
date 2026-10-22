import type { ChatMessage } from '@park/protocol';
import { EMOTES, cleanChatText } from '@park/protocol';
import {
  BookOpen,
  Bot,
  ChevronLeft,
  MessageCircle,
  Palette,
  Smile,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ChatPanel } from '../components/Chat';
import { PixelAvatar } from '../components/pixel/PixelAvatar';
import { Button, IconButton, Sheet, toast } from '../components/ui';
import { replyChat } from '../lib/ai/agent';
import { aiEvents, aiSpeech } from '../lib/ai/events';
import { aiReady } from '../lib/ai/settings';
import { characterName } from '../lib/ai/turn';
import type { GameController } from '../lib/controller';
import { online, useOnline } from '../lib/online';
import { playSound } from '../lib/sound';
import { settings } from '../lib/store';
import { SettingsSheet } from './SettingsSheet';

const LAST_SOUND: Record<string, Parameters<typeof playSound>[0]> = {
  play: 'play',
  choose: 'play',
  pass: 'pass',
  fold: 'pass',
  check: 'pass',
  bid: 'select',
  call: 'chip',
  raise: 'chip',
  allin: 'chip',
  return: 'play',
  discard: 'play',
  exchange: 'deal',
  que: 'select',
};

const LOCAL_ID = 'local-me';

export function TableShell({
  ctl,
  title,
  children,
}: {
  ctl: GameController;
  title: string;
  children: ReactNode;
}) {
  const s = settings.use();
  const [rules, setRules] = useState(false);
  const [look, setLook] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const net = useOnline();
  const online_ = ctl.mode === 'online';
  // 人机局：聊天只在本地记录；被 AI 接管的电脑会偶尔发言，也会回应玩家
  const [localChat, setLocalChat] = useState<ChatMessage[]>([]);
  const chatMessages = online_ ? net.chat : localChat;
  const myChatId = online_ ? net.playerId : LOCAL_ID;
  const ctlRef = useRef(ctl);
  ctlRef.current = ctl;
  const pushLocal = (seat: number, text: string) => {
    const p = ctlRef.current.players[seat];
    if (!p) return;
    setLocalChat((list) => [
      ...list.slice(-59),
      {
        id: (list.at(-1)?.id ?? 0) + 1,
        kind: 'user',
        text: cleanChatText(text),
        at: Date.now(),
        name: p.name,
        avatar: p.avatar,
        playerId: p.isMe ? LOCAL_ID : `bot-${seat}`,
        seat,
      },
    ]);
  };
  const aiBots = ctl.players.flatMap((p, i) => (p.ai?.on ? [i] : []));
  const sendChat = (text: string) => {
    if (online_) {
      online.send({ t: 'chat', text });
      return;
    }
    pushLocal(ctl.seat ?? 0, text);
    // 有 AI 人机时，挑一位回话（点名优先）
    if (!aiBots.length || !aiReady()) return;
    const named = aiBots.find((i) => text.includes(ctl.players[i].name));
    const seat = named ?? aiBots[Math.floor(Math.random() * aiBots.length)];
    if (named === undefined && Math.random() < 0.25) return;
    const p = ctl.players[seat];
    const recent = [...localChat.slice(-6), { name: ctl.players[ctl.seat ?? 0].name, text }].map(
      (m) => ({
        name: 'name' in m ? (m.name ?? '?') : '?',
        text: m.text,
      }),
    );
    replyChat(ctl.def.meta.name, { name: p.name, character: characterName(p.avatar) }, recent)
      .then((reply) => {
        if (!reply) return;
        pushLocal(seat, reply);
        aiSpeech.say(seat, reply);
      })
      .catch(() => {});
  };
  // AI 事件：发言写进聊天记录；出错时提示（同类提示 20 秒内只出现一次）
  const lastErr = useRef(0);
  useEffect(() => {
    if (online_) return;
    return aiEvents.on((e) => {
      if (e.type === 'say') pushLocal(e.seat, e.text);
      else if (e.type === 'needConfig') {
        toast('先在「外观 → AI 人机」里填写接口地址和 Key');
        setLook(true);
      } else if (e.type === 'error' && Date.now() - lastErr.current > 20_000) {
        lastErr.current = Date.now();
        toast(`AI 出错：${e.message}，这一步由规则电脑代打`, 'error');
      }
    });
  }, [online_]);
  const lastChatId = chatMessages.at(-1)?.id ?? 0;
  const [seenChat, setSeenChat] = useState(lastChatId);
  useEffect(() => {
    if (chatOpen) setSeenChat(lastChatId);
  }, [chatOpen, lastChatId]);
  const incoming = chatMessages.filter(
    (m) => m.kind === 'user' && m.id > seenChat && m.playerId !== myChatId,
  );
  // 新消息提示音
  const chatSound = useRef(lastChatId);
  useEffect(() => {
    if (lastChatId > chatSound.current && incoming.length) playSound('select');
    chatSound.current = lastChatId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastChatId]);

  // 动作音效
  const lastKey = useRef('');
  useEffect(() => {
    if (!ctl.last) return;
    const key = `${ctl.version}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const snd = LAST_SOUND[ctl.last.type];
    if (snd) playSound(snd);
  }, [ctl.version, ctl.last]);

  const onBack = () => {
    if (ctl.mode === 'online' && !ctl.over) setConfirmLeave(true);
    else ctl.leave();
  };

  const offline = ctl.mode === 'online' && net.status !== 'open';
  const emotes = ctl.mode === 'online' ? net.emotes.filter((e) => Date.now() - e.at < 3500) : [];

  return (
    <div className="table" data-felt={s.felt}>
      <header className="table__top">
        <div className="table__top-left">
          <IconButton label="返回" onClick={onBack}>
            <ChevronLeft size={22} />
          </IconButton>
          <div className="table__title">
            <strong>{title}</strong>
            <span>{ctl.mode === 'online' ? '联机对局' : '单人练习'}</span>
          </div>
        </div>
        <div className="table__top-right">
          {(online_ || ctl.seat !== null) && (
            <IconButton label="聊天" onClick={() => setChatOpen((x) => !x)} active={chatOpen}>
              <MessageCircle size={19} />
              {!chatOpen && incoming.length > 0 && (
                <span className="badge num">{incoming.length > 9 ? '9+' : incoming.length}</span>
              )}
            </IconButton>
          )}
          {online_ && ctl.seat !== null && (
            <IconButton label="表情" onClick={() => setEmoteOpen((x) => !x)} active={emoteOpen}>
              <Smile size={19} />
            </IconButton>
          )}
          {ctl.seat !== null && !ctl.over && (
            <IconButton
              label={ctl.auto ? '取消托管' : '托管'}
              active={ctl.auto}
              onClick={() => ctl.setAuto(!ctl.auto)}
            >
              <Bot size={19} />
            </IconButton>
          )}
          <IconButton
            label={s.sound ? '关闭音效' : '开启音效'}
            onClick={() => settings.set({ sound: !s.sound })}
          >
            {s.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </IconButton>
          <IconButton label="外观" onClick={() => setLook(true)}>
            <Palette size={19} />
          </IconButton>
          <IconButton label="规则" onClick={() => setRules(true)}>
            <BookOpen size={19} />
          </IconButton>
        </div>
        {emoteOpen && (
          <div className="emote-picker">
            {EMOTES.map((e) => (
              <button
                key={e}
                onClick={() => {
                  online.send({ t: 'emote', emote: e });
                  setEmoteOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </header>

      {ctl.auto && (
        <div className="auto-banner">
          <Bot size={15} /> 托管中，电脑正在替你出牌
          <button onClick={() => ctl.setAuto(false)}>取消托管</button>
        </div>
      )}
      {offline && (
        <div className="net-banner">
          <WifiOff size={15} /> {net.status === 'offline' ? '网络已断开' : '正在重新连接…'}
          {net.status === 'offline' && <button onClick={() => online.reconnectNow()}>重试</button>}
        </div>
      )}
      <div className="emote-layer">
        {emotes.map((e) => (
          <div key={e.at + e.name} className="emote-float">
            <span>{e.emote}</span>
            <small>{e.name}</small>
          </div>
        ))}
      </div>

      <main className="board">{children}</main>

      {!chatOpen && incoming.length > 0 && (
        <div className="chat-peek">
          {incoming.slice(-3).map((m) => (
            <div key={m.id} className="chat-peek__item" onClick={() => setChatOpen(true)}>
              <PixelAvatar avatar={m.avatar} name={m.name ?? '?'} size={24} />
              <b>{m.name}</b>
              <span>{m.text}</span>
            </div>
          ))}
        </div>
      )}
      {chatOpen && (
        <aside className="chat-drawer" aria-label="房间聊天">
          <div className="chat-drawer__head">
            <span>
              {online_ ? '房间聊天' : '聊天'}
              <small>{online_ ? net.room?.code : '人机局'}</small>
            </span>
            <IconButton label="收起" onClick={() => setChatOpen(false)}>
              <ChevronLeft size={18} style={{ rotate: '180deg' }} />
            </IconButton>
          </div>
          <ChatPanel
            tone="felt"
            messages={chatMessages}
            myId={myChatId}
            autoFocus
            onSend={sendChat}
            placeholder={
              online_
                ? undefined
                : aiBots.length
                  ? '和 AI 人机聊几句吧（提到名字会优先回复）'
                  : '人机局：唤醒 AI 后，电脑才会说话'
            }
          />
        </aside>
      )}

      <Sheet
        open={rules}
        onClose={() => setRules(false)}
        title={`${ctl.def.meta.name} · 规则`}
        wide
      >
        <ol className="rules-list">
          {ctl.def.meta.rules.map((r: string, i: number) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
      </Sheet>

      <SettingsSheet open={look} onClose={() => setLook(false)} />

      <Sheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="离开对局？"
        subtitle="离开后你的座位将由电脑接替，对局会继续进行。"
        footer={
          <>
            <Button onClick={() => setConfirmLeave(false)}>再想想</Button>
            <Button variant="danger" onClick={() => ctl.leave()}>
              离开
            </Button>
          </>
        }
      />
    </div>
  );
}
