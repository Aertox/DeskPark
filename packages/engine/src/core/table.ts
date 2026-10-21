import { Rng, randomSeed } from './rng';
import type { TimerHandle } from './timers';
import { clearTimer, setTimer } from './timers';
import type { AnyGame, Seat } from './types';
import { SYSTEM_SEAT } from './types';

export interface TableSeat {
  name: string;
  isBot: boolean;
  /** 形象 id（界面用的元数据，规则不关心） */
  avatar?: string;
  /** 托管：由电脑代打 */
  auto?: boolean;
  /** 联机时玩家是否在线，离线视同托管 */
  connected?: boolean;
}

export interface TableConfig {
  /** 真人玩家的操作时限，超时由电脑代打一步；null 表示不限时（单机） */
  humanTimeoutMs?: number | null;
  /** 托管 / 离线玩家的代打延迟 */
  autoDelayMs?: number;
  /** 便于测试：关闭所有定时器，由调用方手动推进 */
  manual?: boolean;
  seed?: number;
  /** 从已保存的状态恢复（例如刷新页面后继续单机对局） */
  initialState?: unknown;
  onError?: (err: unknown) => void;
}

export interface LastAction {
  seat: Seat;
  action: unknown;
  at: number;
}

type Listener = () => void;

/**
 * 牌桌运行器：持有一局游戏的状态，负责校验/应用动作、调度电脑玩家与超时。
 * 单机（浏览器内）与联机（服务器端）共用同一份实现。
 */
export class Table<G extends AnyGame = AnyGame> {
  state: ReturnType<G['setup']>;
  version = 0;
  lastAction: LastAction | null = null;
  /** 各座位本次行动的截止时间戳（毫秒），用于前端显示倒计时 */
  deadlines: Record<number, number> = {};

  private listeners = new Set<Listener>();
  private seatTimers = new Map<Seat, TimerHandle>();
  private systemTimer: TimerHandle | null = null;
  private disposed = false;
  private running = false;

  constructor(
    public readonly def: G,
    public readonly seats: TableSeat[],
    public readonly options: Parameters<G['setup']>[0]['options'],
    private readonly config: TableConfig = {},
  ) {
    const seed = config.seed ?? randomSeed();
    this.state =
      (config.initialState as ReturnType<G['setup']>) ??
      def.setup({
        players: seats.map((s) => ({ name: s.name, isBot: s.isBot })),
        options,
        seed,
      });
  }

  /** 开始调度（电脑玩家开始行动）。可在 stop() 之后再次调用。 */
  start(): void {
    if (this.disposed) return;
    this.running = true;
    this.schedule(null);
  }

  /** 暂停调度：清除所有定时器，状态保留。 */
  stop(): void {
    this.running = false;
    this.clearAllTimers();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  view(seat: Seat | null): ReturnType<G['view']> {
    return this.def.view(this.state, seat);
  }

  isOver(): boolean {
    return this.def.isOver(this.state);
  }

  activeSeats(): Seat[] {
    return this.def.activeSeats(this.state);
  }

  /** 执行一个动作，成功返回 null，失败返回错误提示。 */
  act(seat: Seat, action: unknown): string | null {
    if (this.disposed) return '牌桌已关闭';
    if (this.def.isOver(this.state)) return '本场已结束';
    if (seat !== SYSTEM_SEAT && !this.def.activeSeats(this.state).includes(seat)) {
      return '还没轮到你';
    }
    let err: string | null;
    try {
      err = this.def.validate(this.state, seat, action);
    } catch (e) {
      this.config.onError?.(e);
      return '无效操作';
    }
    if (err) return err;
    this.state = this.def.apply(this.state, seat, action);
    this.version++;
    this.lastAction = { seat, action, at: Date.now() };
    this.schedule(seat);
    this.emit();
    return null;
  }

  /** 让电脑替某个座位走一步（托管 / 超时 / 提示）。 */
  botAction(seat: Seat): unknown {
    const view = this.def.view(this.state, seat);
    return this.def.bot(view, seat, new Rng(randomSeed()));
  }

  setAuto(seat: Seat, auto: boolean): void {
    const s = this.seats[seat];
    if (!s || !!s.auto === auto) return;
    s.auto = auto;
    this.clearSeatTimer(seat);
    this.schedule(null);
    this.emit();
  }

  setConnected(seat: Seat, connected: boolean): void {
    const s = this.seats[seat];
    if (!s || s.connected === connected) return;
    s.connected = connected;
    this.clearSeatTimer(seat);
    this.schedule(null);
    this.emit();
  }

  setSeat(seat: Seat, patch: Partial<TableSeat>): void {
    const s = this.seats[seat];
    if (!s) return;
    Object.assign(s, patch);
    this.clearSeatTimer(seat);
    this.schedule(null);
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.listeners.clear();
  }

  private clearAllTimers(): void {
    for (const t of this.seatTimers.values()) clearTimer(t);
    this.seatTimers.clear();
    this.deadlines = {};
    if (this.systemTimer) clearTimer(this.systemTimer);
    this.systemTimer = null;
  }

  // ---------------------------------------------------------------------------

  private emit(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (e) {
        this.config.onError?.(e);
      }
    }
  }

