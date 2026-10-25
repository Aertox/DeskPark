import type { UciTransport } from './uci';
import { UciEngine } from './uci';

/**
 * 外部引擎的加载（只在打开导师时才下载，之后浏览器会缓存）：
 * - 国际象棋：Stockfish 19 单线程精简版（约 1.9MB），在后台线程（Web Worker）里跑；
 * - 中国象棋：Fairy-Stockfish（约 1.7MB），多线程版，需要页面处于跨域隔离状态。
 * 两者都是 GPL-3.0，许可证随文件放在 public/engines/ 下。加载失败时由调用方退回内置引擎。
 */

const base = () => `${import.meta.env.BASE_URL}engines/`;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} 加载超时`)), ms)),
  ]);
}

let stockfish: Promise<UciEngine> | null = null;
let fairy: Promise<UciEngine> | null = null;
/** 加载失败过的引擎：这次打开页面就不再尝试，免得每一步都白等 */
const failed = new Set<string>();

/** 之前已经失败过（不必再报） */
export class EngineUnavailable extends Error {}

function once(name: string, load: () => Promise<UciEngine>): Promise<UciEngine> {
  if (failed.has(name)) return Promise.reject(new EngineUnavailable(`${name} 不可用`));
  return withTimeout(load(), 20000, name).catch((e) => {
    failed.add(name);
    throw e;
  });
}

export function loadStockfish(): Promise<UciEngine> {
  stockfish ??= once('Stockfish', async () => {
    if (typeof WebAssembly !== 'object') throw new Error('浏览器不支持 WebAssembly');
    const worker = new Worker(`${base()}stockfish/stockfish-19-lite-single.js`);
    const io: UciTransport = {
      send: (cmd) => worker.postMessage(cmd),
      onLine: (cb) => {
        worker.onmessage = (e) => cb(typeof e.data === 'string' ? e.data : String(e.data));
      },
      terminate: () => worker.terminate(),
    };
    const engine = new UciEngine(io, ['setoption name Hash value 16']);
    // 脚本下载失败、wasm 出错时，后台线程会报错：马上放弃，不用等超时
    const crashed = new Promise<never>((_, reject) => {
      worker.onerror = (e) => {
        e.preventDefault();
        worker.terminate();
        reject(new Error(`Stockfish 出错：${e.message || '无法加载'}`));
      };
    });
    await Promise.race([engine.ready, crashed]);
    return engine;
  });
  return stockfish;
}

/** 引擎卡住或崩溃：丢掉它，这次打开页面改用内置引擎 */
export function discard(which: 'stockfish' | 'fairy'): void {
  const p = which === 'stockfish' ? stockfish : fairy;
  p?.then(
    (e) => e.terminate(),
    () => undefined,
  );
  failed.add(which === 'stockfish' ? 'Stockfish' : 'Fairy-Stockfish');
  if (which === 'stockfish') stockfish = null;
  else fairy = null;
}

interface FairyModule {
  addMessageListener(cb: (line: string) => void): void;
  postMessage(cmd: string): void;
  terminate?: () => void;
}
declare global {
  interface Window {
    Stockfish?: (opts?: object) => Promise<FairyModule>;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`无法加载 ${src}`));
    document.head.appendChild(el);
  });
}

/** Fairy-Stockfish 能不能用（多线程版需要 SharedArrayBuffer） */
export const fairySupported = () =>
  typeof WebAssembly === 'object' &&
  typeof SharedArrayBuffer !== 'undefined' &&
  !!globalThis.crossOriginIsolated;

export function loadFairy(): Promise<UciEngine> {
  fairy ??= once('Fairy-Stockfish', async () => {
    if (!fairySupported()) throw new Error('页面没有跨域隔离，不能使用多线程引擎');
    if (!window.Stockfish) await loadScript(`${base()}fairy/stockfish.js`);
    const mod = await window.Stockfish!({
      locateFile: (f: string) => `${base()}fairy/${f}`,
      mainScriptUrlOrBlob: `${base()}fairy/stockfish.js`,
    });
    const io: UciTransport = {
      send: (cmd) => mod.postMessage(cmd),
      onLine: (cb) => mod.addMessageListener(cb),
      terminate: () => mod.terminate?.(),
    };
    const threads = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
    const engine = new UciEngine(io, [
      'setoption name UCI_Variant value xiangqi',
      `setoption name Threads value ${threads}`,
      'setoption name Hash value 16',
    ]);
    await engine.ready;
    return engine;
  });
  return fairy;
}
