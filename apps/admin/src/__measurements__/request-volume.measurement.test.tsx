import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../lib/fetch-query";

/**
 * @file TEMPORARY measurement harness — TM-TOVU-2026-08-12-A follow-up ("did lib/fetch-query
 * actually reduce request volume"). Not a regression suite; not meant to be committed. Mounts each
 * screen's REAL wired hook/component (real `api.ts` -> global `fetch`, no DI fake port) so nothing
 * bypasses the actual request seam, stubs `fetch` to record every call, and logs a table row per
 * action. Reuses the `vi.stubGlobal("fetch", ...)` + locale-bootstrap-interceptor convention
 * already established across this package's own test suite (Comments/roles/users/database/etc.).
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
  it("initial load", async () => {
    const { fn, calls } = createRecorder([{ match: "/redirects", respond: () => jsonResponse({ data: [] }) }]);
    vi.stubGlobal("fetch", fn);
    const { useWiredRedirects } = await import("../features/redirects/hooks/use-redirects.hooks");
    const { result } = renderHook(() => useWiredRedirects(), { wrapper });
    await waitFor(() => expect(result.current.redirects).not.toBeUndefined());
    logRow("redirects", "initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

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
    await waitFor(() => expect(result.current.contentTypes).not.toBeNull());
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
    const { useRoles } = await import("../features/roles/hooks/use-roles.hooks");
    const { result } = renderHook(() => useRoles(), { wrapper });
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
    const { useRoles } = await import("../features/roles/hooks/use-roles.hooks");
    const { result } = renderHook(() => useRoles(), { wrapper });
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
    const { useRoles } = await import("../features/roles/hooks/use-roles.hooks");
    const { result } = renderHook(() => useRoles(), { wrapper });
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
    const { useUsers } = await import("../features/users/hooks/use-users.hooks");
    const { result } = renderHook(() => useUsers(), { wrapper });
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
    const { useTimelineSection } = await import("../features/database/hooks/use-timeline-section.hooks");
    const { result } = renderHook(() => useTimelineSection(), { wrapper });
    await waitFor(() => expect(result.current.rows).not.toBeNull());
    logRow("database", "timeline initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("timeline: filter change", async () => {
    const { fn, calls } = createRecorder([{ match: "/database/timeline", respond: () => jsonResponse({ items: [], nextCursor: null }) }]);
    vi.stubGlobal("fetch", fn);
    const { useTimelineSection } = await import("../features/database/hooks/use-timeline-section.hooks");
    const { result } = renderHook(() => useTimelineSection(), { wrapper });
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
    const { useRestorePointsSection } = await import("../features/database/hooks/use-restore-points-section.hooks");
    const { result } = renderHook(() => useRestorePointsSection(), { wrapper });
    await waitFor(() => expect(result.current.points).not.toBeNull());
    logRow("database", "restore points initial load", calls);
    expect(calls.length).toBeGreaterThan(0);
  });
});
