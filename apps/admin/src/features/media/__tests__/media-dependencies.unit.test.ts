import { fakeGridPage } from "../hooks/media-dependencies.hooks";
import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMediaPort } from "../hooks/media-dependencies.hooks";

// Consumer suites exercise the fake through hooks; this suite owns its store and live binding contracts.
afterEach(() => vi.unstubAllGlobals());
describe("defaultMediaPort", () => {
  const base = "/api/admin/v1/workspaces/workspace-local";
  const input = { filename: "photo.png", contentType: "image/png", dataBase64: "AA==" };
  it.each([
    { name: "listMedia", run: () => defaultMediaPort.listMedia(), path: "/media", method: "GET", body: undefined, response: { media: [] } },
    { name: "uploadMedia", run: () => defaultMediaPort.uploadMedia(input, { alt: "Cat" }), path: "/media", method: "POST", body: { ...input, alt: "Cat" }, response: { media: { id: "uploaded" } } },
    { name: "updateMedia", run: () => defaultMediaPort.updateMedia({ id: "m/1" }, { alt: "changed" }), path: "/media/m%2F1", method: "PATCH", body: { alt: "changed" }, response: { media: { id: "m/1", alt: "changed" } } },
    { name: "trashMedia", run: () => defaultMediaPort.trashMedia("m/1"), path: "/media/m%2F1/trash", method: "POST", body: undefined, response: { media: { id: "m/1", status: "trashed" } } },
    { name: "deleteMedia", run: () => defaultMediaPort.deleteMedia("m/1"), path: "/media/m%2F1", method: "DELETE", body: undefined, response: { purged: true } },
    { name: "listUsers", run: () => defaultMediaPort.listUsers!(), path: "/users", method: "GET", body: undefined, response: { users: [] } },
  ])("$name preserves the real API request and response contract", async ({ run, path, method, body, response }) => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${base}${path}`);
      expect(init?.method ?? "GET").toBe(method);
      requests.push({ url, method: init?.method ?? "GET", body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      return Response.json(response);
    });
    await expect(run()).resolves.toEqual(response);
    expect(requests).toEqual([{ url: `${base}${path}`, method, body }]);
  });

  it.each([
    { restored: 1, outcome: "restored", expected: true },
    { restored: 0, outcome: "version-changed", expected: false },
  ])("restoreMedia posts one media item to the shared Trash restore and reports $outcome", async ({ restored, outcome, expected }) => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? "GET", body: JSON.parse(String(init?.body)) });
      return Response.json({ restored, results: [{ entityType: "media", entityId: "m/1", outcome }] });
    });
    await expect(defaultMediaPort.restoreMedia("m/1")).resolves.toEqual({ restored: expected });
    expect(requests).toEqual([{ url: `${base}/trash/restore`, method: "POST", body: { items: [{ entityType: "media", entityId: "m/1" }] } }]);
  });

  it("resolves the original URL with an encoded media id", () => {
    expect(defaultMediaPort.mediaOriginalUrl("m/1")).toBe(`${base}/media/m%2F1/original`);
  });
});

it("limits deep-linked results to the requested item without narrowing the tab counts", () => {
  const items = [
    { id: "cover", title: "Cover", status: "active", createdAt: "2026-11-26T00:00:00Z", contentType: "image/jpeg" },
    { id: "banner", title: "Banner", status: "active", createdAt: "2026-11-20T00:00:00Z", contentType: "image/png" },
    { id: "video", title: "Video", status: "active", createdAt: "2026-11-26T00:00:00Z", contentType: "video/mp4" },
  ] as AdminMedia[];
  expect(fakeGridPage({ items, tab: "images", orderBy: "created", itemId: "banner" })).toMatchObject({
    media: [items[1]], counts: { all: 3, images: 2, videos: 1, trash: 0 }, nextCursor: null,
  });
  expect(fakeGridPage({ items, tab: "images", orderBy: "created", itemId: "video" }).media).toEqual([]);
});
