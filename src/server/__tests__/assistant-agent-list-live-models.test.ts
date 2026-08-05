import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "../../assistant/daemon-auth";
import { setExecutionCredential } from "../../assistant/execution-credential-store";
import { resetLiveModelCacheForTesting } from "../../assistant/live-model-cache";
import { startTestServer, loginAsOwner } from "./helpers/http-test-server";

/**
 * @file Route-level coverage for `respondWithEnrichedAgentList` (`server/modules/assistant.ts`) —
 * the `GET /api/agents` / `POST /api/agents/rescan` handler that replaced the raw streaming
 * `proxyPassthrough` for those two routes. Complements `live-model-cache.test.ts` (which proves the
 * credential/cache/union logic in isolation) by proving the wiring: the real session-authenticated
 * principal and workspace id reach `getLiveClaudeModels`, only the `claude` entry is touched, and a
 * daemon-provided entry with no matching credential is relayed byte-identical.
 *
 * Mirrors `assistant-proxy-routes.test.ts`'s stand-in-daemon harness (same `JINI_AGENT_DAEMON_URL`
 * env-var-before-first-import constraint — see that file's own doc), but the stand-in here answers
 * the actual `{agents: AgentSummary[]}` shape `listAssistantAgents()` produces, not the runs-list
 * shape the sibling file uses.
 */

const CLAUDE_FALLBACK_MODELS = [
  { id: "default", label: "Default" },
  { id: "sonnet", label: "Sonnet (alias)" },
  { id: "opus", label: "Opus (alias)" },
  { id: "haiku", label: "Haiku (alias)" },
  { id: "claude-opus-5", label: "claude-opus-5" },
];
const CLAUDE_AGENT = {
  id: "claude",
  name: "Claude Code",
  available: true,
  supportsCustomModel: true,
  models: CLAUDE_FALLBACK_MODELS,
  modelsSource: "fallback",
};
/** A second, non-`claude` entry — every test asserts this one is relayed untouched, proving the
 *  enrichment step is scoped to `id === "claude"` and not applied blanket-wide. */
const CODEX_AGENT = {
  id: "codex",
  name: "Codex",
  available: true,
  supportsCustomModel: true,
  models: [{ id: "gpt-5-codex", label: "gpt-5-codex" }],
  modelsSource: "fallback",
};

let daemonRequestCount = 0;

