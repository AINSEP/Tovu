import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../lib/fetch-query";

/**
 * @file Measurement instrument — TM-TOVU-2026-08-12-A follow-up ("did `lib/fetch-query` actually
 * reduce request volume, or just move it?"). MEASUREMENT-ONLY, NOT a correctness test — it asserts
 * request counts, so it fails on any deliberate change to invalidation topology; that's the point,
 * it's the before/after instrument for any Phase 2 change. Run with:
 * `cd apps/admin && npx vitest run src/__measurements__/request-volume.measurement.test.tsx --reporter=verbose`
 * — the `MEASURE\t...` lines in stdout are the actual data.
 *
 * Mounts each screen's REAL wired hook/component (real `api.ts` -> global `fetch`, no DI fake port)
 * so nothing bypasses the actual request seam, stubs `fetch` to record every call, and logs a table
 * row per action. Reuses the `vi.stubGlobal("fetch", ...)` + locale-bootstrap-interceptor convention
 * already established across this package's own test suite (Comments/roles/users/database/etc.).
 *
 * The "remount / re-navigation" block at the end is the one case where sharing a SINGLE
 * `FetchQueryProvider`/`QueryClient` across both "visits" is load-bearing, not incidental — two
 * independent `render`/`renderHook` calls each mint their OWN client (`FetchQueryProvider`'s
 * `useMemo(createClient, [])` runs fresh per mount), which would silently manufacture a guaranteed
 * cache miss and make "visit 2 also fetched" a foregone, meaningless conclusion. Those tests keep
 * `<FetchQueryProvider>` itself in a fixed position across `rerender()` calls (same component
 * instance, same memoized client) and only mount/unmount the SCREEN inside it — matching production,
 * where `main.tsx` mounts one `FetchQueryProvider` for the app's lifetime and the router mounts/
 * unmounts individual screens inside it.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Call = { method: string; url: string };

/** Records every call NOT matched by an explicit route. Unmatched, non-locale calls fall through to
 *  a generic 200 with every plausible list-key present as `[]` (and a couple of common singular
 *  wrappers), so a screen this test isn't focused on can still mount without crashing — but the call
 *  is still counted and logged, which is exactly the "did something unexpected fire" signal this
 *  measurement wants. */
