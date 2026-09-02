import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, type Principal, type RunRef, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistry } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";
import { isReadOnlyTool } from "@jini-ai/core";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { createInMemoryToolAttemptAuditSink } from "#src/features/tool-audit/repo.memory";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/repo.memory";
import { buildCustomCredentialsRegistrations, type CustomCredentialsToolDeps } from "#src/features/custom-credentials/tool-registrations";
import { createCustomCredential, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/store";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";

import { TOOL_FAILURE_RECOVERY_TOOL_ID } from "../tool-failure-recovery.js";
import {
  READ_ONLY_UNCHECKABLE_MESSAGE,
  constrainPrincipalToReadOnlyTools,
  withReadOnlyToolConstraint,
} from "../read-only-tool-constraint.js";
import { createAssistantToolExecutor } from "../tool-executor-stack.js";

/**
 * @file The test the previous read-only-gateway work did not have: it drives the REAL decorator
 * composition (`createAssistantToolExecutor`, the exact stack `agent-daemon-server.ts` mounts) over
 * the REAL `custom-credentials` tool registrations, and asserts against the REPO rather than against
 * a returned status.
 *
 * That combination is the whole point. The shipped route check (`@jini-ai/http-kit`'s
 * `requireReadOnly`) was correct and covered; what was uncovered was everything downstream of it.
 * `execute_readonly_delegated_tool` would admit `custom_credential_verify` — genuinely registered
 * read-only — whose 401 diagnostic names `custom_credential_set_username` as its remedy, and
 * `withToolFailureRecovery` would then dispatch THAT id, which durably writes a Tovu-side column. A
 * status assertion passes while that happens; only reading the repo back catches it.
 *
 * Every fixture here is the production article: real registry, real registrations, real risk
 * classification, real sealer/keyring/repo. The only fakes are the outbound HTTP client (so `verify`
 * can fail 401 deterministically) and the human on the other end of the recovery surface.
 */

const WORKSPACE_ID = "ws-read-only-constraint";
const RUN: RunRef = { id: "run-read-only" };
const UNCONSTRAINED: Principal = { id: "principal-under-test" };
const READ_ONLY = constrainPrincipalToReadOnlyTools(UNCONSTRAINED);
const LABEL = "name.com";
const VERIFY_TOOL_ID = "custom_credential_verify";
const SET_USERNAME_TOOL_ID = "custom_credential_set_username";
const NOW = "2026-09-02T00:00:00.000Z";

/** Answers every outbound call with 401, which is what makes `custom_credential_verify` emit the
 *  Bearer-with-no-username diagnostic naming `custom_credential_set_username` as the remedy — see
 *  `custom-credentials/__tests__/auth-failure-diagnostic.unit.test.ts`. */
class UnauthorizedHttpClient implements HttpClientPort {
  calls = 0;
  async send(_request: HttpRequest): Promise<HttpResponse> {
    this.calls += 1;
    return { status: 401, headers: {}, bodyText: "unauthorized" };
  }
}

interface Harness {
  readonly registry: ToolRegistry;
  readonly repo: InMemoryCustomCredentialSetRepo;
  readonly surfaceExchanges: SurfaceExchangeStore;
  readonly executor: ToolExecutor;
  readonly credentialId: string;
}

/**
 * Builds the production composition over the production custom-credentials registrations, with one
 * credential already saved: a Bearer token and NO username — the exact state the live incident this
 * whole mechanism was written for started from.
 */
async function buildHarness(): Promise<Harness> {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => NOW };
  let seq = 0;
  const idGen = { newId: () => `cred-${++seq}` };

  const writeDeps: CustomCredentialWriteDeps = { repo, sealer, keyring, clock, idGen };
  const created = await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: LABEL,
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });

  const surfaceExchanges = createSurfaceExchangeStore();
  const toolDeps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock,
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    idGen,
    customCredentialsHttpClient: new UnauthorizedHttpClient(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };

  const registry = createToolRegistry();
  for (const registration of buildCustomCredentialsRegistrations(toolDeps, { surfaceExchanges })) {
    registry.register(registration);
  }

  const executor = createAssistantToolExecutor({
    registry,
    auditSink: createInMemoryToolAttemptAuditSink(),
    surfaceExchanges,
    workspaceId: WORKSPACE_ID,
  });

  return { registry, repo, surfaceExchanges, executor, credentialId: created.id };
}

