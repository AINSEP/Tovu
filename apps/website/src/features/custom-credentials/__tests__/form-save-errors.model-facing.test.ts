/**
 * @file Regression suite for the SAVE-failure branch of `custom_credential_set_token` and
 * `custom_credential_create` (2026-09-16, w7).
 *
 * The defect: both form-answer handlers caught ANY error from the save and put its raw `err.message`
 * into two places at once — the structured `{ saved|created: false, reason: "error", message }`
 * result the model reads, and the mcp-ui outcome resource rendered to the human. The comment above
 * that catch claimed no error there could carry a field VALUE. It could:
 * - `store.ts`'s `sealConnection` wraps the sealer's own failure text into
 *   `CustomCredentialSecretStoreUnconfiguredError`, and the sealer is handed the submitted token as
 *   its plaintext. A `SecretSealerPort` adapter whose failure text quotes its input puts the token in
 *   that message; `decryptRecord`'s `JSON.parse` arm is the in-tree precedent for exactly that shape.
 * - With the SHIPPED `EnvOrFileKeyring`, an install with no root key puts the env var name and the
 *   absolute key-file path into that same message.
 * - A raw repo/driver failure reached the model and the human verbatim.
 *
 * Driven through the REAL delegated-tool transport (`delegatedToolExecuteRoute` over a real
 * `ToolRegistry`/`ToolExecutor`/`RunLifecycle`), with the human's submission delivered through a real
 * `SurfaceExchangeStore`. What is asserted is the literal payload the agent CLI receives plus every
 * event the run emitted — the outcome resource the human sees is one of those events.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { EnvOrFileKeyring } from "../../webhooks/keyring.env.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import type { KeyringPort, SecretSealerPort } from "../../webhooks/index.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { CREATE_TOOL_ID } from "../custom-credential-create-ui.js";
import { SET_TOKEN_TOOL_ID } from "../custom-credential-set-token-ui.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential } from "../store.js";
import { buildCustomCredentialsRegistrations, type CustomCredentialsToolDeps } from "../tool-registrations.js";
import type { CustomCredentialSetRepoPort } from "../types.js";

const WORKSPACE_ID = "ws-cred-form-save-errors";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-16T00:00:00.000Z";

/** Every planted secret starts with this. It must appear NOWHERE the model, the human, or a log can read. */
const LEAK_MARKER = "LEAK-";
const SAVED_TOKEN = "LEAK-OLD-TOKEN-7f3a";
const SUBMITTED_TOKEN = "LEAK-NEW-TOKEN-91c2";

/** The SHIPPED keyring, configured the way an install with no root key is: env var unset, no key
 *  file, no auto-generation. Nothing is read or written — the path does not exist. */
const MISSING_ROOT_KEY_ENV = "TOVU_W7_TEST_UNSET_ROOT_KEY";
const MISSING_ROOT_KEY_PATH = "/nonexistent-w7-root-key-dir/integrations-root-key.hex";

const SECRET_STORE_MESSAGE =
  "The site's secret store could not seal or open this credential: its root key is missing or unusable, or the stored credential is unreadable. Nothing was saved.";
const INTERNAL_FAILURE_MESSAGE = "Saving failed because of an internal server error. Nothing was saved. The server log has the details.";

class ExplodingHttpClient implements HttpClientPort {
  async send(_request: HttpRequest): Promise<HttpResponse> {
    throw new Error("the form-save paths must never call the HTTP client");
  }
}

/** A `SecretSealerPort` adapter whose failure text quotes the plaintext it was handed — the shape
 *  `decryptRecord`'s `JSON.parse` arm already produces for decrypted plaintext. */
function plaintextEchoingSealer(inner: SecretSealerPort): SecretSealerPort {
  return {
    seal: async (input) => {
      throw new Error(`Unexpected token 'L', "${input.plaintext}" is not valid JSON`);
    },
    open: (input) => inner.open(input),
  };
}

interface HarnessOptions {
  sealer?: (inner: SecretSealerPort) => SecretSealerPort;
  keyring?: KeyringPort;
  repo?: (inner: InMemoryCustomCredentialSetRepo) => CustomCredentialSetRepoPort;
}

