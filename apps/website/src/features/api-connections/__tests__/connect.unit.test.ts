/**
 * @file Phase-C unit tests for `connect.ts` (the API-connection branch of `agent_plugin_connect`):
 * the already-connected short cut, the hosted wait (polls until the callback installs a newer
 * credential; times out or aborts to `waiting-for-sign-in`), a missing requested scope forcing a new
 * sign-in, refusals mapped to caller-facing `ToolInputError`s (other faults unchanged), and the
 * desktop loopback path: completes itself, maps a failed exchange, and always closes its 127.0.0.1
 * listener when the card fails, the run aborts or the start is refused.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, afterEach, before, test } from "node:test";

import { ToolInputError } from "@jini-ai/core";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { startLoopbackAuthorizationReceiver } from "@jini-ai/oauth";

import { runApiConnectionConnect, startApiConnectionSignIn } from "../connect.js";
import type { ApiConnectionHost } from "../host.js";
import { ACME_FIXTURE_ROOT, ACME_PLUGIN, acmeFixtureCopy, connectHosted, startAcmeHarness, type AcmeHarness } from "./support/acme-harness.js";

let harness: AcmeHarness;
before(async () => { harness = await startAcmeHarness(); });
afterEach(() => harness.reset());
after(async () => { await harness.close(); });

const fixtureHooks = (): string => readFileSync(path.join(ACME_FIXTURE_ROOT, "lib", "connection.mjs"), "utf8");

interface RunOptions {
  readonly showSignIn?: (input: { readonly signInUrl: string }) => Promise<void>;
  readonly signal?: AbortSignal;
  readonly pollIntervalMs?: number;
  readonly waitTimeoutMs?: number;
}

async function run(host: ApiConnectionHost, options: RunOptions = {}) {
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  return runApiConnectionConnect({
    deps: { host }, connection: connection!, actorId: "admin-1", showSignIn: options.showSignIn ?? (async () => {}),
    signal: options.signal ?? new AbortController().signal, pollIntervalMs: options.pollIntervalMs ?? 10, waitTimeoutMs: options.waitTimeoutMs ?? 60,
  });
}

/** Wraps Jini's real loopback receiver to see each listener's redirect URI and the signal that closes it. */
function observedLoopback() {
  const opened: { redirectUri: string; signal: AbortSignal | undefined }[] = [];
  const startLoopback: typeof startLoopbackAuthorizationReceiver = async (required, optional = {}) => {
    const receiver = await startLoopbackAuthorizationReceiver(required, optional);
    opened.push({ redirectUri: receiver.redirectUri, signal: optional.signal });
    return receiver;
  };
  return { opened, startLoopback };
}

const isClosed = async (redirectUri: string): Promise<boolean> => fetch(redirectUri).then(() => false, () => true);

test("already connected with every requested scope: connected, with no sign-in card", async () => {
  const host = harness.makeHost();
  const { connectionRef } = await connectHosted(harness, host);
  const cards: string[] = [];
  assert.deepEqual(await run(host, { showSignIn: async ({ signInUrl }) => { cards.push(signInUrl); } }), { status: "connected", connectionRef });
  assert.deepEqual(cards, []);
});

test("connected but missing a scope the connection now requests: a new sign-in card is shown", async (t) => {
  const keyring = new InMemoryKeyring({ hkdfSalt: "connect-c3-scopes" });
  const vaultRepo = new InMemoryVaultRepo({});
  const first = harness.makeHost({ keyring, vaultRepo });
  const { connectionRef } = await connectHosted(harness, first);
  const widened = fixtureHooks().replace('return ["acme.files",', 'return ["acme.files", "acme.audit",');
  const host = harness.makeHost({ keyring, vaultRepo, packageRoot: acmeFixtureCopy(t, () => {}, { "lib/connection.mjs": widened }) });
  const cards: string[] = [];
  const result = await run(host, { showSignIn: async ({ signInUrl }) => { cards.push(signInUrl); } });
  assert.deepEqual(result, { status: "waiting-for-sign-in", connectionRef });
  assert.equal(cards.length, 1);
  assert.match(new URL(cards[0]!).searchParams.get("scope") ?? "", /acme\.audit/);
});

test("hosted: the call polls the record until the public callback installs a newer credential", async () => {
  const host = harness.makeHost();
  let consented: Promise<number> | undefined;
  const result = await run(host, {
    waitTimeoutMs: 5_000,
    // The person finishes consent a little after the card is shown, so the first polls see no new credential.
    showSignIn: async ({ signInUrl }) => { consented = new Promise((resolve) => { setTimeout(() => resolve(harness.consent(signInUrl)), 50); }); },
  });
  assert.equal(result.status, "connected");
  assert.equal(await consented, 200);
});

test("hosted: no callback within the wait returns waiting-for-sign-in with the ref to use later", async () => {
  const host = harness.makeHost();
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  const result = await run(host, { waitTimeoutMs: 40 });
  assert.deepEqual(result, { status: "waiting-for-sign-in", connectionRef: (await host.statusOf({ connection: connection! })).connectionRef });
});

