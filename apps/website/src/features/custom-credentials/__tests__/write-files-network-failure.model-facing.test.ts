/**
 * @file Regression suite for `custom_credential_write_files`' network-failure branch (2026-09-16, w7).
 *
 * The defect: when a GitHub call failed before any response arrived, `github-write-files.ts`'s
 * `githubSend` kept the thrown error's raw text as the failure `message`, and after the human confirmed,
 * `performGitHubFilesWrite` returned that text in `{ executed: false, reason: "error", message }` —
 * straight to the model. That text is transport internals (`connect ECONNREFUSED 10.0.4.7:443`) or an
 * egress refusal naming the address a host resolved to. The plan phase had the same text: its throw is
 * redacted on the wire, but the daemon records the thrown message in the run's `tool_result` event.
 *
 * Driven through the REAL delegated-tool transport, with the human's confirmation delivered through a
 * real `SurfaceExchangeStore`. The saved token and the transport text both carry a `LEAK-` marker that
 * must appear nowhere: not in the result, not in any run event, not in the server log.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { EgressRefusedError, type HttpClientPort, type HttpRequest, type HttpResponse } from "../../../platform/http/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential } from "../store.js";
import { buildCustomCredentialsRegistrations, type CustomCredentialsToolDeps } from "../tool-registrations.js";
import { WRITE_FILES_TOOL_ID } from "../write-files-confirmation-ui.js";

const WORKSPACE_ID = "ws-cred-write-files-network";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-16T00:00:00.000Z";
const LEAK_MARKER = "LEAK-";
const SAVED_TOKEN = "LEAK-GITHUB-TOKEN-5d0e";
const INTERNAL_ADDRESS = "10.0.4.7";

const VALID_INPUT = { label: "github", owner: "octo", repo: "demo", branch: "main", commitMessage: "deploy", files: [{ path: "fly.toml", content: "app = 'demo'" }] };

type Step = { match: RegExp; status: number; json?: unknown } | { match: RegExp; error: Error };

/** Sequential `HttpClientPort` double: each call consumes the next step, answering or throwing. */
class SteppedHttpClient implements HttpClientPort {
  constructor(private readonly steps: Step[]) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    const step = this.steps.shift();
    if (!step) throw new Error(`unexpected send() call: ${request.method} ${request.url}`);
    if (!step.match.test(request.url)) throw new Error(`send() ${request.method} ${request.url} did not match ${step.match}`);
    if ("error" in step) throw step.error;
    return { status: step.status, headers: {}, bodyText: JSON.stringify(step.json ?? {}) };
  }
}

const PLAN_STEPS: Step[] = [
  { match: /\/git\/ref\/heads\/main$/, status: 200, json: { object: { sha: "parent-sha" } } },
  { match: /\/git\/commits\/parent-sha$/, status: 200, json: { tree: { sha: "base-tree-sha" } } },
  { match: /\/contents\/fly\.toml\?ref=main$/, status: 404, json: {} },
];

/** A transport failure whose text carries an internal address and — the worst case for an adapter
 *  that echoes its request — the Authorization header value. */
function leakyTransportError(): Error {
  return Object.assign(new Error(`request failed (Authorization: Bearer ${SAVED_TOKEN}): connect ECONNREFUSED ${INTERNAL_ADDRESS}:443`), { code: "ECONNREFUSED" });
}

async function buildHarness(steps: Step[]) {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  let counter = 0;
  const idGen = { newId: () => `cred-${++counter}` };
  const clock = { nowIso: () => NOW };
  await createCustomCredential(
    { repo, sealer, keyring, clock, idGen },
    { workspaceId: WORKSPACE_ID, label: "github", category: "source-control", baseUrl: "https://api.github.com", connection: { token: SAVED_TOKEN } }
  );

  const logLines: string[] = [];
  const deps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock,
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    idGen,
    customCredentialsHttpClient: new SteppedHttpClient([...steps]),
    customCredentialsFailureLog: (line) => logLines.push(line),
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };

  const surfaceExchanges: SurfaceExchangeStore = createSurfaceExchangeStore();
  const openedExchangeIds: string[] = [];
  const observedExchanges: SurfaceExchangeStore = Object.assign(Object.create(surfaceExchanges) as SurfaceExchangeStore, {
    open: (...args: Parameters<SurfaceExchangeStore["open"]>) => {
      const exchange = surfaceExchanges.open(...args);
      openedExchangeIds.push(exchange.id);
      return exchange;
    },
  });

  const registry = createToolRegistry();
  for (const registration of buildCustomCredentialsRegistrations(deps, { surfaceExchanges: observedExchanges })) registry.register(registration);
  const eventLog = createInMemoryEventLog();
  const lifecycle = createRunLifecycle({ eventLog });
  const toolExecutor = createToolExecutor({ registry });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { surfaceExchanges, openedExchangeIds, eventLog, lifecycle, toolExecutor, run, logLines };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

