import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

afterEach(() => vi.unstubAllGlobals());

const ENDPOINT = "/api/admin/v1/workspaces/workspace-local/fs-files/custom-root";

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("getFsFilesCustomRoot GETs the workspace custom-root endpoint", async () => {
  const response = { path: "/canonical/project" };
  const fetchMock = stubFetch(response);
  await expect(api.getFsFilesCustomRoot()).resolves.toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(ENDPOINT);
  expect(init?.method ?? "GET").toBe("GET");
  expect(init?.body).toBeUndefined();
});

test("setFsFilesCustomRoot PUTs the path verbatim in JSON and returns the canonical server path", async () => {
  const path = "/Users/la/My project/#draft?";
  const response = { path: "/canonical/project" };
  const fetchMock = stubFetch(response);
  await expect(api.setFsFilesCustomRoot(path)).resolves.toEqual(response);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(ENDPOINT);
  expect(init?.method).toBe("PUT");
  expect(JSON.parse(init?.body as string)).toEqual({ path });
});

// clearFsFilesCustomRoot (lib/api.ts) and its dedicated test case were deleted 2026-10-03: unused; see development/DELETED-CODE.md.

test("getFolderPicker GETs and pickFolder POSTs the workspace folder-picker endpoint with no body", async () => {
  const endpoint = "/api/admin/v1/workspaces/workspace-local/fs-files/folder-picker";
  const fetchMock = stubFetch({ path: "/Users/la/Picked" });
  await expect(api.getFolderPicker()).resolves.toEqual({ path: "/Users/la/Picked" });
  await expect(api.pickFolder()).resolves.toEqual({ path: "/Users/la/Picked" });
  const [[getUrl, getInit], [postUrl, postInit]] = fetchMock.mock.calls;
  expect([getUrl, getInit?.method ?? "GET", postUrl, postInit?.method]).toEqual([endpoint, "GET", endpoint, "POST"]);
  expect(postInit?.body).toBeUndefined();
});
