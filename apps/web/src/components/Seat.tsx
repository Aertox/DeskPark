import { Bot, WifiOff } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { PlayerInfo } from '../lib/controller';
import { avatarColor, initial } from '../lib/format';

export function Avatar({
  name,
  size = 44,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, background: avatarColor(name), fontSize: size * 0.42 }}
    >
      {initial(name)}
    </span>
  );
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
  size = 46,
  layout = 'column',
  className = '',
  style,
  children,
}: SeatProps) {
  const cd = useCountdown(active ? deadline : undefined);
  const ringStyle = cd ? ({ '--p': cd.ratio } as CSSProperties) : undefined;
  return (
    <div
      className={`seat seat--${layout} ${active ? 'is-active' : ''} ${dim ? 'is-dim' : ''} ${className}`}
      style={style}
    >
      <div className="seat__avatar" style={ringStyle}>
        {cd && <span className={`seat__ring ${cd.seconds <= 5 ? 'is-urgent' : ''}`} />}
        <Avatar name={player.name} size={size} />
        {tag && <span className={`seat__tag tone-${tagTone}`}>{tag}</span>}
        {(player.isBot || player.auto) && (
          <span className="seat__badge" title={player.isBot ? '电脑' : '托管中'}>
            <Bot size={11} strokeWidth={2.4} />
          </span>
        )}
        {!player.connected && (
          <span className="seat__badge is-off" title="离线">
            <WifiOff size={11} strokeWidth={2.4} />
          </span>
        )}
        {cd && <span className="seat__seconds num">{cd.seconds}</span>}
      </div>
      <div className="seat__meta">
        <span className="seat__name">
          {player.name}
          {player.isMe && <span className="seat__me">我</span>}
        </span>
        {sub !== undefined && <span className="seat__sub num">{sub}</span>}
      </div>
      {bubble && <div className={`seat__bubble side-${bubbleSide}`}>{bubble}</div>}
      {children}
    </div>
  );
}
