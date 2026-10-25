import type { SurfaceEmission, SurfaceEmitter } from '@jini-ai/core';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createFakeClock } from './fake-clock.js';

/** Real exchanges over an injected clock/scheduler; expire only after the test observes the card.
 * No host timers or sleeps. O(s) expiration in the handful of scheduled exchange deadlines.
 */
export function createExpiringSurfaces(_required: Record<string, never>, _options: Record<string, never> = {}) {
  const clock = createFakeClock({ startIso: '2026-10-25T00:00:00Z' });
  const deadlines = new Map<() => void, number>();
  const emitted: SurfaceEmission[] = [];
  let ids = 0;
  const surfaceExchanges = createSurfaceExchangeStore({
    clock, idGenerator: { newId: () => `expiry-${++ids}` }, defaultChannel: 'mcp-ui',
    scheduler: { schedule: ({ delayMs, callback }) => {
      deadlines.set(callback, clock.nowMs() + delayMs);
      return () => { deadlines.delete(callback); };
    } },
  }, { idleTtlMs: 100, maxLifetimeMs: 1_000 });
  const emitSurface: SurfaceEmitter = async surface => { emitted.push(surface); };
  return { surfaceExchanges, emitted, emitSurface,
    expire: () => {
      clock.advanceMs(100);
      for (const [callback, at] of [...deadlines]) if (at <= clock.nowMs()) callback();
    },
  };
}