/** The saved username as the DURABLE STORE holds it — the only assertion that can distinguish "the
 *  write was refused" from "the write happened and the status looked fine". */
async function storedUsername(harness: Harness): Promise<string | null | undefined> {
  const row = await harness.repo.findById({ workspaceId: WORKSPACE_ID, id: harness.credentialId });
  assert.ok(row, "the seeded credential must still exist");
  return (row as { username?: string | null }).username;
}

/** Pulls the exchange id out of an emitted mcp-ui surface — mirrors `tool-failure-recovery.test.ts`. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text as string;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the recovery surface must carry its exchange id");
  return match[1]!;
}

/** The refusal text a denied/annotated result must carry, asserted present before it is matched —
 *  a missing message is itself a failure worth naming, not a non-null assertion away. */
function errorText(result: ToolExecutionResult): string {
  assert.ok(result.error, "expected the result to carry a refusal message");
  return result.error;
}

/** Delivers an answer to a recovery surface only if the loop actually raised one, so a test can
 *  assert on the DURABLE OUTCOME either way instead of timing out when the gate declines to ask. */
function answerAnyRecoverySurface(harness: Harness, emitted: readonly unknown[], principal: Principal, username: string): void {
  if (emitted.length === 0) return;
  harness.surfaceExchanges.deliver({
    exchangeId: exchangeIdFromSurface(emitted[0]),
    toolId: TOOL_FAILURE_RECOVERY_TOOL_ID,
    principalId: principal.id,
    params: { username },
  });
}

/** Starts a `custom_credential_verify` call and yields once, so any recovery surface the loop raises
 *  has actually been emitted before the test inspects or answers it. */
async function startVerify(harness: Harness, principal: Principal) {
  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (surface) => void emitted.push(surface);
  const pending = harness.executor.execute(principal, RUN, VERIFY_TOOL_ID, { label: LABEL }, undefined, emitSurface);
  await new Promise((resolve) => setImmediate(resolve));
  return { pending, emitted };
}

// ---------------------------------------------------------------------------
// 0. The premise the whole exploit rests on — stated as assertions so a reclassification that
//    silently defuses (or re-arms) this test cannot go unnoticed.
// ---------------------------------------------------------------------------

test("PREMISE: custom_credential_verify is registered read-only and custom_credential_set_username is not", async () => {
  const harness = await buildHarness();
  const byId = new Map(harness.registry.list().map((d) => [d.id, d]));

  assert.equal(isReadOnlyTool(byId.get(VERIFY_TOOL_ID)), true, "the read-only gateway admits this tool — that is what makes the remedy reachable");
  assert.equal(isReadOnlyTool(byId.get(SET_USERNAME_TOOL_ID)), false, "the remedy durably writes; it must never be admitted by a read-only execution");
});

// ---------------------------------------------------------------------------
// 1. THE REGRESSION. A read-only execution must not be able to write, whichever layer chose the id.
// ---------------------------------------------------------------------------

test("READ-ONLY: a verify call whose remedy writes performs NO durable write — asserted against the repo, not the status", async () => {
  const harness = await buildHarness();
  assert.equal(await storedUsername(harness), undefined, "precondition: no username is saved yet");

  const { pending, emitted } = await startVerify(harness, READ_ONLY);
  // Answer the recovery surface IF one was raised. A gate that merely declines to ask still has to be
  // proven not to write, and an unanswered surface would park this call forever — reporting a hang
  // where the ungated code's actual behaviour is a completed, successful, durable write.
  answerAnyRecoverySurface(harness, emitted, READ_ONLY, "smuggled@example.com");
  const result = await pending;

  assert.equal(await storedUsername(harness), undefined, "a read-only execution must never reach custom_credential_set_username's durable write");
  assert.equal(emitted.length, 0, "no human should be asked to fill in a form whose answer would then be refused");
  assert.equal(harness.surfaceExchanges.size(), 0, "no recovery exchange should have been opened");
  assert.equal(result.status, "completed", "the original read still completed — it is the REMEDY that is refused, not the read");
});

