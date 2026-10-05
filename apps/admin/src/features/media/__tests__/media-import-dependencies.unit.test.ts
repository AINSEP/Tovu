import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMediaImportPort } from "../hooks/media-import-dependencies.hooks";

/**
 * The live URL-import port. `remote-image-import.unit.test.tsx` injects a fake port, so the real
 * request this one sends (route, method, body) is pinned here against a fetch stub.
 */

afterEach(() => { vi.unstubAllGlobals(); });

function stubImport() {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ media: { id: "m_new" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("defaultMediaImportPort", () => {
  it("posts the URL and alt text to the workspace import route and returns the created media", async () => {
    const fetchMock = stubImport();
    await expect(defaultMediaImportPort.importFromUrl({ url: "https://cdn.example/cat.png" }, { alt: "A cat" })).resolves.toEqual({ media: { id: "m_new" } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/media/import-url");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ url: "https://cdn.example/cat.png", alt: "A cat" });
  });

  it("sends only the URL when no optional fields are given", async () => {
    const fetchMock = stubImport();
    await defaultMediaImportPort.importFromUrl({ url: "https://cdn.example/dog.png" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ url: "https://cdn.example/dog.png" });
  });
});