async function buildHarness(options: HarnessOptions = {}) {
  const repo = new InMemoryCustomCredentialSetRepo();
  const seedKeyring = new InMemoryKeyring();
  const realSealer = new AesGcmSecretSealer(seedKeyring);
  let counter = 0;
  const idGen = { newId: () => `cred-${++counter}` };
  const clock = { nowIso: () => NOW };

  // Seeded with a working sealer: only the handler under test sees the failing one.
  const seeded = await createCustomCredential(
    { repo, sealer: realSealer, keyring: seedKeyring, clock, idGen },
    { workspaceId: WORKSPACE_ID, label: "fly.io", category: "ops", baseUrl: "https://api.fly.io", connection: { token: SAVED_TOKEN } }
  );

  const keyring = options.keyring ?? seedKeyring;
  const logLines: string[] = [];
  const deps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock,
    customCredentialSetRepo: options.repo ? options.repo(repo) : repo,
    siteAssistantSecretSealer: options.sealer ? options.sealer(realSealer) : options.keyring ? new AesGcmSecretSealer(keyring) : realSealer,
    siteAssistantSecretKeyring: keyring,
    idGen,
    customCredentialsHttpClient: new ExplodingHttpClient(),
    customCredentialsFailureLog: (line) => logLines.push(line),
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };

  // The real store, with `open` observed so a test can answer the exchange the handler opened.
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
  for (const registration of buildCustomCredentialsRegistrations(deps, { surfaceExchanges: observedExchanges })) {
    registry.register(registration);
  }
  const eventLog = createInMemoryEventLog();
  const lifecycle = createRunLifecycle({ eventLog });
  const toolExecutor = createToolExecutor({ registry });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });

  return { repo, seeded, surfaceExchanges, openedExchangeIds, eventLog, lifecycle, toolExecutor, run, logLines };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

let toolUseCounter = 0;

/**
 * Calls `toolId` through the real transport, waits for the form it raises, submits `params` as the
 * human, and returns the wire result plus everything the run emitted (the outcome resource included).
 */
async function submitForm(harness: Harness, toolId: string, input: unknown, params: Record<string, unknown>) {
  const pending = delegatedToolExecuteRoute.handle(
    { runId: harness.run.id, toolUseId: `tu-${++toolUseCounter}`, toolId, input },
    { lifecycle: harness.lifecycle, toolExecutor: harness.toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) } as never
  );
  for (let tick = 0; tick < 200 && harness.openedExchangeIds.length === 0; tick++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const exchangeId = harness.openedExchangeIds[0];
  assert.ok(exchangeId, `${toolId}: the form must be raised before it can be answered`);
  const delivered = harness.surfaceExchanges.deliver({ exchangeId, toolId, principalId: PRINCIPAL_ID, params });
  assert.ok(delivered, `${toolId}: the submission must reach the parked call`);

  const wire = await pending;
  const events = await harness.eventLog.replay(harness.run.id, null);
  return { wire, wireText: JSON.stringify(wire), eventsText: JSON.stringify(events) };
}

/** The structured tool result inside the transport's `{ ok: true, value: { result } }` envelope. */
function structuredOutput(wireText: string): Record<string, unknown> {
  const match = /"reason":"(\w[\w-]*)","message":"((?:[^"\\]|\\.)*)"/.exec(wireText);
  assert.ok(match, `expected a structured {reason, message} failure on the wire: ${wireText}`);
  return { reason: match[1], message: JSON.parse(`"${match[2]}"`) };
}

function assertNowhere(label: string, haystacks: Record<string, string>, needle: string) {
  for (const [where, text] of Object.entries(haystacks)) {
    assert.ok(!text.includes(needle), `${label}: '${needle}' reached the ${where}: ${text}`);
  }
}

/* ------------------------------------------------------------------------------------------------
 * custom_credential_set_token
 * ---------------------------------------------------------------------------------------------- */

test("set_token: a seal failure that quotes the submitted token never reaches the model, the outcome resource, or the log", async () => {
  const harness = await buildHarness({ sealer: plaintextEchoingSealer });

  const { wireText, eventsText } = await submitForm(harness, SET_TOKEN_TOOL_ID, { label: "fly.io" }, { token: SUBMITTED_TOKEN });

  assertNowhere("set_token", { "model-facing result": wireText, "run events (outcome resource)": eventsText, log: harness.logLines.join("\n") }, LEAK_MARKER);
  assert.deepEqual(structuredOutput(wireText), { reason: "error", message: SECRET_STORE_MESSAGE });
  assert.equal(harness.logLines.length, 1, harness.logLines.join("\n"));
  assert.match(harness.logLines[0]!, /custom_credential_set_token: save failed .*error=CustomCredentialSecretStoreUnconfiguredError/);
});

test("set_token: the SHIPPED keyring's missing-root-key text (env var name, absolute key-file path) never reaches the model or the human", async () => {
  const harness = await buildHarness({
    keyring: new EnvOrFileKeyring({ envVarName: MISSING_ROOT_KEY_ENV, keyFilePath: MISSING_ROOT_KEY_PATH, allowFileFallback: true, allowFileAutoGenerate: false }),
  });

  const { wireText, eventsText } = await submitForm(harness, SET_TOKEN_TOOL_ID, { label: "fly.io" }, { token: SUBMITTED_TOKEN });

  const haystacks = { "model-facing result": wireText, "run events (outcome resource)": eventsText, log: harness.logLines.join("\n") };
  assertNowhere("set_token", haystacks, MISSING_ROOT_KEY_PATH);
  assertNowhere("set_token", haystacks, MISSING_ROOT_KEY_ENV);
  assertNowhere("set_token", haystacks, LEAK_MARKER);
  assert.deepEqual(structuredOutput(wireText), { reason: "error", message: SECRET_STORE_MESSAGE });
});

