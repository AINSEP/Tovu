import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { createFakeTermPickerPort } from "../hooks/term-picker-dependencies.hooks";
import { useTermPicker, useWiredTermPicker } from "../hooks/use-term-picker.hooks";
import type { TermPickerPort } from "../hooks/term-picker-port.hooks";

/**
 * @file `useTermPicker` — `TermPicker`'s ticked set, loaded from the entry's own terms, and its save
 * (assign the added ids, unassign the removed ones). Driven through `createFakeTermPickerPort`; one
 * wired case at the bottom proves the real client's three routes.
 *
 * `wrapper`: the read and the save go through `lib/fetch-query`, which needs its provider.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A manually-resolved promise, for race tests — never a timer (WRITER-RULES). */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function mountWith(port: TermPickerPort) {
  const hook = renderHook(() => useTermPicker({ contentType: "recipe", contentId: "e1" }, { port, locale: "en" }), { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("loading the entry's terms", () => {
  it("starts loading, then shows the entry's own terms ticked and nothing to save", async () => {
    const port = createFakeTermPickerPort({ assigned: ["t1", "t2"] });
    const hook = renderHook(() => useTermPicker({ contentType: "recipe", contentId: "e1" }, { port, locale: "en" }), { wrapper });
    expect(hook.result.current.loading).toBe(true);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.selected).toEqual(new Set(["t1", "t2"]));
    expect(hook.result.current.dirty).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });

  it("a failed read is reported with its own message", async () => {
    const port = createFakeTermPickerPort({ loadError: new Error("read exploded") });
    const { result } = renderHook(() => useTermPicker({ contentType: "recipe", contentId: "e1" }, { port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.error).toBe("read exploded"));
  });
});

describe("toggle", () => {
  it("unticking a held term and ticking a new one both make it dirty; undoing both makes it clean", async () => {
    const { result } = await mountWith(createFakeTermPickerPort({ assigned: ["t1"] }));
    act(() => result.current.toggle("t1"));
    expect(result.current.selected).toEqual(new Set());
    expect(result.current.dirty).toBe(true);
    act(() => result.current.toggle("t2"));
    expect(result.current.selected).toEqual(new Set(["t2"]));
    act(() => result.current.toggle("t1"));
    act(() => result.current.toggle("t2"));
    expect(result.current.dirty).toBe(false);
  });
});

describe("save", () => {
  it("is a no-op with nothing changed", async () => {
    const port = createFakeTermPickerPort({ assigned: ["t1"] });
    const { result } = await mountWith(port);
    await act(async () => {
      await result.current.save();
    });
    expect(port.calls).toEqual([]);
  });

  it("assigns the added ids and unassigns the removed ones, then reads back clean", async () => {
    const port = createFakeTermPickerPort({ assigned: ["t1", "t2"] });
    const { result } = await mountWith(port);
    act(() => result.current.toggle("t1"));
    act(() => result.current.toggle("t3"));

    await act(async () => {
      await result.current.save();
    });

    expect(port.calls).toEqual([
      { kind: "assign", contentType: "recipe", contentId: "e1", termIds: ["t3"] },
      { kind: "unassign", contentType: "recipe", contentId: "e1", termIds: ["t1"] },
    ]);
    expect(result.current.message).toBe("Categories & tags saved.");
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(result.current.selected).toEqual(new Set(["t2", "t3"]));
  });

  it("removing every term only unassigns", async () => {
    const port = createFakeTermPickerPort({ assigned: ["t1"] });
    const { result } = await mountWith(port);
    act(() => result.current.toggle("t1"));
    await act(async () => {
      await result.current.save();
    });
    expect(port.calls).toEqual([{ kind: "unassign", contentType: "recipe", contentId: "e1", termIds: ["t1"] }]);
  });

  it("on failure, reports the error and keeps the ticked set", async () => {
    const port = createFakeTermPickerPort({ saveError: new Error("server exploded") });
    const { result } = await mountWith(port);
    act(() => result.current.toggle("t1"));
    await act(async () => {
      await result.current.save();
    });
    // `describeApiError` returns a plain `Error`'s own `.message` verbatim.
    expect(result.current.error).toBe("server exploded");
    expect(result.current.message).toBeNull();
    expect(result.current.selected.has("t1")).toBe(true);
    expect(result.current.dirty).toBe(true);
  });

  it("a term ticked while Save is in flight stays ticked, as an unsaved change (M1)", async () => {
    const writes: string[][] = [];
    const inFlight = deferred<void>();
    let held: string[] = [];
    const port: TermPickerPort = {
      assignedTerms: async () => ({ termIds: held }),
      assignTerms: async (input) => {
        writes.push(input.termIds);
        await inFlight.promise;
        held = [...held, ...input.termIds];
      },
      unassignTerms: async () => {},
    };
    const { result } = await mountWith(port);

    act(() => result.current.toggle("a"));
    act(() => {
      void result.current.save();
    });
    await waitFor(() => expect(result.current.saving).toBe(true));
    act(() => result.current.toggle("b"));
    inFlight.resolve();
    await waitFor(() => expect(result.current.saving).toBe(false));

    expect(writes).toEqual([["a"]]);
    await waitFor(() => expect(result.current.selected).toEqual(new Set(["a", "b"])));
    expect(result.current.dirty).toBe(true);
  });

  it("ticking after a save clears its message", async () => {
    const { result } = await mountWith(createFakeTermPickerPort());
    act(() => result.current.toggle("t1"));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.message).not.toBeNull();
    act(() => result.current.toggle("t2"));
    expect(result.current.message).toBeNull();
  });
});

describe("useWiredTermPicker (real client)", () => {
  let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

  beforeEach(() => {
    fetchMock = vi.fn();
    // `useAdminLocale()`'s own settings read is answered outside `fetchMock`'s queue.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }
      return fetchMock(url, init);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads assigned-terms, then saves through assign-terms and unassign-terms", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/assigned-terms") ? jsonResponse({ termIds: ["t1"] }) : new Response(null, { status: 204 })
    );
    const { result } = renderHook(() => useWiredTermPicker({ contentType: "recipe", contentId: "e1" }), { wrapper });
    await waitFor(() => expect(result.current.selected).toEqual(new Set(["t1"])));
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/taxonomy/assigned-terms?contentType=recipe&contentId=e1");

    act(() => result.current.toggle("t1"));
    act(() => result.current.toggle("t2"));
    await act(async () => {
      await result.current.save();
    });

    const writes = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
      .map(([url, init]) => [String(url).replace(/^.*\/taxonomy\//, ""), JSON.parse(String((init as RequestInit).body))]);
    expect(writes).toEqual([
      ["assign-terms", { contentType: "recipe", contentId: "e1", termIds: ["t2"] }],
      ["unassign-terms", { contentType: "recipe", contentId: "e1", termIds: ["t1"] }],
    ]);
  });
});