function createRecorder(routes: Array<{ match: string; method?: string; respond: () => Response }> = []) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/settings/effective") && url.includes("namespace=core.language")) {
      return jsonResponse({ data: [] }); // useAdminLocale() bootstrap — not part of the measured action
    }
    calls.push({ method, url });
    const route = routes.find((r) => url.includes(r.match) && (!r.method || r.method === method));
    if (route) return route.respond();
    return jsonResponse({
      data: [], items: [], roles: [], policies: [], users: [], subscriptions: [], media: [], deliveries: [],
    });
  });
  return { fn, calls };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function logRow(feature: string, action: string, calls: Call[]) {
  const urls = calls.map((c) => `${c.method} ${c.url.replace(/^https?:\/\/[^/]+/, "")}`);
  // eslint-disable-next-line no-console
  console.log(`MEASURE\t${feature}\t${action}\t${calls.length}\t${JSON.stringify(urls)}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// redirects
// ---------------------------------------------------------------------------
describe("redirects", () => {
  /**
   * Explicit 15s timeout (2026-08-15 flaky-test investigation, `2026-08-15-coverage-and-tests-
   * worklist.md`): this is the FIRST test in the file, so its `await import(...)` below uniquely
   * pays for cold-transforming the whole `use-redirects.hooks` dependency graph AND every shared
   * dependency this file's later tests then reuse already-warm (jsdom env, `@testing-library/
   * react`, `lib/fetch-query`, etc.) — every later `it()` in this file imports a NEW feature's own
   * hooks but finishes in 30-400ms because the expensive shared infra is already transformed.
   * Instrumented timing on 4 successful runs: `import()` alone = 2.5s-3.8s of a ~2.6s-3.9s total;
   * `renderHook` ~26ms, `waitFor` ~53ms — the mocked fetch/render/assert path itself is not slow.
   * Measured 4 timeouts in 18 sequential whole-file runs (~22%) against the vitest.config.ts
   * default 5000ms `testTimeout`, entirely from this transform cost eating the budget before the
   * hook under test even starts — confirmed by the exact failure text ("Test timed out in 5000ms"
   * at the `it(...)` line itself, not a `waitFor`-specific message). Reproduced with NO other heavy
   * vitest process running, so generic "N concurrent agents" contention is not the full story —
   * the real cause is this test's inherently narrow margin against ordinary OS scheduling jitter
   * (background CPU load, e.g. an active browser, is enough on its own). 15s leaves ~4x headroom
   * over the worst observed successful run (4.2s) while still catching a genuine hang.
   */
  it("initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/redirects", respond: () => jsonResponse({ data: [] }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRedirects } = await import("../features/redirects/hooks/use-redirects.hooks");
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).not.toBeUndefined());
    logRow("redirects", "initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  }, 15000);

  it("create redirect (save)", async () => {
    let listCallCount = 0;
    const { fn, calls } = createRecorder([
      {
        match: "/redirects",
        respond: () => {
          listCallCount += 1;
          return jsonResponse({ data: [] });
        },
      },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRedirects } = await import("../features/redirects/hooks/use-redirects.hooks");
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).not.toBeUndefined());
    calls.length = 0;

    const form = new FormData();
    form.set("matchType", "exact");
    form.set("fromPattern", "/old");
    form.set("toTarget", "/new");
    form.set("statusCode", "301");
    act(() => {
      result.current.createRedirect(form);
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
    logRow("redirects", "create (save)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("delete (tombstone)", async () => {
    const RULE = { id: "r1", workspaceId: "w1", matchType: "exact", fromPattern: "/old", toTarget: "/new", statusCode: 301, status: "active", override: false, priority: 0, source: "manual", sourceEntryId: null, fromPathAtCapture: null, toPathAtCapture: null, createdByPrincipal: "p1", createdByPluginId: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 };
    const { fn, calls } = createRecorder([
      { match: "/redirects/r1", method: "DELETE", respond: () => jsonResponse({ data: RULE }) },
      { match: "/redirects", respond: () => jsonResponse({ data: [RULE] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRedirects } = await import("../features/redirects/hooks/use-redirects.hooks");
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).not.toBeUndefined());
    calls.length = 0;

    act(() => result.current.setPendingDelete(RULE as never));
    await act(async () => {
      await result.current.confirmDelete();
    });
    logRow("redirects", "delete", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("PREFIX-FAN-OUT PROBE: does creating a redirect refetch an already-loaded hit-count cell for a DIFFERENT row?", async () => {
    const RULE_A = { id: "rA", workspaceId: "w1", matchType: "exact", fromPattern: "/a", toTarget: "/a2", statusCode: 301, status: "active", override: false, priority: 0, source: "manual", sourceEntryId: null, fromPathAtCapture: null, toPathAtCapture: null, createdByPrincipal: "p1", createdByPluginId: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 };
    const { fn, calls } = createRecorder([
      { match: "/redirects/rA/hits", respond: () => jsonResponse({ data: { hitCount: 5 } }) },
      { match: "/redirects", method: "POST", respond: () => jsonResponse({ data: RULE_A }) },
      { match: "/redirects", respond: () => jsonResponse({ data: [RULE_A] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRedirects } = await import("../features/redirects/hooks/use-redirects.hooks");
    const { useWiredHitCountCell } = await import("../features/redirects/hooks/use-hit-count-cell.hooks");
    // Both hooks MUST share one QueryClient to measure real cross-query fan-out — two independent
    // `renderHook(..., { wrapper })` calls each mint their OWN `FetchQueryProvider`/client (`useMemo
    // (createClient, [])` runs fresh per mount), so an invalidation on one can never reach the
    // other. A real screen (Redirects.tsx + its HitCountCell children) shares exactly one client via
    // `main.tsx`'s single top-level `FetchQueryProvider` — mount both hooks under one `renderHook`
    // call to match that.
    const combined = renderHook(
      () => ({
        list: useWiredRedirects(),
        hitCell: useWiredHitCountCell({ redirectId: "rA", t: (k: string) => k }),
      }),
      { wrapper }
    );
    await waitFor(() => expect(combined.result.current.list.redirects).not.toBeUndefined());
    act(() => combined.result.current.hitCell.request());
    await waitFor(() => expect(combined.result.current.hitCell.data).not.toBeUndefined());
    calls.length = 0;

    const form = new FormData();
    form.set("matchType", "exact");
    form.set("fromPattern", "/new");
    form.set("toTarget", "/new2");
    form.set("statusCode", "301");
    act(() => {
      combined.result.current.list.createRedirect(form);
    });
    await waitFor(() => expect(combined.result.current.list.saving).toBe(false));
    // Let any triggered background refetch actually land before counting.
    await new Promise((r) => setTimeout(r, 50));

    logRow("redirects", "PREFIX PROBE: create -> did /hits/rA refetch?", calls);
    const hitsRefetched = calls.some((c) => c.url.includes("/hits"));
    // eslint-disable-next-line no-console
    console.log(`MEASURE\tredirects\tPREFIX PROBE hits refetched=${hitsRefetched}`);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// taxonomy
// ---------------------------------------------------------------------------
describe("taxonomy", () => {
  it("initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/taxonomy", respond: () => jsonResponse({ items: [] }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredTaxonomy } = await import("../features/taxonomy/hooks/use-taxonomy.hooks");
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
    logRow("taxonomy", "initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// collections
// ---------------------------------------------------------------------------
describe("collections", () => {
  it("content-types list initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/content-types", respond: () => jsonResponse({ items: [] }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredCollections } = await import("../features/collections/hooks/use-collections.hooks");
    const { result } = renderHook(() => useWiredCollections(), { wrapper });
    await waitFor(() => expect(result.current.types).not.toBeNull());
    logRow("collections", "content-types list initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("entry editor: open existing entry (detail panel)", async () => {
    const CONTENT_TYPE = { workspaceId: "w1", key: "recipe", label: "Recipe", fields: [], status: "active", version: 1 };
    const ENTRY = {
      id: "e1", workspaceId: "w1", type: "recipe", slug: "r", status: "draft", title: "T",
      bodyJson: null, fieldsJson: {}, publishedAt: null, createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z", version: 1,
    };
    const { fn, calls } = createRecorder([
      { match: "/content-types", respond: () => jsonResponse({ items: [CONTENT_TYPE] }) },
      { match: "/entries", respond: () => jsonResponse({ items: [ENTRY] }) },
      { match: "/taxonomy", respond: () => jsonResponse({ items: [] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredCollectionEntryEditor } = await import("../features/collections/hooks/use-collection-entry-editor.hooks");
    const { result } = renderHook(() => useWiredCollectionEntryEditor({ contentTypeKey: "recipe", entryId: "e1" }), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    logRow("collections", "entry editor open (detail panel)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("entry editor: save an existing entry — historical '3 extra requests' regression check", async () => {
    const CONTENT_TYPE = { workspaceId: "w1", key: "recipe", label: "Recipe", fields: [], status: "active", version: 1 };
    const ENTRY = {
      id: "e1", workspaceId: "w1", type: "recipe", slug: "r", status: "draft", title: "T",
      bodyJson: null, fieldsJson: {}, publishedAt: null, createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z", version: 1,
    };
    const { fn, calls } = createRecorder([
      { match: "/content-types", respond: () => jsonResponse({ items: [CONTENT_TYPE] }) },
      { match: "/entries/e1", method: "PATCH", respond: () => jsonResponse({ entry: { ...ENTRY, version: 2 } }) },
      { match: "/entries", respond: () => jsonResponse({ items: [ENTRY] }) },
      { match: "/taxonomy", respond: () => jsonResponse({ items: [] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredCollectionEntryEditor } = await import("../features/collections/hooks/use-collection-entry-editor.hooks");
    const { result } = renderHook(() => useWiredCollectionEntryEditor({ contentTypeKey: "recipe", entryId: "e1" }), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    calls.length = 0;

    await act(async () => {
      await result.current.save();
    });
    logRow("collections", "entry editor save (this hook in isolation)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// roles
// ---------------------------------------------------------------------------
describe("roles", () => {
  it("initial load", async () => {
    const { fn, calls } = createRecorder([
      { match: "/roles", respond: () => jsonResponse({ roles: [] }) },
      { match: "/policies", respond: () => jsonResponse({ policies: [] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRoles } = await import("../features/roles/hooks/use-roles.hooks");
    const { result } = renderHook(() => useWiredRoles(), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());
    logRow("roles", "initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("create role (save)", async () => {
    const { fn, calls } = createRecorder([
      { match: "/roles", respond: () => jsonResponse({ roles: [] }) },
      { match: "/policies", respond: () => jsonResponse({ policies: [] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRoles } = await import("../features/roles/hooks/use-roles.hooks");
    const { result } = renderHook(() => useWiredRoles(), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());
    calls.length = 0;

    act(() => result.current.setRoleName("Editor"));
    await act(async () => {
      await result.current.onCreateRole({ preventDefault: () => {} } as unknown as React.FormEvent);
    });
    logRow("roles", "create role (save)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("delete role", async () => {
    const ROLE = { id: "r1", workspaceId: "w1", name: "Editor", isBuiltin: false };
    const { fn, calls } = createRecorder([
      { match: "/roles/r1", method: "DELETE", respond: () => jsonResponse({}) },
      { match: "/roles", respond: () => jsonResponse({ roles: [ROLE] }) },
      { match: "/policies", respond: () => jsonResponse({ policies: [] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRoles } = await import("../features/roles/hooks/use-roles.hooks");
    const { result } = renderHook(() => useWiredRoles(), { wrapper });
    await waitFor(() => expect(result.current.roles).not.toBeNull());
    calls.length = 0;

    act(() => result.current.setPendingRoleDelete(ROLE as never));
    await act(async () => {
      await result.current.onDeleteRole();
    });
    logRow("roles", "delete role", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
describe("users", () => {
  it("initial load", async () => {
    const { fn, calls } = createRecorder([
      { match: "/users", respond: () => jsonResponse({ users: [] }) },
      { match: "/roles", respond: () => jsonResponse({ roles: [] }) },
      { match: "/policies", respond: () => jsonResponse({ policies: [] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredUsers } = await import("../features/users/hooks/use-users.hooks");
    const { result } = renderHook(() => useWiredUsers(), { wrapper });
    await waitFor(() => expect(result.current.users).not.toBeNull());
    logRow("users", "initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// forms
// ---------------------------------------------------------------------------
describe("forms", () => {
  it("list initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/forms", respond: () => jsonResponse({ data: [] }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredFormsList } = await import("../features/forms/hooks/use-forms-list.hooks");
    const { result } = renderHook(() => useWiredFormsList(), { wrapper });
    await waitFor(() => expect(result.current.forms).not.toBeNull());
    logRow("forms", "list initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("editor: open existing form (detail panel)", async () => {
    const FORM = { id: "f1", workspaceId: "w1", name: "Contact", slug: "contact", status: "active", fields: [], notify: { enabled: false, recipients: [] }, version: 1 };
    const { fn, calls } = createRecorder([{ match: "/forms/f1", respond: () => jsonResponse({ data: FORM }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredFormEditor } = await import("../features/forms/hooks/use-form-editor.hooks");
    const { result } = renderHook(() => useWiredFormEditor({ formId: "f1" }), { wrapper });
    await waitFor(() => expect(result.current.form).not.toBeNull());
    logRow("forms", "editor open (detail panel)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("editor: save an existing form — checks for the same KEYS.form-vs-KEYS.list shape collections had", async () => {
    const FORM = { id: "f1", workspaceId: "w1", name: "Contact", slug: "contact", status: "active", fields: [], notify: { enabled: false, recipients: [] }, version: 1 };
    const { fn, calls } = createRecorder([
      { match: "/forms/f1", method: "PATCH", respond: () => jsonResponse({ data: { ...FORM, version: 2 } }) },
      { match: "/forms/f1", respond: () => jsonResponse({ data: FORM }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredFormEditor } = await import("../features/forms/hooks/use-form-editor.hooks");
    const { result } = renderHook(() => useWiredFormEditor({ formId: "f1" }), { wrapper });
    await waitFor(() => expect(result.current.form).not.toBeNull());
    calls.length = 0;

    act(() => result.current.setName("Contact Us"));
    await act(async () => {
      result.current.handleSave();
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
    logRow("forms", "editor save (this hook in isolation)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// media (full screen — list + detail panel share one mount, matching production)
// ---------------------------------------------------------------------------
describe("media", () => {
  const ITEM = {
    id: "m1", workspaceId: "w1", title: "Old title", alt: "old alt", caption: "", credit: "",
    sha256: "sha1", status: "active", createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z", version: 1, width: null, height: null, cssClass: null,
  };

  it("initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/media", respond: () => jsonResponse({ media: [ITEM] }) }]);
    vi.stubGlobal("fetch", fn);
    const { Media } = await import("../features/media/Media");
    render(
      <FetchQueryProvider>
        <Media />
      </FetchQueryProvider>
    );
    await screen.findByText("Old title");
    logRow("media", "initial load (full screen)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("edit metadata save, list mounted alongside (production shape)", async () => {
    const { fn, calls } = createRecorder([
      { match: `/media/${ITEM.id}`, method: "PATCH", respond: () => jsonResponse({ media: { ...ITEM, title: "New title" } }) },
      { match: "/media", respond: () => jsonResponse({ media: [ITEM] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { Media } = await import("../features/media/Media");
    const user = (await import("@testing-library/user-event")).default.setup();
    render(
      <FetchQueryProvider>
        <Media />
      </FetchQueryProvider>
    );
    await screen.findByText("Old title");
    calls.length = 0;

    await user.click(screen.getByRole("button", { name: /actions for "old title"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));
    const titleInput = await screen.findByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "New title");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));

    logRow("media", "edit metadata save (list mounted alongside, production shape)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// integrations
// ---------------------------------------------------------------------------
describe("integrations", () => {
  it("initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/subscriptions", respond: () => jsonResponse({ subscriptions: [] }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredIntegrations } = await import("../features/integrations/hooks/use-integrations.hooks");
    const { result } = renderHook(() => useWiredIntegrations(), { wrapper });
    await waitFor(() => expect(result.current.subscriptions).not.toBeNull());
    logRow("integrations", "initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("create subscription (save)", async () => {
    const { fn, calls } = createRecorder([
      { match: "/subscriptions", method: "POST", respond: () => jsonResponse({ subscription: { id: "s1" } }) },
      { match: "/subscriptions", respond: () => jsonResponse({ subscriptions: [] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredIntegrations } = await import("../features/integrations/hooks/use-integrations.hooks");
    const { result } = renderHook(() => useWiredIntegrations(), { wrapper });
    await waitFor(() => expect(result.current.subscriptions).not.toBeNull());
    calls.length = 0;

    act(() => {
      result.current.setLabel("My hook");
      result.current.setTargetUrl("https://example.com/hook");
    });
    await act(async () => {
      await result.current.onCreate({ preventDefault: () => {} } as unknown as React.FormEvent);
    });
    logRow("integrations", "create subscription (save)", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// database
// ---------------------------------------------------------------------------
describe("database", () => {
  it("timeline: initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/database/timeline", respond: () => jsonResponse({ items: [], nextCursor: null }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredTimelineSection } = await import("../features/database/hooks/use-timeline-section.hooks");
    const { result } = renderHook(() => useWiredTimelineSection(), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeNull());
    logRow("database", "timeline initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("timeline: filter change", async () => {
    const { fn, calls } = createRecorder([{ match: "/database/timeline", respond: () => jsonResponse({ items: [], nextCursor: null }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredTimelineSection } = await import("../features/database/hooks/use-timeline-section.hooks");
    const { result } = renderHook(() => useWiredTimelineSection(), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeNull());
    calls.length = 0;

    act(() => result.current.setKind("core.migration"));
    act(() => {
      result.current.applyFilters({ preventDefault: () => {} } as unknown as React.FormEvent);
    });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    logRow("database", "timeline filter change", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("restore points: initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/database/restore-points", respond: () => jsonResponse({ items: [] }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRestorePointsSection } = await import("../features/database/hooks/use-restore-points-section.hooks");
    const { result } = renderHook(() => useWiredRestorePointsSection(), { wrapper });
    await waitFor(() => expect(result.current.points).not.toBeNull());
    logRow("database", "restore points initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// remount / re-navigation — staleTime:0's actual cost, per Coordinator's ask.
// `<FetchQueryProvider>` stays mounted (same component instance, same memoized QueryClient) across
// every `rerender()` below — only the SCREEN inside it mounts/unmounts, matching `main.tsx` (one
// provider for the app's lifetime) + the router (screens mount/unmount on navigation). Elapsed time
// inside these tests is milliseconds, far under TanStack's default `gcTime` (5 min), so a refetch
// observed here is a `staleTime` decision, not a `gcTime` eviction — noted per test.
// ---------------------------------------------------------------------------
describe("remount / re-navigation — same QueryClient shared across visits", () => {
  it("redirects: navigate away (unmount the whole screen) and back (remount) — does visit 2 refetch?", async () => {
    const { fn, calls } = createRecorder([{ match: "/redirects", respond: () => jsonResponse({ data: [] }) }]);
    vi.stubGlobal("fetch", fn);
    const { Redirects } = await import("../features/redirects/Redirects");

    const { rerender } = render(
      <FetchQueryProvider>
        <Redirects />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.queryByText(/loading redirects/i)).not.toBeInTheDocument());
    const visit1 = calls.length;
    calls.length = 0;

    // "Navigate away": unmount the screen but keep the provider (and its QueryClient) alive.
    rerender(<FetchQueryProvider>{null}</FetchQueryProvider>);
    // "Navigate back": remount the SAME screen under the SAME provider/client.
    rerender(
      <FetchQueryProvider>
        <Redirects />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.queryByText(/loading redirects/i)).not.toBeInTheDocument());
    const visit2 = calls.length;

    logRow("redirects", `remount visit 1=${visit1} requests`, []);
    logRow("redirects", `remount visit 2 (same client, cache entry ${visit2 > 0 ? "NOT " : ""}reused)`, calls);
    // eslint-disable-next-line no-console
    console.log(`MEASURE\tredirects\tremount cost: visit2Requests=${visit2} (gcTime not a factor — elapsed time is ms)`);
    expect(visit1).toBeGreaterThan(0);
    // Owner decision (TM-TOVU-2026-08-12-A, `adapter.tanstack.tsx`'s `staleTime: 0 -> 10_000`
    // default change): under the OLD `staleTime: 0` default this was 1 — a remount refetched at
    // full cost, identical to a first visit (see this same file's git history for the pre-change
    // number). Now 0: the cache entry survives the remount and is still fresh, so nothing refetches.
    // This assertion IS the regression guard for that change — if it goes back to 1, `staleTime`
    // regressed to `0` (or something is forcing a refetch some other way) and that is worth knowing.
    expect(visit2).toBe(0);
  });

  it("collections entry editor: open a detail panel, close it, reopen the SAME record — does the reopen refetch?", async () => {
    const CONTENT_TYPE = { workspaceId: "w1", key: "recipe", label: "Recipe", fields: [], status: "active", version: 1 };
    const ENTRY = {
      id: "e1", workspaceId: "w1", type: "recipe", slug: "r", status: "draft", title: "T",
      bodyJson: null, fieldsJson: {}, publishedAt: null, createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z", version: 1,
    };
    const { fn, calls } = createRecorder([
      { match: "/content-types", respond: () => jsonResponse({ items: [CONTENT_TYPE] }) },
      { match: "/entries", respond: () => jsonResponse({ items: [ENTRY] }) },
      { match: "/taxonomy", respond: () => jsonResponse({ items: [] }) },
    ]);
    vi.stubGlobal("fetch", fn);
    const { useWiredCollectionEntryEditor } = await import("../features/collections/hooks/use-collection-entry-editor.hooks");

    function Panel({ open }: { open: boolean }) {
      const editor = open ? useWiredCollectionEntryEditor({ contentTypeKey: "recipe", entryId: "e1" }) : null;
      return <div data-testid="loaded">{editor?.loaded ? "yes" : "no"}</div>;
    }

    const { rerender } = render(
      <FetchQueryProvider>
        <Panel open={true} />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("yes"));
    const visit1 = calls.length;
    calls.length = 0;

    // Close the panel (unmount its query), then reopen the SAME record under the SAME provider.
    rerender(
      <FetchQueryProvider>
        <Panel open={false} />
      </FetchQueryProvider>
    );
    rerender(
      <FetchQueryProvider>
        <Panel open={true} />
      </FetchQueryProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("yes"));
    const visit2 = calls.length;

    logRow("collections", `entry editor reopen visit 1=${visit1} requests`, []);
    logRow("collections", "entry editor reopen visit 2 (same record, same client)", calls);
    // eslint-disable-next-line no-console
    console.log(`MEASURE\tcollections\tdetail-panel reopen cost: visit2Requests=${visit2}`);
    expect(visit1).toBeGreaterThan(0);
    // Owner decision (TM-TOVU-2026-08-12-A, `adapter.tanstack.tsx`'s `staleTime: 0 -> 10_000`
    // default change): under the OLD `staleTime: 0` default this was 3 — reopening the SAME record
    // refetched all 3 of the combined load's requests again, identical to a first open (see this
    // same file's git history for the pre-change number). Now 0: the cache entry survives the
    // close/reopen and is still fresh. Same regression-guard reasoning as the redirects remount test
    // above — if this goes back to 3, `staleTime` regressed or something else is forcing a refetch.
    expect(visit2).toBe(0);
  });

  it("media: close the edit-metadata panel and reopen the SAME item — control case, no query of its own", async () => {
    const ITEM = {
      id: "m1", workspaceId: "w1", title: "T", alt: "", caption: "", credit: "", sha256: "s",
      status: "active", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
      version: 1, width: null, height: null, cssClass: null,
    };
    const { fn, calls } = createRecorder([{ match: "/media", respond: () => jsonResponse({ media: [ITEM] }) }]);
    vi.stubGlobal("fetch", fn);
    const { Media } = await import("../features/media/Media");
    const user = (await import("@testing-library/user-event")).default.setup();
    render(
      <FetchQueryProvider>
        <Media />
      </FetchQueryProvider>
    );
    await screen.findByText("T");
    calls.length = 0;

    await user.click(screen.getByRole("button", { name: /actions for "t"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));
    await screen.findByLabelText("Title");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /actions for "t"/i }));
    await user.click(screen.getByRole("menuitem", { name: /edit metadata/i }));
    await screen.findByLabelText("Title");

    logRow("media", "edit panel close+reopen SAME item — no independent query, expect 0", calls);
    console.log(`MEASURE\tmedia\tdetail-panel reopen cost: ${calls.length} (EditMediaPanel has no useFetchQuery of its own — item arrives as a prop already resolved from the cached list)`);
    expect(calls.length).toBe(0);
  });
});
