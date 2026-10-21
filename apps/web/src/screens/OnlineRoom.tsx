import { getGame } from '@park/engine';
import { Bot, Check, ChevronLeft, Copy, Crown, Link2, Plus, UserMinus, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Avatar } from '../components/Seat';
import { Button, IconButton } from '../components/ui';
import { getGameUI } from '../games';
import { useOnlineController } from '../lib/controller';
import { online, useOnline } from '../lib/online';
import { copyText } from '../lib/platform';
import { navigate, roomLink } from '../lib/router';
import { OptionsForm, PlayerCountField } from './SetupSheet';
import { TableShell } from './TableShell';
import './room.css';

export function OnlineRoom({ code }: { code: string }) {
  const net = useOnline();
  const ctl = useOnlineController();
  const creating = code === 'NEW';

  useEffect(() => {
    online.connect();
    if (!creating) online.send({ t: 'join', code });
  }, [code, creating]);

  useEffect(() => {
    if (creating && net.room) navigate(`/room/${net.room.code}`, true);
  }, [creating, net.room]);

  const room = net.room && (creating || net.room.code === code) ? net.room : null;
  const notFound = !room && net.error && /不存在/.test(net.error.message);

  if (!room) {
    return (
      <div className="room-state">
        {notFound ? (
          <>
            <h2>房间 {code} 不存在</h2>
            <p>可能已经解散，或房间号输入有误。</p>
            <Button variant="primary" onClick={() => navigate('/')}>
              返回大厅
            </Button>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p>
              {net.status === 'offline'
                ? '无法连接服务器'
                : creating
                  ? '正在创建房间…'
                  : `正在进入房间 ${code}…`}
            </p>
            {net.status === 'offline' && (
              <Button onClick={() => online.reconnectNow()}>重试</Button>
            )}
            <Button variant="ghost" onClick={() => navigate('/')}>
              返回大厅
            </Button>
          </>
        )}
      </div>
    );
  }

  const def = getGame(room.gameId)!;
  const ui = getGameUI(room.gameId)!;
  if (room.status !== 'waiting' && ctl) {
    return (
      <TableShell ctl={ctl} title={def.meta.name}>
        <Suspense fallback={<div className="loading on-felt">正在摆牌…</div>}>
          <ui.Board ctl={ctl} />
        </Suspense>
      </TableShell>
    );
  }
  return <WaitingRoom />;
}

function WaitingRoom() {
  const net = useOnline();
  const room = net.room!;
  const you = net.you!;
  const def = getGame(room.gameId)!;
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const isHost = you.isHost;
  const filled = room.seats.filter((s) => s.kind !== 'empty').length;

  const copy = async (what: 'code' | 'link') => {
    const ok = await copyText(what === 'code' ? room.code : roomLink(room.code));
    if (ok) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    }
  };

  const leave = () => {
    online.send({ t: 'leave' });
    navigate('/');
  };

  return (
    <div className="room">
      <header className="room__top">
        <IconButton label="离开房间" onClick={leave}>
          <ChevronLeft size={22} />
        </IconButton>
        <div className="room__title">
          <span>{def.meta.name}</span>
          <small>等待开局</small>
        </div>
        <span style={{ width: 38 }} />
      </header>

      <section className="room__code">
        <span className="room__label">房间号</span>
        <button className="room__digits" onClick={() => copy('code')} aria-label="复制房间号">
          {room.code.split('').map((ch, i) => (
            <i key={i}>{ch}</i>
          ))}
        </button>
        <div className="room__share">
          <Button size="sm" onClick={() => copy('code')}>
            {copied === 'code' ? <Check size={14} /> : <Copy size={14} />} 复制房间号
          </Button>
          <Button size="sm" onClick={() => copy('link')}>
            {copied === 'link' ? <Check size={14} /> : <Link2 size={14} />} 复制邀请链接
          </Button>
        </div>
      </section>

      <section className="room__seats">
        {room.seats.map((s, i) => {
          const mine = i === you.seat;
          return (
            <div key={i} className={`rseat is-${s.kind} ${mine ? 'is-mine' : ''}`}>
              {s.kind === 'empty' ? (
                <>
                  <span className="rseat__empty">空位</span>
                  <div className="rseat__ops">
                    {isHost && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => online.send({ t: 'bot', seat: i, add: true })}
                      >
                        <Plus size={14} /> 电脑
                      </Button>
                    )}
                    {!isHost || you.seat === null ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => online.send({ t: 'sit', seat: i })}
                      >
                        坐这里
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => online.send({ t: 'sit', seat: i })}
                      >
                        换到这
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Avatar name={s.name ?? '?'} avatar={s.avatar} size={40} />
                  <div className="rseat__who">
                    <strong>
                      {s.name}
                      {mine && <em>你</em>}
                    </strong>
                    <span>
                      {s.kind === 'bot' ? (
                        <>
                          <Bot size={12} /> 电脑
                        </>
                      ) : s.playerId === room.hostId ? (
                        <>
                          <Crown size={12} /> 房主
                        </>
                      ) : s.connected === false ? (
                        '离线'
                      ) : (
                        '已就位'
                      )}
                    </span>
                  </div>
                  {isHost && !mine && (
                    <IconButton
                      label={s.kind === 'bot' ? '移除电脑' : '请出座位'}
                      onClick={() => online.send({ t: 'bot', seat: i, add: false })}
                    >
                      {s.kind === 'bot' ? <X size={16} /> : <UserMinus size={16} />}
                    </IconButton>
                  )}
                </>
              )}
              <span className="rseat__no">{i + 1}</span>
            </div>
          );
        })}
      </section>

      <section className="room__options">
        <h3>
          对局设置<small>{isHost ? '房主可修改' : '仅房主可修改'}</small>
        </h3>
        <PlayerCountField
          def={def}
          value={room.seats.length}
          disabled={!isHost}
          onChange={(n) => online.send({ t: 'configure', seats: n })}
        />
        <OptionsForm
          def={def}
          options={room.options}
          disabled={!isHost}
          onChange={(o) => online.send({ t: 'configure', options: o })}
        />
      </section>

      <footer className="room__foot">
        {isHost ? (
          <>
            <Button variant="primary" size="lg" block onClick={() => online.send({ t: 'start' })}>
              开始对局
            </Button>
            <small>
              {filled < room.seats.length
                ? `还有 ${room.seats.length - filled} 个空位，开局时将由电脑补齐`
                : '人已到齐'}
              {room.spectators > 0 ? ` · ${room.spectators} 人观战` : ''}
            </small>
          </>
        ) : (
          <div className="room__wait">
            <div className="spinner small" /> 等待房主开始…
          </div>
        )}
      </footer>
    </div>
  );
}