/** Calls write_files through the real transport, confirms the dialog as the human, and returns what the model and the run saw. */
async function confirmWrite(harness: Harness) {
  const pending = delegatedToolExecuteRoute.handle(
    { runId: harness.run.id, toolUseId: "tu-1", toolId: WRITE_FILES_TOOL_ID, input: VALID_INPUT },
    { lifecycle: harness.lifecycle, toolExecutor: harness.toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) } as never
  );
  for (let tick = 0; tick < 200 && harness.openedExchangeIds.length === 0; tick++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const exchangeId = harness.openedExchangeIds[0];
  assert.ok(exchangeId, "the confirmation must be raised before it can be answered");
  assert.ok(harness.surfaceExchanges.deliver({ exchangeId, toolId: WRITE_FILES_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } }));

  const wire = await pending;
  const events = await harness.eventLog.replay(harness.run.id, null);
  return { wireText: JSON.stringify(wire), eventsText: JSON.stringify(events) };
}

/** Calls write_files through the real transport when the plan phase fails, so no confirmation is ever raised. */
async function callUnconfirmed(harness: Harness) {
  const wire = await delegatedToolExecuteRoute.handle(
    { runId: harness.run.id, toolUseId: "tu-1", toolId: WRITE_FILES_TOOL_ID, input: VALID_INPUT },
    { lifecycle: harness.lifecycle, toolExecutor: harness.toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) } as never
  );
  const events = await harness.eventLog.replay(harness.run.id, null);
  return { wireText: JSON.stringify(wire), eventsText: JSON.stringify(events) };
}

function assertNowhere(haystacks: Record<string, string>, needle: string) {
  for (const [where, text] of Object.entries(haystacks)) {
    assert.ok(!text.includes(needle), `'${needle}' reached the ${where}: ${text}`);
  }
}

test("a network failure after confirmation returns a caller-safe message: no transport text, no address, no token — anywhere", async () => {
  const harness = await buildHarness([...PLAN_STEPS, { match: /\/git\/blobs$/, error: leakyTransportError() }]);

  const { wireText, eventsText } = await confirmWrite(harness);

  const haystacks = { "model-facing result": wireText, "run events": eventsText, log: harness.logLines.join("\n") };
  assertNowhere(haystacks, LEAK_MARKER);
  assertNowhere(haystacks, INTERNAL_ADDRESS);
  assertNowhere({ "model-facing result": wireText }, "ECONNREFUSED");
  assert.match(
    wireText,
    /"executed":false,"cancelled":false,"reason":"error","message":"GitHub could not be reached: the request failed before any response arrived \(a network error or timeout\)\."/
  );
  assert.equal(harness.logLines.length, 1, harness.logLines.join("\n"));
  assert.match(harness.logLines[0]!, /custom_credential_write_files: commit failed code=network-unreachable detail=Error\(ECONNREFUSED\)$/);
});

test("an egress refusal after confirmation reaches the model without the resolved address; the log keeps the full refusal", async () => {
  const refusal = new EgressRefusedError(`egress to 'api.github.com' (${INTERNAL_ADDRESS}) rejected: resolved address is private`, {
    callerSafeMessage: "egress to 'api.github.com' rejected: resolved address is private",
  });
  const harness = await buildHarness([...PLAN_STEPS, { match: /\/git\/blobs$/, error: refusal }]);

  const { wireText, eventsText } = await confirmWrite(harness);

  assertNowhere({ "model-facing result": wireText, "run events": eventsText }, INTERNAL_ADDRESS);
  assertNowhere({ "model-facing result": wireText, "run events": eventsText, log: harness.logLines.join("\n") }, LEAK_MARKER);
  assert.match(wireText, /"reason":"error","message":"the request to GitHub was refused: egress to 'api\.github\.com' rejected: resolved address is private"/);
  assert.equal(harness.logLines.length, 1, harness.logLines.join("\n"));
  assert.match(harness.logLines[0]!, /commit failed code=network-unreachable detail=egress to 'api\.github\.com' \(10\.0\.4\.7\) rejected: resolved address is private$/);
});

test("a network failure while planning, before any confirmation, keeps the transport text out of the result, the run, and the log", async () => {
  const harness = await buildHarness([{ match: /\/git\/ref\/heads\/main$/, error: leakyTransportError() }]);

  const { wireText, eventsText } = await callUnconfirmed(harness);

  assert.equal(harness.openedExchangeIds.length, 0, "a failed plan must not raise a confirmation");
  const haystacks = { "model-facing result": wireText, "run events": eventsText, log: harness.logLines.join("\n") };
  assertNowhere(haystacks, LEAK_MARKER);
  assertNowhere(haystacks, INTERNAL_ADDRESS);
  assertNowhere({ "model-facing result": wireText, "run events": eventsText }, "ECONNREFUSED");
  assert.equal(harness.logLines.length, 1, harness.logLines.join("\n"));
  assert.match(harness.logLines[0]!, /custom_credential_write_files: plan failed code=network-unreachable detail=Error\(ECONNREFUSED\)$/);
});

test("a provider rejection after confirmation still carries GitHub's own reason — the allowlist does not blank real reasons", async () => {
  const harness = await buildHarness([...PLAN_STEPS, { match: /\/git\/blobs$/, status: 422, json: { message: "Invalid blob content" } }]);

  const { wireText } = await confirmWrite(harness);

  assert.match(wireText, /"reason":"error","message":"GitHub blob creation failed: Invalid blob content"/);
  assert.ok(!wireText.includes(LEAK_MARKER), wireText);
});
