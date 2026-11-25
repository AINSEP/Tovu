import { describe, expect, it, vi } from "vitest";
import type { MediaProviderRowsPort } from "@jini-ai/ui";

/**
 * @file Coverage for `media-providers-port.ts` (0/2 funcs) — Tovu's real `MediaProvidersPort`.
 *
 * The two functions' error-handling contracts are opposite by design (the file's own header spells
 * out why): `fetchMediaProviders` swallows every failure into `null` — never `{}` — so a transient
 * network blip can never read as "the server manages nothing" and wipe local edits;
 * the per-provider writes reject on failure, since the tab renders that rejection as its own
 * `save-error` state. Both branches of that asymmetry are asserted here.
 */

const { getMediaProviders, request, getMediaProviderCatalog } = vi.hoisted(() => ({
  getMediaProviders: vi.fn(),
  request: vi.fn(),
  getMediaProviderCatalog: vi.fn(),
}));

vi.mock("../../../lib/admin-http/request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/admin-http/request")>();
  return { ...actual, request };
});

vi.mock("../api/media-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/media-api")>();
  return { ...actual, mediaApi: { ...actual.mediaApi, getMediaProviders, getMediaProviderCatalog } };
});

const { WORKSPACE_ID } = await import("@jini-ai/admin/shell/lib/admin-http/config");

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

/**
 * The writes go through the real `mediaApi` down to the `request` seam, so these pin what actually
 * travels: one provider's fields to its own row, never a whole map whose omissions would delete.
 */
describe("mediaProvidersPort per-provider writes", () => {
  const authoritative = { openai: { apiKeyConfigured: true, apiKeyTail: "0001" }, grok: { apiKeyConfigured: true, apiKeyTail: "0002" } };
  const rowPath = (providerId: string) => `/workspaces/${WORKSPACE_ID}/media/providers/${encodeURIComponent(providerId)}`;

  it("is the per-provider port: there is no whole-map save left to infer deletion from omission", () => {
    expect("saveMediaProviders" in mediaProvidersPort).toBe(false);
    expect(typeof (mediaProvidersPort as MediaProviderRowsPort).patchProvider).toBe("function");
  });

  it("saving one provider does not wipe a built-in key saved in another window", async () => {
    request.mockReset();
    request.mockResolvedValue(authoritative);
    const port = mediaProvidersPort as MediaProviderRowsPort;
    await expect(port.patchProvider({ providerId: "grok", fields: { apiKey: "xai-window-b" } })).resolves.toEqual(authoritative);
    expect(request).toHaveBeenCalledTimes(1);
    const [target, options] = request.mock.calls[0]!;
    expect(target).toEqual({ path: rowPath("grok") });
    expect(options.init.method).toBe("PATCH");
    // Only grok's own fields travel; openai (saved elsewhere, unknown to this tab) is never named.
    expect(JSON.parse(options.init.body)).toEqual({ apiKey: "xai-window-b" });
  });

  it("Remove on a plugin-vendor key deletes that key and nothing else", async () => {
    request.mockReset();
    request.mockResolvedValue(authoritative);
    const port = mediaProvidersPort as MediaProviderRowsPort;
    await expect(port.removeProvider({ providerId: "acme/media" })).resolves.toEqual(authoritative);
    expect(request).toHaveBeenCalledTimes(1);
    const [target, options] = request.mock.calls[0]!;
    expect(target).toEqual({ path: rowPath("acme/media") });
    expect(options.init).toEqual({ method: "DELETE" });
  });

  it("REJECTS on failure, unlike fetchMediaProviders — the tab renders this as its save-error state", async () => {
    request.mockReset();
    request.mockRejectedValue(new Error("no site key"));
    const port = mediaProvidersPort as MediaProviderRowsPort;
    await expect(port.patchProvider({ providerId: "openai", fields: { model: "m" } })).rejects.toThrow("no site key");
    await expect(port.removeProvider({ providerId: "openai" })).rejects.toThrow("no site key");
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
