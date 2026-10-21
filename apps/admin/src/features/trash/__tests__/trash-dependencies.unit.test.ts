import { afterEach, expect, it, vi } from "vitest";

import { createFakeTrashPort, defaultTrashPort } from "../hooks/trash-dependencies.hooks";

afterEach(() => vi.unstubAllGlobals());

it("the live restore port sends entity identities and returns the server's restore report", async () => {
  const input = { items: [{ entityType: "post", entityId: "post-7" }] };
  const report = { restored: 1, results: [{ ...input.items[0], outcome: "restored" }] };
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/trash/restore");
    expect(init?.method).toBe("POST");
    requests.push(JSON.parse(String(init?.body)));
    return Response.json(report);
  });
  expect(await defaultTrashPort.restoreTrashItems(input)).toEqual(report);
  expect(requests).toEqual([input]);
});

it("the live purge port sends trash row ids and returns the server's purge report", async () => {
  const input = { ids: ["trash-row-9"] };
  const report = { purged: 1, results: [{ id: "trash-row-9", outcome: "purged" }] };
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/trash/purge");
    expect(init?.method).toBe("POST");
    requests.push(JSON.parse(String(init?.body)));
    return Response.json(report);
  });
  expect(await defaultTrashPort.purgeTrashItems(input)).toEqual(report);
  expect(requests).toEqual([input]);
});

it("the fake rejects configured restore failures while recording the attempted entity identities", async () => {
  const port = createFakeTrashPort({ restoreError: new Error("Restore denied") });
  const input = { items: [{ entityType: "page", entityId: "page-2" }] };
  await expect(port.restoreTrashItems(input)).rejects.toThrow("Restore denied");
  expect(port.restoreCalls).toEqual([input]);
  expect(port.purgeCalls).toEqual([]);
});

it("the fake rejects configured purge failures while recording the attempted trash row ids", async () => {
  const port = createFakeTrashPort({ purgeError: new Error("Purge denied") });
  const input = { ids: ["trash-row-2"] };
  await expect(port.purgeTrashItems(input)).rejects.toThrow("Purge denied");
  expect(port.purgeCalls).toEqual([input]);
  expect(port.restoreCalls).toEqual([]);
});

it("the fake rejects configured user-roster failures and counts the failed read", async () => {
  const port = createFakeTrashPort({ listUsersError: new Error("Users forbidden") });
  await expect(port.listUsers!()).rejects.toThrow("Users forbidden");
  expect(port.listUsersCalls).toBe(1);
});

it("an unseeded fake lists an empty trash page with no next cursor and records the query", async () => {
  const port = createFakeTrashPort();
  await expect(port.listTrash({ cursor: "page-2" })).resolves.toEqual({ items: [], nextCursor: null });
  expect(port.listCalls).toEqual([{ cursor: "page-2" }]);
});
