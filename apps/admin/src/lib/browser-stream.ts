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
  { ports = browserStreamPorts(), scope = "origin", activity, hiddenDelayMs = 30_000 }: {
    ports?: BrowserStreamPorts; scope?: "origin" | "tab"; activity?: StreamActivity; hiddenDelayMs?: number;
  } = {},
): () => void {
  let disposed = false;
  let away = false;
  let hiddenSince = ports.visibility.visibilityState === "hidden" ? ports.now() : undefined;
  let stopConnection: (() => void) | undefined;
  let stopTimer: (() => void) | undefined;
  let lock: AbortController | undefined;
  let releaseLock: (() => void) | undefined;
  let channel: StreamChannel | undefined;
  // Both capabilities are necessary: a lock without fan-out would silence follower tabs.
  if (scope === "origin" && ports.requestLock && ports.openChannel) {
    try { channel = ports.openChannel({ name: `browser-stream:${key}` }); }
    catch { /* Storage-denied hosts use the visibility-managed fallback. */ }
  }

  const onMessage = (event: MessageEvent<unknown>) => {
    if (!disposed && !away) receive({ frame: event.data as Frame });
  };
  channel?.addEventListener("message", onMessage);

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
    void ports.requestLock!({ key: `browser-stream:${key}`, signal: requested.signal, hold: async () => {
      if (requested.signal.aborted || disposed || away) return;
      // Set the release first so cleanup always releases even when connect throws.
      await new Promise<void>((resolve, reject) => {
        releaseLock = resolve;
        try { open(); } catch (error) { reject(error); }
      });
    } }).catch(() => {
      if (requested.signal.aborted || disposed) return;
      halt();
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      channel = undefined;
      reconcile();
    });
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
      const remaining = hiddenDelayMs - (ports.now() - hiddenSince);
      if (remaining <= 0) { halt(); return; }
      stopTimer = ports.schedule({ work: reconcile, delayMs: remaining });
    }
    open();
  }

  const onVisibility = () => {
    hiddenSince = ports.visibility.visibilityState === "hidden" ? hiddenSince ?? ports.now() : undefined;
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
    channel?.removeEventListener("message", onMessage);
    channel?.close();
  };
  try { reconcile(); } catch (error) { stop(); throw error; }
  return stop;
}
