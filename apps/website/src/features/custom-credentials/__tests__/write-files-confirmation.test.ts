import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../store.js";
import { buildCustomCredentialsRegistrations, type CustomCredentialsToolDeps } from "../tool-registrations.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { githubFromSource } from "../../source-control/__tests__/fixtures/github-from-source.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file Direct named-file writes: provider commit, validation, permission and abort contracts.
 * Shared-policy approval tests belong to that policy's owner. Provider planning needs the saved
 * credential for read-only branch/tree/existence queries, unlike DELETE's non-decrypting pre-check,
 * so TrackingSecretSealer verifies exactly one decrypt for the plan rather than zero decrypts.
 */

const WORKSPACE_ID = "ws-cred-write-files";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-09T00:00:00.000Z";
const TOOL_ID = "custom_credential_write_files";

class TrackingSecretSealer implements SecretSealerPort {
  sealCalls = 0;
  openCalls = 0;
  constructor(private readonly inner: SecretSealerPort) {}
  seal(input: Parameters<SecretSealerPort["seal"]>[0]): ReturnType<SecretSealerPort["seal"]> {
    this.sealCalls += 1;
    return this.inner.seal(input);
  }
  open(input: Parameters<SecretSealerPort["open"]>[0], optional: Parameters<SecretSealerPort["open"]>[1] = {}): ReturnType<SecretSealerPort["open"]> {
    this.openCalls += 1;
    return this.inner.open(input, optional);
  }
}

/** Sequential, order-verifying fake `HttpClientPort` — same discipline
 *  `bundled-github-write-files.unit.test.ts`'s own `SequentialFakeHttpClient` uses, kept local per this
 *  codebase's "each test file owns its own fixtures" convention. */
class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly steps: { match: RegExp; status: number; json?: unknown }[];

  constructor(steps: { match: RegExp; status: number; json?: unknown }[]) {
    this.steps = [...steps];
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const step = this.steps.shift();
    if (!step) throw new Error(`unexpected send() call (no more steps queued): ${request.method} ${request.url}`);
    if (!step.match.test(request.url)) throw new Error(`send() call ${request.method} ${request.url} did not match ${step.match}`);
    return { status: step.status, headers: {}, bodyText: JSON.stringify(step.json ?? {}) };
  }
}

/** The plan-phase steps every test in this file needs before the dialog can even be raised: one
 *  branch/tip lookup, one parent-commit lookup, and one existence check per file in `VALID_INPUT`. */
function planSteps() {
  return [
    { match: /\/git\/ref\/heads\/main$/, status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, status: 200, json: { tree: { sha: "base-tree-sha" } } },
    { match: /\/contents\?ref=main$/, status: 404, json: {} },
  ];
}

/** The commit phase's first call (bebc5736f): a non-recursive read of the CONFIRMED base tree, so an
 *  overwritten file keeps its mode (100644/100755). `fly.toml` is absent here, so it is written 100644. */
function modeLookupStep() {
  return { match: /\/git\/trees\/base-tree-sha$/, status: 200, json: { tree: [], truncated: false } };
}

function fakeRouteDeps(options: { allow?: boolean; httpSteps?: { match: RegExp; status: number; json?: unknown }[] } = {}) {
  let allow = options.allow ?? true;
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new TrackingSecretSealer(new AesGcmSecretSealer(keyring));
  const httpClient = new FakeHttpClient(options.httpSteps ?? planSteps());

  const deps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: createFakeClock({ startIso: NOW }),
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    idGen: (() => {
      let n = 0;
      return { newId: () => `deps-cred-${++n}` };
    })(),
    customCredentialsHttpClient: httpClient,
    loadSourceControlProviders: githubFromSource,
    authorize: async (params: Record<string, unknown>) => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };

  const writeDeps: CustomCredentialWriteDeps = {
    repo,
    sealer,
    keyring,
    clock: createFakeClock({ startIso: NOW }),
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
  };

  return { deps, sealer, httpClient, writeDeps, setAllow: (value: boolean) => { allow = value; } };
}

async function seedGithub(writeDeps: CustomCredentialWriteDeps) {
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "github",
    category: "source-control",
    baseUrl: "https://api.github.com",
    additionalHosts: [],
    connection: { token: "github-secret-token" },
  });
}

const VALID_INPUT = { label: "github", owner: "octo", repo: "demo", branch: "main", commitMessage: "deploy", files: [{ path: "fly.toml", content: "app = 'demo'" }] };

function buildRegistrations(deps: CustomCredentialsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildCustomCredentialsRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? VALID_INPUT,
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

async function beginCall(writeTool: ToolRegistration, input: Record<string, unknown> = VALID_INPUT) {
  return {pending: call(writeTool, {input})};
}

// ---------------------------------------------------------------------------
// 2. The model-facing schema cannot forge an approval answer
// ---------------------------------------------------------------------------

test("the model's own schema publishes only label/owner/repo/branch/commitMessage/files — no decision or exchange-id field", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const schema = writeTool.descriptor.inputSchema as { properties: object; additionalProperties?: boolean };
  assert.deepEqual(Object.keys(schema.properties).sort(), ["branch", "commitMessage", "files", "label", "owner", "repo"]);
  assert.equal(schema.additionalProperties, false);
});

// ---------------------------------------------------------------------------
// 3. Repository write contract
// ---------------------------------------------------------------------------

