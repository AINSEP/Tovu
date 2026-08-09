import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminContentType, AdminEntry, AdminTaxonomyWithTerms } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { useCollectionEntryEditor } from "../hooks/use-collection-entry-editor.hooks";

/**
 * @file `useCollectionEntryEditor` — the collection entry editor's load + save + lifecycle-toggle
 * state, so `CollectionEntryEditor.tsx` is only markup. Follows the fetch-mocking harness
 * `use-migrate-forward-section.unit.test.ts`/`Comments.unit.test.tsx` established for this
 * package. `editor` is a real Tiptap instance (`useEditor({ extensions: [StarterKit,
 * WidgetEmbed] })`) — the same setup `CollectionEntryEditor.unit.test.tsx` already mounts
 * successfully in jsdom, so `editor.getJSON()` is exercised for real rather than stubbed.
 */

vi.mock("../../../lib/router", () => ({ navigate: vi.fn() }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const RECIPE_TYPE: AdminContentType = {
  workspaceId: "w1",
  key: "recipe",
  label: "Recipe",
  fields: [],
  status: "active",
  version: 1,
};

const ENTRY: AdminEntry = {
  id: "e1",
  workspaceId: "w1",
  type: "recipe",
  slug: "my-recipe",
  status: "draft",
  title: "My Recipe",
  bodyJson: null,
  fieldsJson: { ext: { site: { notes: "hello" } } },
  publishedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 2,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useCollectionEntryEditor` now also calls `useAdminLocale()` (real `fetch`, not this hook's
  // own concern), which would otherwise consume one of this file's strictly-ordered
  // `mockResolvedValueOnce` slots and shift every later assertion by one call. Routed to a fixed
  // default-locale response outside `fetchMock`'s own call queue — same interceptor pattern
  // `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
  vi.mocked(navigate).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Queues the load's three Promise.all responses in the order the hook awaits them:
 *  listContentTypes, (listEntries — only when entryId is set), listTaxonomies. */
function queueLoad(opts: {
  types?: AdminContentType[];
  entries?: AdminEntry[];
  taxonomies?: AdminTaxonomyWithTerms[];
  entryId: string | null;
  typesStatus?: number;
}) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: opts.types ?? [RECIPE_TYPE] }, opts.typesStatus ?? 200));
  if (opts.entryId) {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: opts.entries ?? [] }));
  }
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: opts.taxonomies ?? [] }));
}

