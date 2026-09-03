import assert from "node:assert/strict";
import test from "node:test";

import type { Principal, RunRef, SurfaceEmitter, ToolDescriptor, ToolRegistry } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import { TOOL_FAILURE_RECOVERY_TOOL_ID, withToolFailureRecovery } from "../tool-failure-recovery.js";

/**
 * @file Certifies `tool-failure-recovery.ts` — the generic consumer of
 * `contracts/core/tool-failure-diagnostics.ts`'s `ToolFailureDiagnostic` contract. Mirrors
 * `tool-executor-audit.test.ts`'s fake-`ToolExecutor` style for the decorator half, and
 * `set-token-agent-tool.unit.test.ts`'s real-`SurfaceExchangeStore`-plus-`deliver()` style for the
 * human-answer half, rather than inventing a third pattern.
 *
 * The four properties this file is responsible for above all others (see the dispatch that asked for
 * this file): the one-cycle guard is structural, a no-hint result is untouched, the original failure
 * always survives, and nothing beyond a planned field can ever reach a remedy tool call.
 */

const PRINCIPAL: Principal = { id: "principal-1" };
const RUN: RunRef = { id: "run-1" };
const ORIGINAL_TOOL_ID = "fake_make_request";
const SET_USERNAME_TOOL_ID = "fake_set_username";
const SET_TOKEN_TOOL_ID = "fake_set_token";

const USERNAME_HINT = "This request was sent with a Bearer token and no saved username — saving one may fix it.";

/** A `ToolExecutor` whose behavior for each tool id is supplied by the test, and which records every
 *  call it receives — the same shape `tool-executor-audit.test.ts`'s own `fakeExecutor` uses,
 *  widened to route by tool id since this decorator can call more than one. */
function routedExecutor(handlers: Record<string, (input: unknown) => ToolExecutionResult>): ToolExecutor & { calls: Array<{ toolId: string; input: unknown }> } {
  const calls: Array<{ toolId: string; input: unknown }> = [];
  return {
    calls,
    execute: async (_principal: Principal, _run: RunRef, toolId: string, input: unknown): Promise<ToolExecutionResult> => {
      calls.push({ toolId, input });
      const handler = handlers[toolId];
      if (!handler) throw new Error(`unknown tool "${toolId}"`);
      return handler(input);
    },
    resumeConfirmation: () => {},
    cancel: () => {},
    getAuditRecord: () => null,
  };
}

function fakeRegistry(descriptors: readonly ToolDescriptor[]): Pick<ToolRegistry, "list"> {
  return { list: () => descriptors };
}

const SET_USERNAME_DESCRIPTOR: ToolDescriptor = {
  id: SET_USERNAME_TOOL_ID,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["label", "username"],
    properties: {
      label: { type: "string" },
      username: { type: ["string", "null"], description: "The account username/login to save for this credential." },
    },
  },
};

/** Mirrors `custom_credential_set_token`'s real schema shape: requires only what the original call
 *  already supplies, so this loop has nothing left to ask a human for. */
const SET_TOKEN_DESCRIPTOR: ToolDescriptor = {
  id: SET_TOKEN_TOOL_ID,
  inputSchema: { type: "object", additionalProperties: false, required: ["label"], properties: { label: { type: "string" } } },
};

const TWO_MISSING_FIELDS_DESCRIPTOR: ToolDescriptor = {
  id: "fake_needs_two_fields",
  inputSchema: {
    type: "object",
    required: ["label", "username", "region"],
    properties: { label: { type: "string" }, username: { type: "string" }, region: { type: "string" } },
  },
};

const NUMERIC_FIELD_DESCRIPTOR: ToolDescriptor = {
  id: "fake_needs_a_number",
  inputSchema: { type: "object", required: ["label", "retryCount"], properties: { label: { type: "string" }, retryCount: { type: "number" } } },
};

function authFailureOutput(overrides: { hint?: string; remedyToolId?: string } = {}): Record<string, unknown> {
  return {
    executed: true,
    status: 401,
    headers: {},
    bodyText: "Unauthorized",
    authDiagnostic: {
      schemeSent: "Bearer",
      usernameStored: false,
      hint: USERNAME_HINT,
      remedyToolId: SET_USERNAME_TOOL_ID,
      ...overrides,
    },
  };
}

