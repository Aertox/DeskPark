/**
 * 平台适配层：所有与运行环境相关的能力（存储、服务器地址、震动等）集中在这里，
 * 移植到 App（Capacitor / React Native）时只需替换本文件的实现。
 */

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 隐私模式或配额已满时忽略 */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** 联机服务器 WebSocket 地址：优先使用构建时注入的 VITE_SERVER_URL，否则与页面同源。 */
export function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export function vibrate(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

/**
 * 复制文字到剪贴板。
 * navigator.clipboard 只在安全页面（HTTPS / localhost）里存在；用 http 打开（例如局域网 IP、
 * 没配证书的服务器）时它是 undefined，这时退回到隐藏文本框 + execCommand('copy')。
 * 必须在点击事件里同步调用（不要先 await 别的东西），否则浏览器会拒绝复制。
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 权限被拒等：再试旧办法 */
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // 放在可视区外；16px 字号避免 iOS 聚焦时放大页面
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    /* 极少数浏览器会抛错：当作复制失败 */
  }
  ta.remove();
  active?.focus?.({ preventScroll: true });
  return ok;
}

export function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
