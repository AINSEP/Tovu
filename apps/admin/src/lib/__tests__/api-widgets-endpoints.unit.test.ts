import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

/**
 * @file Coverage-gap-fill pass (2026-09-05) for `api.ts`'s Widgets-resource endpoint wrappers
 * (`/workspaces/${WORKSPACE_ID}/widgets...` paths) that had no test at all before this file:
 * `getWidget`, `listWidgetRegions`, `bindWidgetRegion`, `getWidgetRegion`,
 * `widgetsToolPlace`, `widgetsToolCreate`. `listWidgets`, `createWidget`, `updateWidget`,
 * and `mutateWidgetRegionPlacements` already had real fetch-stubbed tests in
 * `api-endpoint-option-branches.unit.test.ts` — not duplicated here. (`trashWidget`/`purgeWidget`,
 * the widget-specific hard-delete pair, were removed with the Trash rewrite, T8c 2026-09-21 — see
 * `api.trash`.) `insertWidgetEmbed` /
 * `removeWidgetEmbed` hit `/entries/${id}/widget-embeds`, not a `/widgets/...` path, so they are
 * out of this file's scope (a sibling resource's endpoints).
 *
 * Every test asserts the ACTUAL `fetch` call's URL/method/body — never a trivially-true assertion
 * — so a future edit that breaks the request shape fails these tests, not just a coverage number.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Captures every `fetch` call's URL and `RequestInit` so tests can assert on the exact request
 *  shape a branch produces, rather than only on the resolved value. Mirrors the identically-named
 *  helper in `api-endpoint-option-branches.unit.test.ts`. */
function stubFetchCapturing(): { calls: Array<{ url: string; init?: RequestInit }>; body(n?: number): unknown } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({});
    })
  );
  return {
    calls,
    body(n = 0) {
      const raw = calls[n]?.init?.body;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    },
  };
}

// --- Widgets -----------------------------------------------------------------

test("getWidget builds a bare GET at /widgets/:id — no query string, no method override", async () => {
  const { calls } = stubFetchCapturing();
  await api.getWidget("w1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets/w1`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("getWidget resolves the widget/whereUsed envelope verbatim", async () => {
  const widget = {
    id: "w1",
    workspaceId: "workspace-local",
    slug: "my-widget",
    title: "My widget",
    status: "active",
    widgetType: "text",
    config: {},
    updatedAt: "2026-09-05T00:00:00.000Z",
    version: 1,
  };
  const whereUsed = { count: 0, references: [] };
  vi.stubGlobal("fetch", vi.fn(async () => okJson({ widget, whereUsed })));
  await expect(api.getWidget("w1")).resolves.toEqual({ widget, whereUsed });
});

test("listWidgetRegions is a bare GET at /widgets/regions", async () => {
  const { calls } = stubFetchCapturing();
  await api.listWidgetRegions();
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets/regions`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("bindWidgetRegion POSTs { regionKey } to /widgets/regions", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.bindWidgetRegion("sidebar");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets/regions`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ regionKey: "sidebar" });
});

test("getWidgetRegion is a bare GET at /widgets/regions/:regionKey", async () => {
  const { calls } = stubFetchCapturing();
  await api.getWidgetRegion("sidebar");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets/regions/sidebar`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("widgetsToolPlace POSTs the input verbatim as the body to /widgets/tools/place", async () => {
  const { calls, body } = stubFetchCapturing();
  const input = { widgetInstanceId: "w1", target: { regionKey: "sidebar" } };
  await api.widgetsToolPlace(input);
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets/tools/place`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual(input);
});

test("updateWidget forwards an edited title in the PUT body", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.updateWidget({ id: "w1", baseVersion: 2, title: "Autumn Hero", config: { body: "edited" } });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets/w1`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ baseVersion: 2, config: { body: "edited" }, title: "Autumn Hero" });
});

test("updateWidget omits title from the body entirely when the caller doesn't pass one", async () => {
  const { body } = stubFetchCapturing();
  await api.updateWidget({ id: "w1", baseVersion: 2, config: { body: "edited" } });
  const sent = body() as Record<string, unknown>;
  expect(Object.prototype.hasOwnProperty.call(sent, "title")).toBe(false);
  expect(sent).toEqual({ baseVersion: 2, config: { body: "edited" } });
});

test("widgetsToolCreate POSTs the input verbatim as the body to /widgets/tools/create", async () => {
  const { calls, body } = stubFetchCapturing();
  const input = {
    widgetType: "text" as const,
    title: "My widget",
    config: { text: "hello" },
    target: { regionKey: "sidebar" },
  };
  await api.widgetsToolCreate(input);
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets/tools/create`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual(input);
});
