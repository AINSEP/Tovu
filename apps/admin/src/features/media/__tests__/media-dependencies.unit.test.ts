import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeMediaPort, defaultMediaPort } from "../hooks/media-dependencies.hooks";

// Consumer suites exercise the fake through hooks; this suite owns its store and live binding contracts.
afterEach(() => vi.unstubAllGlobals());

describe("createFakeMediaPort", () => {
  it("permanently deletes only the requested item from the readable store", async () => {
    const port = createFakeMediaPort();
    const input = { filename: "Cat.png", contentType: "image/png", dataBase64: "AA==" };
    const { media: cat } = await port.uploadMedia(input);
    const { media: dog } = await port.uploadMedia({ ...input, filename: "Dog.png" });
    await expect(port.deleteMedia(cat.id)).resolves.toEqual({ purged: true });
    expect(port.items).toEqual([dog]);
    await expect(port.listMedia()).resolves.toEqual({ media: [dog] });
  });

  it.each(["updateMedia", "trashMedia", "restoreMedia", "deleteMedia"] as const)("%s rejects a missing id without changing the store", async (operation) => {
    const port = createFakeMediaPort();
    const { media } = await port.uploadMedia({ filename: "kept.png", contentType: "image/png", dataBase64: "AA==" });
    const pending = operation === "updateMedia" ? port.updateMedia({ id: "missing" }) : port[operation]("missing");
    await expect(pending).rejects.toThrow("fake media not found: missing");
    await expect(port.listMedia()).resolves.toEqual({ media: [media] });
  });

  it("uses untitled when a filename contains no slug characters and preserves explicit metadata", async () => {
    const port = createFakeMediaPort();
    const { media } = await port.uploadMedia(
      { filename: "???", contentType: "image/png", dataBase64: "AA==" },
      { alt: "Cat", caption: "At rest", credit: "Photographer" },
    );
    expect(media).toMatchObject({ slug: "untitled", alt: "Cat", caption: "At rest", credit: "Photographer" });
    await expect(port.updateMedia({ id: media.id })).resolves.toEqual({ media });
    await expect(port.trashMedia(media.id)).resolves.toEqual({ media: { ...media, status: "trashed" } });
    await expect(port.listMedia()).resolves.toEqual({ media: [{ ...media, status: "trashed" }] });
    await expect(port.restoreMedia(media.id)).resolves.toEqual({ restored: true });
    await expect(port.listMedia()).resolves.toEqual({ media: [{ ...media, status: "active" }] });
  });
});

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
