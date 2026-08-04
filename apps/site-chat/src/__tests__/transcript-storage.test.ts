import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clearPersistedState, loadPersistedState, savePersistedState, TRANSCRIPT_STORAGE_KEY } from "../transcript-storage";

/**
 * SPEC-046 REQ-1. Run directly (no jsdom needed — `FakeStorage` below satisfies the `Storage`
 * interface the module actually depends on): `node --import tsx --test
 * apps/site-chat/src/__tests__/transcript-storage.test.ts` from the repo root.
 */

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

function message(id: string, role: "user" | "assistant", content: string) {
  return { id, role, content };
}

describe("transcript-storage", () => {
  describe("loadPersistedState — fail-soft rehydrate", () => {
    it("returns the empty default when nothing is stored", () => {
      const storage = new FakeStorage();
      assert.deepEqual(loadPersistedState(storage), { open: false, messages: [] });
    });

    it("rehydrates a validly-shaped entry", () => {
      const storage = new FakeStorage();
      const state = { open: true, messages: [message("1", "user", "hi")] };
      storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(state));
      assert.deepEqual(loadPersistedState(storage), state);
    });

    it("clears the key and starts empty on malformed JSON", () => {
      const storage = new FakeStorage();
      storage.setItem(TRANSCRIPT_STORAGE_KEY, "{not valid json");
      assert.deepEqual(loadPersistedState(storage), { open: false, messages: [] });
      assert.equal(storage.getItem(TRANSCRIPT_STORAGE_KEY), null, "the corrupt entry must be cleared, not left behind");
    });

    it("clears the key and starts empty when the envelope is not an object", () => {
      const storage = new FakeStorage();
      storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(["not", "an", "object"]));
      assert.deepEqual(loadPersistedState(storage), { open: false, messages: [] });
    });

    it("clears the key and starts empty when open is the wrong type", () => {
      const storage = new FakeStorage();
      storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify({ open: "yes", messages: [] }));
      assert.deepEqual(loadPersistedState(storage), { open: false, messages: [] });
    });

    it("clears the whole entry when even one message in the array is wrong-shaped", () => {
      const storage = new FakeStorage();
      const poisoned = {
        open: true,
        messages: [message("1", "user", "fine"), { id: "2", role: "villain", content: "bad role" }],
      };
      storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(poisoned));
      assert.deepEqual(
        loadPersistedState(storage),
        { open: false, messages: [] },
        "no partial recovery — one bad message clears the entire stored entry, not just itself",
      );
    });

    it("never throws when storage access itself throws", () => {
      const throwing: Storage = {
        length: 0,
        clear: () => {},
        key: () => null,
        getItem: () => {
          throw new DOMException("blocked", "SecurityError");
        },
        removeItem: () => {},
        setItem: () => {},
      };
      assert.doesNotThrow(() => loadPersistedState(throwing));
      assert.deepEqual(loadPersistedState(throwing), { open: false, messages: [] });
    });
  });

  describe("savePersistedState — bounded, oldest-dropped-first", () => {
    it("round-trips through loadPersistedState", () => {
      const storage = new FakeStorage();
      const state = { open: true, messages: [message("1", "user", "hello"), message("2", "assistant", "hi there")] };
      savePersistedState(storage, state);
      assert.deepEqual(loadPersistedState(storage), state);
    });

    it("drops the oldest messages first once the count cap is exceeded", () => {
      const storage = new FakeStorage();
      const messages = Array.from({ length: 60 }, (_, i) => message(`${i}`, "user", `turn ${i}`));
      savePersistedState(storage, { open: false, messages });
      const reloaded = loadPersistedState(storage);
      assert.equal(reloaded.messages.length, 50, "capped at MAX_MESSAGES");
      assert.equal(reloaded.messages[0]?.id, "10", "the 10 oldest were dropped, not the newest");
      assert.equal(reloaded.messages.at(-1)?.id, "59");
    });

    it("drops oldest messages first once the byte cap is exceeded, even under the count cap", () => {
      const storage = new FakeStorage();
      const big = "x".repeat(20_000);
      const messages = Array.from({ length: 15 }, (_, i) => message(`${i}`, "assistant", big));
      savePersistedState(storage, { open: false, messages });
      const reloaded = loadPersistedState(storage);
      assert.ok(reloaded.messages.length < 15, "byte cap must trim before the 50-message count cap would ever trigger");
      assert.equal(reloaded.messages.at(-1)?.id, "14", "the newest survives; oldest are dropped first");
    });

    it("never throws when the underlying setItem throws (e.g. quota exceeded)", () => {
      const throwing: Storage = {
        length: 0,
        clear: () => {},
        key: () => null,
        getItem: () => null,
        removeItem: () => {},
        setItem: () => {
          throw new DOMException("quota exceeded", "QuotaExceededError");
        },
      };
      assert.doesNotThrow(() => savePersistedState(throwing, { open: true, messages: [message("1", "user", "x")] }));
    });
  });

  describe("clearPersistedState", () => {
    it("removes the stored key", () => {
      const storage = new FakeStorage();
      savePersistedState(storage, { open: true, messages: [message("1", "user", "x")] });
      clearPersistedState(storage);
      assert.equal(storage.getItem(TRANSCRIPT_STORAGE_KEY), null);
      assert.deepEqual(loadPersistedState(storage), { open: false, messages: [] });
    });

    it("never throws when the underlying removeItem throws", () => {
      const throwing: Storage = {
        length: 0,
        clear: () => {},
        key: () => null,
        getItem: () => null,
        removeItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {},
      };
      assert.doesNotThrow(() => clearPersistedState(throwing));
    });
  });
});
