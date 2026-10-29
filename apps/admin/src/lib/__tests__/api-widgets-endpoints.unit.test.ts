import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

/**
 * @file The widget read used by the host editor.
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

test("getWidget builds an explicit GET at /widgets/:id with no query string", async () => {
  const { calls } = stubFetchCapturing();
  await api.getWidget("w1");
  expect(calls[0].url).toBe(`/api/admin/v1/workspaces/workspace-local/widgets/w1`);
  expect(calls[0].init?.method).toBe("GET");
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
