import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth.js";
import { createAssistantExecutionModule } from "../runtime/composition/modules/assistant-execution.js";
import { setSiteAssistantCredential } from "../../assistant/index.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Route-level tests for the admin "Execution mode" tab's 4 probe routes (Local CLI detect,
 * per-agent CLI re-check, BYOK connection test, BYOK model discovery).
 *
 * Real auth throughout, mirroring `admin-assistant-settings-routes.test.ts`. `detect-agents` and
 * `test-agent` both call the real `@jini-ai/agent-runtime` `detectAgents()` — a local PATH probe
 * with no network access, so exercising it for real is safe and fast. `test-connection`/
 * `list-models`'s SUCCESS paths make a real outbound HTTP request, which this suite deliberately
 * does not exercise (no live external dependency in a scoped test run); what it certifies instead is
 * the wiring these routes actually own: auth gating, workspace-mismatch 404, request validation, and
 * — for a base URL that resolves to a blocked private address — the real, no-network SSRF-guard
 * rejection path, proving the request actually reaches `@jini-ai/agent-runtime`'s real functions
 * rather than a stub.
 *
 * `test-agent`'s installed/authenticated/model-mismatch/success branches all depend on which CLIs
 * are actually on the host's PATH and their live auth state — machine-dependent, not something this
 * suite can force deterministically without a fake-CLI test seam (route calls `detectAgents()`
 * directly, not through an injectable dep, and this repo's Node version needs an experimental flag
 * for `mock.module()` — see `database-migrate-forward-routes.test.ts`'s note on the same
 * constraint). Only the agent-id-not-found branch is exercised here, since it holds on every host
 * regardless of what's installed. The other branches (installed/authenticated/model-mismatch/
 * success) are covered instead at `../routes/admin/assistant/__tests__/resolve-test-agent-outcome.
 * test.ts`, against `resolveTestAgentOutcome` — the pure decision function `test-agent.ts` was split
 * into specifically so those branches don't need a real CLI or a module mock to test.
 */

const WORKSPACE_ID = "workspace-local";
const DETECT_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution/detect-agents`;
const TEST_CONNECTION_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution/test-connection`;
const LIST_MODELS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution/models`;
const TEST_AGENT_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution/test-agent`;

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createAssistantExecutionModule(deps).registerRoutes?.(app);
  return { app, deps };
}