test("READ-ONLY: the refusal is reported, not swallowed — the caller gets the original failure AND why the remedy was not attempted", async () => {
  const harness = await buildHarness();

  const { pending, emitted } = await startVerify(harness, READ_ONLY);
  answerAnyRecoverySurface(harness, emitted, READ_ONLY, "smuggled@example.com");
  const result = await pending;

  // The original failure survives in full: the loop's standing contract.
  const output = result.output as { status?: string; authDiagnostic?: { remedyToolId?: string } };
  assert.equal(output.status, "invalid", "the verify result itself must come back untouched");
  assert.equal(output.authDiagnostic?.remedyToolId, SET_USERNAME_TOOL_ID);

  // ...and the caller is told the recovery was declined, and what to do instead.
  const refusal = errorText(result);
  assert.match(refusal, /automatic recovery was NOT attempted/);
  assert.match(refusal, new RegExp(`"${SET_USERNAME_TOOL_ID}" is not registered as read-only`));
  assert.match(refusal, /execute_delegated_tool/);
});

test("READ-ONLY: the same constraint refuses a write tool the caller names DIRECTLY, with no remedy involved", async () => {
  const harness = await buildHarness();

  const result = await harness.executor.execute(READ_ONLY, RUN, SET_USERNAME_TOOL_ID, { label: LABEL, username: "leona@example.com" }, undefined, undefined);

  assert.equal(result.status, "denied");
  assert.match(errorText(result), new RegExp(`"${SET_USERNAME_TOOL_ID}" is not registered as read-only`));
  assert.equal(await storedUsername(harness), undefined, "a denied dispatch must leave the store untouched");
});

// ---------------------------------------------------------------------------
// 2. Nothing else changes. `execute_delegated_tool`'s path is byte-for-byte what it was.
// ---------------------------------------------------------------------------

test("UNCONSTRAINED: the identical call still asks a human, applies the remedy, and DOES perform the durable write", async () => {
  const harness = await buildHarness();

  const { pending, emitted } = await startVerify(harness, UNCONSTRAINED);
  assert.equal(emitted.length, 1, "an unconstrained execution still raises the recovery surface");

  const delivered = harness.surfaceExchanges.deliver({
    exchangeId: exchangeIdFromSurface(emitted[0]),
    toolId: TOOL_FAILURE_RECOVERY_TOOL_ID,
    principalId: UNCONSTRAINED.id,
    params: { username: "leona@example.com" },
  });
  assert.deepEqual(delivered, { ok: true });
  await pending;

  assert.equal(await storedUsername(harness), "leona@example.com", "the recovery loop's write must still work for a caller that did not ask for read-only");
});

// ---------------------------------------------------------------------------
// 3. A read-only remedy is still allowed — the constraint is about writes, not about recovery.
// ---------------------------------------------------------------------------

