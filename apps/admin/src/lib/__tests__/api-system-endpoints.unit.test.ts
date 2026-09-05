import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

/**
 * @file Coverage-gap-fill pass (2026-09-05) for `api.ts`'s System-resource endpoint wrappers
 * (`/workspaces/${WORKSPACE_ID}/system/...` paths) that had no test exercising the real request
 * shape before this file: `getDeploymentOverview`, `listSites`, `createSite`, `activateSite`,
 * `getSiteExportStatus`, `triggerPublish`, `getPublishStatus`, and the three credential-CRUD
 * groups (publish / source-control / custom). `restartAssistantDaemon`, `getDockerfileSource`,
 * `setDockerfileSource`, `triggerSiteExport`, and `getPublishPreview` already had real
 * fetch-stubbed tests elsewhere (`api-endpoint-option-branches.unit.test.ts`,
 * `api-request-onok-and-null-body.unit.test.ts`) — not duplicated here.
 *
 * The credential-CRUD groups (`list/create/update/deleteXCredential`) each already had a
 * *feature*-level test (`access-tokens-dependencies.unit.test.ts`,
 * `publish-credentials-dependencies.unit.test.ts`, `source-control-credentials-dependencies.unit.test.ts`)
 * — but every one of those `vi.mock("../../../../lib/api", ...)`s the whole module and spies on
 * `api.*` directly, so none of them ever exercises `api.ts`'s own URL/method/body-assembly code.
 * That is real feature coverage but zero `api.ts` coverage; this file closes the `api.ts` half.
 *
 * Every test asserts the ACTUAL `fetch` call's URL/method/body — never a trivially-true assertion
 * — so a future edit that breaks the request shape fails these tests, not just a coverage number.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Captures every `fetch` call's URL and `RequestInit` so tests can assert on the exact request
 *  shape a branch produces, rather than only on the resolved value. Mirrors the identically-named
 *  helper in `api-endpoint-option-branches.unit.test.ts` / `api-widgets-endpoints.unit.test.ts`. */
function stubFetchCapturing(): { calls: Array<{ url: string; init?: RequestInit }>; body(n?: number): unknown } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okJson({});
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

const BASE = `/api/admin/v1/workspaces/workspace-local`;

// --- Deployment overview -----------------------------------------------------------------

test("getDeploymentOverview is a bare GET at /system/deployment-overview", async () => {
  const { calls } = stubFetchCapturing();
  await api.getDeploymentOverview();
  expect(calls[0].url).toBe(`${BASE}/system/deployment-overview`);
  expect(calls[0].init?.method).toBeUndefined();
});

// --- Sites -----------------------------------------------------------------

test("listSites is a bare GET at /system/sites", async () => {
  const { calls } = stubFetchCapturing();
  await api.listSites();
  expect(calls[0].url).toBe(`${BASE}/system/sites`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("createSite POSTs { name } to /system/sites", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.createSite({ name: "my-new-site" });
  expect(calls[0].url).toBe(`${BASE}/system/sites`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ name: "my-new-site" });
});

test("activateSite POSTs to /system/sites/:name/activate with the name percent-encoded", async () => {
  const { calls } = stubFetchCapturing();
  await api.activateSite("my site");
  expect(calls[0].url).toBe(`${BASE}/system/sites/my%20site/activate`);
  expect(calls[0].init?.method).toBe("POST");
});

test("activateSite leaves an already-URL-safe name untouched", async () => {
  const { calls } = stubFetchCapturing();
  await api.activateSite("tovu-com");
  expect(calls[0].url).toBe(`${BASE}/system/sites/tovu-com/activate`);
});

// --- Static export (poll half) -----------------------------------------------------------------

test("getSiteExportStatus is a bare GET at /system/export, distinct from triggerSiteExport's POST to the same URL", async () => {
  const { calls } = stubFetchCapturing();
  await api.getSiteExportStatus();
  expect(calls[0].url).toBe(`${BASE}/system/export`);
  expect(calls[0].init?.method).toBeUndefined();
});

// --- Publish (trigger/poll) -----------------------------------------------------------------

test("triggerPublish POSTs config's own fields merged with projectName as the body", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.triggerPublish({
    config: { target: "github-pages", owner: "acme", repo: "site" },
    projectName: "my-site",
  });
  expect(calls[0].url).toBe(`${BASE}/system/publish`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ target: "github-pages", owner: "acme", repo: "site", projectName: "my-site" });
});

test("triggerPublish merges a vercel config's own fields the same way", async () => {
  const { body } = stubFetchCapturing();
  await api.triggerPublish({ config: { target: "vercel", teamId: "team-1" }, projectName: "my-site" });
  expect(body()).toEqual({ target: "vercel", teamId: "team-1", projectName: "my-site" });
});

test("getPublishStatus is a bare GET at /system/publish, distinct from triggerPublish's POST to the same URL", async () => {
  const { calls } = stubFetchCapturing();
  await api.getPublishStatus();
  expect(calls[0].url).toBe(`${BASE}/system/publish`);
  expect(calls[0].init?.method).toBeUndefined();
});

// --- Publish credentials -----------------------------------------------------------------

