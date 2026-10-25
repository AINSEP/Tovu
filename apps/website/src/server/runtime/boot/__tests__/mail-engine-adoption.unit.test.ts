import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as engine from "@jini-ai/platform/mail";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { loadMailAdapterRegistryFromSource } from "#src/features/agent-plugins/mail-adapter-registry";
import { createCustomCredential, InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { HttpClientPort, HttpRequest } from "#src/platform/http/index";
import type { MailerSendOptions } from "#src/platform/mail/index";
import { credentialSecrets, safeMailProviderText } from "#src/platform/mail/provider-error";
import { createMailPolicyWrapper } from "../mail-delivery-policy.js";
import { readMailDomain, isDomainReadPermissionRefused } from "../mail-domain-read.js";
import { createTtlCache, MAIL_STATUS_TTL_MS } from "../mail-status-cache.js";
import { createResolvedMailer } from "../resolve-mailer.js";

/** Mail-engine extraction shard 8, binding OPUS review changes 3–8.
 * Exercise the real bundled plugin through Jini's engine and Tovu's guarded HTTP seam.
 * No network or mail delivery; the unchanged shard-1 suite owns literal legacy parity.
 */
const MESSAGE = { workspaceId: "ws", from: { email: "news@example.com" }, to: { email: "reader@example.com" }, subject: "hi", text: "hi" };
const OPTIONS: MailerSendOptions = { workspaceId: "ws", idempotencyKey: "adoption", sourceContext: { module: "members" }, purpose: "transactional", lane: "interactive", timeoutMs: 1234 };

function fakeGuardedHttp(required: { calls: HttpRequest[] }, _optional = {}): HttpClientPort {
  return { send: async request => {
    required.calls.push(request);
    // A Jini-shaped client here would hide url/method under .request and break real Resend sends.
    assert.equal(typeof request.url, "string");
    assert.equal(typeof request.method, "string");
    if (request.method === "POST") {
      assert.equal("request" in request, false);
      return { status: 200, headers: {}, bodyText: JSON.stringify({ id: request.headers["Idempotency-Key"] }) };
    }
    if (request.headers.Authorization === "Bearer sending-key") {
      return { status: 401, headers: {}, bodyText: JSON.stringify({ name: "restricted_api_key", message: "Sending access only" }) };
    }
    assert.equal(request.headers.Authorization, "Bearer account-key");
    assert.equal(new URL(request.url).origin, "https://api.resend.com");
    const body = request.url.endsWith("/domains")
      ? { data: [{ id: "domain-1", name: "example.com", status: "verified" }] }
      : { records: [{ type: "TXT", name: "send", value: "v=spf1 include:example.com ~all" }] };
    return { status: 200, headers: {}, bodyText: JSON.stringify(body) };
  } };
}

async function fixture(required: { setting: engine.MailProviderSetting | null }, _optional = {}) {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = createFakeClock({ startIso: "2026-10-24T12:00:00.000Z" });
  const adapters = await loadMailAdapterRegistryFromSource({ pluginId: "resend",
    packageRoot: fileURLToPath(new URL("../../../../../../../content/agent-plugins/resend/", import.meta.url)) });
  assert.deepEqual(adapters.refusals, []);
  assert.equal(adapters.list().length, 1);
  await createCustomCredential({ repo, sealer, keyring, clock, idGen: { newId: () => "credential-1" } }, {
    workspaceId: "ws", label: adapters.list()[0]!.descriptor.credentialLabel, category: "ops",
    baseUrl: "https://send.example", connection: { token: "sending-key" },
  });
  const state = { setting: required.setting };
  const writes: engine.MailProviderSetting[] = [];
  const calls: HttpRequest[] = [];
  const accounts: unknown[] = [];
  const reserves: { key: string; reclaimUnknown: boolean | undefined }[] = [];
  let now = 0;
  const resolved = createResolvedMailer({
    workspaceId: "ws", mode: "production", customCredentialRepo: repo, sealer,
    httpClient: fakeGuardedHttp({ calls }), loadMailAdapters: async () => adapters, warn: () => {},
    providerSetting: { read: async () => state.setting, write: async setting => { writes.push(setting); state.setting = setting; } },
    readSenderEmail: async () => "news@Example.COM",
    resolvePluginAccountToken: async input => { accounts.push(input); return "account-key"; },
    wrapProviderMailer: createMailPolicyWrapper({
      ledger: {
        reserve: async (input, options) => { reserves.push({ key: input.idempotencyKey, reclaimUnknown: options?.reclaimUnknown }); return { status: "reserved" }; },
        mark: async () => {},
      },
      suppression: { isSuppressed: async () => false, suppress: async () => {} },
      readTestMode: async () => ({ mode: "off" }),
    }, { now: () => now += 1000 }),
  });
  await resolved.ready;
  return { resolved, state, writes, calls, accounts, reserves };
}

test("adoption: compatible entrypoints reuse Jini's existing implementations", () => {
  assert.equal(readMailDomain, engine.readMailDomain);
  assert.equal(isDomainReadPermissionRefused, engine.isDomainReadPermissionRefused);
  assert.equal(createTtlCache, engine.createTtlCache);
  assert.equal(MAIL_STATUS_TTL_MS, engine.MAIL_STATUS_TTL_MS);
  assert.equal(safeMailProviderText, engine.safeMailProviderText);
  assert.equal(credentialSecrets, engine.credentialSecrets);
});

test("adoption: real Resend keeps positional HTTP, indexed batches and account-key isolation", async () => {
  const { resolved, calls, accounts, reserves } = await fixture({ setting: { transactional: "resend", bulk: "resend" } });
  const results = await resolved.mailer.sendBatch([MESSAGE, { ...MESSAGE, to: { email: "second@example.com" } }], OPTIONS);
  assert.deepEqual(results.map(result => result.ok && result.providerMessageId), ["adoption:0", "adoption:1"]);
  assert.deepEqual(reserves, [{ key: "adoption:0", reclaimUnknown: false }, { key: "adoption:1", reclaimUnknown: false }]);
  assert.deepEqual(calls.map(call => ({ url: call.url, token: call.headers.Authorization, timeoutMs: call.timeoutMs })), [
    { url: "https://send.example/emails", token: "Bearer sending-key", timeoutMs: 1234 },
    { url: "https://send.example/emails", token: "Bearer sending-key", timeoutMs: 1234 },
  ]);
  assert.deepEqual(await resolved.senderDomainVerification(), { state: "verified", domain: "example.com", providerId: "resend" });
  assert.deepEqual(await resolved.domainRequirements({ workspaceId: "ws" }), {
    purpose: "mail", domain: "example.com", providerId: "resend",
    records: [{ type: "TXT", name: "send.example.com", value: "v=spf1 include:example.com ~all", note: "Resend record" }],
  });
  assert.deepEqual(accounts, [{ pluginId: "resend", serverId: "resend" }, { pluginId: "resend", serverId: "resend" }]);
  assert.deepEqual(calls.slice(2).map(call => ({ url: call.url, token: call.headers.Authorization })), [
    { url: "https://send.example/domains", token: "Bearer sending-key" },
    { url: "https://api.resend.com/domains", token: "Bearer account-key" },
    { url: "https://send.example/domains", token: "Bearer sending-key" },
    { url: "https://api.resend.com/domains", token: "Bearer account-key" },
    { url: "https://api.resend.com/domains/domain-1", token: "Bearer account-key" },
  ]);
  assert.equal(await resolved.domainRequirements({ workspaceId: "other" }), null);
  assert.equal(calls.length, 7);
  assert.equal((await resolved.mailer.send(MESSAGE, { ...OPTIONS, idempotencyKey: "after-domain" })).ok, true);
  assert.equal(calls.at(-1)!.headers.Authorization, "Bearer sending-key");
  assert.equal(calls.at(-1)!.url, "https://send.example/emails");
});

test("adoption: initial setting write is unwrapped and invalidate immediately stops sign-in mail", async () => {
  const { resolved, state, writes, calls } = await fixture({ setting: null });
  assert.deepEqual(writes, [{ transactional: null, bulk: null }]);
  assert.equal((await resolved.mailer.send(MESSAGE, OPTIONS)).ok, false);
  assert.equal(calls.length, 0);
  state.setting = { transactional: "resend", bulk: "resend" };
  resolved.invalidate();
  assert.equal((await resolved.mailer.send(MESSAGE, OPTIONS)).ok, true);
  state.setting = { transactional: null, bulk: null };
  resolved.invalidate();
  assert.equal(await resolved.laneReady({ lane: "transactional" }), false);
  const result = await resolved.mailer.send(MESSAGE, OPTIONS);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errorCode, "MAIL_UNCONFIGURED");
  assert.equal(calls.length, 1);
});