async function mountLoaded(opts: Parameters<typeof queueLoad>[0]) {
  queueLoad(opts);
  const view = renderHook(() => useCollectionEntryEditor({ contentTypeKey: "recipe", entryId: opts.entryId }));
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

describe("initial load — new entry (entryId null)", () => {
  it("resolves contentType from the matching key, taxonomies from listTaxonomies, and does NOT call listEntries", async () => {
    const { result } = await mountLoaded({ entryId: null, taxonomies: [] });
    expect(result.current.contentType).toEqual(RECIPE_TYPE);
    expect(result.current.entry).toBeNull();
    // Only 2 fetch calls: listContentTypes + listTaxonomies — no listEntries call for a new entry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("starts contentType as undefined (the not-yet-resolved sentinel) before the load settles", () => {
    queueLoad({ entryId: null });
    const { result } = renderHook(() => useCollectionEntryEditor({ contentTypeKey: "recipe", entryId: null }));
    expect(result.current.contentType).toBeUndefined();
    expect(result.current.loaded).toBe(false);
  });

  it("resolves contentType to null when no content type matches the key", async () => {
    const { result } = await mountLoaded({ entryId: null, types: [{ ...RECIPE_TYPE, key: "other" }] });
    expect(result.current.contentType).toBeNull();
  });

  it("resets title/slug/extFields to blank for a new entry", async () => {
    const { result } = await mountLoaded({ entryId: null });
    expect(result.current.title).toBe("");
    expect(result.current.slug).toBe("");
    expect(result.current.extFields).toEqual({});
  });
});

describe("initial load — editing (entryId set)", () => {
  it("finds the matching entry, seeds title/slug/extFields from it", async () => {
    const { result } = await mountLoaded({ entryId: "e1", entries: [ENTRY] });
    expect(result.current.entry).toEqual(ENTRY);
    expect(result.current.title).toBe("My Recipe");
    expect(result.current.slug).toBe("my-recipe");
    expect(result.current.extFields).toEqual({ notes: "hello" });
  });

  it("seeds an empty extFields object when the entry's fieldsJson has no ext.site", async () => {
    const { result } = await mountLoaded({ entryId: "e1", entries: [{ ...ENTRY, fieldsJson: {} }] });
    expect(result.current.extFields).toEqual({});
  });

  it("sets entry to null when entryId matches nothing in the loaded list", async () => {
    const { result } = await mountLoaded({ entryId: "e404", entries: [ENTRY] });
    expect(result.current.entry).toBeNull();
  });
});

describe("initial load — failure", () => {
  it("sets the fallback loadError when listContentTypes fails, and still sets loaded=true", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] })); // listTaxonomies
    const { result } = renderHook(() => useCollectionEntryEditor({ contentTypeKey: "recipe", entryId: null }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.loadError).toBe("failed to load entry");
  });

  it("tolerates a failing listTaxonomies call — falls back to an empty taxonomies list, no loadError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [RECIPE_TYPE] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500)); // listTaxonomies fails
    const { result } = renderHook(() => useCollectionEntryEditor({ contentTypeKey: "recipe", entryId: null }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.taxonomies).toEqual([]);
    expect(result.current.loadError).toBeNull();
    expect(result.current.contentType).toEqual(RECIPE_TYPE);
  });
});

describe("save — new entry", () => {
  it("is a no-op (no fetch call) when contentType hasn't resolved yet", async () => {
    fetchMock.mockResolvedValueOnce(new Promise(() => {})); // listContentTypes never resolves
    const { result } = renderHook(() => useCollectionEntryEditor({ contentTypeKey: "recipe", entryId: null }));
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.save();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("is a no-op when contentType resolved to null (unknown type)", async () => {
    const { result } = await mountLoaded({ entryId: null, types: [{ ...RECIPE_TYPE, key: "other" }] });
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.save();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("POSTs { type, slug (trimmed), title } + { fieldsJson: { ext: { site: extFields } }, bodyJson }, sets entry + message, and navigates to the new entry", async () => {
    const view = await mountLoaded({ entryId: null });
    act(() => view.result.current.setTitle("New Recipe"));
    act(() => view.result.current.setSlug("  new-recipe  "));

    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: { ...ENTRY, id: "e9", version: 1 } }));
    await act(async () => {
      await view.result.current.save();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/entries");
    expect((call[1] as RequestInit).method).toBe("POST");
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.type).toBe("recipe");
    expect(body.slug).toBe("new-recipe");
    expect(body.title).toBe("New Recipe");
    expect(body.fieldsJson).toEqual({ ext: { site: {} } });
    expect(body.bodyJson).toBeDefined();

    expect(view.result.current.entry).toEqual({ ...ENTRY, id: "e9", version: 1 });
    expect(view.result.current.message).toBe("Created · version 1");
    expect(navigate).toHaveBeenCalledWith("/collections/recipe/e9");
  });

  it("sets saving=true during the request, false after", async () => {
    const view = await mountLoaded({ entryId: null });
    let resolveCreate: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveCreate = resolve)));

    let promise!: Promise<void>;
    act(() => {
      promise = view.result.current.save();
    });
    expect(view.result.current.saving).toBe(true);

    await act(async () => {
      resolveCreate?.(jsonResponse({ entry: ENTRY }));
      await promise;
    });
    expect(view.result.current.saving).toBe(false);
  });

  it("on failure, sets the fallback error and does not navigate", async () => {
    const view = await mountLoaded({ entryId: null });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await view.result.current.save();
    });
    expect(view.result.current.error).toBe("save failed");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clears a prior message/error when re-invoked", async () => {
    const view = await mountLoaded({ entryId: null });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await view.result.current.save();
    });
    expect(view.result.current.error).not.toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: ENTRY }));
    await act(async () => {
      await view.result.current.save();
    });
    expect(view.result.current.error).toBeNull();
  });
});

