import { afterEach, expect, test, vi } from "vitest";

import { ApiError, api, type AdminMedia, type AdminMediaProviderMap } from "../api";

/**
 * @file First direct coverage pass for `api.ts`'s media endpoints. `listMedia`, `getMediaProviders`,
 * `saveMediaProviders`, `updateMedia`, `trashMedia`, and `deleteMedia` had zero test anywhere in
 * this suite before this pass — `mediaOriginalUrl` was only exercised indirectly (as a URL prefix
 * substring) by `media-image-extension.unit.test.tsx`, and `uploadMedia` only had its two
 * option-branch body assertions in `api-endpoint-option-branches.unit.test.ts` (no URL/method/error
 * assertion). This file adds the missing exact-request-shape and error-path coverage; it does not
 * duplicate that file's existing option-branch tests.
 *
 * Same stub-real-`fetch`-and-assert-on-the-call pattern as `api-themes.unit.test.ts`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function errJson(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ error, code }), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetchCapturing(response: Response = okJson({})): {
  calls: Array<{ url: string; init?: RequestInit }>;
  body(n?: number): unknown;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return response;
    })
  );
  return {
    calls,
    body(n = 0) {
      const raw = calls[n]?.init?.body;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    },
  };
}

const BASE = "/api/admin/v1/workspaces/workspace-local";

function media(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "asset-1",
    workspaceId: "w1",
    title: "Dune",
    slug: "dune",
    alt: "Sand dunes at dusk",
    caption: "",
    credit: "",
    sha256: "abc",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    contentType: "image/png",
    ...overrides,
  };
}

// --- listMedia ---------------------------------------------------------------

test("listMedia GETs the workspace's media list and resolves it verbatim", async () => {
  const list = [media()];
  const { calls } = stubFetchCapturing(okJson({ media: list }));
  await expect(api.listMedia()).resolves.toEqual({ media: list });
  expect(calls[0].url).toBe(`${BASE}/media`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("listMedia throws ApiError on a non-2xx response", async () => {
  stubFetchCapturing(errJson(500, "database unavailable"));
  const error = await api.listMedia().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toBe("database unavailable");
});

// --- getMediaProviders / saveMediaProviders ---------------------------------------------------------------

test("getMediaProviders GETs the bare provider map (no {data} envelope)", async () => {
  const providers: AdminMediaProviderMap = { grok: { baseUrl: "https://x.example", apiKeyConfigured: true } };
  const { calls } = stubFetchCapturing(okJson(providers));
  await expect(api.getMediaProviders()).resolves.toEqual(providers);
  expect(calls[0].url).toBe(`${BASE}/media/providers`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("saveMediaProviders PUTs the whole provider map as the body and resolves the authoritative copy", async () => {
  const providers: AdminMediaProviderMap = { nanobanana: { baseUrl: "https://y.example", model: "v2" } };
  const { calls, body } = stubFetchCapturing(okJson(providers));
  const result = await api.saveMediaProviders(providers);
  expect(calls[0].url).toBe(`${BASE}/media/providers`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual(providers);
  expect(result).toEqual(providers);
});

test("saveMediaProviders sending an empty map is how a caller clears every provider — still a plain PUT", async () => {
  const { body } = stubFetchCapturing(okJson({}));
  await api.saveMediaProviders({});
  expect(body()).toEqual({});
});

test("saveMediaProviders throws ApiError on a validation failure", async () => {
  stubFetchCapturing(errJson(400, "invalid provider config", "VALIDATION_ERROR"));
  const error = await api.saveMediaProviders({ grok: {} }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("VALIDATION_ERROR");
});

// --- mediaOriginalUrl ---------------------------------------------------------------

test("mediaOriginalUrl builds the byte-serving URL directly — not routed through request()/fetch at all", () => {
  expect(api.mediaOriginalUrl("asset-1")).toBe(`${BASE}/media/asset-1/original`);
});

// --- uploadMedia ---------------------------------------------------------------

test("uploadMedia POSTs to the media collection and resolves the created record", async () => {
  const created = media({ id: "asset-9" });
  const { calls } = stubFetchCapturing(okJson({ media: created }));
  const result = await api.uploadMedia({ filename: "f.png", contentType: "image/png", dataBase64: "AA==" });
  expect(calls[0].url).toBe(`${BASE}/media`);
  expect(calls[0].init?.method).toBe("POST");
  expect(result).toEqual({ media: created });
});

test("uploadMedia throws ApiError when the upload is rejected", async () => {
  stubFetchCapturing(errJson(413, "payload too large"));
  const error = await api
    .uploadMedia({ filename: "big.png", contentType: "image/png", dataBase64: "AA==" })
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(413);
});

// --- updateMedia ---------------------------------------------------------------

test("updateMedia PATCHes /media/:id with the given options as the body", async () => {
  const updated = media({ id: "asset-1", title: "New title" });
  const { calls, body } = stubFetchCapturing(okJson({ media: updated }));
  const result = await api.updateMedia({ id: "asset-1" }, { title: "New title" });
  expect(calls[0].url).toBe(`${BASE}/media/asset-1`);
  expect(calls[0].init?.method).toBe("PATCH");
  expect(body()).toEqual({ title: "New title" });
  expect(result).toEqual({ media: updated });
});

test("updateMedia sends an empty body when the caller passes no options", async () => {
  const { body } = stubFetchCapturing(okJson({ media: media() }));
  await api.updateMedia({ id: "asset-1" });
  expect(body()).toEqual({});
});

test("updateMedia can explicitly null out width/height/cssClass", async () => {
  const { body } = stubFetchCapturing(okJson({ media: media() }));
  await api.updateMedia({ id: "asset-1" }, { width: null, height: null, cssClass: null });
  expect(body()).toEqual({ width: null, height: null, cssClass: null });
});

test("updateMedia throws ApiError for an unknown id", async () => {
  stubFetchCapturing(errJson(404, "media not found"));
  const error = await api.updateMedia({ id: "missing" }, { title: "x" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(404);
});

// --- trashMedia ---------------------------------------------------------------

test("trashMedia POSTs to /media/:id/trash and resolves the trashed record", async () => {
  const trashed = media({ status: "trashed" });
  const { calls } = stubFetchCapturing(okJson({ media: trashed }));
  const result = await api.trashMedia("asset-1");
  expect(calls[0].url).toBe(`${BASE}/media/asset-1/trash`);
  expect(calls[0].init?.method).toBe("POST");
  expect(result).toEqual({ media: trashed });
});

test("trashMedia throws ApiError for an unknown id", async () => {
  stubFetchCapturing(errJson(404, "media not found"));
  const error = await api.trashMedia("missing").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});

// --- deleteMedia ---------------------------------------------------------------

test("deleteMedia DELETEs /media/:id and resolves { purged: true }", async () => {
  const { calls } = stubFetchCapturing(okJson({ purged: true }));
  const result = await api.deleteMedia("asset-1");
  expect(calls[0].url).toBe(`${BASE}/media/asset-1`);
  expect(calls[0].init?.method).toBe("DELETE");
  expect(result).toEqual({ purged: true });
});

test("deleteMedia throws ApiError when the asset is still referenced", async () => {
  stubFetchCapturing(errJson(409, "still referenced by content", "RESOURCE_CONFLICT"));
  const error = await api.deleteMedia("asset-1").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("RESOURCE_CONFLICT");
});
