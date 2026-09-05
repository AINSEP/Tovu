import { afterEach, expect, test, vi } from "vitest";

import { api, onUnauthenticated } from "../api";

/**
 * @file Coverage-gap-fill pass (2026-09-05, `fix-apienc` dispatch TASK 2) closing the remaining gap
 * from `ADS-memory/reports/2026-09-05-api-ts-coverage-measurement.md` (commit `b95299ea`) — of that
 * report's 10 named unhit `api.*` methods, `disableMember` and `getMenu` were incidentally covered
 * by the id-encoding sweep this dispatch's Task 1 added (`api-id-url-encoding.unit.test.ts`); the
 * other 8 (`listPages`, `createPage`, `listMembers`, `listMenus`, `getWorkspace`, `updateWorkspace`,
 * `listTaxonomies`, `listPlugins`) get real, `fetch`-stubbed coverage here — never a `vi.mock`/
 * `vi.spyOn` of the `api` module, which is exactly the mistake the report warned produced the
 * original gap (several of these methods already appear in feature/hook tests that mock the `api`
 * module wholesale, giving `api.ts` itself zero credit).
 *
 * Also closes the report's `onUnauthenticated` + its unsubscribe closure (both fully unhit) and
 * `notifyIfUnauthenticated`'s true-condition body (no in-scope test drove a real 401 carrying
 * `code: "UNAUTHENTICATED"` through `request()`) — three findings from the same report, grouped here
 * because they are one mechanism: `request()` calling `notifyIfUnauthenticated` on every non-2xx,
 * which only ever does something observable once a listener is registered via `onUnauthenticated`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetchCapturing(respond: () => Response = () => jsonResponse({})): {
  calls: Array<{ url: string; init?: RequestInit }>;
  method(n?: number): string;
  body(n?: number): unknown;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return respond();
    })
  );
  return {
    calls,
    method(n = 0) {
      return calls[n]?.init?.method ?? "GET";
    },
    body(n = 0) {
      const raw = calls[n]?.init?.body;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    },
  };
}

const BASE_WORKSPACE = "/api/admin/v1/workspaces/workspace-local";

// --- The 8 remaining unhit methods ------------------------------------------

test("listPages GETs the workspace pages collection and resolves the parsed envelope", async () => {
  const { calls, method } = stubFetchCapturing(() =>
    jsonResponse({ posts: [{ post: { id: "pg1", kind: "page" } }] })
  );
  await expect(api.listPages()).resolves.toEqual({ posts: [{ post: { id: "pg1", kind: "page" } }] });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/pages`);
  expect(method()).toBe("GET");
});

test("createPage POSTs { title } and resolves the created page", async () => {
  const { body, method, calls } = stubFetchCapturing(() =>
    jsonResponse({ post: { id: "pg1", title: "Hello", kind: "page" } })
  );
  await expect(api.createPage("Hello")).resolves.toEqual({ post: { id: "pg1", title: "Hello", kind: "page" } });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/pages`);
  expect(body()).toEqual({ title: "Hello" });
  expect(method()).toBe("POST");
});

test("listMembers GETs the workspace members collection and resolves the parsed envelope", async () => {
  const { calls, method } = stubFetchCapturing(() =>
    jsonResponse({ members: [{ id: "m1", email: "a@b.com", status: "active" }] })
  );
  await expect(api.listMembers()).resolves.toEqual({ members: [{ id: "m1", email: "a@b.com", status: "active" }] });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/members`);
  expect(method()).toBe("GET");
});

test("listMenus GETs the workspace menus collection and resolves the parsed envelope", async () => {
  const { calls, method } = stubFetchCapturing(() => jsonResponse({ menus: [{ id: "mn1", slug: "main" }] }));
  await expect(api.listMenus()).resolves.toEqual({ menus: [{ id: "mn1", slug: "main" }] });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/menus`);
  expect(method()).toBe("GET");
});

test("getWorkspace GETs /workspaces/:id (workspace IS the resource, no sub-resource nesting)", async () => {
  const { calls, method } = stubFetchCapturing(() =>
    jsonResponse({ workspace: { id: "workspace-local", name: "Tovu" } })
  );
  await expect(api.getWorkspace()).resolves.toEqual({ workspace: { id: "workspace-local", name: "Tovu" } });
  expect(calls[0].url).toBe(BASE_WORKSPACE);
  expect(method()).toBe("GET");
});

test("updateWorkspace PATCHes /workspaces/:id with the given options and resolves the updated workspace", async () => {
  const { calls, method, body } = stubFetchCapturing(() =>
    jsonResponse({ workspace: { id: "workspace-local", name: "New Name" } })
  );
  await expect(api.updateWorkspace({ name: "New Name" })).resolves.toEqual({
    workspace: { id: "workspace-local", name: "New Name" },
  });
  expect(calls[0].url).toBe(BASE_WORKSPACE);
  expect(method()).toBe("PATCH");
  expect(body()).toEqual({ name: "New Name" });
});

test("updateWorkspace sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing();
  await api.updateWorkspace();
  expect(body()).toEqual({});
});

test("listTaxonomies GETs the top-level /taxonomy collection (no /workspaces/:id nesting)", async () => {
  const { calls, method } = stubFetchCapturing(() =>
    jsonResponse({ items: [{ taxonomy: { id: "t1", name: "Category" }, terms: [] }] })
  );
  await expect(api.listTaxonomies()).resolves.toEqual({
    items: [{ taxonomy: { id: "t1", name: "Category" }, terms: [] }],
  });
  expect(calls[0].url).toBe("/api/admin/v1/taxonomy");
  expect(method()).toBe("GET");
});

test("listPlugins GETs the workspace plugins collection and resolves the parsed envelope", async () => {
  const { calls, method } = stubFetchCapturing(() =>
    jsonResponse({ plugins: [{ id: "lipay-plugin", version: "1.0.0", enabled: true }] })
  );
  await expect(api.listPlugins()).resolves.toEqual({
    plugins: [{ id: "lipay-plugin", version: "1.0.0", enabled: true }],
  });
  expect(calls[0].url).toBe(`${BASE_WORKSPACE}/plugins`);
  expect(method()).toBe("GET");
});

// --- onUnauthenticated / notifyIfUnauthenticated ----------------------------

test("a real 401 carrying code: UNAUTHENTICATED notifies every registered listener", async () => {
  stubFetchCapturing(() => jsonResponse({ error: "session expired", code: "UNAUTHENTICATED" }, 401));
  const listener = vi.fn();
  const unsubscribe = onUnauthenticated(listener);
  try {
    await api.getWorkspace().catch(() => {});
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
  }
});

test("a 401 that does NOT carry code: UNAUTHENTICATED (e.g. a relayed Composio 401) notifies no one", async () => {
  stubFetchCapturing(() => jsonResponse({ error: "invalid Composio key" }, 401));
  const listener = vi.fn();
  const unsubscribe = onUnauthenticated(listener);
  try {
    await api.getWorkspace().catch(() => {});
    expect(listener).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
  }
});

test("onUnauthenticated's returned unsubscribe function stops further notifications", async () => {
  stubFetchCapturing(() => jsonResponse({ error: "session expired", code: "UNAUTHENTICATED" }, 401));
  const listener = vi.fn();
  const unsubscribe = onUnauthenticated(listener);
  unsubscribe();
  await api.getWorkspace().catch(() => {});
  expect(listener).not.toHaveBeenCalled();
});