test("the direct call performs the real write (blob, tree, commit, ref) and reports it", async () => {
  const { deps, httpClient, writeDeps } = fakeRouteDeps({
    httpSteps: [
      ...planSteps(),
      modeLookupStep(),
      { match: /\/git\/blobs$/, status: 201, json: { sha: "blob-sha" } },
      { match: /\/git\/trees$/, status: 201, json: { sha: "new-tree-sha" } },
      { match: /\/git\/commits$/, status: 201, json: { sha: "new-commit-sha" } },
      { match: /\/git\/refs\/heads\/main$/, status: 200, json: {} },
    ],
  });
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending } = await beginCall(writeTool);
  const result = await pending;

  assert.deepEqual(result, { executed: true, commitSha: "new-commit-sha", commitUrl: "https://github.com/octo/demo/commit/new-commit-sha", filesWritten: 1 });
  assert.equal(httpClient.calls.length, 8);
  for (const request of httpClient.calls) assert.equal(request.headers?.Authorization, "Bearer github-secret-token");
  const [modeLookup, blob, tree, commit, ref] = httpClient.calls.slice(3);
  assert.equal(modeLookup!.method, "GET");
  const blobBody = JSON.parse(blob!.body!);
  assert.equal(blob!.method, "POST");
  assert.equal(blobBody.encoding, "base64");
  assert.equal(Buffer.from(blobBody.content, "base64").toString("utf8"), VALID_INPUT.files[0]!.content);
  assert.deepEqual(JSON.parse(tree!.body!), { base_tree: "base-tree-sha", tree: [{ path: "fly.toml", mode: "100644", type: "blob", sha: "blob-sha" }] });
  assert.deepEqual(JSON.parse(commit!.body!), { message: VALID_INPUT.commitMessage, tree: "new-tree-sha", parents: ["parent-sha"] });
  assert.deepEqual(JSON.parse(ref!.body!), { sha: "new-commit-sha" });
  assert.ok(httpClient.calls.some((c) => c.url.endsWith("/git/blobs")));
  assert.ok(httpClient.calls.some((c) => c.url.endsWith("/git/trees")));
  assert.ok(httpClient.calls.some((c) => c.url.endsWith("/git/commits")));
  assert.ok(httpClient.calls.some((c) => c.url.endsWith("/git/refs/heads/main")));
});

// ---------------------------------------------------------------------------
// 4. Validation and permission refusals
// ---------------------------------------------------------------------------

test("an invalid input (bad owner) is refused before any decrypt or network call, and no dialog is raised", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  // The host's (github plugin's) own text, checked once the credential's base URL names the host.
  // Validation must reject this input even when a surface emitter is available.
  await assert.rejects(
    () => call(writeTool, { input: { ...VALID_INPUT, owner: "-bad" }, emitSurface: async () => undefined }),
    /invalid GitHub owner '-bad'/
  );
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
  assert.equal(surfaceExchanges.size(), 0);
});

test("a caller-fixable validation refusal arrives as a ToolInputError carrying this tool's schema, not as a bare Error the daemon redacts to INTERNAL_ERROR", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(
    () => call(writeTool, { input: { ...VALID_INPUT, files: [{ path: "../escape.txt", content: "x" }] } }),
    (error: unknown) => {
      // `CustomCredentialValidationError` extends plain Error, so an undecorated throw reaches
      // `@jini-ai/daemon`'s ToolExecutor as errorKind 'internal' and `@jini-ai/http-kit`'s
      // delegatedToolExecuteRoute SEC-005-redacts it to a bare INTERNAL_ERROR — stripping the one
      // thing the caller could act on. Same classification the two `makeCredentialedRequest` call
      // sites in this file already apply.
      assert.ok(error instanceof ToolInputError, `expected ToolInputError, got ${error instanceof Error ? error.constructor.name : String(error)}`);
      assert.match(error.message, /file path escapes the repository root/, "the caller must still learn WHICH rule refused the call");
      assert.match(error.message, /"commitMessage"/, "and the published schema, so one turn fixes the call instead of a guessing game");
      return true;
    }
  );
});

test("a branch that does not exist is refused before any dialog", async () => {
  const { deps, writeDeps, httpClient } = fakeRouteDeps({ httpSteps: [{ match: /\/git\/ref\/heads\/main$/, status: 404, json: {} }] });
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const emitted: unknown[] = [];
  await assert.rejects(() => call(writeTool, { emitSurface: async (surface) => void emitted.push(surface) }), /branch 'main' does not exist in octo\/demo/);
  assert.equal(httpClient.calls.length, 1);
  assert.match(httpClient.calls[0]!.url, /\/git\/ref\/heads\/main$/);
  assert.deepEqual(emitted, []);
  assert.equal(surfaceExchanges.size(), 0);
});

test("insufficient permission is refused before any decrypt or network call", async () => {
  const { deps, sealer, httpClient, writeDeps, setAllow } = fakeRouteDeps();
  await seedGithub(writeDeps);
  setAllow(false);
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(writeTool));
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
});

 test("n06: repository write runs without a confirmation channel", async (t) => {
  const {deps, writeDeps, httpClient} = fakeRouteDeps({httpSteps: [...planSteps(), modeLookupStep(),
    {match: /\/git\/blobs$/, status: 201, json: {sha: "blob-sha"}},
    {match: /\/git\/trees$/, status: 201, json: {sha: "new-tree-sha"}},
    {match: /\/git\/commits$/, status: 201, json: {sha: "new-commit-sha"}},
    {match: /\/git\/refs\/heads\/main$/, status: 200, json: {}},
  ]});
  await seedGithub(writeDeps);
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const result = await call(tool(buildRegistrations(deps, store), TOOL_ID), {input: VALID_INPUT}) as {executed: boolean};
  assert.equal(result.executed, true);
  assert.deepEqual(httpClient.calls.filter(c => c.method !== "GET").map(c => c.method), ["POST", "POST", "POST", "PATCH"]);
  assert.equal(store.size(), 0);
});
