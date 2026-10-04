/**
 * @file `startVisibleInterval` (admin copy) — the composer's skills poll must not tick while the
 * window is hidden, and must catch up the moment it is shown again. Fake document and fake timers.
 */
import { describe, expect, it } from "vitest";

import { startVisibleInterval, type IntervalTimers, type VisibilitySource } from "../visible-interval";

function fakeDocument(initial: DocumentVisibilityState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const doc: VisibilitySource & { set(next: DocumentVisibilityState): void; listenerCount(): number } = {
    get visibilityState() {
      return state;
    },
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
    set(next) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
  return doc;
}

function fakeTimers() {
  const live = new Map<number, () => void>();
  let next = 0;
  const timers: IntervalTimers & { fire(): void; liveCount(): number } = {
    setInterval: (callback) => {
      live.set(++next, callback);
      return next;
    },
    clearInterval: (handle) => void live.delete(handle as number),
    fire: () => [...live.values()].forEach((callback) => callback()),
    liveCount: () => live.size,
  };
  return timers;
}

describe("startVisibleInterval (admin)", () => {
  it("ticks only while visible, catches up once on show, and stop clears timer and listener", () => {
    const doc = fakeDocument("visible");
    const timers = fakeTimers();
    let ticks = 0;
    const stop = startVisibleInterval(() => void ticks++, 10_000, doc, timers);

    expect(ticks).toBe(0);
    timers.fire();
    expect(ticks).toBe(1);

    doc.set("hidden");
    expect(timers.liveCount()).toBe(0);
    timers.fire();
    expect(ticks).toBe(1);

    doc.set("visible");
    expect(ticks).toBe(2);
    expect(timers.liveCount()).toBe(1);

    stop();
    expect(timers.liveCount()).toBe(0);
    expect(doc.listenerCount()).toBe(0);
  });

  it("starts no timer while the document begins hidden", () => {
    const doc = fakeDocument("hidden");
    const timers = fakeTimers();
    let ticks = 0;
    startVisibleInterval(() => void ticks++, 10_000, doc, timers);
    expect(timers.liveCount()).toBe(0);
    expect(ticks).toBe(0);
  });
});
