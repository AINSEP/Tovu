import { afterEach, describe, expect, it, vi } from "vitest";

import { createToolCatalogComposerCapabilitySource } from "../tool-catalog-composer-source";

/**
 * @file Regression coverage for this dispatch's tool-catalog `ComposerCapabilitySource` — the
 * browser-side consumer of the new `GET /api/tools/search` proxy (`server/modules/assistant.ts`).
 * `fetch` is injected via `vi.stubGlobal` rather than hitting a real server, so these assert the
 * source's own mapping/degradation contract in isolation; the real proxy route is certified end to
 * end in `src/server/__tests__/assistant-proxy-routes.test.ts`, and the graceful-degradation
 * property this file asserts directly is also what keeps `AssistantDock.unit.test.tsx`'s bundled-
 * catalog tests passing against a genuinely unreachable daemon in the jsdom test environment (no
 * server listens on the pinned test origin), which is live proof this isn't merely asserted in
 * isolation but actually holds end to end.
 */

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createToolCatalogComposerCapabilitySource", () => {
  it("maps real hits into browse-only capabilities with no resolve — enumeration, never execution", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        hits: [
          { id: "content_post_search", description: "Finds posts and pages by relevance.", source: "content", score: 4.2 },
          { id: "forms_create_definition", description: "Creates a form definition.", source: "forms", score: 3.1 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const capabilities = await createToolCatalogComposerCapabilitySource().list();

    expect(capabilities).toHaveLength(2);
    expect(capabilities[0]).toEqual({
      groupId: "tool-catalog",
      groupLabel: "Tool catalog",
      item: {
        id: "tool-catalog:content_post_search",
        label: "content_post_search",
        description: "Finds posts and pages by relevance.",
        kind: "registered-tool",
        keywords: ["content"],
        insertText: "content_post_search",
      },
    });
    expect(capabilities.every((capability) => capability.resolve === undefined)).toBe(true);

    // The proxy path this source actually calls, with the endpoint's own result ceiling requested.
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toMatch(/^\/api\/tools\/search\?q=.+&limit=25$/);
  });

  it("degrades to an empty list on a non-2xx response, rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, { ok: false, status: 503 })));

    await expect(createToolCatalogComposerCapabilitySource().list()).resolves.toEqual([]);
  });

  it("degrades to an empty list on a network failure (e.g. the daemon is unreachable), rather than rejecting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    // The load-bearing assertion: this must RESOLVE, not reject — projectComposerCapabilities runs
    // every source through one Promise.all, so a rejection here would take the bundled catalog
    // down with it (see this source's own module doc).
    await expect(createToolCatalogComposerCapabilitySource().list()).resolves.toEqual([]);
  });

  it("degrades to an empty list on a malformed body — no 'hits' array — rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ notHits: [] })));

    await expect(createToolCatalogComposerCapabilitySource().list()).resolves.toEqual([]);
  });

  it("filters out a malformed individual hit rather than letting it corrupt the whole batch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          hits: [
            { id: "content_post_search", description: "Finds posts and pages by relevance.", source: "content", score: 4.2 },
            { id: 42, description: "not a string id", source: "content", score: 1 },
            { description: "missing an id entirely", source: "content", score: 1 },
          ],
        }),
      ),
    );

    const capabilities = await createToolCatalogComposerCapabilitySource().list();

    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]?.item.id).toBe("tool-catalog:content_post_search");
  });
});
