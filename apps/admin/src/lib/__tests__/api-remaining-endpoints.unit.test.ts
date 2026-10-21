import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, adminSitePreviewUrl, api, authenticatedAdminRequest, authenticatedAdminUrl } from "../api";

/**
 * @file The `api.ts` endpoints and request options no other `api-*` suite pinned: each call's exact
 * URL, method and body, plus `requireJson` (a malformed successful body rejects instead of reading
 * as `{}`) and a Blob upload's content-type fallback. Same stub-real-`fetch`-and-assert-on-the-call
 * pattern as `api-users.unit.test.ts`.
 */

afterEach(() => { vi.unstubAllGlobals(); });

type Call = { url: string; method: string; body?: unknown };

/** Request headers of every stubbed call, in order (kept out of `Call` so URL/method/body compare cleanly). */
const sentHeaders: Record<string, string>[] = [];

function stubFetch(reply: () => Response = () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const raw = init?.body;
    calls.push({
      url, method: init?.method ?? "GET",
      ...(raw === undefined ? {} : { body: typeof raw === "string" ? JSON.parse(raw) : raw }),
    });
    sentHeaders.push({ ...(init?.headers as Record<string, string> | undefined) });
    return reply();
  }));
  return calls;
}

const W = "/api/admin/v1/workspaces/workspace-local";

describe("request options", () => {
  it("requireJson rejects a successful response whose body is not JSON", async () => {
    stubFetch(() => new Response("<html>proxy</html>", { status: 200 }));
    await expect(authenticatedAdminRequest({ path: "/x", method: "GET" }, { requireJson: true })).rejects.toBeInstanceOf(SyntaxError);
    stubFetch(() => new Response("<html>proxy</html>", { status: 200 }));
    await expect(authenticatedAdminRequest({ path: "/x", method: "GET" })).resolves.toEqual({});
  });

  it("an untyped Blob body is sent as application/octet-stream, unserialized", async () => {
    const calls = stubFetch();
    const blob = new Blob(["bytes"]);
    await authenticatedAdminRequest({ path: "/upload", method: "PUT", body: blob });
    expect(calls[0]!.body).toBe(blob);
    expect(sentHeaders.at(-1)).toMatchObject({ "Content-Type": "application/octet-stream" });
  });

  it("builds authenticated asset URLs under the admin API base, with the preview version in the URL", () => {
    expect(authenticatedAdminUrl({ path: "/a b" })).toBe("/api/admin/v1/a b");
    expect(adminSitePreviewUrl({ name: "my site", version: 3 })).toBe(`${W}/system/sites/my%20site/preview?v=3`);
  });
});

