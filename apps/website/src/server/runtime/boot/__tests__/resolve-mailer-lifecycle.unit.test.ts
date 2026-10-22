import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import {
  createCustomCredential,
  deleteCustomCredential,
  InMemoryCustomCredentialSetRepo,
  updateCustomCredential,
  type CustomCredentialSetRecord,
  type CustomCredentialSetRepoPort,
  type CustomCredentialWriteDeps,
} from "#src/features/custom-credentials/index";
import type { MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import type { HttpClientPort } from "#src/platform/http/index";
import type { MailerPort, MailerSendResult } from "#src/platform/mail/index";
import type { MailProviderSetting } from "@jini-ai/platform/mail";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createResolvedMailer, MAIL_SMTP_CREDENTIAL_LABEL, type MailProviderSettingPort, type ResolveMailerDeps } from "../resolve-mailer.js";

/**
 * @file `createResolvedMailer`'s cached-provider lifecycle (email phase 2): a replaced key is used
 * by the next send with no restart and no explicit invalidation, `invalidate()` rebuilds, the status
 * is cached for a TTL on an injected clock with `refresh`, and provider failures surface as
 * `lastError`. Every provider here is a fake plugin module; nothing sends real mail.
 */

const WS = "ws-life";
const LABEL = "Tovu Mail — Fake Mail API";
const MESSAGE = { workspaceId: WS, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "hi", text: "hi" };
const OPTIONS = { idempotencyKey: "k1", workspaceId: WS, sourceContext: { module: "test" } };

function credentialDeps(): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let n = 0;
  return { repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring, clock: createFakeClock({ startIso: "2026-10-22T00:00:00.000Z" }), idGen: { newId: () => `cred-${++n}` } };
}

function setting(value: MailProviderSetting): MailProviderSettingPort {
  return { read: async () => value, write: async () => {} };
}

/** A repo whose `listByWorkspace` throws while `failing.on` is set. */
function flakyRepo(inner: CustomCredentialSetRepoPort): CustomCredentialSetRepoPort & { failing: { on: boolean; remaining: number } } {
  const failing = { on: false, remaining: Infinity };
  return Object.assign(Object.create(inner) as CustomCredentialSetRepoPort, {
    vault: inner.vault, failing,
    listByWorkspace: async (input: { workspaceId: string }): Promise<CustomCredentialSetRecord[]> => {
      if (failing.on && failing.remaining > 0) { failing.remaining -= 1; throw new Error("store offline"); }
      return inner.listByWorkspace(input);
    },
  });
}