  private isAutomated(seat: Seat): boolean {
    const s = this.seats[seat];
    return !s || s.isBot || !!s.auto || s.connected === false;
  }

  private clearSeatTimer(seat: Seat): void {
    const t = this.seatTimers.get(seat);
    if (t) clearTimer(t);
    this.seatTimers.delete(seat);
    delete this.deadlines[seat];
  }

  /**
   * 重新调度定时器。actedSeat 是刚刚行动的座位，它的计时需要重置；
   * 其他仍处于行动中的座位保留原计时（例如多人同时"准备"的阶段）。
   */
  private schedule(actedSeat: Seat | null): void {
    if (this.config.manual || this.disposed || !this.running) return;
    if (actedSeat !== null) this.clearSeatTimer(actedSeat);
    if (this.systemTimer) clearTimer(this.systemTimer);
    this.systemTimer = null;

    if (this.def.isOver(this.state)) {
      for (const seat of [...this.seatTimers.keys()]) this.clearSeatTimer(seat);
      return;
    }

    const active = new Set(this.def.activeSeats(this.state));
    for (const seat of [...this.seatTimers.keys()]) {
      if (!active.has(seat)) this.clearSeatTimer(seat);
    }

    const auto = this.def.autoAdvance?.(this.state);
    if (auto) {
      const version = this.version;
      this.systemTimer = setTimer(() => {
        if (this.version === version) this.act(SYSTEM_SEAT, auto.action);
      }, auto.delayMs);
    }

    for (const seat of active) {
      if (this.seatTimers.has(seat)) continue;
      let delay: number | null = null;
      if (this.isAutomated(seat)) {
        const s = this.seats[seat];
        if (s?.isBot) {
          const [lo, hi] = this.def.meta.botDelayMs ?? [600, 1200];
          delay = lo + Math.random() * (hi - lo);
        } else {
          delay = this.config.autoDelayMs ?? 700;
        }
      } else if (this.config.humanTimeoutMs) {
        delay = this.config.humanTimeoutMs;
        this.deadlines[seat] = Date.now() + delay;
      }
      if (delay === null) continue;
      const timer = setTimer(() => {
        this.seatTimers.delete(seat);
        delete this.deadlines[seat];
        this.runBot(seat);
      }, delay);
      this.seatTimers.set(seat, timer);
    }
  }

  private runBot(seat: Seat): void {
    if (this.disposed || this.def.isOver(this.state)) return;
    if (!this.def.activeSeats(this.state).includes(seat)) return;
    try {
      const action = this.botAction(seat);
      const err = this.act(seat, action);
      if (err) this.config.onError?.(new Error(`bot action rejected (seat ${seat}): ${err}`));
    } catch (e) {
      this.config.onError?.(e);
    }
  }
}

/**
 * 不依赖定时器、同步跑完整局的辅助函数（用于测试与模拟）。
 * 所有座位均由 bot 决策，返回最终状态与步数。
 */
export function simulate<G extends AnyGame>(
  def: G,
  numPlayers: number,
  options: Parameters<G['setup']>[0]['options'],
  seed: number,
  maxSteps = 20000,
): { state: ReturnType<G['setup']>; steps: number } {
  const rng = new Rng(seed);
  let state = def.setup({
    players: Array.from({ length: numPlayers }, (_, i) => ({ name: `P${i + 1}`, isBot: true })),
    options,
    seed,
  });
  let steps = 0;
  while (!def.isOver(state) && steps < maxSteps) {
    const active = def.activeSeats(state);
    if (active.length === 0) {
      const auto = def.autoAdvance?.(state);
      if (!auto) throw new Error('no active seats and no auto-advance');
      state = def.apply(state, SYSTEM_SEAT, auto.action);
      steps++;
      continue;
    }
    const seat = active[rng.int(active.length)];
    const action = def.bot(def.view(state, seat), seat, rng);
    const err = def.validate(state, seat, action);
    if (err) {
      throw new Error(
        `bot produced invalid action at step ${steps}: ${err} ${JSON.stringify(action)}`,
      );
    }
    state = def.apply(state, seat, action);
    steps++;
  }
  return { state, steps };
}
