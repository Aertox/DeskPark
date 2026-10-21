import type { AnyGame, TableSeat } from '@park/engine';
import { Table, getGame } from '@park/engine';
import { AVATARS } from '@park/protocol';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { online, useOnline } from './online';
import { storage } from './platform';
import { navigate } from './router';
import { profile } from './store';

export interface PlayerInfo {
  name: string;
  avatar?: string;
  isBot: boolean;
  isMe: boolean;
  connected: boolean;
  auto: boolean;
}

/**
 * 牌桌控制器：屏蔽"单机 / 联机"的差异。
 * 各玩法的界面只依赖这个接口，因此同一套界面可以同时用于两种模式。
 */
export interface GameController<V = any, A = any> {
  mode: 'local' | 'online';
  def: AnyGame;
  view: V | null;
  seat: number | null;
  players: PlayerInfo[];
  version: number;
  /** 各座位行动截止时间（本地时钟） */
  deadlines: Record<number, number>;
  over: boolean;
  last: { seat: number; type: string } | null;
  /** 执行动作；单机模式会同步返回错误信息 */
  act(action: A): string | null;
  auto: boolean;
  setAuto(on: boolean): void;
  canRestart: boolean;
  restart(): void;
  leave(): void;
}

/** 为电脑玩家挑选互不重复的形象，名字取自形象 */
function pickBots(n: number, exclude: string | undefined): TableSeat[] {
  const pool = AVATARS.filter((a) => a.id !== exclude);
  const order = pool.map((a) => ({ a, r: Math.random() })).sort((x, y) => x.r - y.r);
  return Array.from({ length: n }, (_, i) => {
    const a = order[i % order.length].a;
    return { name: a.botName, isBot: true, avatar: a.id };
  });
}
const SAVE_KEY = 'park.local';

interface SavedLocal {
  gameId: string;
  seats: TableSeat[];
  options: Record<string, unknown>;
  state: unknown;
  version: number;
}

function makeTable(
  def: AnyGame,
  players: number,
  options: Record<string, unknown>,
  restore?: SavedLocal,
) {
  const me = profile.get();
  const seats: TableSeat[] = restore?.seats ?? [
    { name: me.name, isBot: false, avatar: me.avatar },
    ...pickBots(players - 1, me.avatar),
  ];
  seats[0].name = me.name;
  seats[0].avatar = me.avatar;
  seats[0].auto = false;
  return new Table(def, seats, restore?.options ?? options, {
    humanTimeoutMs: null,
    initialState: restore?.state,
    onError: (e) => console.error('[table]', e),
  });
}

export function loadSavedLocal(gameId: string): SavedLocal | null {
  const saved = storage.get<SavedLocal | null>(SAVE_KEY, null);
  if (!saved || saved.gameId !== gameId) return null;
  const def = getGame(gameId);
  if (!def || def.isOver(saved.state)) return null;
  return saved;
}

export function clearSavedLocal(): void {
  storage.remove(SAVE_KEY);
}

/** 单机：在浏览器内运行牌桌，其余座位由电脑扮演。 */
export function useLocalController(
  gameId: string,
  players: number,
  options: Record<string, unknown>,
  resume: boolean,
): GameController | null {
  const def = getGame(gameId);
  const [table, setTable] = useState<Table | null>(() => {
    if (!def) return null;
    const saved = resume ? loadSavedLocal(gameId) : null;
    return makeTable(def, players, options, saved ?? undefined);
  });
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!table) return;
    const save = () =>
      storage.set(SAVE_KEY, {
        gameId,
        seats: table.seats,
        options: table.options,
        state: table.state,
        version: table.version,
      } satisfies SavedLocal);
    const unsub = table.subscribe(() => {
      if (table.isOver()) clearSavedLocal();
      else save();
      bump();
    });
    save();
    table.start();
    return () => {
      unsub();
      table.stop();
    };
  }, [table, gameId]);

  const tableRef = useRef(table);
  tableRef.current = table;

  return useMemo<GameController | null>(() => {
    if (!table || !def) return null;
    const me = table.seats[0];
    const last = table.lastAction;
    return {
      mode: 'local',
      def,
      view: table.view(0),
      seat: 0,
      players: table.seats.map((s, i) => ({
        name: s.name,
        avatar: s.avatar,
        isBot: s.isBot,
        isMe: i === 0,
        connected: true,
        auto: !!s.auto,
      })),
      version: table.version,
      deadlines: {},
      over: table.isOver(),
      last: last
        ? { seat: last.seat, type: String((last.action as { type?: string }).type ?? '') }
        : null,
      act: (action) => table.act(0, action),
      auto: !!me.auto,
      setAuto: (on) => table.setAuto(0, on),
      canRestart: true,
      restart: () => {
        clearSavedLocal();
        setTable(makeTable(def, table.seats.length, table.options as Record<string, unknown>));
      },
      leave: () => navigate('/'),
    };
    // table.version 变化时重新生成快照
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, def, table?.version, table?.seats[0]?.auto]);
}

/** 联机：状态来自服务器推送。 */
export function useOnlineController(): GameController | null {
  const s = useOnline();
  const room = s.room;
  const game = s.game;
  const def = room ? getGame(room.gameId) : undefined;

  return useMemo<GameController | null>(() => {
    if (!room || !def || !game || game.matchNo !== room.matchNo) return null;
    const seat = game.seat;
    const deadlines: Record<number, number> = {};
    for (const [k, v] of Object.entries(game.deadlines)) deadlines[Number(k)] = v - s.clockOffset;
    const mySeat = seat !== null ? room.seats[seat] : null;
    return {
      mode: 'online',
      def,
      view: game.view,
      seat,
      players: room.seats.map((p) => ({
        name: p.name ?? '空位',
        avatar: p.avatar,
        isBot: p.kind === 'bot',
        isMe: !!p.playerId && p.playerId === s.playerId,
        connected: p.kind === 'bot' ? true : p.connected !== false,
        auto: !!p.auto,
      })),
      version: game.version,
      deadlines,
      over: game.over,
      last: game.last,
      act: (action) => {
        online.send({ t: 'act', action });
        return null;
      },
      auto: !!mySeat?.auto,
      setAuto: (on) => online.send({ t: 'auto', on }),
      canRestart: !!s.you?.isHost,
      restart: () => online.send({ t: 'start' }),
      leave: () => {
        online.send({ t: 'leave' });
        navigate('/');
      },
    };
  }, [room, def, game, s.clockOffset, s.playerId, s.you]);
}