test("listPublishCredentials is a bare GET at /system/publish/credentials", async () => {
  const { calls } = stubFetchCapturing();
  await api.listPublishCredentials();
  expect(calls[0].url).toBe(`${BASE}/system/publish/credentials`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("createPublishCredential POSTs the input verbatim, including a cloudflare-pages connection's accountId", async () => {
  const { calls, body } = stubFetchCapturing();
  const input = {
    label: "Production",
    connection: { providerId: "cloudflare-pages" as const, token: "tok", accountId: "acct-1" },
  };
  await api.createPublishCredential(input);
  expect(calls[0].url).toBe(`${BASE}/system/publish/credentials`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual(input);
});

test("createPublishCredential omits isDefault from the body when the caller doesn't pass it", async () => {
  const { body } = stubFetchCapturing();
  await api.createPublishCredential({ label: "Production", connection: { providerId: "vercel", token: "tok" } });
  expect(body()).toEqual({ label: "Production", connection: { providerId: "vercel", token: "tok" } });
});

test("updatePublishCredential PUTs to /system/publish/credentials/:id, omitting connection when the caller doesn't pass one", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.updatePublishCredential("cred-1", { label: "Renamed", isDefault: true });
  expect(calls[0].url).toBe(`${BASE}/system/publish/credentials/cred-1`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ label: "Renamed", isDefault: true });
});

test("deletePublishCredential DELETEs /system/publish/credentials/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deletePublishCredential("cred-1");
  expect(calls[0].url).toBe(`${BASE}/system/publish/credentials/cred-1`);
  expect(calls[0].init?.method).toBe("DELETE");
});

test("verifyPublishCredential POSTs to /system/publish/credentials/:id/verify with no body", async () => {
  const { calls } = stubFetchCapturing();
  await api.verifyPublishCredential("cred-1");
  expect(calls[0].url).toBe(`${BASE}/system/publish/credentials/cred-1/verify`);
  expect(calls[0].init?.method).toBe("POST");
  expect(calls[0].init?.body).toBeUndefined();
});

// --- Source-control credentials -----------------------------------------------------------------

test("listSourceControlCredentials is a bare GET at /system/source-control/credentials", async () => {
  const { calls } = stubFetchCapturing();
  await api.listSourceControlCredentials();
  expect(calls[0].url).toBe(`${BASE}/system/source-control/credentials`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("createSourceControlCredential POSTs the input verbatim, including bitbucket's required username", async () => {
  const { calls, body } = stubFetchCapturing();
  const input = { label: "Origin", connection: { providerId: "bitbucket" as const, token: "tok", username: "leona" } };
  await api.createSourceControlCredential(input);
  expect(calls[0].url).toBe(`${BASE}/system/source-control/credentials`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual(input);
});

test("updateSourceControlCredential PUTs to /system/source-control/credentials/:id, omitting connection when the caller doesn't pass one", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.updateSourceControlCredential("scc-1", { label: "Renamed" });
  expect(calls[0].url).toBe(`${BASE}/system/source-control/credentials/scc-1`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ label: "Renamed" });
});

test("deleteSourceControlCredential DELETEs /system/source-control/credentials/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteSourceControlCredential("scc-1");
  expect(calls[0].url).toBe(`${BASE}/system/source-control/credentials/scc-1`);
  expect(calls[0].init?.method).toBe("DELETE");
});

// --- Custom-provider credentials -----------------------------------------------------------------

test("listCustomCredentials is a bare GET at /system/custom/credentials", async () => {
  const { calls } = stubFetchCapturing();
  await api.listCustomCredentials();
  expect(calls[0].url).toBe(`${BASE}/system/custom/credentials`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("createCustomCredential omits additionalHosts from the body when the caller doesn't pass any", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.createCustomCredential({
    label: "Fly",
    category: "hosting",
    baseUrl: "https://api.fly.io",
    connection: { token: "tok" },
  });
  expect(calls[0].url).toBe(`${BASE}/system/custom/credentials`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ label: "Fly", category: "hosting", baseUrl: "https://api.fly.io", connection: { token: "tok" } });
});

test("createCustomCredential includes additionalHosts when the caller passes them", async () => {
  const { body } = stubFetchCapturing();
  await api.createCustomCredential({
    label: "Fly",
    category: "hosting",
    baseUrl: "https://api.fly.io",
    additionalHosts: ["api.machines.dev"],
    connection: { token: "tok" },
  });
  expect(body()).toMatchObject({ additionalHosts: ["api.machines.dev"] });
});

test("updateCustomCredential PUTs to /system/custom/credentials/:id, omitting username from the body when the caller doesn't pass it", async () => {
  const { calls, body } = stubFetchCapturing();
  await api.updateCustomCredential("cc-1", { label: "Renamed" });
  expect(calls[0].url).toBe(`${BASE}/system/custom/credentials/cc-1`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ label: "Renamed" });
  expect(Object.prototype.hasOwnProperty.call(body() as object, "username")).toBe(false);
});

test("updateCustomCredential sends a literal JSON null (not an omitted field) to clear a saved username", async () => {
  const { body } = stubFetchCapturing();
  await api.updateCustomCredential("cc-1", { username: null });
  const parsed = body() as Record<string, unknown>;
  expect(Object.prototype.hasOwnProperty.call(parsed, "username")).toBe(true);
  expect(parsed.username).toBeNull();
});

test("deleteCustomCredential DELETEs /system/custom/credentials/:id", async () => {
  const { calls } = stubFetchCapturing();
  await api.deleteCustomCredential("cc-1");
  expect(calls[0].url).toBe(`${BASE}/system/custom/credentials/cc-1`);
  expect(calls[0].init?.method).toBe("DELETE");
});
