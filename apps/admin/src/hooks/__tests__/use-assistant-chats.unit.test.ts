// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError, type AssistantConversation } from "../../lib/assistant-chats";
import { createFakeAssistantChatsPort, defaultAssistantChatsPort } from "../assistant-chats-dependencies.hooks";
import type { AssistantChatsPort } from "../assistant-chats-port.hooks";
import { useAssistantChats, useWiredAssistantChats } from "../use-assistant-chats.hooks";

/**
 * @file `useAssistantChats` — the persistence paths an external audit found were silently lossy.
 *
 * The interesting behaviour here is all about *when* a conversation exists and *which* one a message
 * is written to, which is invisible from a rendered-component test.
 *
 * Two styles on purpose. The first group drives `useWiredAssistantChats` with `fetch` stubbed, so it
 * still covers the real client and the request shapes it produces. Everything after it injects a
 * fake port instead — because those cases are about retry timing and adoption ownership, and
 * expressing "the first write fails with a 503" as a hand-built `Response` describes the transport
 * rather than the behaviour under test.
 */

type Call = { url: string; method: string; body: unknown };
let calls: Call[];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  let created = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: String(url), method, body });

      if (method === "POST") {
        created += 1;
        return jsonResponse({
          conversation: { id: `new-${created}`, title: null, titleSource: "fallback", messageCount: 0 },
        });
      }
      if (method === "PUT") return jsonResponse({ message: body });
      if (String(url).endsWith("/messages")) return jsonResponse({ messages: [] });
      return jsonResponse({ conversations: [] });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const message = (id: string, content: string) => ({
  id,
  role: "user" as const,
  content,
  createdAt: 1,
});

