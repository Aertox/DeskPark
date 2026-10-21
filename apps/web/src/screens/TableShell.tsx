import { EMOTES } from '@park/protocol';
import {
  BookOpen,
  Bot,
  ChevronLeft,
  Palette,
  Smile,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Sheet } from '../components/ui';
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
  const net = useOnline();

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
          {ctl.mode === 'online' && ctl.seat !== null && (
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
