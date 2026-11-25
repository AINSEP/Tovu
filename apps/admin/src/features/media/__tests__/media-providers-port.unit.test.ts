import { describe, expect, it, vi } from "vitest";

/**
 * @file Coverage for `media-providers-port.ts` (0/2 funcs) — Tovu's real `MediaProvidersPort`.
 *
 * The two functions' error-handling contracts are opposite by design (the file's own header spells
 * out why): `fetchMediaProviders` swallows every failure into `null` — never `{}` — so a transient
 * network blip can never read as "the server manages nothing" and wipe local edits;
 * `saveMediaProviders` rejects on failure, since the tab renders that rejection as its own
 * `save-error` state. Both branches of that asymmetry are asserted here.
 */

const { getMediaProviders, saveMediaProviders, getMediaProviderCatalog } = vi.hoisted(() => ({
  getMediaProviders: vi.fn(),
  saveMediaProviders: vi.fn(),
  getMediaProviderCatalog: vi.fn(),
}));

vi.mock("../api/media-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/media-api")>();
  return { ...actual, mediaApi: { ...actual.mediaApi, getMediaProviders, saveMediaProviders, getMediaProviderCatalog } };
});

const { mediaProvidersPort, mediaProviderCatalogPort } = await import("../media-providers-port");

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
  it("persists the whole map and returns the server's authoritative copy", async () => {
    const map = { cloudinary: { apiKeyConfigured: true, apiKeyTail: "1234" } };
    const authoritative = { cloudinary: { apiKeyConfigured: true, apiKeyTail: "9876" } };
    saveMediaProviders.mockResolvedValue(authoritative);
    await expect(mediaProvidersPort.saveMediaProviders(map)).resolves.toEqual(authoritative);
    expect(saveMediaProviders).toHaveBeenCalledWith(map);
  });

  it("REJECTS on failure, unlike fetchMediaProviders — the tab renders this as its save-error state", async () => {
    saveMediaProviders.mockRejectedValue(new Error("no site key"));
    await expect(mediaProvidersPort.saveMediaProviders({})).rejects.toThrow("no site key");
  });
});

describe("mediaProviderCatalogPort.fetchMediaProviderCatalog", () => {
  it("returns the host's live cards", async () => {
    getMediaProviderCatalog.mockResolvedValue({ providers: [{ id: "xai-grok-imagine", label: "xAI Grok Imagine", models: ["grok-imagine-image"] }] });
    await expect(mediaProviderCatalogPort.fetchMediaProviderCatalog()).resolves.toEqual([{ id: "xai-grok-imagine", label: "xAI Grok Imagine", models: ["grok-imagine-image"] }]);
  });

  it("resolves null (never [], never rejects) when the host is unreachable, so the tab shows no made-up count", async () => {
    getMediaProviderCatalog.mockRejectedValue(new Error("network down"));
    await expect(mediaProviderCatalogPort.fetchMediaProviderCatalog()).resolves.toBeNull();
  });

  it("resolves null for a body that is not a catalog, and drops malformed cards from one that is", async () => {
    getMediaProviderCatalog.mockResolvedValueOnce({ openai: { apiKeyConfigured: true } });
    await expect(mediaProviderCatalogPort.fetchMediaProviderCatalog()).resolves.toBeNull();
    getMediaProviderCatalog.mockResolvedValueOnce({ providers: [{ id: "openai", label: "OpenAI" }, { id: 7 }, null] });
    await expect(mediaProviderCatalogPort.fetchMediaProviderCatalog()).resolves.toEqual([{ id: "openai", label: "OpenAI" }]);
  });
});
