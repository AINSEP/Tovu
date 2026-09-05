import { afterEach, expect, test, vi } from "vitest";

import { ApiError, api } from "../api";

/**
 * @file First direct coverage pass for `api.ts`'s theme/marketplace-theme endpoints (0% before this
 * pass — `listMarketplaceThemes`, `downloadMarketplaceTheme`, `getThemeDetail`, `resetThemeFile`,
 * `getThemeFile`, `putThemeFile`, `copyThemeFile`, `renameThemeFile`, `deleteThemeFile`,
 * `setThemePagePublished`, `rescanThemes` had no test anywhere in this suite).
 *
 * Follows `api-endpoint-option-branches.unit.test.ts`'s pattern: stub the real `fetch`, assert on
 * the actual URL/method/body a call produces, never on a trivially-true "it resolved" check. Each
 * endpoint also gets one error-path test using the specific `ApiError.code` its own doc comment
 * names (`READ_ONLY_FILE`, `REQUIRED_FILE_LOCKED`, `NAME_TAKEN`, `NOT_STATIC_TIER`,
 * `PAGE_NOT_PUBLISHABLE`) — proving the real server error shape round-trips through `ApiError`,
 * not just that *some* error was thrown.
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

// --- listMarketplaceThemes ---------------------------------------------------------------

test("listMarketplaceThemes GETs the marketplace catalog and resolves the parsed list", async () => {
  const themes = [{ id: "basic", name: "Basic", tier: "declarative", idTaken: false }];
  const { calls } = stubFetchCapturing(okJson({ themes }));
  await expect(api.listMarketplaceThemes()).resolves.toEqual({ themes });
  expect(calls[0].url).toBe(`${BASE}/marketplace/themes`);
  expect(calls[0].init?.method).toBeUndefined();
});

// --- downloadMarketplaceTheme ---------------------------------------------------------------

test("downloadMarketplaceTheme POSTs to the theme's /download route and resolves the assigned id", async () => {
  const { calls } = stubFetchCapturing(
    okJson({ id: "basic-1", suffixed: true, tier: "declarative", rescan: { added: ["basic-1"], removed: [], total: 3 } })
  );
  const result = await api.downloadMarketplaceTheme("basic");
  expect(calls[0].url).toBe(`${BASE}/marketplace/themes/basic/download`);
  expect(calls[0].init?.method).toBe("POST");
  expect(calls[0].init?.body).toBeUndefined();
  expect(result).toEqual({ id: "basic-1", suffixed: true, tier: "declarative", rescan: { added: ["basic-1"], removed: [], total: 3 } });
});

test("downloadMarketplaceTheme encodes a themeId containing reserved characters into the URL", async () => {
  const { calls } = stubFetchCapturing();
  await api.downloadMarketplaceTheme("theme/with slash");
  expect(calls[0].url).toBe(`${BASE}/marketplace/themes/${encodeURIComponent("theme/with slash")}/download`);
});

// --- getThemeDetail ---------------------------------------------------------------

test("getThemeDetail GETs one theme's explore surface by id", async () => {
  const detail = {
    id: "basic",
    name: "Basic",
    tier: "declarative" as const,
    status: "valid",
    errors: [],
    pages: ["index"],
    partials: [],
    files: [],
    lineage: null,
    hasOriginal: true,
  };
  const { calls } = stubFetchCapturing(okJson(detail));
  await expect(api.getThemeDetail("basic")).resolves.toEqual(detail);
  expect(calls[0].url).toBe(`${BASE}/themes/basic`);
});

test("getThemeDetail throws ApiError for an unknown theme id", async () => {
  stubFetchCapturing(errJson(404, "theme not found", "NOT_FOUND"));
  const error = await api.getThemeDetail("nope").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("NOT_FOUND");
  expect((error as ApiError).message).toBe("theme not found");
});

// --- resetThemeFile ---------------------------------------------------------------

test("resetThemeFile POSTs the path in the body to the theme's /file/reset route", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ path: "pages/about.html", bytes: 42, content: "<html></html>" }));
  const result = await api.resetThemeFile("basic", "pages/about.html");
  expect(calls[0].url).toBe(`${BASE}/themes/basic/file/reset`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ path: "pages/about.html" });
  expect(result).toEqual({ path: "pages/about.html", bytes: 42, content: "<html></html>" });
});

test("resetThemeFile throws ApiError with code READ_ONLY_FILE for a read-only group", async () => {
  stubFetchCapturing(errJson(400, "this file cannot be reset", "READ_ONLY_FILE"));
  const error = await api.resetThemeFile("basic", "scripts/main.js").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("READ_ONLY_FILE");
});

// --- getThemeFile ---------------------------------------------------------------

test("getThemeFile GETs raw file content via a ?path= query param", async () => {
  const { calls } = stubFetchCapturing(okJson({ path: "pages/about.html", content: "<html></html>" }));
  await expect(api.getThemeFile("basic", "pages/about.html")).resolves.toEqual({
    path: "pages/about.html",
    content: "<html></html>",
  });
  expect(calls[0].url).toBe(`${BASE}/themes/basic/file?path=${encodeURIComponent("pages/about.html")}`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("getThemeFile encodes both themeId and path independently", async () => {
  const { calls } = stubFetchCapturing();
  await api.getThemeFile("my theme", "pages/a b.html");
  expect(calls[0].url).toBe(
    `${BASE}/themes/${encodeURIComponent("my theme")}/file?path=${encodeURIComponent("pages/a b.html")}`
  );
});

// --- putThemeFile ---------------------------------------------------------------

test("putThemeFile PUTs path+content to the theme's /file route", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ path: "pages/about.html", bytes: 10 }));
  const result = await api.putThemeFile("basic", "pages/about.html", "<p>hi</p>");
  expect(calls[0].url).toBe(`${BASE}/themes/basic/file`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ path: "pages/about.html", content: "<p>hi</p>" });
  expect(result).toEqual({ path: "pages/about.html", bytes: 10 });
});

test("putThemeFile throws ApiError with code READ_ONLY_FILE when the route refuses the save", async () => {
  stubFetchCapturing(errJson(400, "read-only file", "READ_ONLY_FILE"));
  const error = await api.putThemeFile("basic", "scripts/main.js", "x").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("READ_ONLY_FILE");
});

// --- copyThemeFile ---------------------------------------------------------------

test("copyThemeFile POSTs the source path to the theme's /file/copy route", async () => {
  const { calls, body } = stubFetchCapturing(
    okJson({ path: "pages/about-1.html", group: "page", readable: true, editable: true, resettable: false, copiedFrom: "pages/about.html" })
  );
  const result = await api.copyThemeFile("basic", "pages/about.html");
  expect(calls[0].url).toBe(`${BASE}/themes/basic/file/copy`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ path: "pages/about.html" });
  expect(result.copiedFrom).toBe("pages/about.html");
});

// --- renameThemeFile ---------------------------------------------------------------

test("renameThemeFile POSTs path+name to the theme's /file/rename route", async () => {
  const { calls, body } = stubFetchCapturing(
    okJson({ path: "pages/contact.html", group: "page", readable: true, editable: true, resettable: false, renamedFrom: "pages/about.html" })
  );
  const result = await api.renameThemeFile("basic", "pages/about.html", "contact.html");
  expect(calls[0].url).toBe(`${BASE}/themes/basic/file/rename`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ path: "pages/about.html", name: "contact.html" });
  expect(result.renamedFrom).toBe("pages/about.html");
});

test("renameThemeFile throws ApiError with code REQUIRED_FILE_LOCKED for a locked required file", async () => {
  stubFetchCapturing(errJson(400, "this file cannot be renamed", "REQUIRED_FILE_LOCKED"));
  const error = await api.renameThemeFile("basic", "theme.json", "x.json").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("REQUIRED_FILE_LOCKED");
});

test("renameThemeFile throws ApiError with code NAME_TAKEN when the destination name collides", async () => {
  stubFetchCapturing(errJson(409, "that name is already taken", "NAME_TAKEN"));
  const error = await api.renameThemeFile("basic", "pages/about.html", "index.html").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("NAME_TAKEN");
});

// --- deleteThemeFile ---------------------------------------------------------------

test("deleteThemeFile POSTs the path to the theme's /file/delete route", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ path: "pages/about.html", deleted: true }));
  const result = await api.deleteThemeFile("basic", "pages/about.html");
  expect(calls[0].url).toBe(`${BASE}/themes/basic/file/delete`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ path: "pages/about.html" });
  expect(result).toEqual({ path: "pages/about.html", deleted: true });
});

test("deleteThemeFile throws ApiError with code REQUIRED_FILE_LOCKED for a theme's required file", async () => {
  stubFetchCapturing(errJson(400, "cannot delete a required file", "REQUIRED_FILE_LOCKED"));
  const error = await api.deleteThemeFile("basic", "pages/index.html").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("REQUIRED_FILE_LOCKED");
});

// --- setThemePagePublished ---------------------------------------------------------------

test("setThemePagePublished POSTs page+published to the theme's /page/publish route", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ page: "about", published: true, publishedPages: ["about"] }));
  const result = await api.setThemePagePublished("basic", "about", true);
  expect(calls[0].url).toBe(`${BASE}/themes/basic/page/publish`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ page: "about", published: true });
  expect(result).toEqual({ page: "about", published: true, publishedPages: ["about"] });
});

test("setThemePagePublished throws ApiError with code NOT_STATIC_TIER for a non-static theme", async () => {
  stubFetchCapturing(errJson(400, "only static-tier themes support page publishing", "NOT_STATIC_TIER"));
  const error = await api.setThemePagePublished("declarative-theme", "about", true).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("NOT_STATIC_TIER");
});

test("setThemePagePublished throws ApiError with code PAGE_NOT_PUBLISHABLE for index/404/template-shell pages", async () => {
  stubFetchCapturing(errJson(400, "this page cannot be published/unpublished", "PAGE_NOT_PUBLISHABLE"));
  const error = await api.setThemePagePublished("basic", "index", false).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("PAGE_NOT_PUBLISHABLE");
});

// --- rescanThemes ---------------------------------------------------------------

test("rescanThemes POSTs to /themes/rescan with no body and resolves the discovery delta", async () => {
  const { calls } = stubFetchCapturing(
    okJson({ added: ["new-theme"], removed: [], total: 4, availableThemeIds: ["basic", "new-theme"], duplicateIds: [] })
  );
  const result = await api.rescanThemes();
  expect(calls[0].url).toBe(`${BASE}/themes/rescan`);
  expect(calls[0].init?.method).toBe("POST");
  expect(calls[0].init?.body).toBeUndefined();
  expect(result.added).toEqual(["new-theme"]);
});
