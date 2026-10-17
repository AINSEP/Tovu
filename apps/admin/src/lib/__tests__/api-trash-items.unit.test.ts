import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

/**
 * @file `api.trash` — the generic single-item Trash endpoint (`POST /trash/items`, 2026-09-21) every
 * OTHER admin feature's delete button (forms, widgets, menus, terms, taxonomies) moves a row through,
 * instead of each domain keeping its own bespoke delete call. Same `stubFetchCapturing` convention as
 * `api-long-tail-endpoints.unit.test.ts`: assert the ACTUAL `fetch` call's URL/method/body.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function stubFetchCapturing(): { calls: Array<{ url: string; init?: RequestInit }>; body(n?: number): unknown } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({ ok: true, version: 3 });
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

test("trash POSTs { type, id } to /trash/items", async () => {
  const { calls, body } = stubFetchCapturing();
  const result = await api.trash({ type: "form", id: "f1" });
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/trash/items`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ type: "form", id: "f1" });
  expect(result).toEqual({ ok: true, version: 3 });
});

test("trash sends the exact type string for every registry kind, unmodified", async () => {
  const { calls, body } = stubFetchCapturing();
  for (const type of ["widget", "menu", "term", "taxonomy", "form_submission"]) {
    await api.trash({ type, id: "x" });
  }
  expect(calls.map((_, i) => body(i))).toEqual([
    { type: "widget", id: "x" },
    { type: "menu", id: "x" },
    { type: "term", id: "x" },
    { type: "taxonomy", id: "x" },
    { type: "form_submission", id: "x" },
  ]);
  expect(body(0)).toEqual({ type: "widget", id: "x" });
  expect(body(4)).toEqual({ type: "form_submission", id: "x" });
});

test.each([undefined, {}, { cursor: "", limit: 0, entityTypes: [] }])(
  "listTrash omits empty filters (%j)", async (options) => {
    const { calls } = stubFetchCapturing();
    await api.listTrash(options);
    expect(calls[0].url).toBe("/api/admin/v1/workspaces/workspace-local/trash");
    expect(calls[0].init?.method).toBe("GET");
  },
);

test("listTrash encodes the cursor, limit and comma-separated entity types", async () => {
  const { calls } = stubFetchCapturing();
  await api.listTrash({ cursor: "next/+?", limit: 25, entityTypes: ["post", "menu"] });
  expect(calls[0].url).toBe("/api/admin/v1/workspaces/workspace-local/trash?cursor=next%2F%2B%3F&limit=25&entityTypes=post%2Cmenu");
});

test("restore names entities by kind and id while purge sends only trash row ids", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.restoreTrashItems({ items: [{ entityType: "post", entityId: "post-1" }] });
  await api.purgeTrashItems({ ids: ["trash-1"] });
  expect(calls.map(({ url, init }) => [url, init?.method])).toEqual([
    ["/api/admin/v1/workspaces/workspace-local/trash/restore", "POST"],
    ["/api/admin/v1/workspaces/workspace-local/trash/purge", "POST"],
  ]);
  expect(body(0)).toEqual({ items: [{ entityType: "post", entityId: "post-1" }] });
  expect(body(1)).toEqual({ ids: ["trash-1"] });
});