const ORIGINAL_INPUT = { label: "name.com", method: "GET", url: "https://api.name.com/v4/hello" };

/** Pulls the exchange id out of an emitted mcp-ui surface — mirrors
 *  `set-token-agent-tool.unit.test.ts`'s own `exchangeIdFromSurface`. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text as string;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the recovery surface must carry its exchange id");
  return match[1]!;
}

/** Runs `executor.execute` for the original tool and, if a recovery surface is raised, waits for it
 *  to actually be emitted before returning control to the test. */
async function runOriginal(executor: ToolExecutor, options: { input?: unknown; signal?: AbortSignal } = {}) {
  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (s) => void emitted.push(s);
  const pending = executor.execute(PRINCIPAL, RUN, ORIGINAL_TOOL_ID, options.input ?? ORIGINAL_INPUT, options.signal, emitSurface);
  await new Promise((resolve) => setImmediate(resolve));
  return { pending, emitted };
}

// ---------------------------------------------------------------------------
// 1. Silence stays free
// ---------------------------------------------------------------------------

test("SILENCE: a completed result with no diagnostic anywhere in its output returns untouched, with no exchange and no extra calls", async () => {
  const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: { executed: true, status: 200, bodyText: "ok" } }) });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  const result = await pending;

  assert.deepEqual(result, { executionId: "e1", status: "completed", output: { executed: true, status: 200, bodyText: "ok" } });
  assert.equal(emitted.length, 0, "no surface should ever be raised for a hint-free result");
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal(inner.calls.length, 1, "only the original call should ever run");
});

test("SILENCE: a non-completed status (denied/failed/timed-out) is never scanned or altered", async () => {
  for (const status of ["denied", "failed", "timed-out", "cancelled", "confirmation-denied"] as const) {
    const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e", status, output: authFailureOutput() }) });
    const surfaceExchanges = createSurfaceExchangeStore();
    const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

    const { pending, emitted } = await runOriginal(executor);
    const result = await pending;

    assert.equal(result.status, status);
    assert.equal(emitted.length, 0, `status '${status}' must never raise a recovery surface even though its output looks diagnostic-shaped`);
    assert.equal(inner.calls.length, 1);
  }
});

test("SILENCE: hint present without remedyToolId is not actionable — nothing this loop can apply, so nothing happens", async () => {
  const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput({ remedyToolId: undefined as unknown as string }) }) });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([]) });

  const { pending, emitted } = await runOriginal(executor);
  const result = await pending;

  assert.equal((result.output as Record<string, unknown>)["status"], 401, "the original diagnostic-carrying output must survive untouched");
  assert.equal(emitted.length, 0);
  assert.equal(inner.calls.length, 1);
});

test("SILENCE: a diagnostic can be nested arbitrarily deep or inside an array and is still found — but a NOT-completable one (no emitSurface) still returns untouched", async () => {
  const nested = { outer: { items: [{ inner: authFailureOutput() }] } };
  const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: nested }) });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

  // No `emitSurface` on this call — a headless/synthetic caller.
  const result = await executor.execute(PRINCIPAL, RUN, ORIGINAL_TOOL_ID, ORIGINAL_INPUT, undefined, undefined);

  assert.deepEqual(result.output, nested, "with no channel to ask through, the loop must never guess — original result returned untouched");
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal(inner.calls.length, 1);
});

// ---------------------------------------------------------------------------
// 2. Bail-outs — a shape this loop cannot safely act on returns the ORIGINAL result untouched
// ---------------------------------------------------------------------------

test("BAIL: remedyToolId names a tool that is not registered at all — no descriptor to plan from", async () => {
  const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput({ remedyToolId: "does_not_exist" }) }) });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([]) });

  const { pending, emitted } = await runOriginal(executor);
  const result = await pending;

  assert.equal((result.output as Record<string, unknown>)["status"], 401);
  assert.equal(emitted.length, 0);
  assert.equal(inner.calls.length, 1);
});

