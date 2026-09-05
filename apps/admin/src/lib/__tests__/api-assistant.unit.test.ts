import { afterEach, expect, test, vi } from "vitest";

import { ApiError, api } from "../api";

/**
 * @file First direct coverage pass for `api.ts`'s assistant endpoints. `detectExecutionAgents`,
 * `testExecutionConnection`, `testExecutionAgent`, `listExecutionModels`, `getAssistantSettings`,
 * `setAssistantSettings`, `getAssistantSiteCredential`, `setAssistantSiteCredential`,
 * `deleteAssistantSiteCredential`, `getAdminExecutionCredential`, `setAdminExecutionCredential`, and
 * `deleteAdminExecutionCredential` had zero DIRECT test — `execution-settings.test.ts` exercises
 * `execution-settings.ts`'s own logic against a `vi.mock("../api")` stub, so it never runs api.ts's
 * real fetch-URL/method/body wiring for any of these. This file closes that gap.
 *
 * `restartAssistantDaemon`'s three refusal/error branches are already covered in
 * `api-endpoint-option-branches.unit.test.ts`; this file adds only the missing successful-restart
 * path, so as not to duplicate that file's tests. `getAssistantDaemonReadyz` already has its own
 * full test file (`api-assistant-daemon-readyz.unit.test.ts`) and is intentionally not touched here.
 *
 * Same stub-real-`fetch`-and-assert-on-the-call pattern as the sibling `api-*.unit.test.ts` files.
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

// --- detectExecutionAgents ---------------------------------------------------------------

test("detectExecutionAgents POSTs an empty body to /assistant/execution/detect-agents", async () => {
  const agents = [{ id: "claude", label: "Claude Code", installed: true }];
  const { calls, body } = stubFetchCapturing(okJson({ data: agents }));
  const result = await api.detectExecutionAgents();
  expect(calls[0].url).toBe(`${BASE}/assistant/execution/detect-agents`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({});
  expect(result).toEqual({ data: agents });
});

test("detectExecutionAgents throws ApiError on a non-2xx response", async () => {
  stubFetchCapturing(errJson(500, "detection crashed"));
  const error = await api.detectExecutionAgents().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toBe("detection crashed");
});

// --- testExecutionConnection ---------------------------------------------------------------

test("testExecutionConnection POSTs the full probe input verbatim to /assistant/execution/test-connection", async () => {
  const input = { protocol: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "sk-test", model: "claude-sonnet-4-5" };
  const { calls, body } = stubFetchCapturing(okJson({ ok: true, message: "Connection succeeded" }));
  const result = await api.testExecutionConnection(input);
  expect(calls[0].url).toBe(`${BASE}/assistant/execution/test-connection`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual(input);
  expect(result).toEqual({ ok: true, message: "Connection succeeded" });
});

test("testExecutionConnection passes useStoredCredential/useAdminStoredCredential through verbatim when given", async () => {
  const { body } = stubFetchCapturing(okJson({ ok: true, message: "ok" }));
  await api.testExecutionConnection({
    protocol: "anthropic",
    baseUrl: "",
    apiKey: "",
    model: "",
    useStoredCredential: true,
    useAdminStoredCredential: true,
  });
  expect(body()).toMatchObject({ useStoredCredential: true, useAdminStoredCredential: true });
});

test("testExecutionConnection resolves { ok: false } as a value on a reachable-but-rejecting provider, not a thrown error", async () => {
  stubFetchCapturing(okJson({ ok: false, message: "Unauthorized" }));
  await expect(
    api.testExecutionConnection({ protocol: "anthropic", baseUrl: "", apiKey: "bad", model: "" })
  ).resolves.toEqual({ ok: false, message: "Unauthorized" });
});

test("testExecutionConnection throws ApiError on a transport failure (non-2xx)", async () => {
  stubFetchCapturing(errJson(503, "daemon unreachable"));
  const error = await api
    .testExecutionConnection({ protocol: "anthropic", baseUrl: "", apiKey: "", model: "" })
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});

// --- testExecutionAgent ---------------------------------------------------------------

test("testExecutionAgent POSTs agentId+model to /assistant/execution/test-agent", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ ok: true, message: "Claude Code is usable" }));
  const result = await api.testExecutionAgent({ agentId: "claude", model: "claude-opus-5" });
  expect(calls[0].url).toBe(`${BASE}/assistant/execution/test-agent`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ agentId: "claude", model: "claude-opus-5" });
  expect(result).toEqual({ ok: true, message: "Claude Code is usable" });
});

test("testExecutionAgent throws ApiError on a transport failure", async () => {
  stubFetchCapturing(errJson(503, "daemon unreachable"));
  const error = await api.testExecutionAgent({ agentId: "claude" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});

// --- listExecutionModels ---------------------------------------------------------------

test("listExecutionModels POSTs the probe input to /assistant/execution/models and resolves the model list", async () => {
  const input = { protocol: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test" };
  const { calls, body } = stubFetchCapturing(okJson({ ok: true, models: ["gpt-4o", "gpt-4o-mini"] }));
  const result = await api.listExecutionModels(input);
  expect(calls[0].url).toBe(`${BASE}/assistant/execution/models`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual(input);
  expect(result).toEqual({ ok: true, models: ["gpt-4o", "gpt-4o-mini"] });
});

test("listExecutionModels resolves { ok: false } as a value (an invalid key), not a thrown error", async () => {
  stubFetchCapturing(okJson({ ok: false, models: [], message: "invalid key" }));
  await expect(
    api.listExecutionModels({ protocol: "openai", baseUrl: "", apiKey: "bad" })
  ).resolves.toEqual({ ok: false, models: [], message: "invalid key" });
});

test("listExecutionModels throws ApiError on a transport failure", async () => {
  stubFetchCapturing(errJson(503, "daemon unreachable"));
  const error = await api.listExecutionModels({ protocol: "openai", baseUrl: "", apiKey: "" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});

// --- getAssistantSettings / setAssistantSettings ---------------------------------------------------------------

test("getAssistantSettings GETs /assistant/settings and resolves data plus the sibling adminAssistantEnabled flag", async () => {
  const { calls } = stubFetchCapturing(okJson({ data: { publicEnabled: true }, adminAssistantEnabled: false }));
  const result = await api.getAssistantSettings();
  expect(calls[0].url).toBe(`${BASE}/assistant/settings`);
  expect(calls[0].init?.method).toBeUndefined();
  expect(result).toEqual({ data: { publicEnabled: true }, adminAssistantEnabled: false });
});

test("setAssistantSettings PUTs the given patch verbatim as the body", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ data: { publicEnabled: false } }));
  const result = await api.setAssistantSettings({ publicEnabled: false });
  expect(calls[0].url).toBe(`${BASE}/assistant/settings`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ publicEnabled: false });
  expect(result).toEqual({ data: { publicEnabled: false } });
});

test("setAssistantSettings throws ApiError on a non-2xx response", async () => {
  stubFetchCapturing(errJson(500, "write failed"));
  const error = await api.setAssistantSettings({ publicEnabled: true }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});

// --- restartAssistantDaemon: the one branch NOT already covered in api-endpoint-option-branches ---

test("restartAssistantDaemon resolves { ok: true } on a genuine successful restart, unwrapped from the {ok:true} envelope", async () => {
  const { calls } = stubFetchCapturing(okJson({ ok: true }));
  const result = await api.restartAssistantDaemon();
  expect(calls[0].url).toBe(`${BASE}/system/assistant-daemon/restart`);
  expect(calls[0].init?.method).toBe("POST");
  expect(result).toEqual({ ok: true });
});

// --- getAssistantSiteCredential / setAssistantSiteCredential / deleteAssistantSiteCredential ---

test("getAssistantSiteCredential GETs /assistant/site-credential", async () => {
  const view = { isSet: true, masked: "••••abcd", provider: "anthropic", baseUrl: null, model: null, updatedAt: "2026-01-01T00:00:00.000Z" };
  const { calls } = stubFetchCapturing(okJson({ data: view }));
  const result = await api.getAssistantSiteCredential();
  expect(calls[0].url).toBe(`${BASE}/assistant/site-credential`);
  expect(calls[0].init?.method).toBeUndefined();
  expect(result).toEqual({ data: view });
});

test("setAssistantSiteCredential PUTs the patch verbatim; omitted apiKey means 'leave alone'", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ data: { isSet: true, masked: "••••wxyz", provider: "anthropic", baseUrl: null, model: "claude-sonnet-4-5", updatedAt: null } }));
  await api.setAssistantSiteCredential({ model: "claude-sonnet-4-5" });
  expect(calls[0].url).toBe(`${BASE}/assistant/site-credential`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ model: "claude-sonnet-4-5" });
  expect(body()).not.toHaveProperty("apiKey");
});

test("setAssistantSiteCredential throws ApiError with code SECRET_STORE_UNCONFIGURED when no root key is configured", async () => {
  stubFetchCapturing(errJson(503, "no master key configured", "SECRET_STORE_UNCONFIGURED"));
  const error = await api.setAssistantSiteCredential({ apiKey: "sk-new" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("SECRET_STORE_UNCONFIGURED");
  expect((error as ApiError).status).toBe(503);
});

test("deleteAssistantSiteCredential DELETEs /assistant/site-credential", async () => {
  const cleared = { isSet: false, masked: null, provider: "anthropic", baseUrl: null, model: null, updatedAt: null };
  const { calls } = stubFetchCapturing(okJson({ data: cleared }));
  const result = await api.deleteAssistantSiteCredential();
  expect(calls[0].url).toBe(`${BASE}/assistant/site-credential`);
  expect(calls[0].init?.method).toBe("DELETE");
  expect(result).toEqual({ data: cleared });
});

// --- getAdminExecutionCredential / setAdminExecutionCredential / deleteAdminExecutionCredential ---

test("getAdminExecutionCredential GETs /assistant/execution-credential", async () => {
  const view = { isSet: true, masked: "••••abcd", protocol: "anthropic", providerId: "anthropic", baseUrl: null, model: "claude-sonnet-4-5", maxTokens: null, updatedAt: null };
  const { calls } = stubFetchCapturing(okJson({ data: view }));
  const result = await api.getAdminExecutionCredential();
  expect(calls[0].url).toBe(`${BASE}/assistant/execution-credential`);
  expect(calls[0].init?.method).toBeUndefined();
  expect(result).toEqual({ data: view });
});

test("setAdminExecutionCredential PUTs the patch verbatim", async () => {
  const { calls, body } = stubFetchCapturing(
    okJson({ data: { isSet: true, masked: "••••wxyz", protocol: "openai", providerId: "openai", baseUrl: null, model: "gpt-4o", maxTokens: null, updatedAt: null } })
  );
  await api.setAdminExecutionCredential({ apiKey: "sk-new", protocol: "openai", model: "gpt-4o" });
  expect(calls[0].url).toBe(`${BASE}/assistant/execution-credential`);
  expect(calls[0].init?.method).toBe("PUT");
  expect(body()).toEqual({ apiKey: "sk-new", protocol: "openai", model: "gpt-4o" });
});

test("setAdminExecutionCredential throws ApiError with code SECRET_STORE_UNCONFIGURED when no root key is configured", async () => {
  stubFetchCapturing(errJson(503, "no master key configured", "SECRET_STORE_UNCONFIGURED"));
  const error = await api.setAdminExecutionCredential({ apiKey: "sk-new" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("SECRET_STORE_UNCONFIGURED");
  expect((error as ApiError).status).toBe(503);
});

test("deleteAdminExecutionCredential DELETEs /assistant/execution-credential", async () => {
  const cleared = { isSet: false, masked: null, protocol: "anthropic", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null };
  const { calls } = stubFetchCapturing(okJson({ data: cleared }));
  const result = await api.deleteAdminExecutionCredential();
  expect(calls[0].url).toBe(`${BASE}/assistant/execution-credential`);
  expect(calls[0].init?.method).toBe("DELETE");
  expect(result).toEqual({ data: cleared });
});