/** Mirrors `admin-assistant-settings-routes.test.ts`'s identical helper. */
let grantCounter = 0;
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-exec-${suffix}`;
  const policyId = `grant-policy-exec-${suffix}`;
  const username = `grant-exec-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ") || "(none)"}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("grant-pw"),
  });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-policy-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({ id: `grant-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function post(baseUrl: string, path: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

test("all 4 routes require a session — an unauthenticated caller never reaches them", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  assert.equal((await post(baseUrl, DETECT_PATH, "", {})).status, 401);
  assert.equal((await post(baseUrl, TEST_CONNECTION_PATH, "", {})).status, 401);
  assert.equal((await post(baseUrl, LIST_MODELS_PATH, "", {})).status, 401);
  assert.equal((await post(baseUrl, TEST_AGENT_PATH, "", {})).status, 401);
});

test("all 4 routes require admin.assistant.manage — a signed-in principal without it gets 403", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["content.write"]);

  for (const res of [
    await post(baseUrl, DETECT_PATH, cookie, {}),
    await post(baseUrl, TEST_CONNECTION_PATH, cookie, {}),
    await post(baseUrl, LIST_MODELS_PATH, cookie, {}),
    await post(baseUrl, TEST_AGENT_PATH, cookie, {}),
  ]) {
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string; details: { permission: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "admin.assistant.manage");
  }
});

test("a workspace id that is not this site's is 404, on all 4 routes", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const otherBase = "/api/admin/v1/workspaces/some-other-workspace/assistant/execution";

  assert.equal((await post(baseUrl, `${otherBase}/detect-agents`, cookie, {})).status, 404);
  assert.equal((await post(baseUrl, `${otherBase}/test-connection`, cookie, {})).status, 404);
  assert.equal((await post(baseUrl, `${otherBase}/models`, cookie, {})).status, 404);
  assert.equal((await post(baseUrl, `${otherBase}/test-agent`, cookie, {})).status, 404);
});

test("detect-agents returns a data array (real, no-network local-CLI probe)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, DETECT_PATH, cookie, {});
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { data: unknown[] };
  assert.ok(Array.isArray(body.data));
});

test("test-agent rejects a missing agentId with 400 before any PATH probe", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, TEST_AGENT_PATH, cookie, {});
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "BAD_REQUEST");
  assert.match(body.error, /agentId/);
});

test("test-agent rejects a blank/whitespace-only agentId with 400, same as missing", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, TEST_AGENT_PATH, cookie, { agentId: "   " });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "BAD_REQUEST");
});

test("test-agent reports ok:false for an agentId not present in the real detectAgents() result (real, no-network local-CLI probe)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // No id this repo's `@jini-ai/agent-runtime` registers will ever equal this string, so this
  // branch is deterministic regardless of which CLIs happen to be installed on the host running
  // the suite (see this file's header note on why the installed/authenticated branches are not
  // exercised here).
  const res = await post(baseUrl, TEST_AGENT_PATH, cookie, { agentId: "not-a-real-agent-id-zzz" });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; message: string };
  assert.equal(body.ok, false);
  assert.match(body.message, /was not found on this server's PATH/);
});

test("test-connection rejects an unsupported protocol with 400 before any network access", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, TEST_CONNECTION_PATH, cookie, {
    protocol: "ollama",
    baseUrl: "https://example.com",
    apiKey: "k",
    model: "m",
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { code: string }).code, "VALIDATION_ERROR");
});

test("test-connection rejects a missing baseUrl/model with 400", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, TEST_CONNECTION_PATH, cookie, { protocol: "anthropic", apiKey: "k" });
  assert.equal(res.status, 400);
});

test("test-connection surfaces the real SSRF guard as ok:false for an internal base url, proving real delegation", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, TEST_CONNECTION_PATH, cookie, {
    protocol: "anthropic",
    baseUrl: "http://10.0.0.5",
    apiKey: "k",
    model: "claude-sonnet-4-5",
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; message: string };
  assert.equal(body.ok, false);
  assert.match(body.message, /forbidden|internal/i);
});

test("test-connection surfaces the real local empty-api-key guard as ok:false, not a raw upstream call", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Reproduces the reported bug's underlying gap: this route validates
  // `baseUrl`/`model` but never `apiKey`, so an empty key used to sail
  // straight through to the provider and come back as a confusing upstream
  // error ("Method doesn't allow unregistered callers" for Google). This
  // proves the fix's local guard (`@jini-ai/agent-runtime`'s
  // `testProviderConnection`) is actually reached through this route.
  const res = await post(baseUrl, TEST_CONNECTION_PATH, cookie, {
    protocol: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "",
    model: "gemini-2.5-flash",
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; message: string };
  assert.equal(body.ok, false);
  assert.match(body.message, /no api key/i);
});

test("list-models surfaces the real local empty-api-key guard as ok:false, not a raw upstream call", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, {
    protocol: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "",
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; models: string[]; message?: string };
  assert.equal(body.ok, false);
  assert.deepEqual(body.models, []);
  assert.match(body.message ?? "", /no api key/i);
});

test("list-models rejects an unsupported protocol with 400 before any network access", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, { protocol: "bedrock", baseUrl: "https://example.com", apiKey: "k" });
  assert.equal(res.status, 400);
});

test("list-models surfaces the real SSRF guard as ok:false for an internal base url", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, {
    protocol: "openai",
    baseUrl: "http://10.0.0.5",
    apiKey: "k",
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; models: string[] };
  assert.equal(body.ok, false);
  assert.deepEqual(body.models, []);
});

/**
 * --- ADR-058 write-only boundary: where the STORED site key is allowed to travel -------------
 *
 * The exposure these cover: both probe routes accept `useStoredCredential: true`, decrypt the
 * workspace's site key, and make one outbound call — while taking `baseUrl` from the request body.
 * A principal who may never READ that key (`get-site-credential.ts` returns only `isSet`/`masked`)
 * could therefore have the server deliver it to a host they control, in one request, leaving
 * nothing persisted to notice afterwards.
 *
 * The SSRF guard does not cover this and is not meant to: it rejects internal address space
 * (loopback/RFC1918/link-local), which is why these tests can use a real loopback listener as the
 * "attacker" endpoint at all — the guard waves it through exactly as it would wave through any
 * public host an attacker had registered.
 *
 * So the assertion that matters is not the status code, it is `capture.requests.length === 0`: a
 * real server that would have recorded the key, proving absence of delivery rather than presence of
 * a rejection. Status codes can be right while bytes still leave.
 */

interface CaptureServer {
  url: string;
  requests: { authorization: string | undefined; xApiKey: string | undefined; xGoogApiKey: string | undefined }[];
}

/** A stand-in provider endpoint that records what actually reached it. Answers every method and
 *  path with a permissive body so no provider adapter hangs waiting on a shape it expects. */
async function startCaptureServer(t: import("node:test").TestContext): Promise<CaptureServer> {
  const capture: CaptureServer = { url: "", requests: [] };
  const app = express();
  app.use(express.json());
  app.use((req, res) => {
    capture.requests.push({
      authorization: req.header("authorization"),
      xApiKey: req.header("x-api-key"),
      xGoogApiKey: req.header("x-goog-api-key"),
    });
    res.json({ data: [{ id: "captured-model" }], models: [{ name: "captured-model" }], choices: [{ message: { content: "ok" } }] });
  });
  capture.url = await startTestServer(app, t);
  return capture;
}

const STORED_KEY = "sk-stored-site-key-abcd1234";

/** Seeds the workspace's SITE credential through the real store (real sealing, real keyring), so
 *  these tests exercise the same decrypt path the routes use rather than a hand-placed plaintext. */
async function seedStoredCredential(deps: RouteDeps, input: { baseUrl?: string }): Promise<void> {
  await setSiteAssistantCredential(
    {
      repo: deps.siteAssistantCredentialRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      clock: deps.clock,
    },
    {
      workspaceId: deps.workspaceId,
      apiKey: STORED_KEY,
      provider: "openai",
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
      model: "gpt-4o-mini",
    }
  );
}

test("test-connection never sends the stored site key to a baseUrl the request body chose", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const attacker = await startCaptureServer(t);
  await seedStoredCredential(deps, { baseUrl: "https://api.openai.com" });

  const res = await post(baseUrl, TEST_CONNECTION_PATH, cookie, {
    protocol: "openai",
    baseUrl: attacker.url,
    model: "gpt-4o-mini",
    useStoredCredential: true,
  });

  assert.equal(res.status, 400, await res.clone().text());
  assert.equal(((await res.json()) as { code: string }).code, "STORED_CREDENTIAL_ENDPOINT_MISMATCH");
  // The load-bearing assertion — nothing reached the attacker's listener at all.
  assert.deepEqual(attacker.requests, []);
});

test("list-models never sends the stored site key to a baseUrl the request body chose", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const attacker = await startCaptureServer(t);
  await seedStoredCredential(deps, { baseUrl: "https://api.openai.com" });

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, {
    protocol: "openai",
    baseUrl: attacker.url,
    useStoredCredential: true,
  });

  assert.equal(res.status, 400, await res.clone().text());
  assert.equal(((await res.json()) as { code: string }).code, "STORED_CREDENTIAL_ENDPOINT_MISMATCH");
  assert.deepEqual(attacker.requests, []);
});

test("a stored credential with no saved endpoint is refused rather than sent to the requested one", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const attacker = await startCaptureServer(t);
  // No baseUrl ever saved — the server has no approved destination, so it must not accept one here.
  await seedStoredCredential(deps, {});

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, {
    protocol: "openai",
    baseUrl: attacker.url,
    useStoredCredential: true,
  });

  assert.equal(res.status, 400, await res.clone().text());
  assert.equal(((await res.json()) as { code: string }).code, "STORED_CREDENTIAL_ENDPOINT_UNSET");
  assert.deepEqual(attacker.requests, []);
});

test("the stored key IS sent when the requested endpoint matches the one saved for it", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const provider = await startCaptureServer(t);
  await seedStoredCredential(deps, { baseUrl: provider.url });

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, {
    protocol: "openai",
    baseUrl: provider.url,
    useStoredCredential: true,
  });

  assert.equal(res.status, 200, await res.clone().text());
  // The feature still works: this is what an operator returning to a screen with a saved key needs,
  // and a fix that quietly broke it would be indistinguishable here from one that held the boundary.
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.requests[0]?.authorization, `Bearer ${STORED_KEY}`);
});

test("a trailing-slash difference is the same endpoint, not a mismatch", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const provider = await startCaptureServer(t);
  await seedStoredCredential(deps, { baseUrl: `${provider.url}/` });

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, {
    protocol: "openai",
    baseUrl: provider.url,
    useStoredCredential: true,
  });

  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(provider.requests.length, 1);
});

test("a key typed into THIS request still goes wherever the caller named — the pin binds only the stored one", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const chosen = await startCaptureServer(t);
  await seedStoredCredential(deps, { baseUrl: "https://api.openai.com" });

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, {
    protocol: "openai",
    baseUrl: chosen.url,
    apiKey: "sk-typed-by-the-operator",
    useStoredCredential: true,
  });

  assert.equal(res.status, 200, await res.clone().text());
  // Their own key, their own choice of host — the operator can consent with a credential they hold.
  // Proving this still works is what keeps the fix targeted rather than a blanket restriction.
  assert.equal(chosen.requests.length, 1);
  assert.equal(chosen.requests[0]?.authorization, "Bearer sk-typed-by-the-operator");
  assert.notEqual(chosen.requests[0]?.authorization, `Bearer ${STORED_KEY}`);
});