async function startStandInDaemon(): Promise<{ origin: string; server: Server }> {
  const server = createServer((req, res) => {
    daemonRequestCount += 1;
    res.writeHead(200, { "content-type": "application/json" });
    // `?shapeMismatch=1` is a test-only escape hatch (real `@jini-ai/http-kit` routes never answer
    // this shape) for the "2xx but no agents array" test below — everything else always gets the
    // normal shape.
    if ((req.url ?? "").includes("shapeMismatch=1")) {
      res.end(JSON.stringify({ unexpected: "shape", note: "not an agents array" }));
      return;
    }
    res.end(JSON.stringify({ agents: [CLAUDE_AGENT, CODEX_AGENT] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, server };
}

/** A stand-in Anthropic-shaped `/v1/models` endpoint for the "credential present" tests. Real
 *  loopback HTTP, not a mock — `validateBaseUrlResolved` short-circuits DNS for 127.0.0.1, so this
 *  needs no network/DNS injection (same pattern `live-model-cache.test.ts` uses). */
async function startProviderServer(): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "claude-opus-5-20260101", display_name: "Claude Opus 5 (2026-01-01)" }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

let harnessPromise: Promise<{
  buildApp: () => express.Express;
  daemon: Server;
  deps: import("../routes/types").RouteDeps;
}> | null = null;
function harness() {
  harnessPromise ??= (async () => {
    const { origin, server } = await startStandInDaemon();
    process.env.JINI_AGENT_DAEMON_URL = origin;
    process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = "f".repeat(64);

    const { createRouteDeps } = await import("../app");
    const { createAssistantModule } = await import("../modules/assistant");
    const { registerAuthRoutes } = await import("../middleware/dev-auth");
    const { createSurfaceExchangeStore } = await import("../../assistant/surface-exchanges");

    const deps = createRouteDeps();
    return {
      daemon: server,
      deps,
      buildApp: () => {
        const app = express();
        app.use(express.json());
        registerAuthRoutes(app, deps);
        createAssistantModule(deps, createSurfaceExchangeStore()).registerRoutes(app);
        return app;
      },
    };
  })();
  return harnessPromise;
}

async function bootProxy(t: import("node:test").TestContext) {
  const { buildApp, deps } = await harness();
  daemonRequestCount = 0;
  const baseUrl = await startTestServer(buildApp(), t);
  const cookie = await loginAsOwner(baseUrl);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as {
    user: { id: string };
  };
  return { baseUrl, cookie, deps, principalId: me.user.id };
}

test.after(async () => {
  const built = await harnessPromise;
  if (built) await new Promise<void>((resolve) => built.daemon.close(() => resolve()));
});

// Runs first, deliberately, before any test below stores a credential for the shared seeded owner
// account `loginAsOwner` always authenticates as — see this file's header for why the harness
// intentionally shares one `deps` (and therefore one credential repo) across every test here.

test("no stored admin credential leaves the daemon's agent list byte-identical, including modelsSource", async (t) => {
  resetLiveModelCacheForTesting();
  const { baseUrl, cookie } = await bootProxy(t);

  const res = await fetch(`${baseUrl}/api/agents`, { headers: { cookie } });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { agents: [CLAUDE_AGENT, CODEX_AGENT] });
  assert.equal(daemonRequestCount, 1, "the daemon must still be called exactly once — no credential is not a skip");
});

test("an anthropic admin credential enriches only the claude entry, unioned with the fallback list", async (t) => {
  resetLiveModelCacheForTesting();
  const { baseUrl, cookie, deps, principalId } = await bootProxy(t);
  const provider = await startProviderServer();
  t.after(() => new Promise<void>((resolve) => provider.server.close(() => resolve())));

  await setExecutionCredential(
    {
      repo: deps.adminExecutionCredentialRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      clock: deps.clock,
    },
    { workspaceId: deps.workspaceId, principalId, apiKey: "sk-ant-test-key", protocol: "anthropic", baseUrl: provider.baseUrl },
  );

  const res = await fetch(`${baseUrl}/api/agents`, { headers: { cookie } });
  const body = (await res.json()) as { agents: Array<{ id: string; models: unknown; modelsSource: string }> };

  const claude = body.agents.find((agent) => agent.id === "claude");
  const codex = body.agents.find((agent) => agent.id === "codex");
  assert.ok(claude, "expected a claude entry in the response");
  assert.equal(claude?.modelsSource, "live");
  assert.deepEqual(claude?.models, [
    ...CLAUDE_FALLBACK_MODELS,
    { id: "claude-opus-5-20260101", label: "Claude Opus 5 (2026-01-01)" },
  ]);
  assert.deepEqual(codex, CODEX_AGENT, "a non-claude entry must be relayed untouched");
});

test("POST /api/agents/rescan gets the same enrichment as GET /api/agents", async (t) => {
  resetLiveModelCacheForTesting();
  const { baseUrl, cookie, deps, principalId } = await bootProxy(t);
  const provider = await startProviderServer();
  t.after(() => new Promise<void>((resolve) => provider.server.close(() => resolve())));

  await setExecutionCredential(
    {
      repo: deps.adminExecutionCredentialRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      clock: deps.clock,
    },
    { workspaceId: deps.workspaceId, principalId, apiKey: "sk-ant-test-key", protocol: "anthropic", baseUrl: provider.baseUrl },
  );

  const res = await fetch(`${baseUrl}/api/agents/rescan`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
  });
  const body = (await res.json()) as { agents: Array<{ id: string; modelsSource: string }> };

  const claude = body.agents.find((agent) => agent.id === "claude");
  assert.equal(claude?.modelsSource, "live", "rescan must go through the same enrichment as the GET route");
});

test("a 2xx daemon response missing the agents array is relayed unmodified and logs a warning — the dangerous silent-degradation path", async (t) => {
  resetLiveModelCacheForTesting();
  const { baseUrl, cookie } = await bootProxy(t);
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    const res = await fetch(`${baseUrl}/api/agents?shapeMismatch=1`, { headers: { cookie } });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { unexpected: "shape", note: "not an agents array" }, "the daemon's raw body must still reach the browser");
    assert.equal(warnings.length, 1, "an unexpected 2xx shape must log exactly one warning — this is the case an operator has no other way to see");
    assert.match(String(warnings[0][0]), /without an 'agents' array/);
  } finally {
    console.warn = originalWarn;
  }
});
