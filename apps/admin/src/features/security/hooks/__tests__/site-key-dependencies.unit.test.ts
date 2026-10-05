import { afterEach, expect, it, vi } from "vitest";
import { defaultSiteKeyPort } from "../site-key-dependencies.hooks";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Author Checklist F1.1/F2.5/F2.6/F3.6/F6.2/F7.6: execute real bindings and
// API client, fake only fetch, reject wrong path/method/body, literal response oracle.
it.each([
  ["status", "GET", "/api/admin/v1/workspaces/workspace-local/system/site-key", undefined, { active: false, state: "missing", source: "none", keyFilePath: "/key", runtimeMode: "local" }],
  ["reveal", "POST", "/api/admin/v1/workspaces/workspace-local/system/site-key/reveal", undefined, { active: true, state: "active", hex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", source: "env", keyFilePath: "/key", runtimeMode: "production" }],
  ["generate", "POST", "/api/admin/v1/workspaces/workspace-local/system/site-key/generate", undefined, { outcome: "recovered", fingerprint: "fp-17", keyFilePath: "/key", runtimeMode: "local" }],
  ["importSiteKey", "POST", "/api/admin/v1/workspaces/workspace-local/system/site-key/import", { siteKey: "  old-token-42  " }, { outcome: "unlocked", resealed: 3, fingerprint: "fp-42", keyFilePath: "/key", runtimeMode: "local" }],
  ["previewStartFresh", "GET", "/api/admin/v1/workspaces/workspace-local/system/site-key/start-fresh", undefined, { removes: 2, affectedWebhooks: [], detail: "Two locked credentials", runtimeMode: "local" }],
  ["startFresh", "POST", "/api/admin/v1/workspaces/workspace-local/system/site-key/start-fresh", { confirm: "START FRESH" }, { outcome: "started-fresh", discarded: 2, kept: 1, restorePointId: "rp-17", affectedWebhooks: [], fingerprint: "fp-83", keyFilePath: "/key", runtimeMode: "local" }],
] as const)("%s forwards the exact request and returned data", async (method, verb, path, body, reply) => {
  // Reject: any binding calls status instead, or renames token/confirm in the body.
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(url).toBe(path);
    expect(init?.method ?? "GET").toBe(verb);
    expect(init?.body ? JSON.parse(String(init.body)) : undefined).toEqual(body);
    return Response.json(reply);
  });
  vi.stubGlobal("fetch", fetch);
  const value = method === "importSiteKey" ? await defaultSiteKeyPort.importSiteKey("  old-token-42  ")
    : method === "startFresh" ? await defaultSiteKeyPort.startFresh("START FRESH")
    : await defaultSiteKeyPort[method]();
  expect(value).toEqual(reply);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves the API refusal when importing a token, then permits a retry", async () => {
  // Reject: catch importToken refusal and return a success-shaped result.
  let attempts = 0;
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/site-key/import");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ siteKey: "old-token-42" });
    return ++attempts === 1 ? Response.json({ error: "SITE_KEY_DOES_NOT_OPEN", detail: "Wrong site key" }, { status: 409 })
      : Response.json({ outcome: "unlocked", resealed: 2, fingerprint: "fp-42", keyFilePath: "/key", runtimeMode: "local" });
  });
  vi.stubGlobal("fetch", fetch);
  await expect(defaultSiteKeyPort.importSiteKey("old-token-42")).rejects.toMatchObject({ status: 409, body: { error: "SITE_KEY_DOES_NOT_OPEN", detail: "Wrong site key" } });
  await expect(defaultSiteKeyPort.importSiteKey("old-token-42")).resolves.toEqual({ outcome: "unlocked", resealed: 2, fingerprint: "fp-42", keyFilePath: "/key", runtimeMode: "local" });
  expect(fetch).toHaveBeenCalledTimes(2);
});
