import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, type Principal, type ToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute, type DelegatedToolsHttpDeps } from "@jini-ai/daemon/http";

import { createSurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";
import { createAssistantToolExecutor } from "../tool-executor-stack.js";
import {
  delegatedToolErrorDisclosure,
  describeDelegatedInternalError,
  type DelegatedInternalErrorContext,
  type ToolFailureRecord,
} from "../tool-failure-redaction.js";

/**
 * @file The agent daemon's `/api/delegated-tool-calls` error disclosure — every failure http-kit
 * would otherwise answer with a bare `500 INTERNAL_ERROR: an internal error occurred` (the
 * "daemon 500" a model could neither act on nor report, tool-gaps report gap #10) now carries
 * `Error <ID>: <redacted reason>`. Each test drives the REAL http-kit route with the REAL Tovu
 * executor stack and the exact `delegatedToolErrorDisclosure()` options the daemon spreads in, so
 * the wiring under test is the production wiring, one route per failure source.
 */

const PRINCIPAL: Principal = { id: "principal-disclosure" };
const FIXED_ID = "ERR-AAAA-1111-BBBB-2222";
const STRIPE_KEY = ["sk", "live", ""].join("_") + "Ab3".repeat(8);
const SECRET_TEXT = `lookup failed: key=${STRIPE_KEY}`;

interface Harness {
  readonly records: ToolFailureRecord[];
  call(toolId: string, overrides?: Partial<DelegatedToolsHttpDeps>, signal?: AbortSignal): ReturnType<typeof delegatedToolExecuteRoute.handle>;
}

/** Builds the daemon's route deps over `registry`: Tovu's executor stack plus the disclosure options. */
async function harness(registry: ToolRegistry = createToolRegistry({})): Promise<Harness> {
  const records: ToolFailureRecord[] = [];
  const toolFailures = { mintErrorId: () => FIXED_ID, onFailure: (record: ToolFailureRecord) => records.push(record) };
  const toolExecutor = createAssistantToolExecutor({ registry, surfaceExchanges: createSurfaceExchangeStore(), toolFailures });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-disclosure" });
  return {
    records,
    call: (toolId, overrides = {}, signal) =>
      delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: "tu-1", toolId, input: {} }, deps: {
          lifecycle,
          toolExecutor,
          resolvePrincipal: () => PRINCIPAL,
          onInternalError: () => undefined,
          ...delegatedToolErrorDisclosure(toolFailures),
          ...overrides,
        } }, { signal: signal }
      ),
  };
}

/** Asserts a 500 whose message is exactly `Error <FIXED_ID>: <reason>`. */
function assertDescribed(result: Awaited<ReturnType<Harness["call"]>>, reason: string): void {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  assert.equal(result.error.message, `Error ${FIXED_ID}: ${reason}`);
}

test("ROUTE: an unknown tool id (the executor throws) reaches the model as its real reason, not a bare 500", async () => {
  const h = await harness();

  const result = await h.call("search_components");

  assertDescribed(result, 'ToolExecutor: unknown tool "search_components"');
  assert.equal(h.records.length, 1);
  assert.equal(h.records[0]!.errorId, FIXED_ID);
  assert.equal(h.records[0]!.toolId, "search_components");
});

test("ROUTE: a tool that runs past its timeout says it timed out", async () => {
  const registry = createToolRegistry({});
  registry.register({
    descriptor: { id: "slow_tool", timeoutMs: 5 },
    policy: { authorize: () => "allow" },
    handler: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
  });
  const h = await harness(registry);

  assertDescribed(await h.call("slow_tool"), 'tool "slow_tool" timed out before it finished');
});

test("ROUTE: a call abandoned before it ran says it was cancelled", async () => {
  const registry = createToolRegistry({});
  registry.register({ descriptor: { id: "noop" }, policy: { authorize: () => "allow" }, handler: async () => "ok" });
  const h = await harness(registry);

  assertDescribed(await h.call("noop", {}, AbortSignal.abort()), 'tool "noop" was cancelled before it finished (the run ended or the call was abandoned)');
});

test("ROUTE: a resolvePrincipal throw carries its reason, with secret-shaped values blanked", async () => {
  const h = await harness();

  const result = await h.call("noop", {
    resolvePrincipal: () => {
      throw new Error(SECRET_TEXT);
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  assert.match(result.error.message, new RegExp(`^Error ${FIXED_ID}: lookup failed: key=`));
  assert.equal(JSON.stringify(result).includes(STRIPE_KEY), false, `leaked the key: ${result.error.message}`);
  assert.equal(h.records[0]!.redactions, 1);
});

test("ROUTE: a failed result that skipped the redaction layer is redacted here instead of becoming a bare 500", async () => {
  const registry = createToolRegistry({});
  registry.register({
    descriptor: { id: "throws_secret" },
    policy: { authorize: () => "allow" },
    handler: () => {
      throw new Error(SECRET_TEXT);
    },
  });
  const h = await harness(registry);

  // The BARE executor: no `withRedactedToolFailures`, so no ERR id and `isModelSafeToolFailure` says no.
  const result = await h.call("throws_secret", { toolExecutor: createToolExecutor({ registry }) });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  assert.match(result.error.message, new RegExp(`^Error ${FIXED_ID}: lookup failed: key=`));
  assert.equal(JSON.stringify(result).includes(STRIPE_KEY), false, `leaked the key: ${result.error.message}`);
});

test("ROUTE: a failure the redaction layer already ID-tagged keeps its 422 TOOL_EXECUTION_FAILED", async () => {
  const registry = createToolRegistry({});
  registry.register({
    descriptor: { id: "throws_plain" },
    policy: { authorize: () => "allow" },
    handler: () => {
      throw new Error("upstream returned 502");
    },
  });
  const h = await harness(registry);

  const result = await h.call("throws_plain");

  assert.deepEqual(result, { ok: false, error: { code: "TOOL_EXECUTION_FAILED", message: `Error ${FIXED_ID}: upstream returned 502` } });
});

test("describeDelegatedInternalError: a non-Error, empty-message, or missing error falls back to naming the tool", () => {
  const base: DelegatedInternalErrorContext = { source: "delegated-tool-execute", runId: "r", toolId: "t", correlationId: "c", error: undefined };
  const deps = { mintErrorId: () => FIXED_ID, onFailure: () => undefined };

  assert.equal(describeDelegatedInternalError(base, deps), `Error ${FIXED_ID}: tool "t" failed`);
  assert.equal(describeDelegatedInternalError({ ...base, error: new Error("") }, deps), `Error ${FIXED_ID}: tool "t" failed`);
  assert.equal(describeDelegatedInternalError({ ...base, error: "" }, deps), `Error ${FIXED_ID}: tool "t" failed`);
  assert.equal(describeDelegatedInternalError({ ...base, error: "plain text" }, deps), `Error ${FIXED_ID}: plain text`);
});

test("describeDelegatedInternalError: the server-side record correlates to http-kit's own log line", () => {
  const records: ToolFailureRecord[] = [];
  describeDelegatedInternalError(
    { source: "resolve-principal", runId: "run-9", toolId: "t", correlationId: "corr-1", error: new Error("boom") },
    { mintErrorId: () => FIXED_ID, onFailure: (record) => records.push(record) },
  );

  assert.deepEqual(records, [
    { errorId: FIXED_ID, toolId: "t", runId: "run-9", principalId: "(unresolved)", executionId: "(none) correlationId=corr-1", redactions: 0, message: "boom" },
  ]);
});
