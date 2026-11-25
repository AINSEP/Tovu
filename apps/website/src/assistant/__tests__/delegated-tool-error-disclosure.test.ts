import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, type Principal, type ToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute, type DelegatedToolsHttpDeps } from "@jini-ai/daemon/http";

import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createAssistantToolExecutor } from "../tool-recovery-preset.js";
import {
  delegatedToolErrorDisclosure,
  describeDelegatedInternalError,
  type DelegatedInternalErrorContext,
} from "../tool-recovery-preset.js";
import { createRecordingReporter } from "@jini-ai/core/errors/testing";
import type { LogDiagnosticRecord } from "@jini-ai/core/primitives";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createReporterRouteInternalError } from "@jini-ai/http-kit";


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

/** One recording reporter per harness: the executor stack and the route disclosure share it, as the
 *  daemon's site scope does, so every id the model sees must be the id of a host record. */
function recordingReporter() {
  return createRecordingReporter({ ids: Array.from({ length: 8 }, () => FIXED_ID), iso: "2026-01-01T00:00:00.000Z" });
}

/** The ERR- ids the reporter's host records were written under, in order. */
function hostRecordIds(entries: readonly LogDiagnosticRecord[]): unknown[] {
  return entries.map((entry) => entry.meta?.["errorId"]);
}

interface Harness {
  readonly entries: LogDiagnosticRecord[];
  call(toolId: string, overrides?: Partial<DelegatedToolsHttpDeps>, signal?: AbortSignal): ReturnType<typeof delegatedToolExecuteRoute.handle>;
}

/** Builds the daemon's route deps over `registry`: Tovu's executor stack plus the disclosure options. */
async function harness(registry: ToolRegistry = createToolRegistry({})): Promise<Harness> {
  const { reporter, entries } = recordingReporter();
  const toolFailures = { mintErrorId: () => FIXED_ID };
  const toolExecutor = createAssistantToolExecutor({ registry, reporter, surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }), toolFailures }, {});
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-disclosure" });
  return {
    entries,
    call: (toolId, overrides = {}, signal) =>
      delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: "tu-1", toolId, input: {} }, deps: {
          lifecycle,
          toolExecutor,
          resolvePrincipal: () => PRINCIPAL,
          ...delegatedToolErrorDisclosure({ reporter }, {}),
          reportInternalError: createReporterRouteInternalError({ reporter }),
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

  // Caller input, not a server fault: a 400 with the executor's own text and no failure record.
  assert.deepEqual(result, { ok: false, error: { code: "BAD_REQUEST", message: 'ToolExecutor: unknown tool "search_components"' } });
  assert.equal(h.entries.length, 0);
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
  // The host record is the same incident the model was shown, and it carries no secret either.
  assert.deepEqual(hostRecordIds(h.entries), [FIXED_ID]);
  assert.equal(JSON.stringify(h.entries).includes(STRIPE_KEY), false, "the host record leaked the key");
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
  const base: DelegatedInternalErrorContext = { source: "delegated-tool-execute", runId: "r", toolId: "t", error: undefined };
  const deps = { reporter: recordingReporter().reporter };

  assert.equal(describeDelegatedInternalError({ context: base, ...deps }).message, `Error ${FIXED_ID}: tool "t" failed`);
  assert.equal(describeDelegatedInternalError({ context: { ...base, error: new Error("") }, ...deps }).message, `Error ${FIXED_ID}: tool "t" failed`);
  assert.equal(describeDelegatedInternalError({ context: { ...base, error: "" }, ...deps }).message, `Error ${FIXED_ID}: tool "t" failed`);
  assert.equal(describeDelegatedInternalError({ context: { ...base, error: "plain text" }, ...deps }).message, `Error ${FIXED_ID}: plain text`);
});

test("describeDelegatedInternalError: the host record carries the same ERR- id as the model's words", () => {
  const { reporter, entries } = recordingReporter();
  const { message, errorId } = describeDelegatedInternalError({ context: { source: "resolve-principal", runId: "run-9", toolId: "t", error: new Error("boom") }, reporter });
  assert.equal(errorId, FIXED_ID);

  assert.equal(message, `Error ${FIXED_ID}: boom`);
  assert.deepEqual(hostRecordIds(entries), [FIXED_ID]);
  assert.equal((entries[0]!.meta?.["attributes"] as Record<string, unknown>)["agent.run.id"], "run-9");
});
