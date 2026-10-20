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
 * @example startBrowserStream({ key: "feed", connect: ({ emit }) => openFeed(emit) });
 */
export function startBrowserStream<Frame>(
  { key, connect, receive = () => {} }: {
    key: string;
    connect: (required: { emit: (frame: Frame) => void }) => () => void;
    receive?: (required: { frame: Frame }) => void;
  },
  { ports = browserStreamPorts(), scope = "origin", activity }: {
    ports?: BrowserStreamPorts; scope?: "origin" | "tab"; activity?: StreamActivity;
  } = {},
): () => void {
  let disposed = false;
  let away = false;
  let hiddenSince = hiddenSinceNow({ ports, previous: undefined });
  let stopConnection: (() => void) | undefined;
  let stopTimer: (() => void) | undefined;
  let lock: AbortController | undefined;
  let releaseLock: (() => void) | undefined;
  // `stop` removes this listener, so a disposed stream never reaches it.
  const onMessage = (event: MessageEvent<unknown>) => {
    if (!away) receive({ frame: event.data as Frame });
  };
  let channel = openSharedChannel({ key, scope, ports, onMessage });

  /** Close before releasing the lock: two tabs must never overlap their connections. */
  function halt(): void {
    stopConnection?.();
    stopConnection = undefined;
    lock?.abort();
    lock = undefined;
    releaseLock?.();
    releaseLock = undefined;
  }

  function open(): void {
    if (stopConnection) return;
    let connected = true;
    const close = connect({ emit: (frame) => {
      if (!connected || disposed || away) return;
      receive({ frame });
      channel?.postMessage(frame);
    } });
    stopConnection = () => { connected = false; close(); };
  }

  /** A pending/acquired lock owns its own cancellation; denied hosts switch to tab mode. */
  function acquire(): void {
    if (lock) return;
    const requested = new AbortController();
    lock = requested;
    // Disposal and pagehide both run `halt()`, which aborts this request, so its signal covers them.
    void ports.requestLock!({ key: `browser-stream:${key}`, signal: requested.signal, hold: async () => {
      if (requested.signal.aborted) return;
      // Set the release first so cleanup always releases even when connect throws.
      await new Promise<void>((resolve, reject) => {
        releaseLock = resolve;
        try { open(); } catch (error) { reject(error); }
      });
    } }).catch(() => {
      if (requested.signal.aborted) return;
      halt();
      closeChannel();
      reconcile();
    });
  }

  function closeChannel(): void {
    channel?.removeEventListener("message", onMessage);
    channel?.close();
    channel = undefined;
  }

  /** Reconcile one tab's visibility/activity with its connection and queued lock. */
  function reconcile(): void {
    stopTimer?.();
    stopTimer = undefined;
    if (disposed || away) { halt(); return; }
    if (channel) {
      if (hiddenSince !== undefined) { halt(); return; }
      acquire();
      return;
    }
    if (hiddenSince !== undefined && !activity?.active({})) {
      const remaining = HIDDEN_GRACE_MS - (ports.now() - hiddenSince);
      if (remaining <= 0) { halt(); return; }
      stopTimer = ports.schedule({ work: reconcile, delayMs: remaining });
    }
    open();
  }

  const onVisibility = () => {
    hiddenSince = hiddenSinceNow({ ports, previous: hiddenSince });
    reconcile();
  };
  const onPageHide = () => { away = true; reconcile(); };
  const onPageShow = () => { away = false; onVisibility(); };
  ports.visibility.addEventListener("visibilitychange", onVisibility);
  ports.page.addEventListener("pagehide", onPageHide);
  ports.page.addEventListener("pageshow", onPageShow);
  const unsubscribeActivity = activity?.subscribe({ listener: reconcile });
  const stop = () => {
    if (disposed) return;
    disposed = true;
    halt();
    stopTimer?.();
    unsubscribeActivity?.();
    ports.visibility.removeEventListener("visibilitychange", onVisibility);
    ports.page.removeEventListener("pagehide", onPageHide);
    ports.page.removeEventListener("pageshow", onPageShow);
    closeChannel();
  };
  try { reconcile(); } catch (error) { stop(); throw error; }
  return stop;
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
