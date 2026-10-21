import type { AnyGame, OptionField } from '@park/engine';
import { getGame, normalizeOptions } from '@park/engine';
import { useState } from 'react';
import { Button, Field, Segmented, Sheet, Switch } from '../components/ui';
import { online } from '../lib/online';
import { lastSetup } from '../lib/store';

/** 根据玩法声明的 optionFields 自动生成设置表单 */
export function OptionsForm({
  def,
  options,
  onChange,
  disabled,
}: {
  def: AnyGame;
  options: Record<string, unknown>;
  onChange: (o: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {def.optionFields.map((f: OptionField) => (
        <Field key={f.key} label={f.label} hint={f.hint}>
          {f.type === 'toggle' ? (
            <Switch
              checked={!!options[f.key]}
              disabled={disabled}
              onChange={(v) => onChange({ ...options, [f.key]: v })}
            />
          ) : (
            <Segmented
              value={options[f.key] as string | number}
              disabled={disabled}
              options={f.choices}
              onChange={(v) => onChange({ ...options, [f.key]: v })}
            />
          )}
        </Field>
      ))}
    </>
  );
}

export function PlayerCountField({
  def,
  value,
  onChange,
  disabled,
}: {
  def: AnyGame;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const { minPlayers, maxPlayers } = def.meta;
  if (minPlayers === maxPlayers) return null;
  const opts = Array.from({ length: maxPlayers - minPlayers + 1 }, (_, i) => minPlayers + i);
  return (
    <Field label="人数">
      <Segmented
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={opts.map((n) => ({ value: n, label: n }))}
      />
    </Field>
  );
}

export function SetupSheet({
  gameId,
  mode,
  onClose,
  onStart,
}: {
  gameId: string;
  mode: 'local' | 'online';
  onClose: () => void;
  onStart: () => void;
}) {
  const def = getGame(gameId)!;
  const saved = lastSetup.get()[gameId];
  const [players, setPlayers] = useState(saved?.players ?? def.meta.defaultPlayers);
  const [options, setOptions] = useState<Record<string, unknown>>(() =>
    normalizeOptions(def, saved?.options),
  );

  const start = () => {
    lastSetup.set({ [gameId]: { players, options } });
    if (mode === 'online') {
      online.connect();
      online.send({ t: 'create', gameId, options, seats: players });
    }
    onStart();
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={def.meta.name}
      subtitle={mode === 'local' ? '单人练习 · 与电脑对局' : '联机房间 · 创建后邀请好友加入'}
      footer={
        <Button variant="primary" size="lg" onClick={start}>
          {mode === 'local' ? '开始游戏' : '创建房间'}
        </Button>
      }
    >
      <PlayerCountField def={def} value={players} onChange={setPlayers} />
      <OptionsForm def={def} options={options} onChange={setOptions} />
      {mode === 'online' && (
        <p className="setup-note">
          空位可以由电脑补齐；对局中断线会自动托管，重新打开链接即可回到牌桌。
        </p>
      )}
    </Sheet>
  );
}