describe("save — existing entry", () => {
  it("PUTs { expectedVersion, title, fieldsJson, bodyJson } to /entries/{id}, sets entry + message, and does NOT navigate", async () => {
    const view = await mountLoaded({ entryId: "e1", entries: [ENTRY] });
    act(() => view.result.current.setTitle("Updated Title"));

    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: { ...ENTRY, title: "Updated Title", version: 3 } }));
    await act(async () => {
      await view.result.current.save();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/entries/e1");
    expect((call[1] as RequestInit).method).toBe("PUT");
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.expectedVersion).toBe(2);
    expect(body.title).toBe("Updated Title");
    expect(body.bodyJson).toBeDefined();

    expect(view.result.current.entry?.version).toBe(3);
    expect(view.result.current.message).toBe("Saved · version 3");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("sends the CURRENT extFields (not the entry's original fieldsJson) as fieldsJson.ext.site", async () => {
    const view = await mountLoaded({ entryId: "e1", entries: [ENTRY] });
    act(() => view.result.current.setExtFields({ notes: "edited" }));

    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: ENTRY }));
    await act(async () => {
      await view.result.current.save();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.fieldsJson).toEqual({ ext: { site: { notes: "edited" } } });
  });

  it("on failure, sets the fallback error", async () => {
    const view = await mountLoaded({ entryId: "e1", entries: [ENTRY] });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 409));
    await act(async () => {
      await view.result.current.save();
    });
    expect(view.result.current.error).toBe("save failed");
  });
});

describe("toggleLifecycle", () => {
  it("is a no-op (no fetch call) when there is no entry yet", async () => {
    const view = await mountLoaded({ entryId: null });
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await view.result.current.toggleLifecycle("publish");
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("POSTs { op, expectedVersion } to /entries/{id}/lifecycle and sets entry + op-specific message", async () => {
    const view = await mountLoaded({ entryId: "e1", entries: [ENTRY] });
    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: { ...ENTRY, status: "published", version: 3 } }));

    await act(async () => {
      await view.result.current.toggleLifecycle("publish");
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/entries/e1/lifecycle");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ op: "publish", expectedVersion: 2 });
    expect(view.result.current.entry?.status).toBe("published");
    expect(view.result.current.message).toBe("Entry published · version 3");
  });

  it("uses the 'unpublish' verb in its message for the unpublish op", async () => {
    const published = { ...ENTRY, status: "published" as const };
    const view = await mountLoaded({ entryId: "e1", entries: [published] });
    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: { ...published, status: "unpublished", version: 3 } }));

    await act(async () => {
      await view.result.current.toggleLifecycle("unpublish");
    });

    expect(view.result.current.message).toBe("Entry unpublished · version 3");
  });

  it("on failure, sets an op-specific fallback error", async () => {
    const view = await mountLoaded({ entryId: "e1", entries: [ENTRY] });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    await act(async () => {
      await view.result.current.toggleLifecycle("publish");
    });

    expect(view.result.current.error).toBe("Failed to publish entry");
  });

  it("clears a prior message/error when re-invoked", async () => {
    const view = await mountLoaded({ entryId: "e1", entries: [ENTRY] });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await view.result.current.toggleLifecycle("publish");
    });
    expect(view.result.current.error).not.toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: { ...ENTRY, status: "published", version: 3 } }));
    await act(async () => {
      await view.result.current.toggleLifecycle("publish");
    });
    expect(view.result.current.error).toBeNull();
  });
});
