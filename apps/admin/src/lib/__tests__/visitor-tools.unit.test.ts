import { afterEach, expect, test, vi } from "vitest";

import { VISITOR_TOOLS_CONFLICT_CODE, VISITOR_TOOLS_NAMESPACE, visitorToolsPort } from "../visitor-tools";

/** L13 Stryker: the port's two calls had no lib-scoped test. Pin method, path, body and unwrap. */
afterEach(() => { vi.unstubAllGlobals(); });

function stub(data: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("list GETs the workspace's visitor tools and unwraps data", async () => {
  const view = { revisionSeq: 3, defaults: { perIpPerHour: 1, perSitePerDay: 2 }, callsPerTurn: 1, tools: [] };
  const fetchMock = stub(view);
  expect(await visitorToolsPort.list({})).toEqual(view);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/admin/v1/workspaces/workspace-local/assistant/visitor-tools");
  expect(init.method).toBe("GET");
  expect(init.body).toBeUndefined();
});

test("configure PUTs the exact patch as JSON and unwraps data", async () => {
  const fetchMock = stub({ revisionSeq: 4 });
  const patch = { toolId: "site", expectedRevisionSeq: 3, mode: "off" as const };
  expect(await visitorToolsPort.configure(patch)).toEqual({ revisionSeq: 4 });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/admin/v1/workspaces/workspace-local/assistant/visitor-tools");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body as string)).toEqual(patch);
});

test("the conflict code and settings namespace match the server's", () => {
  expect(VISITOR_TOOLS_CONFLICT_CODE).toBe("VISITOR_TOOLS_REVISION_CONFLICT");
  expect(VISITOR_TOOLS_NAMESPACE).toBe("site.assistant");
});