test("BAIL: the remedy tool's inputSchema is not an object — nothing to introspect", async () => {
  const badDescriptor: ToolDescriptor = { id: SET_USERNAME_TOOL_ID, inputSchema: "not-a-schema" as unknown };
  const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput() }) });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([badDescriptor]) });

  const { pending, emitted } = await runOriginal(executor);
  await pending;

  assert.equal(emitted.length, 0);
  assert.equal(inner.calls.length, 1);
});

test("BAIL: more than one required field is unknown — no single honest question covers all of them", async () => {
  const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput({ remedyToolId: "fake_needs_two_fields" }) }) });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([TWO_MISSING_FIELDS_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  const result = await pending;

  assert.equal((result.output as Record<string, unknown>)["status"], 401);
  assert.equal(emitted.length, 0, "a two-field gap must never produce a guessed multi-field form");
  assert.equal(inner.calls.length, 1);
});

test("BAIL: the one missing field is not text-shaped (e.g. a number) — this loop never invents how to render it", async () => {
  const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput({ remedyToolId: "fake_needs_a_number" }) }) });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([NUMERIC_FIELD_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  await pending;

  assert.equal(emitted.length, 0);
  assert.equal(inner.calls.length, 1);
});

// ---------------------------------------------------------------------------
// 3. The happy path — ask, apply, retry once
// ---------------------------------------------------------------------------

test("HAPPY PATH: asks for the one missing field, applies the answer via the remedy tool, retries the original exactly once, and returns the retry's result", async () => {
  const retriedOutput = { executed: true, status: 200, headers: {}, bodyText: "ok now" };
  const inner = routedExecutor({});
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

  // The original tool returns the 401 on its FIRST invocation and the success on its SECOND (the
  // retry) — a stateful fake, since this test is specifically about that call happening twice.
  let originalCallCount = 0;
  inner.execute = async (_p, _r, toolId, input) => {
    inner.calls.push({ toolId, input });
    if (toolId === ORIGINAL_TOOL_ID) {
      originalCallCount += 1;
      if (originalCallCount === 1) return { executionId: "e-original", status: "completed", output: authFailureOutput() };
      assert.deepEqual(input, ORIGINAL_INPUT, "the retry must carry the exact original input");
      return { executionId: "e-retry", status: "completed", output: retriedOutput };
    }
    if (toolId === SET_USERNAME_TOOL_ID) {
      return { executionId: "e-remedy", status: "completed", output: { id: "cred-1", ...(input as Record<string, unknown>) } };
    }
    throw new Error(`unexpected tool '${toolId}'`);
  };

  const { pending, emitted } = await runOriginal(executor);
  assert.equal(emitted.length, 1, "the recovery surface must be raised exactly once");
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  assert.equal(surfaceExchanges.size(), 1);

  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { username: "leona@example.com" } });
  assert.deepEqual(delivered, { ok: true });

  const result = await pending;

  assert.deepEqual(result, { executionId: "e-retry", status: "completed", output: retriedOutput }, "the FINAL result must be the retry's own result");
  assert.deepEqual(inner.calls, [
    { toolId: ORIGINAL_TOOL_ID, input: ORIGINAL_INPUT },
    { toolId: SET_USERNAME_TOOL_ID, input: { label: "name.com", username: "leona@example.com" } },
    { toolId: ORIGINAL_TOOL_ID, input: ORIGINAL_INPUT },
  ]);
});

// ---------------------------------------------------------------------------
// 4. Human declines, never answers, or answers blank — never invent an answer
// ---------------------------------------------------------------------------

test("DECLINE: a dismissed recovery surface returns the ORIGINAL failure untouched, and the remedy tool is never called", async () => {
  const inner = routedExecutor({
    [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput() }),
    [SET_USERNAME_TOOL_ID]: () => {
      throw new Error("must never be called when the human declines");
    },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { [SURFACE_DISMISSED_PARAM]: true } });

  const result = await pending;
  assert.equal((result.output as Record<string, unknown>)["status"], 401, "the original 401 must survive completely untouched");
  assert.equal(inner.calls.length, 1, "only the original call — the remedy tool must never run on a decline");
});

test("DECLINE: a blank answer to the missing field is treated as 'skip', never as a value to try", async () => {
  const inner = routedExecutor({
    [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput() }),
    [SET_USERNAME_TOOL_ID]: () => {
      throw new Error("must never be called with a blank/invented answer");
    },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { username: "   " } });

  const result = await pending;
  assert.equal((result.output as Record<string, unknown>)["status"], 401);
  assert.equal(inner.calls.length, 1);
});