describe("typing with no conversation selected", () => {
  it("creates one and persists the messages instead of discarding them", async () => {
    /*
     * The default state: nothing selects a conversation on mount, so a user who opens the dock and
     * types — without clicking "New" or picking from history — used to hit an early `return` here.
     * The run appeared on screen and nothing was ever stored; the conversation vanished on reload.
     */
    const { result } = renderHook(() => useWiredAssistantChats());
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    expect(result.current.activeId).toBeNull();

    await act(async () => {
      result.current.onMessagesChange([message("m1", "hello")]);
    });

    await waitFor(() => expect(result.current.activeId).toBe("new-1"));
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.url).toContain("/new-1/messages/m1");
  });

  it("does NOT remount the pane when adopting, so a streaming reply survives", async () => {
    // `paneKey` is what `ChatPane` is keyed on. Adoption changes `activeId` (where writes go) but
    // must leave `paneKey` alone, or the in-flight run is wiped from the UI mid-stream.
    const { result } = renderHook(() => useWiredAssistantChats());
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    const keyBefore = result.current.paneKey;

    await act(async () => {
      result.current.onMessagesChange([message("m1", "hello")]);
    });
    await waitFor(() => expect(result.current.activeId).toBe("new-1"));

    expect(result.current.paneKey).toBe(keyBefore);
  });

  it("adopts a single conversation when several deltas arrive before creation resolves", async () => {
    const { result } = renderHook(() => useWiredAssistantChats());
    await waitFor(() => expect(result.current.conversations).toEqual([]));

    await act(async () => {
      result.current.onMessagesChange([message("m1", "one")]);
      result.current.onMessagesChange([message("m1", "one"), message("m2", "two")]);
    });
    await waitFor(() => expect(result.current.activeId).toBe("new-1"));

    // One POST, not two — otherwise the turn is split across two conversations.
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

describe("explicit create still remounts the pane", () => {
  it("changes paneKey, because that is a user-initiated switch", async () => {
    const { result } = renderHook(() => useWiredAssistantChats());
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    const keyBefore = result.current.paneKey;

    await act(async () => {
      await result.current.create();
    });

    expect(result.current.activeId).toBe("new-1");
    expect(result.current.paneKey).not.toBe(keyBefore);
  });
});

/** Renders against `port` and waits out the mount refresh. */
async function mountWith(port: AssistantChatsPort) {
  const rendered = renderHook(() => useAssistantChats(port));
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
}

describe("a failed message write is retried", () => {
  it("survives a transient 503 instead of losing the reply", async () => {
    /*
     * The gap this closes. `flush` un-marked a failed id so it *could* be retried, and then nothing
     * ever retried it: retries were driven by the next `onMessagesChange`, and the message most
     * likely to fail is the final assistant reply — after which no further delta arrives. One
     * transient 503 there plus a reload and the reply is gone from durable history while still
     * sitting on screen.
     */
    vi.useFakeTimers();
    const port = createFakeAssistantChatsPort({
      onSaveMessage: (_conversationId, _message, attempt) => {
        if (attempt === 1) throw new HttpError(503, "Service Unavailable");
      },
    });

    const { result } = await mountWith(port);
    act(() => {
      result.current.onMessagesChange([message("m1", "hello")]);
    });

    // Past the first backoff step (1s), not past the second — so this asserts the retry happened,
    // not merely that something eventually succeeded.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(port.saveAttempts()).toBe(2);
    expect(port.saved.get("fake-1")?.map((m) => m.id)).toEqual(["m1"]);
  });

  it("does not retry a 400, and does not re-queue it on every later delta", async () => {
    /*
     * Two claims, deliberately in one test rather than split across two.
     *
     * They used to be separate, and the split was the bug: a standalone "no backoff fires" case
     * asserting only `saveAttempts() === 1` after 60s does not discriminate `isPermanent` from
     * merely `!isTransient` — `isTransient(400)` is already false on its own, so deleting
     * `isPermanent` entirely and falling through to that check reproduces `attempts === 1` and
     * `saved` empty identically. Nothing here tells the two implementations apart without a
     * SECOND delta, because the difference between "permanent" and "exhausted" is only visible in
     * what happens to the id afterwards: `"permanent"` keeps it marked written forever, `"exhausted"`
     * un-marks it for the next delta to retry. `isTransient`-only would classify 400 as
     * `"exhausted"`, and a follow-up delta would re-attempt it — which is exactly what the second
     * half below checks for, and is the assertion that actually pins `isPermanent`.
     */
    vi.useFakeTimers();
    const port = createFakeAssistantChatsPort({
      onSaveMessage: () => {
        throw new HttpError(400, "Bad Request");
      },
    });

    const { result } = await mountWith(port);
    act(() => {
      result.current.onMessagesChange([message("m1", "hello")]);
    });
    // Well past every backoff step, so a retry would certainly have fired by now.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(port.saveAttempts()).toBe(1);
    expect(port.saved.get("fake-1")).toBeUndefined();

    // The transcript grows, as it does on every streamed delta, and still carries m1.
    for (let delta = 0; delta < 3; delta += 1) {
      act(() => {
        result.current.onMessagesChange([message("m1", "hello"), message(`m${delta + 2}`, "more")]);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
    }

    // m1 attempted exactly once, ever. The three later messages account for the rest. This is the
    // half that would fail if `isPermanent` were deleted in favour of `!isTransient` alone.
    const m1Attempts = port.attemptedIds().filter((id) => id === "m1").length;
    expect(m1Attempts).toBe(1);
  });
});

describe("deleting the last conversation does not wedge persistence", () => {
  it("adopts a NEW conversation on the next message, not the deleted one", async () => {
    /*
     * The bug this pins, which four audit rounds missed because it takes two steps to reach.
     * `adoptingRef` is scoped to one pane, and deleting the last conversation is the only path that
     * returns `activeId` to `null` — the state that re-enters lazy adoption. `??=` then found the
     * previous pane's already-resolved promise, still naming the conversation that had just been
     * deleted: writes went to a row that no longer existed, `activeId` was never set again, and no
     * new conversation was ever created. The dock persisted nothing for the rest of the session.
     */
    const port = createFakeAssistantChatsPort();
    const { result } = await mountWith(port);

    await act(async () => {
      result.current.onMessagesChange([message("m1", "first")]);
    });
    await waitFor(() => expect(result.current.activeId).toBe("fake-1"));

    await act(async () => {
      await result.current.remove("fake-1");
    });
    expect(result.current.activeId).toBeNull();

    await act(async () => {
      result.current.onMessagesChange([message("m2", "second")]);
    });

    // A second conversation, and the message actually in it. Before the fix `activeId` stayed
    // `null` forever and `m2` was written at the deleted `fake-1`.
    await waitFor(() => expect(result.current.activeId).toBe("fake-2"));
    expect(port.saved.get("fake-2")?.map((m) => m.id)).toEqual(["m2"]);
  });
});

describe("a background adoption never overrides an explicit switch", () => {
  it("leaves the user in the chat they chose while the adoption was in flight", async () => {
    /*
     * Adoption used to BUMP the switch token before publishing its id, which made it win every race
     * it finished last: type into a fresh pane, click "New" a moment later, and the adoption landed
     * after the explicit create and dragged the user back. Reading the token instead of bumping it
     * means a deliberate action always outranks a background one.
     *
     * Does NOT, by itself, pin `adoptionGenRef` specifically: in this ordering `create()` wins
     * outright (nothing supersedes it), so it calls `resetAdoption()`, and an old `switchSeqRef`-only
     * guard would have seen `create()`'s bump of THAT token just as surely — the two mechanisms are
     * not distinguishable from this test's outcome alone. It stays for the assertion the other test
     * below does not make (the adopted row still shows up in the list even though it lost focus);
     * see "also holds when the SWITCH comes first" for the case that actually requires the
     * generation counter rather than the switch token.
     */
    const base = createFakeAssistantChatsPort();
    let openGate: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    let createCalls = 0;
    const port: AssistantChatsPort = {
      ...base,
      async createConversation(firstMessage?: string) {
        createCalls += 1;
        // Only the adoption's own POST is held open; the explicit `create()` below resolves at once.
        if (createCalls === 1) await gate;
        return base.createConversation(firstMessage);
      },
    };

    const { result } = await mountWith(port);

    act(() => {
      result.current.onMessagesChange([message("m1", "typed into the fresh pane")]);
    });

    await act(async () => {
      await result.current.create();
    });
    const chosen = result.current.activeId;
    expect(chosen).toBe("fake-1");

    await act(async () => {
      openGate?.();
      await Promise.resolve();
    });

    // Still where the user put themselves. The adopted row exists and is listed — abandoning it
    // would lose `m1` — it simply does not steal focus.
    expect(result.current.activeId).toBe(chosen);
    expect(result.current.conversations.map((c) => c.id)).toContain("fake-2");
  });

  it("also holds when the SWITCH comes first and the adoption is the straggler", async () => {
    /*
     * The opposite ordering to the case above, and the one that was still broken after the first
     * fix — an external review caught that the original test picked the ordering that passed.
     *
     * `select(B)` bumps the switch token at the moment of the CALL. A delta from the outgoing pane
     * arriving a moment later therefore reads the already-bumped value, so when the adoption
     * resolved its token still matched and it published `activeId`. Meanwhile B's own commit had
     * set `paneKey` and `initialMessages` to B. Net effect: the pane showed B's transcript while
     * every subsequent write went to the adopted conversation. Clearing `adoptingRef` in B's commit
     * does not help — that drops the reference, not the promise already in flight — which is why
     * invalidation needs its own generation counter.
     */
    const base = createFakeAssistantChatsPort({
      conversations: [
        { id: "existing-b", title: "B", titleSource: "manual", messageCount: 0, createdAt: 1, updatedAt: 1 },
      ],
    });
    let openGate: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const port: AssistantChatsPort = {
      ...base,
      async createConversation(firstMessage?: string) {
        await gate;
        return base.createConversation(firstMessage);
      },
    };

    const { result } = await mountWith(port);

    /*
     * ORDER IS THE ENTIRE TEST, and the first version of it had the order backwards — a review
     * caught that it started the adoption first, which the old `switchSeqRef` guard already
     * handled, so it passed with the fix reverted and proved nothing.
     *
     * `select` must come FIRST. It bumps the switch token at the moment of the call, so a delta
     * arriving afterwards reads the already-bumped value and the old guard could never tell the two
     * apart. The adoption then resolves LAST and publishes into a pane that has been re-keyed to B.
     */
    act(() => {
      result.current.select("existing-b");
    });
    act(() => {
      result.current.onMessagesChange([message("m1", "typed before the switch settled")]);
    });
    await waitFor(() => expect(result.current.activeId).toBe("existing-b"));

    await act(async () => {
      openGate?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The whole point: `activeId` must still agree with the pane the user is looking at.
    expect(result.current.activeId).toBe("existing-b");
    expect(result.current.paneKey).toBe("existing-b");
  });

  it("a late-rejecting stale adoption does not clear a newer one", async () => {
    /*
     * `adoptingRef.current = null` on failure cleared whatever was there *now*, not necessarily the
     * promise that failed. A stale adoption rejecting late therefore wiped a newer in-flight one,
     * and the following delta started a third — two conversations created for a single turn, the
     * same messages flushed into both, and whichever resolved last taking `activeId`.
     */
    const base = createFakeAssistantChatsPort();
    let failFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      failFirst = resolve;
    });
    let createCalls = 0;
    const port: AssistantChatsPort = {
      ...base,
      async createConversation(firstMessage?: string) {
        createCalls += 1;
        // #1 is the doomed adoption, held open so it can reject LATE. #3 is the live adoption it
        // must not disturb, left pending forever. #2 is the explicit create, which resolves at once.
        if (createCalls === 1) {
          await firstGate;
          throw new HttpError(500, "Internal Server Error");
        }
        if (createCalls >= 3) return new Promise<never>(() => {});
        return base.createConversation(firstMessage);
      },
    };

    const { result } = await mountWith(port);

    // Adoption #1 starts and hangs.
    act(() => {
      result.current.onMessagesChange([message("m1", "first turn")]);
    });

    // Create then delete the only conversation — the one route back to `activeId === null`, which
    // is the state that re-enters lazy adoption. `select` cannot stand in here: it sets a non-null
    // id, so the next delta takes the flush branch and no second adoption ever starts.
    await act(async () => {
      await result.current.create();
    });
    await act(async () => {
      await result.current.remove("fake-1");
    });
    expect(result.current.activeId).toBeNull();

    // Adoption #3 (call three) starts and stays in flight.
    await act(async () => {
      result.current.onMessagesChange([message("m2", "second turn")]);
      await Promise.resolve();
    });

    // Only NOW does the long-stale first adoption fail.
    await act(async () => {
      failFirst?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      result.current.onMessagesChange([message("m2", "second turn")]);
      await Promise.resolve();
    });

    // Three calls: the failed adoption, the explicit create, and the live adoption. A fourth would
    // mean the stale rejection had cleared the live one and the next delta started yet another
    // conversation for the same turn.
    expect(createCalls).toBe(3);
  });
});

describe("an in-flight list refresh cannot erase a just-created conversation", () => {
  it("keeps the new row when a stale snapshot lands after it", async () => {
    /*
     * The mount `refresh()` resolves to `[]`. If the user creates a conversation before that
     * response arrives, the stale snapshot replaced the list and the brand-new conversation
     * vanished from the switcher — while `activeId` still pointed at it, so the header fell back to
     * the default title and the chat was unreachable until some later write refreshed again.
     */
    const base = createFakeAssistantChatsPort();
    let releaseList: (() => void) | undefined;
    const listGate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    let listCalls = 0;
    const port: AssistantChatsPort = {
      ...base,
      async listConversations() {
        listCalls += 1;
        if (listCalls === 1) {
          /*
           * The SNAPSHOT IS TAKEN NOW, before the gate — which is what makes it stale, and what the
           * first version of this test got wrong. Awaiting the gate and only then calling
           * `base.listConversations()` reads the array *after* `create()` has already inserted
           * `fake-1`, so the response contained the new row and the test passed with
           * `markListMutated` removed. A stale response has to be captured before the mutation it
           * is supposed to be older than.
           */
          const snapshot = await base.listConversations();
          await listGate;
          return snapshot;
        }
        return base.listConversations();
      },
    };

    // Deliberately NOT `mountWith` — this test needs to act before the mount refresh settles.
    const { result } = renderHook(() => useAssistantChats(port));

    await act(async () => {
      await result.current.create();
    });
    expect(result.current.activeId).toBe("fake-1");

    await act(async () => {
      releaseList?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.conversations.map((c) => c.id)).toContain("fake-1");
  });
});

describe("the real client is what classifies a failure", () => {
  it("throws an HttpError carrying the status, so the retry can tell 503 from 400", async () => {
    /*
     * The retry tests above inject `HttpError` straight through a fake port, which means they would
     * all still pass if `json()` went back to throwing a bare `Error` — at which point every real
     * 400 and 404 would take the transient path and be retried forever. This is the one assertion
     * that pins the mapping from an actual non-2xx response to the class the hook branches on.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" })),
    );

    await expect(defaultAssistantChatsPort.saveMessage("c1", message("m1", "hi"))).rejects.toBeInstanceOf(
      HttpError,
    );
    await expect(defaultAssistantChatsPort.saveMessage("c1", message("m1", "hi"))).rejects.toMatchObject({
      status: 503,
    });
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Everything below exists because of a MUTATION SWEEP, not a review.
 *
 * Each guard in the hook was deleted in turn and the suite re-run. Six survived — no test failed
 * when the guard was removed — which means six pieces of production code were carried on reviewer
 * agreement alone, with nothing mechanically demonstrating they were needed. Two independent
 * adversarial reviews had signed off on most of them, so agreement is evidently not evidence.
 *
 * The rule these encode: a guard is justified by a test that FAILS without it, or it comes out.
 * If you delete a guard below and this file still passes, the guard is dead — remove it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

describe("guards proven necessary by deleting them", () => {
  it("retries a 404 on the backoff ladder instead of giving up instantly", async () => {
    /*
     * Kills: removing 404 from `isTransient`.
     *
     * A 404 was excluded from `isPermanent` (correctly — deleting a conversation mid-write 404s a
     * perfectly valid message), but then matched NEITHER predicate, so it returned "exhausted" on
     * the first failure with no backoff, was un-marked, and re-sent immediately on the next delta.
     * That is the retry storm the classification exists to prevent, running at delta cadence.
     */
    vi.useFakeTimers();
    const port = createFakeAssistantChatsPort({
      onSaveMessage: (_c, _m, attempt) => {
        if (attempt === 1) throw new HttpError(404, "Not Found");
      },
    });

    const { result } = await mountWith(port);
    act(() => {
      result.current.onMessagesChange([message("m1", "hello")]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    // Two attempts means the ladder ran. Without 404 in `isTransient` it stops at one.
    expect(port.saveAttempts()).toBe(2);
    expect(port.saved.get("fake-1")?.map((m) => m.id)).toEqual(["m1"]);
  });

  it("keeps an optimistic rename visible while its PATCH is still in flight", async () => {
    /*
     * Kills: dropping the `pendingRenamesRef` overlay from `refresh`.
     *
     * `markListMutated` only invalidates reads that STARTED before the rename. A read starting
     * after it, against a server that has not applied the PATCH yet, is legitimately "fresh" — and
     * wrote the old title straight over the new one. Any unrelated activity triggers such a read.
     */
    const base = createFakeAssistantChatsPort({
      conversations: [
        { id: "c1", title: "Old", titleSource: "manual", messageCount: 0, createdAt: 1, updatedAt: 1 },
      ],
    });
    let openPatch: (() => void) | undefined;
    const patchGate = new Promise<void>((resolve) => {
      openPatch = resolve;
    });
    const port: AssistantChatsPort = {
      ...base,
      async renameConversation(id: string, title: string) {
        await patchGate;
        return base.renameConversation(id, title);
      },
    };

    const { result } = await mountWith(port);
    let renaming: Promise<void> | undefined;
    act(() => {
      renaming = result.current.rename("c1", "New");
    });

    // An unrelated refresh lands while the PATCH is still open. The server still says "Old".
    await act(async () => {
      await result.current.remove("nonexistent");
    });

    expect(result.current.conversations.find((c) => c.id === "c1")?.title).toBe("New");

    await act(async () => {
      openPatch?.();
      await renaming;
    });
    expect(result.current.conversations.find((c) => c.id === "c1")?.title).toBe("New");
  });

  it("stops retrying once the dock unmounts", async () => {
    /*
     * Kills: `disposedRef` (the mount/unmount flag threaded into `saveWithRetry`).
     *
     * Without it a torn-down dock keeps writing on its backoff schedule for another ~13 seconds,
     * against a component nobody is looking at. Note the flag must RESET on mount, not merely set
     * on unmount — StrictMode's mount→unmount→mount would otherwise latch it on the throwaway pass.
     */
    vi.useFakeTimers();
    const port = createFakeAssistantChatsPort({
      onSaveMessage: () => {
        throw new HttpError(503, "Service Unavailable");
      },
    });

    const rendered = renderHook(() => useAssistantChats(port));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      rendered.result.current.onMessagesChange([message("m1", "hello")]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const attemptsBeforeUnmount = port.saveAttempts();

    rendered.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(port.saveAttempts()).toBe(attemptsBeforeUnmount);
  });

  it("does not route to a conversation a stale list still thinks exists", async () => {
    /*
     * Kills: using an unguarded stale snapshot in `remove` (checking `fresh` without ever falling
     * back when it's false).
     *
     * Delete A while its list read is in flight; delete C, whose newer read lands first and wins.
     * A's read then arrives stale, still listing C. Routing from it lands `activeId` on a
     * conversation no fresh list will ever contain again — and `select`'s `.catch(() => commit([]))`
     * dresses that up as a successful switch to an empty pane.
     *
     * Was `it.skip`, and honestly so at the time: the mock captured its "stale" snapshot by reading
     * the fake's live array at the moment `remove(A)`'s own `listConversations()` was dispatched —
     * which, given how `act()` actually interleaves these two `remove()` calls, happens AFTER C's
     * synchronous deletion has already run. The "stale" response therefore already omitted C by
     * accident of timing, and the test passed whether or not the guard existed. Pinning the stale
     * response to a snapshot taken before EITHER delete — a plain array literal, not a live read —
     * removes that dependency on exact interleaving: it is stale no matter when it is returned, and
     * this is the case that must fail without a fallback and pass with one.
     */
    const seed = (id: string, order: number): AssistantConversation => ({
      id,
      title: id,
      titleSource: "manual" as const,
      messageCount: 0,
      createdAt: order,
      updatedAt: order,
    });
    const staleListStillContainingC: AssistantConversation[] = [seed("A", 3), seed("C", 2), seed("B", 1)];
    const base = createFakeAssistantChatsPort({
      conversations: staleListStillContainingC.map((c) => ({ ...c })),
    });
    let openFirstList: (() => void) | undefined;
    const firstListGate = new Promise<void>((resolve) => {
      openFirstList = resolve;
    });
    let listCalls = 0;
    const port: AssistantChatsPort = {
      ...base,
      async listConversations() {
        listCalls += 1;
        // Call 1 is the mount read. Call 2 is remove(A)'s — a response computed before either
        // delete, held open until AFTER C has actually been deleted (by `remove("C")`, below), so it
        // arrives having missed C's removal entirely — a genuinely stale read, not a live one that
        // happens to still be fresh at read time.
        if (listCalls === 2) {
          await firstListGate;
          return staleListStillContainingC;
        }
        return base.listConversations();
      },
    };

    const { result } = await mountWith(port);
    act(() => {
      result.current.select("A");
    });
    await waitFor(() => expect(result.current.activeId).toBe("A"));

    let removingA: Promise<void> | undefined;
    act(() => {
      removingA = result.current.remove("A");
    });
    await act(async () => {
      await result.current.remove("C");
    });
    await act(async () => {
      openFirstList?.();
      await removingA;
    });

    // B, never C. C was deleted while A's snapshot was in flight, so A's own stale response must
    // not be trusted to pick the next conversation to land on.
    expect(result.current.activeId).toBe("B");
  });

  it("names a conversation from its first user message, as the real route does on append", async () => {
    /*
     * Kills: the fake's append-time title derivation.
     *
     * Every conversation this hook creates is created with NO `firstMessage` — both `create()` and
     * lazy adoption do — so append-time naming is the only mechanism that ever gives one a title.
     * A fake that skips it makes "does the switcher ever stop saying Untitled" untestable, which is
     * exactly the blind spot a previous round had to fix a real bug in.
     */
    const port = createFakeAssistantChatsPort();
    const { result } = await mountWith(port);

    await act(async () => {
      result.current.onMessagesChange([message("m1", "how many published posts do I have")]);
    });
    await waitFor(() => expect(result.current.activeId).toBe("fake-1"));
    await waitFor(() =>
      expect(result.current.conversations.find((c) => c.id === "fake-1")?.title).toBeTruthy(),
    );
  });

  it("re-reads the list when a write keeps 404ing, instead of grinding silently", async () => {
    /*
     * Kills: the fake's 404-on-unknown-conversation throw, AND the `"missing"` outcome that
     * un-marks the id and nudges a refresh.
     *
     * A permissive fake accepted writes to deleted conversations, which made this whole class of
     * bug invisible — the previous round found a real `remove()` race the fake had been hiding.
     */
    // Real timers for the setup: `waitFor` polls on a real interval, so it never resolves under
    // fake timers. Swap clocks only once the pane has actually adopted a conversation.
    const port = createFakeAssistantChatsPort();
    const { result } = await mountWith(port);

    await act(async () => {
      result.current.onMessagesChange([message("m1", "first")]);
    });
    await waitFor(() => expect(result.current.activeId).toBe("fake-1"));

    // Deleted out from under the pane, the way another tab would.
    await act(async () => {
      await port.deleteConversation("fake-1");
    });

    vi.useFakeTimers();

    await act(async () => {
      result.current.onMessagesChange([message("m1", "first"), message("m2", "second")]);
      await vi.advanceTimersByTimeAsync(20_000);
    });

    /*
     * Assert the ATTEMPT COUNT, not just that the list refreshed.
     *
     * The refresh assertion alone does not discriminate: a permissive fake accepts the write, the
     * outcome is `"saved"`, and `flush` refreshes on that path too — so the switcher updates either
     * way and the test passes with the fake's 404 removed. Attempts are what separate them: a write
     * that 404s climbs the whole backoff ladder, a write that succeeds is attempted once.
     */
    expect(port.saveAttempts()).toBeGreaterThan(2);
    expect(result.current.conversations.map((c) => c.id)).not.toContain("fake-1");
  });
});