/** One fake plugin provider: each create() records the key it got; send answers `result`. */
function fakeProvider(optional: { result?: () => MailerSendResult; domainStatus?: (domain: string) => Promise<unknown> } = {}) {
  const keys: string[] = [];
  const result = optional.result ?? (() => ({ ok: true as const, providerMessageId: "fake-1", acceptedAt: "2026-10-22T00:00:00.000Z" }));
  const create = ({ credential }: { credential: { token: string } }): MailerPort => {
    keys.push(credential.token);
    return {
      capabilities: () => ({ driver: "fakemail", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async () => result(),
      sendBatch: async (messages) => messages.map(() => result()),
    };
  };
  const domain = optional.domainStatus
    ? { domainRequirements: async () => ({ status: "ok", value: { purpose: "mail", domain: "example.com", providerId: "fakemail", records: [] } }), domainStatus: async (_ctx: unknown, { domain: d }: { domain: string }) => optional.domainStatus!(d) }
    : {};
  const registry: MailAdapterRegistry = { refusals: [], list: () => [{
    pluginId: "fake-plugin",
    descriptor: { schemaVersion: 2, id: "fakemail", label: "Fake Mail", module: "a.mjs", credentialLabel: LABEL, credentialKeys: ["token"], feedback: false },
    module: { id: "fakemail", capabilities: { hosted: true, feedback: false, domainVerification: Boolean(optional.domainStatus) }, ...domain, create } as never,
  }] };
  return { keys, registry };
}

function deps(required: { creds: CustomCredentialWriteDeps; registry: MailAdapterRegistry }, overrides: Partial<ResolveMailerDeps> = {}): ResolveMailerDeps {
  return {
    workspaceId: WS, mode: "production", customCredentialRepo: required.creds.repo, sealer: required.creds.sealer,
    httpClient: {} as HttpClientPort, loadMailAdapters: async () => required.registry, log: () => {}, warn: () => {},
    providerSetting: setting({ transactional: "fakemail", bulk: "fakemail" }), ...overrides,
  };
}

async function saveKey(creds: CustomCredentialWriteDeps, token: string): Promise<string> {
  return (await createCustomCredential(creds, { workspaceId: WS, label: LABEL, category: "ops", baseUrl: "https://api.fake.test", connection: { token } })).id;
}

test("a key replaced in the store is used by the very next send, with no invalidate and no restart", async () => {
  const creds = credentialDeps();
  const id = await saveKey(creds, "key-one");
  const { keys, registry } = fakeProvider();
  const { mailer } = createResolvedMailer(deps({ creds, registry }));
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.deepEqual(keys, ["key-one"], "an unchanged row reuses the cached provider");
  await updateCustomCredential(creds, { workspaceId: WS, id, connection: { token: "key-two" } });
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.deepEqual(keys, ["key-one", "key-two"]);
});

test("a deleted key makes the next send refuse instead of using the stale provider", async () => {
  const creds = credentialDeps();
  const id = await saveKey(creds, "key-one");
  const { registry } = fakeProvider();
  const { mailer } = createResolvedMailer(deps({ creds, registry }));
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  await deleteCustomCredential(creds, { workspaceId: WS, id });
  const refused = await mailer.send(MESSAGE, OPTIONS);
  assert.deepEqual(refused.ok ? null : refused.errorCode, "MAIL_PROVIDER_UNAVAILABLE");
});

test("invalidate drops cached providers even when the row is unchanged", async () => {
  const creds = credentialDeps();
  await saveKey(creds, "key-one");
  const { keys, registry } = fakeProvider();
  const resolved = createResolvedMailer(deps({ creds, registry }));
  await resolved.mailer.send(MESSAGE, OPTIONS);
  resolved.invalidate();
  await resolved.mailer.send(MESSAGE, OPTIONS);
  assert.deepEqual(keys, ["key-one", "key-one"]);
});

test("a store fault while fingerprinting keeps the cached provider; a fault at resolution re-resolves once the store reads", async () => {
  const creds = credentialDeps();
  await saveKey(creds, "key-one");
  const repo = flakyRepo(creds.repo);
  const { keys, registry } = fakeProvider();
  const { mailer } = createResolvedMailer(deps({ creds: { ...creds, repo }, registry }));
  await mailer.send(MESSAGE, OPTIONS);
  repo.failing.on = true;
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true, "mail it could still send is not refused");
  assert.deepEqual(keys, ["key-one"]);

  // Only the first list (the fingerprint) fails: the key still resolves, fingerprinted "unknown".
  const second = flakyRepo(creds.repo);
  second.failing.on = true;
  second.failing.remaining = 1;
  const fresh = fakeProvider();
  const other = createResolvedMailer(deps({ creds: { ...creds, repo: second }, registry: fresh.registry }));
  assert.equal((await other.mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.equal((await other.mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.deepEqual(fresh.keys, ["key-one", "key-one"], "the unknown fingerprint is replaced by the real one");
});

test("status is cached for the TTL on the injected clock; refresh and invalidate rebuild it; checkedAt is the build time", async () => {
  const creds = credentialDeps();
  await saveKey(creds, "key-one");
  const { registry } = fakeProvider();
  let loads = 0;
  let now = Date.parse("2026-10-22T10:00:00.000Z");
  const resolved = createResolvedMailer(deps({ creds, registry }, {
    loadMailAdapters: async () => { loads += 1; return registry; }, clock: { nowMs: () => now }, statusTtlMs: 1000,
  }));
  await resolved.ready;
  const before = loads;
  const first = await resolved.status();
  assert.equal(first.checkedAt, "2026-10-22T10:00:00.000Z");
  assert.equal(first.state, "ready");
  const [a, b] = await Promise.all([resolved.status(), resolved.status()]);
  assert.equal(a, first);
  assert.equal(b, first);
  assert.equal(loads, before + 1, "one catalog load served all three reads");
  now += 999;
  await resolved.status();
  assert.equal(loads, before + 1);
  now += 1;
  assert.equal((await resolved.status()).checkedAt, "2026-10-22T10:00:01.000Z");
  assert.equal(loads, before + 2);
  await resolved.status({ refresh: true });
  assert.equal(loads, before + 3);
  resolved.invalidate();
  await resolved.status();
  assert.equal(loads, before + 4);
});

test("lastError records the provider's own send failures (single and batch); checks record their failures too", async () => {
  const creds = credentialDeps();
  await saveKey(creds, "key-one");
  const failure: MailerSendResult = { ok: false, retryable: false, errorCode: "AUTH", message: "the provider rejected the key" };
  const { registry } = fakeProvider({ result: () => failure });
  const now = Date.parse("2026-10-22T11:00:00.000Z");
  const resolved = createResolvedMailer(deps({ creds, registry }, { clock: { nowMs: () => now } }));
  assert.equal((await resolved.status()).lastError, undefined);
  await resolved.mailer.send(MESSAGE, OPTIONS);
  assert.deepEqual((await resolved.status()).lastError, { providerId: "fakemail", source: "send", code: "AUTH", message: "the provider rejected the key", at: "2026-10-22T11:00:00.000Z" });
  assert.deepEqual(await resolved.mailer.sendBatch([MESSAGE], OPTIONS), [failure]);
});

test("status runs the domain check with the lane key and records its failure; a thrown check is recorded by value", async () => {
  const creds = credentialDeps();
  await saveKey(creds, "key-one");
  let answer: () => Promise<unknown> = async () => ({ status: "error", error: { message: "rate limited" } });
  const { registry } = fakeProvider({ domainStatus: () => answer() });
  const resolved = createResolvedMailer(deps({ creds, registry }, { readSenderEmail: async () => "news@example.com" }));
  const rejected = await resolved.status();
  assert.deepEqual(rejected.warnings, []);
  assert.deepEqual({ ...rejected.lastError, at: undefined }, { providerId: "fakemail", source: "check", message: "the domain check for example.com failed (rate limited)", at: undefined });
  answer = async () => { throw "dns down"; };
  assert.match((await resolved.status({ refresh: true })).lastError!.message, /\(dns down\)/);
  answer = async () => { throw new Error("socket hang up"); };
  assert.match((await resolved.status({ refresh: true })).lastError!.message, /\(socket hang up\)/);
  answer = async () => ({ status: "ok", value: { domain: "example.com", state: "pending" } });
  assert.deepEqual((await resolved.status({ refresh: true })).warnings, ["sender_unverified"]);
});

test("status: an undecryptable lane key and an unlistable store are recorded and count as missing", async () => {
  const creds = credentialDeps();
  await saveKey(creds, "key-one");
  const { registry } = fakeProvider();
  const otherSealer = new AesGcmSecretSealer(new InMemoryKeyring());
  const undecryptable = await createResolvedMailer(deps({ creds: { ...creds, sealer: otherSealer }, registry })).status();
  assert.equal(undecryptable.lanes[0]!.state, "missing_credential");
  assert.equal(undecryptable.lastError!.source, "check");
  assert.match(undecryptable.lastError!.message, /Tovu Mail — Fake Mail API/);

  for (const thrown of [new Error("eio"), "eio"]) {
    let fail = false;
    const repo = Object.assign(Object.create(creds.repo) as CustomCredentialSetRepoPort, { vault: creds.repo.vault, listByWorkspace: async (input: { workspaceId: string }) => {
      if (fail) { fail = false; throw thrown; }
      return creds.repo.listByWorkspace(input);
    } });
    const resolved = createResolvedMailer(deps({ creds: { ...creds, repo }, registry }));
    await resolved.ready;
    fail = true; // only the status's own row list fails; the lane key still resolves
    const report = await resolved.status();
    assert.equal(report.lastError!.providerId, null);
    assert.match(report.lastError!.message, /could not be listed \(eio\)/);
    assert.equal(report.providers.find((p) => p.id === "fakemail")!.credential.saved, false);
    assert.equal(report.state, "ready");
  }
});

test("describeProviders and status share the safe DTO: presence and setup fields, never a secret", async () => {
  const creds = credentialDeps();
  await saveKey(creds, "key-secret-value");
  await createCustomCredential(creds, { workspaceId: WS, label: MAIL_SMTP_CREDENTIAL_LABEL, category: "ops", baseUrl: "https://smtp.example.com:465", connection: { token: "pw", username: "mailer@example.com" } });
  const { registry } = fakeProvider();
  const resolved = createResolvedMailer(deps({ creds, registry }));
  const report = await resolved.describeProviders();
  assert.deepEqual(report.setting, { transactional: "fakemail", bulk: "fakemail" });
  assert.deepEqual(report.providers.map((p) => [p.id, p.lanes, p.credential.saved, p.selectable]), [["smtp", [], true, true], ["console", [], false, false], ["fakemail", ["transactional", "bulk"], true, true]]);
  assert.deepEqual(report.providers[2]!.setup.fields.map((f) => [f.key, f.type]), [["token", "secret"], ["baseUrl", "url"]]);
  assert.equal(JSON.stringify(report).includes("key-secret-value"), false);
  assert.equal(JSON.stringify(report).includes("mailer@example.com"), false, "the username is reduced to presence");
  assert.deepEqual((await resolved.status()).providers, report.providers);
});

test("without an injected clock, checkedAt comes from the system clock", async () => {
  const creds = credentialDeps();
  const { registry } = fakeProvider();
  const { checkedAt } = await createResolvedMailer(deps({ creds, registry })).status();
  assert.ok(Math.abs(Date.parse(checkedAt) - Date.now()) < 60_000);
});