test("hosted: aborting the run ends the wait early", async () => {
  const host = harness.makeHost();
  const controller = new AbortController();
  const startedAt = performance.now();
  const result = await run(host, { signal: controller.signal, waitTimeoutMs: 10_000, pollIntervalMs: 5_000, showSignIn: async () => { setTimeout(() => controller.abort(), 20); } });
  assert.equal(result.status, "waiting-for-sign-in");
  assert.ok(performance.now() - startedAt < 2_000, "the pause woke on abort instead of sleeping out its interval");
});

test("hosted: an API-connection refusal at start is a caller-facing input error with its safe message", async () => {
  const { TOVU_API_CONNECTION_CALLBACK_ORIGINS: _unset, ...env } = harness.env;
  const host = harness.makeHost({ env });
  await assert.rejects(run(host), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.match(error.message, /^agent_plugin_connect: Acme Office cannot sign in on this site yet: no registered sign-in return address is configured/);
    return true;
  });
});

test("a fault that is not an API-connection refusal propagates unchanged (not dressed up as input error)", async (t) => {
  // The scope hook answers the status check (first call) and breaks inside the sign-in start (second).
  const broken = fixtureHooks().replace("async resolveScopes({ scopeSetIds }) {", "async resolveScopes({ scopeSetIds }) { globalThis.__acmeScopeCalls = (globalThis.__acmeScopeCalls ?? 0) + 1; if (globalThis.__acmeScopeCalls > 1) throw new Error('scope hook broke');");
  const host = harness.makeHost({ packageRoot: acmeFixtureCopy(t, () => {}, { "lib/connection.mjs": broken }) });
  const counter = globalThis as { __acmeScopeCalls?: number };
  t.after(() => { delete counter.__acmeScopeCalls; });
  await assert.rejects(run(host), (error: unknown) => {
    assert.ok(!(error instanceof ToolInputError));
    assert.equal((error as Error).message, "scope hook broke");
    return true;
  });
});

test("desktop: the call completes the sign-in itself through its loopback listener", async () => {
  const { opened, startLoopback } = observedLoopback();
  const host = harness.makeHost({ runtime: "desktop", startLoopback });
  const statuses: number[] = [];
  const result = await run(host, { waitTimeoutMs: 5_000, showSignIn: async ({ signInUrl }) => { void harness.consent(signInUrl).then((status) => statuses.push(status)); } });
  assert.equal(result.status, "connected");
  assert.equal(opened.length, 1);
  assert.ok(await isClosed(opened[0]!.redirectUri), "the listener is closed once the call returns");
});

test("desktop: a failed code exchange is a caller-facing input error", async () => {
  const host = harness.makeHost({ runtime: "desktop" });
  harness.provider.tokenStatus = 400;
  harness.provider.tokenBody = { error: "invalid_grant" };
  await assert.rejects(run(host, { waitTimeoutMs: 5_000, showSignIn: async ({ signInUrl }) => { void harness.consent(signInUrl); } }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.match(error.message, /^agent_plugin_connect: /);
    return true;
  });
});

test("desktop: a card that cannot be shown closes the loopback listener instead of leaving it to its timeout", async () => {
  const { opened, startLoopback } = observedLoopback();
  const host = harness.makeHost({ runtime: "desktop", startLoopback });
  await assert.rejects(run(host, { waitTimeoutMs: 60_000, showSignIn: async () => { throw new Error("card could not be shown"); } }), { message: "card could not be shown" });
  assert.equal(opened[0]!.signal?.aborted, true);
  assert.ok(await isClosed(opened[0]!.redirectUri));
});

test("desktop: aborting the run closes the listener and returns waiting-for-sign-in", async () => {
  const { opened, startLoopback } = observedLoopback();
  const host = harness.makeHost({ runtime: "desktop", startLoopback });
  const controller = new AbortController();
  const result = await run(host, { signal: controller.signal, waitTimeoutMs: 60_000, showSignIn: async () => { setTimeout(() => controller.abort(), 20); } });
  assert.equal(result.status, "waiting-for-sign-in");
  assert.ok(await isClosed(opened[0]!.redirectUri));
});

test("desktop start: a start the service refuses closes the listener it armed and propagates the refusal", async () => {
  const { opened, startLoopback } = observedLoopback();
  const host = harness.makeHost({ runtime: "desktop", startLoopback });
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  await assert.rejects(startApiConnectionSignIn({ host, connection: connection!, actorId: "admin-1", intent: "connect", scopeSetIds: [] }, { startParams: { undeclared_param: "x" } }), { name: "ApiConnectionError" });
  assert.equal(opened.length, 1);
  assert.equal(opened[0]!.signal?.aborted, true);
  assert.ok(await isClosed(opened[0]!.redirectUri));
});

test("desktop start: the caller's own signal closes the pending listener, and the completion reads null", async () => {
  const { opened, startLoopback } = observedLoopback();
  const host = harness.makeHost({ runtime: "desktop", startLoopback });
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  const controller = new AbortController();
  const start = await startApiConnectionSignIn({ host, connection: connection!, actorId: "admin-1", intent: "connect", scopeSetIds: [] }, { signal: controller.signal, timeoutMs: 60_000 });
  controller.abort();
  assert.equal(await start.completion, null);
  assert.ok(await isClosed(opened[0]!.redirectUri));
});
