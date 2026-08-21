import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";

import {
  clearPersistedState,
  clearSiteAssistantState,
  drainQueuedAction,
  drainQueuedPageAction,
  enqueueAction,
  enqueuePageAction,
  loadPersistedState,
  loadSiteAssistantState,
  saveSiteAssistantState,
  savePersistedState,
  TRANSCRIPT_STORAGE_KEY,
} from "../session-store";

/**
 * SPEC-046 REQ-1/REQ-2. Merged from the former `transcript-storage.test.ts` + `action-queue.test.ts`
 * when both source files collapsed into `session-store.ts` — every test body below is unchanged from
 * those two files; only the import and the shared `FakeStorage` helper were consolidated. Run:
 * `node --import tsx --test apps/site-chat/src/__tests__/session-store.test.ts` from the repo root.
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

    it("clears the whole entry when a message's id is not a string", () => {
      const storage = new FakeStorage();
      const poisoned = { open: true, messages: [{ id: 42, role: "user", content: "fine" }] };
      storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(poisoned));
      assert.deepEqual(loadPersistedState(storage), { open: false, messages: [] });
    });

    it("clears the whole entry when a message's content is not a string", () => {
      const storage = new FakeStorage();
      const poisoned = { open: true, messages: [{ id: "1", role: "user", content: 42 }] };
      storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(poisoned));
      assert.deepEqual(loadPersistedState(storage), { open: false, messages: [] });
    });

    it("clears the whole entry when a message entry is not an object at all", () => {
      const storage = new FakeStorage();
      const poisoned = { open: true, messages: [message("1", "user", "fine"), "not an object"] };
      storage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(poisoned));
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

/**
 * The five `*SiteAssistantState`/`*PageAction` exports are one-line binders bound to the REAL
 * `sessionStorage` global (see this file's own "storage encapsulation guard" below and the source
 * file's own header on why they exist at all: `SiteAssistantWidget.tsx`/`main.tsx` call these, never
 * `sessionStorage` itself). Every test above exercises the injectable `*PersistedState`/`*Action`
 * forms through `FakeStorage`, which never touches these five lines. A fresh `JSDOM` per test installs
 * a real `sessionStorage` onto `globalThis` (matching `highlight.test.ts`'s own "fresh JSDOM per
 * scenario" pattern) so each wrapper is proven to reach the actual global, not just its own
 * injectable counterpart under a fake.
 */
describe("real-sessionStorage-bound wrappers", () => {
  let dom: JSDOM;
  let savedSessionStorage: unknown;

  beforeEach(() => {
    dom = new JSDOM("", { url: "http://localhost/" });
    savedSessionStorage = (globalThis as { sessionStorage?: unknown }).sessionStorage;
    (globalThis as { sessionStorage?: unknown }).sessionStorage = dom.window.sessionStorage;
  });

  afterEach(() => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = savedSessionStorage;
    dom.window.close();
  });

  it("loadSiteAssistantState reads through to the real sessionStorage, not a private store", () => {
    const state = { open: true, messages: [message("1", "user", "hi")] };
    sessionStorage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(state));
    assert.deepEqual(loadSiteAssistantState(), state);
  });

  it("saveSiteAssistantState writes through to the real sessionStorage, not a private store", () => {
    const state = { open: false, messages: [message("1", "assistant", "hello")] };
    saveSiteAssistantState(state);
    assert.deepEqual(JSON.parse(sessionStorage.getItem(TRANSCRIPT_STORAGE_KEY) as string), state);
  });

  it("clearSiteAssistantState removes the real sessionStorage entry", () => {
    sessionStorage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify({ open: true, messages: [] }));
    clearSiteAssistantState();
    assert.equal(sessionStorage.getItem(TRANSCRIPT_STORAGE_KEY), null);
  });

  it("enqueuePageAction writes through to the real sessionStorage, not a private store", () => {
    enqueuePageAction({ kind: "example" });
    assert.deepEqual(JSON.parse(sessionStorage.getItem(ACTION_QUEUE_STORAGE_KEY) as string), { kind: "example" });
  });

  it("drainQueuedPageAction reads and clears the real sessionStorage entry", () => {
    sessionStorage.setItem(ACTION_QUEUE_STORAGE_KEY, JSON.stringify({ kind: "example" }));
    assert.deepEqual(drainQueuedPageAction(), { kind: "example" });
    assert.equal(sessionStorage.getItem(ACTION_QUEUE_STORAGE_KEY), null, "single-shot: the real entry must be gone too");
    assert.equal(drainQueuedPageAction(), null, "draining again finds nothing — proves it read the real global, not a stale fake");
  });
});

/**
 * Guard test (Task 1, storage consolidation): asserts `sessionStorage` is named in exactly one file
 * under `apps/site-chat/src` — `session-store.ts` — plus this test file's own literal below (needed
 * to describe the rule). This is not pedantry: the whole point of collapsing two storage files into
 * one was the owner's explicit preference for a single place that touches `sessionStorage`, with
 * every other caller going through the bound wrappers (`loadSiteAssistantState`,
 * `saveSiteAssistantState`, `clearSiteAssistantState`, `drainQueuedPageAction`, `enqueuePageAction`).
 * A future author adding a second `sessionStorage` reference — even one that "just needs a quick
 * read" — silently recreates the two-key-schemes-that-can-drift problem this consolidation fixed.
 * Do not delete this as pedantic; it is the only thing enforcing that the encapsulation holds.
 */
describe("storage encapsulation guard", () => {
  it("only session-store.ts (and this guard) names sessionStorage under apps/site-chat/src", () => {
    const testFileUrl = import.meta.url;
    const testsDir = path.dirname(fileURLToPath(testFileUrl));
    const srcDir = path.resolve(testsDir, "..");
    const allowedFiles = new Set(["session-store.ts", path.join("__tests__", "session-store.test.ts")]);

    const offenders: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(srcDir, fullPath);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (allowedFiles.has(relativePath)) continue;
        const contents = readFileSync(fullPath, "utf8");
        if (contents.includes("sessionStorage")) offenders.push(relativePath);
      }
    }
    walk(srcDir);

    assert.deepEqual(offenders, [], `sessionStorage must only be named in session-store.ts; found it in: ${offenders.join(", ")}`);
  });
});
