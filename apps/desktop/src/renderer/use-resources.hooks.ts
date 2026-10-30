/** Pull-only Tovu resource readings. Main owns sampling policy and process attribution. */
import { useEffect, useRef, useState } from 'react';
import { runnerInventoryBridge } from './runner-api.js';
import type { ResourcesRequest, ResourcesSnapshot } from '../contracts/resources.js';

/** Effects at the renderer boundary; fakes need neither Electron nor real timers. */
export interface ResourcesPorts {
  getBridge: () => { getResources?: (input: ResourcesRequest) => Promise<ResourcesSnapshot> } | undefined;
  document: {
    readonly hidden: boolean;
    addEventListener: (event: 'visibilitychange', listener: () => void) => void;
    removeEventListener: (event: 'visibilitychange', listener: () => void) => void;
  };
  setTimer: (run: () => void, delay: number) => number;
  clearTimer: (id: number) => void;
}

const browserPorts: ResourcesPorts = {
  getBridge: runnerInventoryBridge,
  get document() { return document; },
  setTimer: (run, delay) => window.setTimeout(run, delay),
  clearTimer: (id) => window.clearTimeout(id),
};

/** A visibility change invalidates a pending reading; retry it before the next normal cadence. */
function pollDelay({ currentVisibility, snapshot }: { currentVisibility: boolean; snapshot: ResourcesSnapshot | null }, _options = {}) {
  if (!currentVisibility) return 0;
  return snapshot?.pollIntervalMs ?? 60_000;
}

/**
 * Read one shared snapshot while the host document is visible. Returns null on IPC failure or
 * stale preload; native errors never enter the UI. Cleanup removes the listener and timer.
 * A shared promise serializes reads even when opening the panel replaces the effect mid-request.
 * @example const snapshot = useResources({ panelOpen });
 * @complexity O(1) work/state per poll beyond the existing main-process IPC.
 */
export function useResources({ panelOpen }: ResourcesRequest, { ports = browserPorts }: { ports?: ResourcesPorts } = {}) {
  const [snapshot, setSnapshot] = useState<ResourcesSnapshot | null>(null);
  const inFlight = useRef<Promise<ResourcesSnapshot | null> | null>(null);
  useEffect(() => {
    const bridge = ports.getBridge();
    if (!bridge?.getResources) return undefined;
    let active = true;
    let pending = false;
    let visibilityVersion = 0;
    let timer: number | undefined;

    /** Clear the scheduled read before hiding, refreshing or disposing this effect. */
    function clearTimer() {
      if (timer !== undefined) ports.clearTimer(timer);
      timer = undefined;
    }

    /** Re-check visibility after awaiting another effect's read; never overlap IPC requests. */
    async function poll() {
      if (pending) return;
      pending = true;
      await inFlight.current;
      if (!active || ports.document.hidden) { pending = false; return; }
      const version = visibilityVersion;
      // Resolve failures locally: raw native/IPC messages may contain sensitive process details.
      const request = Promise.resolve().then(() => bridge!.getResources!({ panelOpen })).catch(() => null);
      inFlight.current = request;
      const next = await request;
      inFlight.current = null;
      pending = false;
      if (!active || ports.document.hidden) return;
      const currentVisibility = version === visibilityVersion;
      if (currentVisibility) setSnapshot(next);
      timer = ports.setTimer(() => { void poll(); }, pollDelay({ currentVisibility, snapshot: next }));
    }

    /** A hidden document owns no timer. Returning to it asks main for a fresh/cached snapshot. */
    function visibilityChanged() {
      visibilityVersion++;
      clearTimer();
      if (!ports.document.hidden) void poll();
    }
    ports.document.addEventListener('visibilitychange', visibilityChanged);
    void poll();
    return () => {
      active = false;
      clearTimer();
      ports.document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [panelOpen, ports]);
  return snapshot;
}
