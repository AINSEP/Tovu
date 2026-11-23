import { describe, expect, it, vi } from "vitest";

/**
 * @file Coverage for `media-providers-port.ts` (0/2 funcs) — Tovu's real `MediaProvidersPort`.
 *
 * The two functions' error-handling contracts are opposite by design (the file's own header spells
 * out why): `fetchMediaProviders` swallows every failure into `null` — never `{}` — so a transient
 * network blip can never read as "the server manages nothing" and wipe local edits;
 * `saveMediaProviders` rejects on failure, since the tab renders that rejection as its own
 * `save-error` state. Both branches of that asymmetry are asserted here. Saves are a PARTIAL patch
 * (B135/B136), asserted in the `createMediaProvidersPort` block.
 */

const { getMediaProviders, request } = vi.hoisted(() => ({
  getMediaProviders: vi.fn(),
  request: vi.fn(),
}));

vi.mock("../../../lib/admin-http/request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/admin-http/request")>();
  return { ...actual, request };
});

vi.mock("../api/media-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/media-api")>();
  return { ...actual, mediaApi: { ...actual.mediaApi, getMediaProviders } };
});

const { createMediaProvidersPort, mediaProvidersPort } = await import("../media-providers-port");

describe("mediaProvidersPort.fetchMediaProviders", () => {
  it("returns the provider map on success", async () => {
    const map = { cloudinary: { apiKeyConfigured: true, apiKeyTail: "1234" } };
    getMediaProviders.mockResolvedValue(map);
    await expect(mediaProvidersPort.fetchMediaProviders()).resolves.toEqual(map);
  });

  it("resolves null (NEVER {}, never rejects) when the server is unreachable — protects local edits from a transient blip", async () => {
    getMediaProviders.mockRejectedValue(new Error("network down"));
    await expect(mediaProvidersPort.fetchMediaProviders()).resolves.toBeNull();
  });

  it("resolves null the same way for a 500/403-shaped failure, not just a network error", async () => {
    getMediaProviders.mockRejectedValue(new Error("403 Forbidden"));
    await expect(mediaProvidersPort.fetchMediaProviders()).resolves.toBeNull();
  });
});

describe("mediaProvidersPort.saveMediaProviders", () => {
  it("REJECTS on failure, unlike fetchMediaProviders — the tab renders this as its save-error state", async () => {
    request.mockRejectedValue(new Error("no site key"));
    await expect(mediaProvidersPort.saveMediaProviders({})).rejects.toThrow("no site key");
  });

  it("sends a PARTIAL save (?mode=merge) and returns the server's authoritative copy", async () => {
    const authoritative = { cloudinary: { apiKeyConfigured: true, apiKeyTail: "9876" } };
    request.mockResolvedValue(authoritative);
    await expect(mediaProvidersPort.saveMediaProviders({ cloudinary: { apiKey: "new-key-9876" } })).resolves.toEqual(authoritative);
    expect(request).toHaveBeenLastCalledWith({ path: "/workspaces/workspace-local/media/providers?mode=merge" },
      { init: { method: "PUT", body: JSON.stringify({ cloudinary: { apiKey: "new-key-9876" } }) } });
  });
});

/** B135/B136: the port turns the tab's whole map into a patch against the map it last SAW from the
 *  server — so a provider the screen never saw (saved elsewhere after it loaded) is never deleted,
 *  and a provider the screen cleared is deleted explicitly by id (plugin vendors included). */
describe("createMediaProvidersPort — patch against the last-seen map", () => {
  function makePort(seen: Record<string, Record<string, unknown>> | null) {
    const api = {
      getMediaProviders: vi.fn().mockResolvedValue(seen),
      mergeMediaProviders: vi.fn().mockImplementation(async (patch: Record<string, unknown>) => patch),
    };
    return { api, port: createMediaProvidersPort({ api }) };
  }

  it("never sends a provider the screen did not see, so a key saved elsewhere survives (B135)", async () => {
    const { api, port } = makePort({ openai: { apiKeyConfigured: true, apiKeyTail: "1234" } });
    await port.fetchMediaProviders();
    // Meanwhile `grok` was saved in another tab; this screen's map still holds only `openai`.
    await port.saveMediaProviders({ openai: { apiKeyConfigured: true, apiKeyTail: "1234", model: "dall-e-3" } });
    expect(api.mergeMediaProviders).toHaveBeenCalledWith({ openai: { apiKeyConfigured: true, apiKeyTail: "1234", model: "dall-e-3" } });
  });

  it("sends only edited providers — an unchanged one is not re-written over a concurrent edit", async () => {
    const { api, port } = makePort({ openai: { apiKeyConfigured: true, model: "a" }, grok: { apiKeyConfigured: true } });
    await port.fetchMediaProviders();
    await port.saveMediaProviders({ openai: { apiKeyConfigured: true, model: "a" }, grok: { apiKeyConfigured: true, apiKey: "xai-new-key" } });
    expect(api.mergeMediaProviders).toHaveBeenCalledWith({ grok: { apiKeyConfigured: true, apiKey: "xai-new-key" } });
  });

  it("deletes a provider the screen saw and then cleared, by explicit null — a plugin vendor too (B136)", async () => {
    const { api, port } = makePort({ "acme-media": { apiKeyConfigured: true }, openai: { apiKeyConfigured: true } });
    await port.fetchMediaProviders();
    await port.saveMediaProviders({ openai: { apiKeyConfigured: true } });
    expect(api.mergeMediaProviders).toHaveBeenCalledWith({ "acme-media": null });
  });

  it("deletes nothing when it never saw the server's map (fetch unreachable) — never deletes implicitly", async () => {
    const { api, port } = makePort(null);
    api.getMediaProviders.mockRejectedValue(new Error("network down"));
    await expect(port.fetchMediaProviders()).resolves.toBeNull();
    await port.saveMediaProviders({});
    expect(api.mergeMediaProviders).toHaveBeenCalledWith({});
  });

  it("measures the next save against the save's authoritative answer, not the stale fetch", async () => {
    const { api, port } = makePort({});
    await port.fetchMediaProviders();
    api.mergeMediaProviders.mockResolvedValueOnce({ grok: { apiKeyConfigured: true } });
    await port.saveMediaProviders({ grok: { apiKey: "xai-key" } });
    await port.saveMediaProviders({});
    expect(api.mergeMediaProviders).toHaveBeenLastCalledWith({ grok: null });
  });
});
