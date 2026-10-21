import { getGame, normalizeOptions } from '@park/engine';
import { Suspense, useState } from 'react';
import { getGameUI } from '../games';
import { useLocalController } from '../lib/controller';
import { lastSetup } from '../lib/store';
import { TableShell } from './TableShell';

let freshStart = false;
/** 从设置面板开始新游戏时调用；直接刷新页面则会继续已保存的对局 */
export function markFreshStart(): void {
  freshStart = true;
}

export function LocalGame({ gameId }: { gameId: string }) {
  const def = getGame(gameId);
  const [init] = useState(() => {
    const resume = !freshStart;
    freshStart = false;
    const saved = lastSetup.get()[gameId];
    return {
      resume,
      players: saved?.players ?? def?.meta.defaultPlayers ?? 2,
      options: def ? normalizeOptions(def, saved?.options) : {},
    };
  });
  const ctl = useLocalController(gameId, init.players, init.options, init.resume);
  const ui = getGameUI(gameId);
  if (!def || !ui || !ctl) return <div className="loading">未知玩法</div>;
  return (
    <TableShell ctl={ctl} title={def.meta.name}>
      <Suspense fallback={<div className="loading on-felt">正在摆牌…</div>}>
        <ui.Board ctl={ctl} />
      </Suspense>
    </TableShell>
  );
}