test("READ-ONLY: a remedy that is itself registered read-only still runs, and the original is still retried", async () => {
  const registry = createToolRegistry();
  const calls: Array<{ toolId: string; input: unknown }> = [];
  let originalCalls = 0;

  registry.register({
    descriptor: {
      id: "probe_read",
      readOnly: true,
      inputSchema: { type: "object", required: ["label"], properties: { label: { type: "string" } } },
    },
    policy: { authorize: () => "allow" },
    handler: (ctx: ToolExecutionContext) => {
      calls.push({ toolId: "probe_read", input: ctx.input });
      originalCalls += 1;
      return originalCalls === 1
        ? { ok: false, hint: "a region is needed to read this", remedyToolId: "probe_pick_region" }
        : { ok: true };
    },
  });
  registry.register({
    descriptor: {
      id: "probe_pick_region",
      readOnly: true,
      inputSchema: { type: "object", required: ["label", "region"], properties: { label: { type: "string" }, region: { type: "string" } } },
    },
    policy: { authorize: () => "allow" },
    handler: (ctx: ToolExecutionContext) => {
      calls.push({ toolId: "probe_pick_region", input: ctx.input });
      return { picked: true };
    },
  });

  const surfaceExchanges = createSurfaceExchangeStore();
  const executor = createAssistantToolExecutor({
    registry,
    auditSink: createInMemoryToolAttemptAuditSink(),
    surfaceExchanges,
    workspaceId: WORKSPACE_ID,
  });

  const emitted: unknown[] = [];
  const pending = executor.execute(READ_ONLY, RUN, "probe_read", { label: LABEL }, undefined, async (s) => void emitted.push(s));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "a read-only remedy must still be able to ask its one question");

  surfaceExchanges.deliver({
    exchangeId: exchangeIdFromSurface(emitted[0]),
    toolId: TOOL_FAILURE_RECOVERY_TOOL_ID,
    principalId: READ_ONLY.id,
    params: { region: "eu-west" },
  });
  const result = await pending;

  assert.deepEqual(
    calls.map((c) => c.toolId),
    ["probe_read", "probe_pick_region", "probe_read"],
    "ask -> apply -> retry-once must be unaffected when every tool involved only reads",
  );
  assert.deepEqual(result.output, { ok: true });
});

// ---------------------------------------------------------------------------
// 4. Fail closed. The gate refuses what it cannot verify, and refuses a dispatch from a decorator
//    that knows nothing about the constraint — which is the actual defect class.
// ---------------------------------------------------------------------------

test("FAIL CLOSED: a gate wired without a registry refuses every constrained dispatch rather than waiving it", async () => {
  let reachedInner = 0;
  const inner: ToolExecutor = {
    execute: async (): Promise<ToolExecutionResult> => {
      reachedInner += 1;
      return { executionId: "e", status: "completed", output: {} };
    },
    resumeConfirmation: () => {},
    cancel: () => {},
    getAuditRecord: () => null,
  };
  const gated = withReadOnlyToolConstraint(inner, { registry: undefined });

  const refused = await gated.execute(READ_ONLY, RUN, "anything_at_all", {}, undefined, undefined);
  assert.equal(refused.status, "denied");
  assert.equal(errorText(refused), READ_ONLY_UNCHECKABLE_MESSAGE);
  assert.equal(reachedInner, 0);

  // ...while an unconstrained call is untouched by the same gate.
  const allowed = await gated.execute(UNCONSTRAINED, RUN, "anything_at_all", {}, undefined, undefined);
  assert.equal(allowed.status, "completed");
  assert.equal(reachedInner, 1);
});

test("FAIL CLOSED: an unregistered id is refused under a read-only execution — silence is never read as safety", async () => {
  const harness = await buildHarness();
  const result = await harness.executor.execute(READ_ONLY, RUN, "not_registered_anywhere", {}, undefined, undefined);

  assert.equal(result.status, "denied", "an unknown id must be refused, not thrown past the gate as a routing error");
  assert.match(errorText(result), /"not_registered_anywhere" is not registered as read-only/);
});

test("DEFECT CLASS: ANY decorator that dispatches an id the caller did not name is gated — not just the recovery loop", async () => {
  const harness = await buildHarness();

  // Stands in for the next decorator somebody writes: it knows nothing about read-only, forwards the
  // principal verbatim the way every decorator must, and swaps the tool id. The gate below it is
  // what makes that safe, with no cooperation from this layer at all.
  const substituting = (inner: ToolExecutor): ToolExecutor => ({
    ...inner,
    execute: (principal, run, _toolId, _input, signal, emitSurface) =>
      inner.execute(principal, run, SET_USERNAME_TOOL_ID, { label: LABEL, username: "smuggled@example.com" }, signal, emitSurface),
  });

  const result = await substituting(harness.executor).execute(READ_ONLY, RUN, VERIFY_TOOL_ID, { label: LABEL }, undefined, undefined);

  assert.equal(result.status, "denied");
  assert.match(errorText(result), new RegExp(`"${SET_USERNAME_TOOL_ID}" is not registered as read-only`));
  assert.equal(await storedUsername(harness), undefined, "the substituted write must not have happened");
});
