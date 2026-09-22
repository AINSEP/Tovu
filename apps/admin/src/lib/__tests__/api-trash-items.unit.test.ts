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
  const { body } = stubFetchCapturing();
  for (const type of ["widget", "menu", "term", "taxonomy", "form_submission"]) {
    await api.trash({ type, id: "x" });
  }
  expect(body(0)).toEqual({ type: "widget", id: "x" });
  expect(body(4)).toEqual({ type: "form_submission", id: "x" });
});
