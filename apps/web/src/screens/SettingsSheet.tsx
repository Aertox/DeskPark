import { useState } from 'react';
import { Field, Segmented, Sheet, Switch } from '../components/ui';
import { Avatar } from '../components/Seat';
import { profile, settings } from '../lib/store';
import type { FeltTheme } from '../lib/store';

export const FELTS: { value: FeltTheme; label: string; color: string }[] = [
  { value: 'jade', label: '墨绿', color: '#2a6152' },
  { value: 'indigo', label: '黛蓝', color: '#2f4a72' },
  { value: 'wine', label: '酒红', color: '#6a2f3b' },
  { value: 'graphite', label: '石墨', color: '#3b3d40' },
];

export function NameEditor() {
  const p = profile.use();
  const [draft, setDraft] = useState(p.name);
  const commit = () => {
    const name = [...draft.trim()].slice(0, 12).join('');
    if (name) profile.set({ name });
    else setDraft(p.name);
  };
  return (
    <div className="name-editor">
      <Avatar name={draft || p.name} size={44} />
      <input
        value={draft}
        maxLength={12}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="昵称"
        placeholder="你的昵称"
      />
    </div>
  );
}

export function SettingsSheet({
  open,
  onClose,
  showProfile,
}: {
  open: boolean;
  onClose: () => void;
  showProfile?: boolean;
}) {
  const s = settings.use();
  return (
    <Sheet open={open} onClose={onClose} title={showProfile ? '设置' : '外观'}>
      {showProfile && (
        <Field label="昵称" hint="联机时其他玩家看到的名字">
          <NameEditor />
        </Field>
      )}
      <Field label="桌布">
        <div className="felt-picker">
          {FELTS.map((f) => (
            <button
              key={f.value}
              className={s.felt === f.value ? 'is-on' : ''}
              onClick={() => settings.set({ felt: f.value })}
              aria-label={f.label}
            >
              <i style={{ background: f.color }} />
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="四色牌" hint="方块蓝色、梅花绿色">
        <Switch checked={s.fourColor} onChange={(v) => settings.set({ fourColor: v })} />
      </Field>
      <Field label="记牌器" hint="斗地主中显示剩余的牌">
        <Switch checked={s.cardCounter} onChange={(v) => settings.set({ cardCounter: v })} />
      </Field>
      <Field label="音效">
        <Switch checked={s.sound} onChange={(v) => settings.set({ sound: v })} />
      </Field>
      <Field label="界面">
        <Segmented
          value={s.theme}
          onChange={(v) => settings.set({ theme: v })}
          options={[
            { value: 'system', label: '自动' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
          ]}
        />
      </Field>
    </Sheet>
  );
}
