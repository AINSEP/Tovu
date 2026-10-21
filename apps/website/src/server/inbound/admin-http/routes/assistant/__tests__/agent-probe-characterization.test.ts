import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createNativeAgentRuntime, type DetectedAgent } from "@jini-ai/agent-runtime";
import { createAssistantAgentInventory } from "#src/assistant/agents";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { AssistantExecutionRouteDeps } from "../execution-deps.js";
import { registerAdminAssistantDetectAgentsRoute } from "../detect-agents.js";
import { registerAdminAssistantTestAgentRoute } from "../test-agent.js";

const agent: DetectedAgent = {
  id: "fixture-cli", name: "Fixture CLI", bin: "fixture-cli", versionArgs: ["--version"],
  streamFormat: "text", available: true, authStatus: "ok", models: [{ id: "model-a", label: "Model A" }],
};

function dependencies({ overrides = {} }: { overrides?: Partial<AssistantExecutionRouteDeps> }, _options = {}): AssistantExecutionRouteDeps {
  const unused = () => { throw new Error("unexpected credential access"); };
  return {
    workspaceId: "workspace-test", authorize: async () => ({ allowed: true, reason: "granted" }),
    siteAssistantCredentialRepo: { findByWorkspaceId: unused, upsert: unused, clearKey: unused },
    siteAssistantSecretSealer: { seal: unused, open: unused },
    adminExecutionCredentialRepo: { findByWorkspaceAndPrincipal: unused, upsert: unused, clearKey: unused },
    ...overrides,
  };
}

const readinessCases: { name: string; agents: DetectedAgent[]; model?: string; expected: { ok: boolean; message: string } }[] = [
  { name: "unknown id", agents: [], expected: { ok: false, message: "'fixture-cli' was not found on this server's PATH." } },
  { name: "unavailable CLI", agents: [{ ...agent, available: false }], expected: { ok: false, message: "'fixture-cli' was not found on this server's PATH." } },
  { name: "missing authentication", agents: [{ ...agent, authStatus: "missing" }], expected: { ok: false, message: "Fixture CLI is installed but not authenticated." } },
  { name: "unknown authentication", agents: [{ ...agent, authStatus: "unknown" }], expected: { ok: true, message: "Fixture CLI responded, but its sign-in status could not be verified." } },
  { name: "stale model", agents: [agent], model: "old-model", expected: { ok: false, message: "Fixture CLI is installed and authenticated, but it no longer offers the model 'old-model'. Pick a different model, or Rescan to refresh the list." } },
  { name: "ready with model", agents: [agent], model: "model-a", expected: { ok: true, message: "Fixture CLI is installed and authenticated, and offers 'model-a'." } },
  { name: "ready without model", agents: [agent], expected: { ok: true, message: "Fixture CLI is installed and authenticated." } },
];
for (const scenario of readinessCases) {
  test(`test-agent preserves ${scenario.name} and forces a fresh probe`, async () => {
    const app = express();
    let calls = 0;
    registerAdminAssistantTestAgentRoute(app, dependencies({ overrides: {
      detectAgents: async (input, options) => {
        calls++;
        assert.deepEqual(input, {});
        assert.deepEqual(options, { force: true });
        return scenario.agents;
      },
    } }));
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-test" };
    await extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/assistant/execution/test-agent")({
      params: { workspaceId: "workspace-test" }, body: { agentId: " fixture-cli ", model: scenario.model },
    }, res);
    assert.equal(capture.statusCode, 200);
    assert.deepEqual(capture.jsonBody, scenario.expected);
    assert.equal(calls, 1);
  });
}

for (const force of [undefined, false, "true", true]) {
  test(`detect-agents reads injected inventory with strict force ${String(force)}`, async () => {
    const inventory = createAssistantAgentInventory({
      runtime: createNativeAgentRuntime({ env: { PATH: "/missing", HOME: "/missing" } }),
      detector: async () => [],
    });
    try {
      const app = express();
      const events: unknown[] = [];
      registerAdminAssistantDetectAgentsRoute(app, dependencies({ overrides: {
        assistantAgentInventory: {
          ...inventory,
          listDetectedAssistantAgents: async (input) => { events.push(input); return [agent]; },
          assistantAgentDiscoveryPending: () => { events.push("pending"); return true; },
        },
      } }));
      const { res, capture } = createCapturingResponse();
      res.locals.principal = { id: "principal-test" };
      await extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/assistant/execution/detect-agents")({
        params: { workspaceId: "workspace-test" }, body: { force },
      }, res);
      assert.deepEqual(events, [{ force: force === true }, "pending"]);
      assert.equal(capture.statusCode, 200);
      assert.deepEqual(capture.jsonBody, { data: [{
        id: agent.id, label: agent.name, installed: true, models: agent.models, authStatus: "ok", discoveryPending: true,
      }] });
    } finally { await inventory.dispose({}); }
  });
}

