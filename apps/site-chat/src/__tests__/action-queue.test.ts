import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { drainQueuedAction, enqueueAction } from "../action-queue";

/**
 * SPEC-046 REQ-2 — the queue mechanism, proven directly since there are no real actions to queue yet
 * (REQ-4 through REQ-8 are out of this slice's scope). Run: `node --import tsx --test
 * apps/site-chat/src/__tests__/action-queue.test.ts` from the repo root.
 */

const ACTION_QUEUE_STORAGE_KEY = "tovu.site-assistant.action-queue.v1";

class FakeStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("action-queue", () => {
  it("drains null when nothing was queued", () => {
    const storage = new FakeStorage();
    assert.equal(drainQueuedAction(storage), null);
  });

  it("returns exactly what was enqueued", () => {
    const storage = new FakeStorage();
    const action = { kind: "example", value: 42 };
    enqueueAction(storage, action);
    assert.deepEqual(drainQueuedAction(storage), action);
  });

  it("deletes the entry from storage before drainQueuedAction returns — a reload can never re-fire it", () => {
    const storage = new FakeStorage();
    enqueueAction(storage, { kind: "example" });
    assert.notEqual(storage.getItem(ACTION_QUEUE_STORAGE_KEY), null, "sanity: the action was actually queued");

    const first = drainQueuedAction(storage);
    assert.deepEqual(first, { kind: "example" });
    assert.equal(storage.getItem(ACTION_QUEUE_STORAGE_KEY), null, "storage must be empty immediately, not after some later step");

    // Simulates the exact failure mode REQ-2 exists to prevent: a reload calls drainQueuedAction
    // again against the SAME storage. It must come back empty, not re-fire the first action.
    const second = drainQueuedAction(storage);
    assert.equal(second, null);
  });

  it("deletes before the JSON.parse step, so a corrupt entry cannot survive a failed drain", () => {
    const storage = new FakeStorage();
    storage.setItem(ACTION_QUEUE_STORAGE_KEY, "{not valid json");
    const result = drainQueuedAction(storage);
    assert.equal(result, null);
    assert.equal(storage.getItem(ACTION_QUEUE_STORAGE_KEY), null, "the corrupt entry must not be left behind for the next mount to trip over again");
  });

  it("later enqueueAction calls overwrite the pending slot rather than stacking a FIFO", () => {
    const storage = new FakeStorage();
    enqueueAction(storage, { kind: "first" });
    enqueueAction(storage, { kind: "second" });
    assert.deepEqual(drainQueuedAction(storage), { kind: "second" });
    assert.equal(drainQueuedAction(storage), null, "only one action was ever pending");
  });

  it("never throws when the underlying storage throws on every call", () => {
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    assert.doesNotThrow(() => enqueueAction(throwing, { kind: "x" }));
    assert.doesNotThrow(() => assert.equal(drainQueuedAction(throwing), null));
  });

  it("fails closed (never returns the action) when removeItem itself throws, rather than risking a re-fire", () => {
    const data = new Map<string, string>([[ACTION_QUEUE_STORAGE_KEY, JSON.stringify({ kind: "x" })]]);
    const storage: Storage = {
      length: 1,
      clear: () => {},
      key: () => null,
      getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
      removeItem: () => {
        throw new Error("removeItem blocked");
      },
      setItem: (key, value) => {
        data.set(key, value);
      },
    };
    assert.equal(drainQueuedAction(storage), null, "cannot guarantee single-shot delivery, so it must not deliver at all");
  });
});
