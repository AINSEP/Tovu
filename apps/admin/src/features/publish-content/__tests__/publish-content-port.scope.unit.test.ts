import { afterEach, expect, test, vi } from "vitest";

import { defaultPublishContentPort } from "../hooks/publish-content-dependencies.hooks";

/**
 * @file plan-publish-sections-2026-09-25.md §1 — the LIVE port's last hop to the wire. Every dialog
 * test runs against `createFakePublishContentPort`, which filters by `scope` itself, so a real port
 * or `api.planPublishContent` that dropped `scope` from the body would leave all of them green while
 * a "Publish pages" dialog staged and published every section. This pins the actual request body.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchCapturing(): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    })
  );
  return calls;
}

test("planPublish sends scope in the push/plan body, alongside the row selection", async () => {
  const calls = stubFetchCapturing();
  await defaultPublishContentPort.planPublish({
    peerId: "peer-prod",
    selectedEntityKeys: ["page:p1"],
    scope: { entityTypes: ["page"] },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toMatch(/\/publish-content\/peers\/peer-prod\/push\/plan$/);
  expect(calls[0].init?.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    selectedEntityKeys: ["page:p1"],
    scope: { entityTypes: ["page"] },
  });
});

test("planPublish with only a scope still sends a body carrying it", async () => {
  const calls = stubFetchCapturing();
  await defaultPublishContentPort.planPublish({ peerId: "peer-prod", scope: { entityTypes: ["theme-files"] } });
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ scope: { entityTypes: ["theme-files"] } });
});

test("planPublish with no scope sends no scope key", async () => {
  const calls = stubFetchCapturing();
  await defaultPublishContentPort.planPublish({ peerId: "peer-prod", overwriteEntityKeys: ["post:a"] });
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ overwriteEntityKeys: ["post:a"] });
});