test("test-agent probes through the assistant inventory's runtime when no detector is injected", async () => {
  const inventory = createAssistantAgentInventory({
    runtime: createNativeAgentRuntime({ env: { PATH: "/missing", HOME: "/missing" } }),
    detector: async () => [],
  });
  const forces: unknown[] = [];
  const app = express();
  registerAdminAssistantTestAgentRoute(app, dependencies({ overrides: {
    assistantAgentInventory: {
      ...inventory,
      runtime: { ...inventory.runtime, detectAgents: async (_input, options) => { forces.push(options); return [agent]; } },
    },
  } }));
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/assistant/execution/test-agent")({
    params: { workspaceId: "workspace-test" }, body: { agentId: "fixture-cli" },
  }, res);
  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.jsonBody, { ok: true, message: "Fixture CLI is installed and authenticated." });
  assert.deepEqual(forces, [{ force: true }]);
});

test("test-agent refuses another workspace before authorizing or probing", async () => {
  let authorizeCalls = 0;
  let probes = 0;
  const app = express();
  registerAdminAssistantTestAgentRoute(app, dependencies({ overrides: {
    authorize: async () => { authorizeCalls++; return { allowed: true, reason: "granted" }; },
    detectAgents: async () => { probes++; return [agent]; },
  } }));
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/assistant/execution/test-agent")({
    params: { workspaceId: "other-workspace" }, body: { agentId: "fixture-cli" },
  }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  assert.equal(authorizeCalls, 0);
  assert.equal(probes, 0);
});

/** A shell stub answering the codex def's version and auth probes; every other probe fails. */
const FAKE_CODEX = `#!/bin/sh
case "$1" in
  --version) echo "codex-cli 9.9.9" ;;
  login) echo "Logged in using an API key" ;;
  *) exit 1 ;;
esac
`;

/** Runs the route in a child whose PATH holds only `binDir`, so the default detector sees exactly that. */
const DEFAULT_DETECTOR_CHILD = `
import express from "express";
const { registerAdminAssistantTestAgentRoute } = await import(process.env.ROUTE_URL);
const app = express();
registerAdminAssistantTestAgentRoute(app, { workspaceId: "w", authorize: async () => ({ allowed: true, reason: "granted" }) });
const layer = app._router.stack.find((l) => l.route?.path?.endsWith("/test-agent"));
const res = { locals: { principal: { id: "p" } }, statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(body) { process.stdout.write(JSON.stringify({ status: this.statusCode, body })); } };
await layer.route.stack.at(-1).handle({ params: { workspaceId: "w" }, body: { agentId: process.env.AGENT_ID } }, res);
`;

function runDefaultDetector({ binDir, home, agentId }: { binDir: string; home: string; agentId: string }, _options = {}) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", DEFAULT_DETECTOR_CHILD], {
    cwd: process.cwd(), encoding: "utf8", timeout: 60_000,
    env: { PATH: binDir, HOME: home, TSX_TSCONFIG_PATH: process.env.TSX_TSCONFIG_PATH ?? "", AGENT_ID: agentId,
      ROUTE_URL: new URL("../test-agent.ts", import.meta.url).href },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as { status: number; body: unknown };
}

test("test-agent falls back to the runtime's own detector when neither a detector nor an inventory is wired (isolated PATH)", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "test-agent-default-detector-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binDir = path.join(root, "bin"); const home = path.join(root, "home");
  await mkdir(binDir, { recursive: true }); await mkdir(home, { recursive: true });
  await writeFile(path.join(binDir, "codex"), FAKE_CODEX, { mode: 0o755 });
  assert.deepEqual(runDefaultDetector({ binDir, home, agentId: "codex" }), {
    status: 200, body: { ok: true, message: "Codex CLI codex-cli 9.9.9 is installed and authenticated." },
  });
  // No catalog entry has this id, so the verdict is the same whichever real CLIs this host has.
  assert.deepEqual(runDefaultDetector({ binDir, home, agentId: "no-such-agent-cli" }), {
    status: 200, body: { ok: false, message: "'no-such-agent-cli' was not found on this server's PATH." },
  });
});