describe("endpoints", () => {
  it("auth: local owner sign-in and password status", async () => {
    const calls = stubFetch();
    await api.signInLocalOwner({});
    await api.getPasswordStatus();
    expect(calls).toEqual([
      { url: "/api/admin/v1/auth/local-boot-session", method: "POST" },
      { url: "/api/admin/v1/auth/me/password-status", method: "GET" },
    ]);
  });

  it("post autosave read and discard", async () => {
    const calls = stubFetch();
    await api.getAutosave("p/1");
    await api.discardAutosave("p/1");
    expect(calls.map(({ url, method }) => [url, method])).toEqual([[`${W}/posts/p%2F1/autosave`, "GET"], [`${W}/posts/p%2F1/autosave`, "DELETE"]]);
  });

  it("media content type from a HEAD of the original, empty on failure or a missing header", async () => {
    const replies = [
      new Response(null, { status: 200, headers: { "content-type": "video/mp4" } }),
      new Response(null, { status: 200 }),
      new Response(null, { status: 404, headers: { "content-type": "text/html" } }),
    ];
    const calls = stubFetch(() => replies.shift()!);
    expect(await api.mediaContentType("m1")).toBe("video/mp4");
    expect(await api.mediaContentType("m1")).toBe("");
    expect(await api.mediaContentType("m1")).toBe("");
    expect(calls.every((call) => call.method === "HEAD" && call.url === api.mediaOriginalUrl("m1"))).toBe(true);
  });

  it("media import from URL, with and without descriptive options", async () => {
    const calls = stubFetch();
    await api.importMediaFromUrl({ url: "https://example.com/a.png" });
    await api.importMediaFromUrl({ url: "https://example.com/a.png" }, { alt: "A", filename: "a.png" });
    expect(calls).toEqual([
      { url: `${W}/media/import-url`, method: "POST", body: { url: "https://example.com/a.png" } },
      { url: `${W}/media/import-url`, method: "POST", body: { url: "https://example.com/a.png", alt: "A", filename: "a.png" } },
    ]);
  });

  it("documents: list, upload as a document, and read text pages", async () => {
    const calls = stubFetch();
    await api.listDocuments();
    await api.uploadDocument({ filename: "notes.md", dataBase64: "aGk=" });
    await api.readDocumentText({ id: "d 1" });
    await api.readDocumentText({ id: "d 1" }, { offset: 0 });
    await api.readDocumentText({ id: "d 1" }, { offset: 65536 });
    expect(calls).toEqual([
      { url: `${W}/media?kind=document`, method: "GET" },
      { url: `${W}/media`, method: "POST", body: { filename: "notes.md", dataBase64: "aGk=", kind: "document" } },
      { url: `${W}/media/d%201/text`, method: "GET" },
      { url: `${W}/media/d%201/text`, method: "GET" },
      { url: `${W}/media/d%201/text?offset=65536`, method: "GET" },
    ]);
  });

  it("deletes a user by encoded principal id", async () => {
    const calls = stubFetch(() => new Response(null, { status: 204 }));
    await api.deleteUser("user/1");
    expect(calls).toEqual([{ url: `${W}/users/user%2F1`, method: "DELETE" }]);
  });

  it("detects execution agents, forcing a re-probe only when asked", async () => {
    const calls = stubFetch();
    await api.detectExecutionAgents();
    await api.detectExecutionAgents({}, { force: true });
    expect(calls.map((call) => call.body)).toEqual([{}, { force: true }]);
    expect(calls[0]!.url).toBe(`${W}/assistant/execution/detect-agents`);
  });

  it("updates a form on the authoring route only when mode or html is given", async () => {
    const calls = stubFetch();
    await api.updateForm({ id: "f1" }, { name: "Contact" });
    await api.updateForm({ id: "f1" }, { mode: "html", html: "<form></form>" });
    await api.updateForm({ id: "f1" }, { html: "<form></form>" });
    expect(calls.map(({ url, method }) => [url, method])).toEqual([
      [`${W}/forms/f1`, "PUT"], [`${W}/forms/f1/authoring`, "PUT"], [`${W}/forms/f1/authoring`, "PUT"],
    ]);
  });

  it("creates a recovery restore point with or without options", async () => {
    const calls = stubFetch();
    await api.createRecoveryRestorePoint();
    await api.createRecoveryRestorePoint({ trigger: "manual", costAck: true });
    expect(calls).toEqual([
      { url: "/api/admin/v1/database/restore-points", method: "POST", body: {} },
      { url: "/api/admin/v1/database/restore-points", method: "POST", body: { trigger: "manual", costAck: true } },
    ]);
  });

  it("site and agent plugins: uninstall, files, list, enable", async () => {
    const calls = stubFetch();
    await api.uninstallPlugin("seo/x");
    await api.getPluginFiles("seo/x");
    await api.listAgentPlugins();
    await api.getAgentPluginFiles("agent/y");
    await api.setAgentPluginEnabled("agent/y", { enabled: false });
    expect(calls).toEqual([
      { url: `${W}/plugins/seo%2Fx`, method: "DELETE" },
      { url: `${W}/plugins/seo%2Fx/files`, method: "GET" },
      { url: `${W}/agent-plugins`, method: "GET" },
      { url: `${W}/agent-plugins/agent%2Fy/files`, method: "GET" },
      { url: `${W}/agent-plugins/agent%2Fy`, method: "PATCH", body: { enabled: false } },
    ]);
  });

  it("system reads: observability status, tool gaps, publish destinations", async () => {
    const calls = stubFetch();
    await api.getObservabilityStatus();
    await api.getToolGaps();
    await api.listPublishDestinations();
    expect(calls.map((call) => call.url)).toEqual([`${W}/system/observability-status`, `${W}/system/tool-gaps`, `${W}/system/publish/destinations`]);
  });

  it("site key lifecycle: status, reveal, generate, import, start-fresh preview and confirm", async () => {
    const calls = stubFetch();
    await api.getSiteKeyStatus();
    await api.revealSiteKey();
    await api.generateSiteKey();
    const imported = ["tovu", "sk", "fixture"].join("_");
    await api.importSiteKey({ siteKey: imported });
    await api.previewSiteKeyStartFresh();
    await api.startFreshSiteKey("START FRESH");
    expect(calls).toEqual([
      { url: `${W}/system/site-key`, method: "GET" },
      { url: `${W}/system/site-key/reveal`, method: "POST" },
      { url: `${W}/system/site-key/generate`, method: "POST" },
      { url: `${W}/system/site-key/import`, method: "POST", body: { siteKey: imported } },
      { url: `${W}/system/site-key/start-fresh`, method: "GET" },
      { url: `${W}/system/site-key/start-fresh`, method: "POST", body: { confirm: "START FRESH" } },
    ]);
  });

  it("an endpoint failure surfaces as an ApiError with the server's status", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "nope", code: "SITE_KEY_MISSING" }), { status: 404 }));
    await expect(api.revealSiteKey()).rejects.toMatchObject({ status: 404, code: "SITE_KEY_MISSING" });
    stubFetch(() => new Response(JSON.stringify({ error: "nope" }), { status: 409 }));
    await expect(api.generateSiteKey()).rejects.toBeInstanceOf(ApiError);
  });
});
