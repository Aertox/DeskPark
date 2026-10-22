import { Bot, Sparkles, WifiOff } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { figureHeight, useFigure } from '../lib/characters';
import type { PlayerInfo } from '../lib/controller';
import { useCompact } from '../lib/media';
import { CharacterSprite } from './pixel/CharacterSprite';
import { PixelAvatar } from './pixel/PixelAvatar';

export function Avatar({
  name,
  avatar,
  size = 44,
  className = '',
}: {
  name: string;
  avatar?: string | null;
  size?: number;
  className?: string;
}) {
  return <PixelAvatar name={name} avatar={avatar} size={size} className={className} />;
}

/** 倒计时剩余比例（0~1） */
function useCountdown(deadline: number | undefined, total = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, deadline - now);
  return { ratio: Math.min(1, left / total), seconds: Math.ceil(left / 1000) };
}

export interface SeatProps {
  player: PlayerInfo;
  active?: boolean;
  deadline?: number;
  /** 头像右上角的身份标签，例如"地主" */
  tag?: ReactNode;
  tagTone?: 'gold' | 'plain' | 'accent';
  /** 名字下方的副信息，例如剩余张数、筹码 */
  sub?: ReactNode;
  /** 状态气泡，例如"不出"、"跟注 40" */
  bubble?: ReactNode;
  bubbleSide?: 'top' | 'bottom' | 'left' | 'right';
  dim?: boolean;
  size?: number;
  layout?: 'column' | 'row';
  /** 全身立绘不占额外高度、头部探出座位上沿（德州胶囊座位用） */
  figureOverflow?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function Seat({
  player,
  active,
  deadline,
  tag,
  tagTone = 'gold',
  sub,
  bubble,
  bubbleSide = 'top',
  dim,
  size = 60,
  layout = 'column',
  figureOverflow = false,
  className = '',
  style,
  children,
}: SeatProps) {
  const compact = useCompact();
  // 横屏手机等矮屏幕上自动缩小
  const px = compact ? Math.round(size * 0.7) : size;
  const cd = useCountdown(active ? deadline : undefined);
  const ringStyle = cd ? ({ '--p': cd.ratio } as CSSProperties) : undefined;
  const vc = useFigure(player.avatar, player.name);
  const figH = vc ? figureHeight(vc, px * (compact || figureOverflow ? 1.9 : 2.4)) : 0;
  const marks = (
    <>
      {tag && <span className={`seat__tag tone-${tagTone}`}>{tag}</span>}
      {(player.isBot || player.auto) && (
        <span
          className={`seat__badge ${player.ai?.on ? 'is-ai' : ''}`}
          title={player.ai?.on ? 'AI 接管中' : player.isBot ? '电脑' : '托管中'}
        >
          {player.ai?.on ? (
            <Sparkles size={11} strokeWidth={2.4} />
          ) : (
            <Bot size={11} strokeWidth={2.4} />
          )}
        </span>
      )}
      {player.ai && (
        <button
          type="button"
          className={`seat__wake ${player.ai.on ? 'is-on' : ''}`}
          onClick={player.ai.toggle}
          title={
            player.ai.on ? 'AI 接管中，点击交还给规则电脑' : '唤醒 AI：由大模型接管这位电脑玩家'
          }
          aria-label={player.ai.on ? '取消 AI 接管' : '唤醒 AI 接管'}
          aria-pressed={player.ai.on}
        >
          <Sparkles size={12} strokeWidth={2.4} />
        </button>
      )}
      {player.thinking && (
        <span className="seat__think" role="status" aria-label="思考中">
          <i />
          <i />
          <i />
        </span>
      )}
      {!player.connected && (
        <span className="seat__badge is-off" title="离线">
          <WifiOff size={11} strokeWidth={2.4} />
        </span>
      )}
      {cd && <span className="seat__seconds num">{cd.seconds}</span>}
    </>
  );
  return (
    <div
      className={`seat seat--${layout} ${vc ? 'seat--figure' : ''} ${active ? 'is-active' : ''} ${dim ? 'is-dim' : ''} ${className}`}
      style={
        vc && figureOverflow
          ? ({ ...style, '--fig-over': `${Math.max(0, figH - px)}px` } as CSSProperties)
          : style
      }
    >
      {vc ? (
        <div
          className={`seat__figure ${figureOverflow ? 'is-overflow' : ''}`}
          style={
            {
              '--fig-h': `${figH}px`,
              ...(figureOverflow ? { height: px, width: (figH * vc.frameW) / vc.frameH } : {}),
            } as CSSProperties
          }
        >
          <span className="seat__stage" />
          {cd && (
            <svg
              className={`seat__oval ${cd.seconds <= 5 ? 'is-urgent' : ''}`}
              viewBox="0 0 100 28"
              aria-hidden="true"
            >
              <ellipse cx="50" cy="14" rx="47" ry="11" pathLength={100} className="track" />
              <ellipse
                cx="50"
                cy="14"
                rx="47"
                ry="11"
                pathLength={100}
                strokeDasharray={`${cd.ratio * 100} 100`}
              />
            </svg>
          )}
          <CharacterSprite character={vc} height={figH} seed={player.name} animate={!dim} />
          {marks}
        </div>
      ) : (
        <div className="seat__avatar" style={ringStyle}>
          {cd && <span className={`seat__ring ${cd.seconds <= 5 ? 'is-urgent' : ''}`} />}
          <Avatar name={player.name} avatar={player.avatar} size={px} />
          {marks}
        </div>
      )}
      <div className="seat__meta">
        <span className="seat__name">
          {player.name}
          {player.isMe && <span className="seat__me">我</span>}
        </span>
        {sub !== undefined && <span className="seat__sub num">{sub}</span>}
      </div>
      {bubble && <div className={`seat__bubble side-${bubbleSide}`}>{bubble}</div>}
      {player.speech && (
        <div
          key={player.speech}
          className={`seat__speech ${bubbleSide === 'right' ? 'align-start' : bubbleSide === 'left' ? 'align-end' : ''}`}
        >
          {player.speech}
        </div>
      )}
      {children}
    </div>
  );
}