test("DECLINE: an unanswered recovery surface expires and returns the ORIGINAL failure untouched", async () => {
  const inner = routedExecutor({ [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput() }) });
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

  const result = await executor.execute(PRINCIPAL, RUN, ORIGINAL_TOOL_ID, ORIGINAL_INPUT, undefined, async () => undefined);

  assert.equal((result.output as Record<string, unknown>)["status"], 401);
  assert.equal(inner.calls.length, 1);
});

test("the fix itself failing to complete (e.g. the remedy tool is denied) never triggers a retry — nothing changed, so the original result is still the truth", async () => {
  const inner = routedExecutor({
    [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput() }),
    [SET_USERNAME_TOOL_ID]: () => ({ executionId: "e-remedy", status: "denied" }),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { username: "leona@example.com" } });

  const result = await pending;
  assert.equal((result.output as Record<string, unknown>)["status"], 401, "the original failure must survive — the fix never actually applied");
  assert.deepEqual(
    inner.calls.map((c) => c.toolId),
    [ORIGINAL_TOOL_ID, SET_USERNAME_TOOL_ID],
    "the original must NEVER be retried when the remedy tool itself did not complete",
  );
});

test("the remedy tool completing but reporting {saved: false} (a declined/expired/invalid human-gated write) never triggers a retry — a completed execution status is not proof the fix was actually applied", async () => {
  let originalCallCount = 0;
  const inner = routedExecutor({});
  inner.execute = async (_p, _r, toolId, input) => {
    inner.calls.push({ toolId, input });
    if (toolId === ORIGINAL_TOOL_ID) {
      originalCallCount += 1;
      // A retry here would prove the bug this test exists for — the remedy's `{saved: false}` must
      // stop this loop before a second call to the original is ever made.
      if (originalCallCount > 1) throw new Error("the original must NEVER be retried when the remedy reported {saved: false}");
      return { executionId: "e1", status: "completed", output: authFailureOutput({ remedyToolId: SET_TOKEN_TOOL_ID }) };
    }
    if (toolId === SET_TOKEN_TOOL_ID) return { executionId: "e-remedy", status: "completed", output: { saved: false, reason: "cancelled" } };
    throw new Error(`unexpected tool '${toolId}'`);
  };
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_TOKEN_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: {} });

  const result = await pending;
  assert.deepEqual(
    result,
    { executionId: "e1", status: "completed", output: authFailureOutput({ remedyToolId: SET_TOKEN_TOOL_ID }) },
    "the ORIGINAL failure must survive completely untouched — the remedy completed but reported it never actually saved",
  );
  assert.deepEqual(
    inner.calls.map((c) => c.toolId),
    [ORIGINAL_TOOL_ID, SET_TOKEN_TOOL_ID],
    "the original must NEVER be retried when the remedy tool's own COMPLETED result reports {saved: false}",
  );
});

// ---------------------------------------------------------------------------
// 5. Never a secret in the remedy call — only what this loop explicitly planned ever reaches it
// ---------------------------------------------------------------------------

test("ADVERSARIAL: a remedy tool needing nothing beyond what is already known (the custom_credential_set_token shape) is called with ONLY the carried-forward field, no matter what extra params the delivered answer smuggles in", async () => {
  const inner = routedExecutor({
    [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput({ remedyToolId: SET_TOKEN_TOOL_ID }) }),
    [SET_TOKEN_TOOL_ID]: (input) => ({ executionId: "e-remedy", status: "completed", output: { saved: true, receivedInput: input } }),
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_TOKEN_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  // A hostile or confused delivery tries to smuggle a `token` field in anyway — this loop never asked
  // for one (the schema needed nothing beyond `label`, which was already known), so it must never be
  // forwarded to the remedy tool call.
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { token: "sneaky-value", decision: "confirm" } });

  await pending;

  const remedyCall = inner.calls.find((c) => c.toolId === SET_TOKEN_TOOL_ID);
  assert.ok(remedyCall);
  assert.deepEqual(remedyCall!.input, { label: "name.com" }, "the remedy call must carry ONLY the planned, carried-forward field — nothing from the raw delivered params");
});

