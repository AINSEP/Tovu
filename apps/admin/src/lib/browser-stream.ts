/** Browser connection ownership; transport callbacks retain their native retry policy. */
import type { VisibilitySource } from "./visible-interval";
import type { StreamActivity } from "./stream-activity";

export interface StreamChannel {
  postMessage(value: unknown): void;
  addEventListener(kind: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(kind: "message", listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}
export interface BrowserStreamPorts {
  visibility: VisibilitySource;
  page: {
    addEventListener(kind: "pagehide" | "pageshow", listener: () => void): void;
    removeEventListener(kind: "pagehide" | "pageshow", listener: () => void): void;
  };
  now(): number;
  schedule(required: { work: () => void; delayMs: number }): () => void;
  requestLock?: (required: { key: string; signal: AbortSignal; hold: () => Promise<void> }) => Promise<unknown>;
  openChannel?: (required: { name: string }) => StreamChannel;
}

/** Resolve browser capabilities at the adapter boundary, never during module import. */
export function browserStreamPorts(_required = {}, _optional = {}): BrowserStreamPorts {
  return {
    visibility: document,
    page: window,
    now: () => Date.now(),
    schedule: ({ work, delayMs }) => { const timer = setTimeout(work, delayMs); return () => clearTimeout(timer); },
    requestLock: typeof navigator.locks?.request === "function"
      ? ({ key, signal, hold }) => navigator.locks.request(key, { signal }, hold) : undefined,
    openChannel: typeof BroadcastChannel === "function" ? ({ name }) => new BroadcastChannel(name) : undefined,
  };
}

/** Unshared idle streams close after this long hidden; shared hidden leaders yield immediately. */
const HIDDEN_GRACE_MS = 30_000;

/**
 * Hold one connection per key/origin using Web Locks, broadcasting only serializable frames.
 * Tab-specific command streams use scope="tab": commands must execute on their bound page.
 * Shared hidden leaders yield immediately; unshared idle streams have a 30s grace period.
 * Active chat retains tab streams. Pagehide/disposal always releases locks and connections.
 * @returns Idempotent disposer. Transport construction errors propagate in per-tab mode.
 * @complexity O(1) ownership state per subscriber; channel delivery is O(number of tabs).
 * @example startBrowserStream({ key: "feed", connect: ({ emit }) => openFeed((frame) => emit({ frame })) });
 */
export function startBrowserStream<Frame>(
  { key, connect, receive = () => {} }: {
    key: string;
    connect: (required: { emit: (required: { frame: Frame }, optional?: Record<string, never>) => void }) => () => void;
    receive?: (required: { frame: Frame }) => void;
  },
  { ports = browserStreamPorts(), scope = "origin", activity }: {
    ports?: BrowserStreamPorts; scope?: "origin" | "tab"; activity?: StreamActivity;
  } = {},
): () => void {
  const stream = buildStream(ports);
  // `stop` removes this listener, so a disposed stream never reaches it.
  const onMessage = (event: MessageEvent<unknown>) => {
    if (!stream.away) receive({ frame: event.data as Frame });
  };
  const fanout = {
    channel: openSharedChannel({ key, scope, ports, onMessage }),
  };

  /** Close before releasing the lock: two tabs must never overlap their connections. */
  const halt = createHalt(stream);

  const open = createStreamConnectionOpener({ stream, connect, receive, fanout });

  /** A pending/acquired lock owns its own cancellation; denied hosts switch to tab mode. */
  const acquire = createStreamLockAcquirer({ stream, ports, key, open, halt, closeChannel: (...args: Parameters<typeof closeChannel>) => closeChannel(...args), reconcile: (...args: Parameters<typeof reconcile>) => reconcile(...args) });

  const closeChannel = createChannelCloser(fanout, onMessage);

  /** Reconcile one tab's visibility/activity with its connection and queued lock. */
  const reconcile = createStreamReconciler({ stream, halt, fanout, acquire, reconcileTab: (...args: Parameters<typeof reconcileTab>) => reconcileTab(...args) });

  /** Per-tab mode: keep the connection through the hidden grace period unless a chat is active. */
  const reconcileTab = createReconcileTab({ stream, activity, ports, halt, reconcile, open });

  const onVisibility = () => {
    stream.hiddenSince = hiddenSinceNow({ ports, previous: stream.hiddenSince });
    reconcile();
  };
  const onPageHide = () => { stream.away = true; reconcile(); };
  const onPageShow = () => { stream.away = false; onVisibility(); };
  ports.visibility.addEventListener("visibilitychange", onVisibility);
  ports.page.addEventListener("pagehide", onPageHide);
  ports.page.addEventListener("pageshow", onPageShow);
  const unsubscribeActivity = activity?.subscribe({ listener: reconcile });
  const stop = createStop({ stream, halt, unsubscribeActivity, ports, onVisibility, onPageHide, onPageShow, closeChannel });
  try { reconcile(); } catch (error) { stop(); throw error; }
  return stop;
}

function createStreamReconciler<Frame>({ stream, halt, fanout, acquire, reconcileTab }: { stream: ReturnType<typeof buildStream>; halt: ReturnType<typeof createHalt>; fanout: { channel: StreamChannel | undefined; }; acquire: ReturnType<typeof createStreamLockAcquirer<Frame>>; reconcileTab: ReturnType<typeof createReconcileTab<Frame>> }) {
  return function reconcile(): void {
    stream.stopTimer?.();
    stream.stopTimer = undefined;
    if (stream.disposed || stream.away) { halt(); return; }
    if (fanout.channel) {
      if (stream.hiddenSince !== undefined) { halt(); return; }
      acquire();
      return;
    }
    reconcileTab();
  };
}

function createChannelCloser(fanout: { channel: StreamChannel | undefined; }, onMessage: (event: MessageEvent<unknown>) => void) {
  return function closeChannel(): void {
    fanout.channel?.removeEventListener("message", onMessage);
    fanout.channel?.close();
    fanout.channel = undefined;
  };
}

function createStreamLockAcquirer<Frame>({ stream, ports, key, open, halt, closeChannel, reconcile }: { stream: ReturnType<typeof buildStream>; ports: BrowserStreamPorts; key: string; open: ReturnType<typeof createStreamConnectionOpener<Frame>>; halt: ReturnType<typeof createHalt>; closeChannel: ReturnType<typeof createChannelCloser>; reconcile: ReturnType<typeof createStreamReconciler<Frame>> }) {
  return function acquire(): void {
    if (stream.lock) return;
    if (!ports.requestLock) throw new Error("shared browser stream has no lock provider");
    const requested = new AbortController();
    stream.lock = requested;
    // Disposal and pagehide both run `halt()`, which aborts this request, so its signal covers them.
    void ports.requestLock({ key: `browser-stream:${key}`, signal: requested.signal, hold: async () => {
      if (requested.signal.aborted) return;
      // Set the release first so cleanup always releases even when connect throws.
      await new Promise<void>((resolve, reject) => {
        stream.releaseLock = resolve;
        try { open(); } catch (error) { reject(error); }
      });
    } }).catch(() => {
      if (requested.signal.aborted) return;
      halt();
      closeChannel();
      reconcile();
    });
  };
}

function createStreamConnectionOpener<Frame>({ stream, connect, receive, fanout }: { stream: ReturnType<typeof buildStream>; connect: (required: { emit: (required: { frame: Frame; }, optional?: Record<string, never>) => void; }) => () => void; receive: (required: { frame: Frame; }) => void; fanout: { channel: StreamChannel | undefined; } }) {
  return function open(): void {
    if (stream.stopConnection) return;
    let connected = true;
    const close = connect({ emit: ({ frame }, _optional = {}) => {
      if (!connected || stream.disposed || stream.away) return;
      receive({ frame });
      fanout.channel?.postMessage(frame);
    } });
    stream.stopConnection = () => { connected = false; close(); };
  };
}

function createReconcileTab<Frame>({ stream, activity, ports, halt, reconcile, open }: { stream: ReturnType<typeof buildStream>; activity: StreamActivity; ports: BrowserStreamPorts; halt: ReturnType<typeof createHalt>; reconcile: ReturnType<typeof createStreamReconciler<Frame>>; open: ReturnType<typeof createStreamConnectionOpener<Frame>> }) {
  return function reconcileTab(): void {
    if (stream.hiddenSince !== undefined && !activity?.active({})) {
      const remaining = HIDDEN_GRACE_MS - (ports.now() - stream.hiddenSince);
      if (remaining <= 0) { halt(); return; }
      stream.stopTimer = ports.schedule({ work: reconcile, delayMs: remaining });
    }
    open();
  };
}

function createHalt(stream: ReturnType<typeof buildStream>) {
  return function halt(): void {
    stream.stopConnection?.();
    stream.stopConnection = undefined;
    stream.lock?.abort();
    stream.lock = undefined;
    stream.releaseLock?.();
    stream.releaseLock = undefined;
  };
}

function buildStream(ports: BrowserStreamPorts) {
  return {
    disposed: false,
    away: false,
    hiddenSince: hiddenSinceNow({ ports, previous: undefined }),
    stopConnection: undefined as (() => void) | undefined,
    stopTimer: undefined as (() => void) | undefined,
    lock: undefined as AbortController | undefined,
    releaseLock: undefined as (() => void) | undefined,
  };
}

function createStop({ stream, halt, unsubscribeActivity, ports, onVisibility, onPageHide, onPageShow, closeChannel }: { stream: ReturnType<typeof buildStream>; halt: ReturnType<typeof createHalt>; unsubscribeActivity: ReturnType<StreamActivity["subscribe"]> | undefined; ports: BrowserStreamPorts; onVisibility: () => void; onPageHide: () => void; onPageShow: () => void; closeChannel: ReturnType<typeof createChannelCloser> }) {
  return () => {
    if (stream.disposed) return;
    stream.disposed = true;
    halt();
    stream.stopTimer?.();
    unsubscribeActivity?.();
    ports.visibility.removeEventListener("visibilitychange", onVisibility);
    ports.page.removeEventListener("pagehide", onPageHide);
    ports.page.removeEventListener("pageshow", onPageShow);
    closeChannel();
  };
}

/**
 * When the tab became hidden: kept while it stays hidden, cleared once visible.
 * @param required Ports to read visibility/clock from, and the previous hidden-since time.
 * @returns Hidden-since timestamp, or undefined while visible.
 */
function hiddenSinceNow({ ports, previous }: { ports: BrowserStreamPorts; previous: number | undefined }): number | undefined {
  return ports.visibility.visibilityState === "hidden" ? previous ?? ports.now() : undefined;
}

/**
 * Opens the cross-tab fan-out channel for an origin-scoped stream and starts listening on it.
 * @param required Stream key and scope, browser ports, and the frame listener.
 * @returns The channel, or undefined for tab scope, hosts lacking locks or channels, or a refused channel.
 */
function openSharedChannel(
  { key, scope, ports, onMessage }: {
    key: string; scope: "origin" | "tab"; ports: BrowserStreamPorts; onMessage: (event: MessageEvent<unknown>) => void;
  },
): StreamChannel | undefined {
  // Both capabilities are necessary: a lock without fan-out would silence follower tabs.
  if (scope !== "origin" || !ports.requestLock || !ports.openChannel) return undefined;
  let channel: StreamChannel;
  try { channel = ports.openChannel({ name: `browser-stream:${key}` }); }
  catch { return undefined; /* Storage-denied hosts use the visibility-managed fallback. */ }
  channel.addEventListener("message", onMessage);
  return channel;
}
