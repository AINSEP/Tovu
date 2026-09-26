import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { createFakeTermPickerPort } from "../hooks/term-picker-dependencies.hooks";
import { useTermPicker, useWiredTermPicker } from "../hooks/use-term-picker.hooks";
import type { TermPickerPort } from "../hooks/term-picker-port.hooks";
import type { AdminTaxonomyWithTerms } from "@/lib/api";

/**
 * @file `useTermPicker` — `TermPicker`'s taxonomy list, its ticked set loaded from the content's own
 * terms (a post, page or collection entry — only the content ref differs), and its save
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

async function mountWith(port: TermPickerPort, target = { contentType: "recipe", contentId: "e1" }) {
  const hook = renderHook(() => useTermPicker(target, { port, locale: "en" }), { wrapper });
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

const GENRE: AdminTaxonomyWithTerms = {
  taxonomy: { id: "tax1", name: "Genre", hierarchical: false, status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 },
  terms: [{ id: "t1", taxonomyId: "tax1", parentId: null, name: "Fiction", status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 }],
};

describe("the taxonomy list and the tagged content", () => {
  it("lists every taxonomy with its terms and shows the box", async () => {
    const { result } = await mountWith(createFakeTermPickerPort({ taxonomies: [GENRE] }));
    expect(result.current.taxonomies).toEqual([GENRE]);
    expect(result.current.hidden).toBe(false);
  });

  it("hides the box once the list is known to be empty, not while it loads", async () => {
    const port = createFakeTermPickerPort();
    const hook = renderHook(() => useTermPicker({ contentType: "recipe", contentId: "e1" }, { port, locale: "en" }), { wrapper });
    expect(hook.result.current.hidden).toBe(false);
    await waitFor(() => expect(hook.result.current.hidden).toBe(true));
  });

  it("a failed taxonomy list read is reported with its own message", async () => {
    const port = createFakeTermPickerPort({ taxonomiesError: new Error("list exploded") });
    const { result } = renderHook(() => useTermPicker({ contentType: "recipe", contentId: "e1" }, { port, locale: "en" }), { wrapper });
    await waitFor(() => expect(result.current.error).toBe("list exploded"));
    expect(result.current.hidden).toBe(false);
  });

  it("tags a post by its own content ref and names it a post", async () => {
    const port = createFakeTermPickerPort({ taxonomies: [GENRE] });
    const hook = renderHook(() => useTermPicker({ contentType: "post", contentId: "p1" }, { port, locale: "en" }), { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.subject).toBe("post");
    act(() => hook.result.current.toggle("t1"));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(port.calls).toEqual([{ kind: "assign", contentType: "post", contentId: "p1", termIds: ["t1"] }]);
  });

  it("names a page a page and a collection entry an entry", async () => {
    const page = await mountWith(createFakeTermPickerPort(), { contentType: "page", contentId: "g1" });
    expect(page.result.current.subject).toBe("page");
    const entry = await mountWith(createFakeTermPickerPort());
    expect(entry.result.current.subject).toBe("entry");
  });

  it("speaks the admin locale", async () => {
    const port = createFakeTermPickerPort();
    const hook = renderHook(() => useTermPicker({ contentType: "post", contentId: "p1" }, { port, locale: "es" }), { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.t("Save categories & tags")).toBe("Guardar categorías y etiquetas");
    act(() => hook.result.current.toggle("t1"));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(hook.result.current.message).toBe("Categorías y etiquetas guardadas.");
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
      listTaxonomies: async () => ({ items: [] }),
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

  it("reads the taxonomy list and assigned-terms, then saves through assign-terms and unassign-terms", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/assigned-terms")) return jsonResponse({ termIds: ["t1"] });
      if (init?.method === "POST") return new Response(null, { status: 204 });
      return jsonResponse({ items: [GENRE] });
    });
    const { result } = renderHook(() => useWiredTermPicker({ contentType: "post", contentId: "p1" }), { wrapper });
    await waitFor(() => expect(result.current.selected).toEqual(new Set(["t1"])));
    await waitFor(() => expect(result.current.taxonomies).toEqual([GENRE]));
    const reads = fetchMock.mock.calls.map(([url]) => String(url).replace(/^.*\/api\/admin\/v1/, ""));
    expect(reads).toEqual(expect.arrayContaining(["/taxonomy", "/taxonomy/assigned-terms?contentType=post&contentId=p1"]));

    act(() => result.current.toggle("t1"));
    act(() => result.current.toggle("t2"));
    await act(async () => {
      await result.current.save();
    });

    const writes = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
      .map(([url, init]) => [String(url).replace(/^.*\/taxonomy\//, ""), JSON.parse(String((init as RequestInit).body))]);
    expect(writes).toEqual([
      ["assign-terms", { contentType: "post", contentId: "p1", termIds: ["t2"] }],
      ["unassign-terms", { contentType: "post", contentId: "p1", termIds: ["t1"] }],
    ]);
  });
});