// ---------------------------------------------------------------------------
// 6. The one-cycle guard — structural, verified adversarially
// ---------------------------------------------------------------------------

test("ONE-CYCLE GUARD: even when the retried call ALSO returns a fresh hint+remedyToolId, no second recovery cycle runs", async () => {
  let originalCallCount = 0;
  const inner = routedExecutor({});
  inner.execute = async (_p, _r, toolId, input) => {
    inner.calls.push({ toolId, input });
    if (toolId === ORIGINAL_TOOL_ID) {
      originalCallCount += 1;
      // BOTH the original call and the retry return an actionable diagnostic — a buggy consumer that
      // could re-enter its own recovery logic would loop here. This one must not.
      return { executionId: `e-${originalCallCount}`, status: "completed", output: authFailureOutput() };
    }
    if (toolId === SET_USERNAME_TOOL_ID) return { executionId: "e-remedy", status: "completed", output: { id: "cred-1" } };
    throw new Error(`unexpected tool '${toolId}'`);
  };
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });

  const { pending, emitted } = await runOriginal(executor);
  assert.equal(emitted.length, 1, "exactly one recovery surface must be raised, ever");
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_FAILURE_RECOVERY_TOOL_ID, principalId: PRINCIPAL.id, params: { username: "leona@example.com" } });

  const result = await pending;

  // The final result IS the retry's own (still-failing) result, returned untouched — never suppressed,
  // never fixed up, never re-entered into a second cycle.
  assert.equal(originalCallCount, 2, "original call once, retried exactly once — never a third time");
  assert.deepEqual(
    inner.calls.map((c) => c.toolId),
    [ORIGINAL_TOOL_ID, SET_USERNAME_TOOL_ID, ORIGINAL_TOOL_ID],
    "exactly three calls total: original, remedy, retry — never a second remedy or a second retry",
  );
  assert.equal(surfaceExchanges.size(), 0, "no exchange should be left open, and none opened a second time");
  assert.equal((result.output as Record<string, unknown>)["status"], 401, "the retry's own (still-failing) output must reach the caller untouched");
});

test("ONE-CYCLE GUARD: an abandoned run (aborted signal) closes the exchange and returns the ORIGINAL result untouched, without a remedy call", async () => {
  const inner = routedExecutor({
    [ORIGINAL_TOOL_ID]: () => ({ executionId: "e1", status: "completed", output: authFailureOutput() }),
    [SET_USERNAME_TOOL_ID]: () => {
      throw new Error("must never be called once the run is abandoned");
    },
  });
  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = withToolFailureRecovery(inner, { surfaceExchanges, registry: fakeRegistry([SET_USERNAME_DESCRIPTOR]) });
  const controller = new AbortController();

  const { pending } = await runOriginal(executor, { signal: controller.signal });
  assert.equal(surfaceExchanges.size(), 1);

  controller.abort();
  const result = await pending;

  assert.equal((result.output as Record<string, unknown>)["status"], 401);
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal(inner.calls.length, 1);
});

// ---------------------------------------------------------------------------
// 7. Delegation — every non-`execute` method passes straight through
// ---------------------------------------------------------------------------

test("resumeConfirmation, cancel and getAuditRecord delegate straight through to the wrapped executor", () => {
  const calls: string[] = [];
  const record = { executionId: "exec-7", toolId: "t", principalId: "p", runId: "r", events: [] };
  const inner: ToolExecutor = {
    execute: async () => ({ executionId: "e", status: "completed" as const }),
    resumeConfirmation: (id, decision) => calls.push(`resume:${id}:${decision}`),
    cancel: (id) => calls.push(`cancel:${id}`),
    getAuditRecord: (id) => {
      calls.push(`get:${id}`);
      return record;
    },
  };
  const executor = withToolFailureRecovery(inner, { surfaceExchanges: createSurfaceExchangeStore(), registry: fakeRegistry([]) });

  executor.resumeConfirmation("exec-7", "confirm");
  executor.cancel("exec-7");
  assert.equal(executor.getAuditRecord("exec-7"), record);
  assert.deepEqual(calls, ["resume:exec-7:confirm", "cancel:exec-7", "get:exec-7"]);
});