test("set_token: an UNLISTED failure (a raw repo error) gets the generic message; the log keeps only its class and code", async () => {
  const rawRepoError = Object.assign(new Error(`SQLITE_READONLY: attempt to write a readonly database (/srv/${LEAK_MARKER}internal/content.db)`), { code: "SQLITE_READONLY" });
  const harness = await buildHarness({
    repo: (inner) =>
      Object.assign(Object.create(inner) as CustomCredentialSetRepoPort, {
        update: async () => {
          throw rawRepoError;
        },
      }),
  });

  const { wireText, eventsText } = await submitForm(harness, SET_TOKEN_TOOL_ID, { label: "fly.io" }, { token: SUBMITTED_TOKEN });

  assertNowhere("set_token", { "model-facing result": wireText, "run events (outcome resource)": eventsText, log: harness.logLines.join("\n") }, LEAK_MARKER);
  assert.deepEqual(structuredOutput(wireText), { reason: "error", message: INTERNAL_FAILURE_MESSAGE });
  assert.equal(harness.logLines.length, 1, harness.logLines.join("\n"));
  assert.match(harness.logLines[0]!, /error=Error\(SQLITE_READONLY\)$/);
});

test("set_token: an ALLOWLISTED failure keeps its real reason — a row deleted while the form was open says not-found", async () => {
  const harness = await buildHarness();
  const pendingDelete = harness.repo;

  // Delete the row between the form opening and the human submitting it.
  const originalFindById = pendingDelete.findById.bind(pendingDelete);
  let reads = 0;
  pendingDelete.findById = async (input) => {
    reads += 1;
    if (reads === 1) await pendingDelete.delete(input);
    return originalFindById(input);
  };

  const { wireText, eventsText } = await submitForm(harness, SET_TOKEN_TOOL_ID, { label: "fly.io" }, { token: SUBMITTED_TOKEN });

  assertNowhere("set_token", { "model-facing result": wireText, "run events (outcome resource)": eventsText }, LEAK_MARKER);
  assert.deepEqual(structuredOutput(wireText), { reason: "error", message: `no custom credential '${harness.seeded.id}' in this workspace` });
});

/* ------------------------------------------------------------------------------------------------
 * custom_credential_create
 * ---------------------------------------------------------------------------------------------- */

const CREATE_SUBMISSION = { label: "github", baseUrl: "https://api.github.com", category: "source-control", token: SUBMITTED_TOKEN };

test("create: a seal failure that quotes the submitted token never reaches the model, the outcome resource, or the log", async () => {
  const harness = await buildHarness({ sealer: plaintextEchoingSealer });

  const { wireText, eventsText } = await submitForm(harness, CREATE_TOOL_ID, {}, CREATE_SUBMISSION);

  assertNowhere("create", { "model-facing result": wireText, "run events (outcome resource)": eventsText, log: harness.logLines.join("\n") }, LEAK_MARKER);
  assert.deepEqual(structuredOutput(wireText), { reason: "error", message: SECRET_STORE_MESSAGE });
  assert.equal(harness.logLines.length, 1, harness.logLines.join("\n"));
  assert.match(harness.logLines[0]!, /custom_credential_create: save failed .*error=CustomCredentialSecretStoreUnconfiguredError/);
});

test("create: an UNLISTED failure (a raw insert error) is reported as 'error' with the generic message, never as 'invalid'", async () => {
  const harness = await buildHarness({
    repo: (inner) =>
      Object.assign(Object.create(inner) as CustomCredentialSetRepoPort, {
        insert: async () => {
          throw new Error(`disk I/O error at /srv/${LEAK_MARKER}internal/content.db`);
        },
      }),
  });

  const { wireText, eventsText } = await submitForm(harness, CREATE_TOOL_ID, {}, CREATE_SUBMISSION);

  assertNowhere("create", { "model-facing result": wireText, "run events (outcome resource)": eventsText, log: harness.logLines.join("\n") }, LEAK_MARKER);
  assert.deepEqual(structuredOutput(wireText), { reason: "error", message: INTERNAL_FAILURE_MESSAGE });
});

test("create: an ALLOWLISTED validation failure keeps the store's own exact message", async () => {
  const harness = await buildHarness();

  const { wireText } = await submitForm(harness, CREATE_TOOL_ID, {}, { ...CREATE_SUBMISSION, category: "not-a-category" });

  assert.deepEqual(structuredOutput(wireText), { reason: "invalid", message: "category must be one of: source-control, hosting, media, ai, ops, general" });
  assert.ok(!wireText.includes(LEAK_MARKER), wireText);
});
