import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { ExecutionCredentialPort, ResolvedProviderCredential } from "@jini-ai/agent-runtime/providers/credentials";
import type { ByokToolSurface } from "#src/assistant/index";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { createRouteDeps } from "../../app.js";
import { FEDERATION_TURN_WAIT_MS, SYSTEM_PREAMBLE, prepareByokTurnSetup } from "../assistant-byok-preflight.js";
import type { ByokTurnContext } from "../assistant-byok-turn.js";

// Direct calls into the turn setup: the abort controller is the turn's own, so each cancellation
// window is entered deterministically instead of racing a real socket close.

const credential = { protocol: "anthropic", apiKey: "fake-one", model: "model-a" } as ResolvedProviderCredential;

function recordingResponse() {
  const answers: Array<{ status: number; body: unknown }> = [];
  let status = 200;
  const res = {
    locals: { principal: { id: "owner-1", kind: "user" } },
    status(code: number) { status = code; return res; },
    json(body: unknown) { answers.push({ status, body }); return res; },
  };
  return { res: res as unknown as Response, answers };
}

function surface({ ready, onFederation, refusalPrefix }: { ready?: Promise<void>; onFederation?: () => void; refusalPrefix?: () => string }) {
  const federationWaits: unknown[] = [];
  const toolSurface = {
    ...(ready ? { ready } : {}),
    awaitFederation: async (input: unknown) => { federationWaits.push(input); onFederation?.(); return { settled: true }; },
    ...(refusalPrefix ? { federation: { refusalPrefix } } : {}),
  } as unknown as ByokToolSurface;
  return { toolSurface, federationWaits };
}

async function setup({ body, toolSurface, abort = new AbortController() }: { body: unknown; toolSurface: ByokToolSurface; abort?: AbortController }) {
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const resolved: Array<{ workspaceId: string; principalId: string }> = [];
  const credentialPort = { resolve: async ({ workspaceId, principalId }: { workspaceId: string; principalId: string }) => {
    resolved.push({ workspaceId, principalId });
    return credential;
  } } as unknown as ExecutionCredentialPort;
  const { res, answers } = recordingResponse();
  const context = { routeDeps, reporter: createRouteIncidentReporter().reporter, resolvedToolSurface: toolSurface, credentialPort,
    liveToolRuns: new Map() } as unknown as ByokTurnContext;
  const result = await prepareByokTurnSetup({ req: { body } as Request, res, context, abort });
  return { result, answers, resolved, workspaceId: routeDeps.workspaceId };
}

const userTurn = { messages: [{ role: "user", content: "Hello there" }] };

test("a surface with no ready promise goes straight to the bounded federation wait and the bare prompt", async () => {
  const { toolSurface, federationWaits } = surface({});
  const { result, answers, resolved, workspaceId } = await setup({ body: userTurn, toolSurface });
  assert.deepEqual(answers, []);
  assert.deepEqual(resolved, [{ workspaceId, principalId: "owner-1" }]);
  assert.deepEqual(federationWaits, [{ timeoutMs: FEDERATION_TURN_WAIT_MS }]);
  assert.equal(result?.system, SYSTEM_PREAMBLE);
  assert.equal(result?.credential, credential);
  assert.deepEqual(result?.principal, { id: "owner-1" });
});

test("a browser that leaves while extension tools load gets no federation wait and no turn", async () => {
  const abort = new AbortController();
  const { toolSurface, federationWaits } = surface({});
  let loads = 0;
  // The turn reads `ready` only once its inputs resolved; leaving at that moment is the load window.
  Object.defineProperty(toolSurface, "ready", { get: () => { loads++; abort.abort(); return Promise.resolve(); } });
  const { result, answers } = await setup({ body: userTurn, toolSurface, abort });
  assert.equal(loads, 1);
  assert.equal(result, null);
  assert.deepEqual(answers, []);
  assert.deepEqual(federationWaits, []);
});

test("a browser that leaves while the system prompt is composed gets no turn", async () => {
  const abort = new AbortController();
  const prefixReads: string[] = [];
  const { toolSurface, federationWaits } = surface({ ready: Promise.resolve(), refusalPrefix: () => { prefixReads.push("read"); abort.abort(); return "PREFIX"; } });
  const { result, answers } = await setup({ body: userTurn, toolSurface, abort });
  assert.equal(result, null);
  assert.deepEqual(answers, []);
  assert.equal(federationWaits.length, 1);
  assert.deepEqual(prefixReads, ["read"]);
});

test("an attachment reference the store does not hold is a 400 that asks to reattach", async () => {
  const { toolSurface, federationWaits } = surface({});
  const { result, answers } = await setup({ body: { ...userTurn, attachmentIds: ["att-missing"] }, toolSurface });
  assert.equal(result, null);
  assert.deepEqual(answers, [{ status: 400, body: { error: "Attachment is unavailable. Reattach it before sending.", code: "VALIDATION_ERROR" } }]);
  assert.deepEqual(federationWaits, []);
});
