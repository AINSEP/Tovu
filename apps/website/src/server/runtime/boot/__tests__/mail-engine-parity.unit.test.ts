import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import { providerOk, providerRejected, providerUnknown, type ProviderResult } from "@jini-ai/core/provider-registry";
import type { MailProviderCallContext, MailProviderModule } from "@jini-ai/platform/mail";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createCustomCredential, InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import type { MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import type { MailTestModeSetting } from "#src/features/settings/mail-provider";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { MailerPort, MailerSendOptions, OutboundEmail } from "#src/platform/mail/index";
import { credentialSecrets, safeMailProviderText } from "#src/platform/mail/provider-error";
import { createMailPolicyWrapper } from "../mail-delivery-policy.js";
import { readMailDomain } from "../mail-domain-read.js";
import { createResolvedMailer } from "../resolve-mailer.js";

/** Post-sign-in parity freeze: plan mail-engine-to-jini + binding OPUS review, shard 1.
 * Expectations are literal legacy outputs; never regenerate them from the extracted engine.
 * Existing resolver/lifecycle/cache suites retain rotation, invalidation and timing coverage.
 */
const AT = "2026-10-24T12:00:00.000Z";
const MESSAGE: OutboundEmail = { workspaceId: "ws", from: { email: "news@example.com" }, to: { email: "Reader@Example.com" }, subject: "hi", text: "hi" };
const OPTIONS: MailerSendOptions = { workspaceId: "ws", idempotencyKey: "parity", sourceContext: { module: "members" }, purpose: "transactional" };
const ACCEPTED = { ok: true as const, providerMessageId: "pm-1", acceptedAt: AT };
const DIAGNOSTIC = "Use saved-value at https://mail.example/?session_code=abc#fragment&view=1";
const SAFE_DIAGNOSTIC = "Use [REDACTED:exact_secret] at https://mail.example/[REDACTED:url_secret_param]&view=1";
const CAPS = { driver: "parity", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 10, supportsAttachments: true };

function innerMailer(required: { send?: MailerPort["send"] } = {}, _options = {}): MailerPort {
  return { capabilities: () => CAPS, send: required.send ?? (async () => ACCEPTED), sendBatch: async () => { throw new Error("batch must dispatch sequentially"); } };
}

async function resolver(required: { rejected?: boolean; send?: MailerPort["send"] } = {}, _options = {}) {
  const keyring = new InMemoryKeyring();
  const repo = new InMemoryCustomCredentialSetRepo();
  const sealer = new AesGcmSecretSealer(keyring);
  await createCustomCredential({ repo, sealer, keyring, clock: createFakeClock({ startIso: AT }), idGen: { newId: () => "cred-parity" } }, {
    workspaceId: "ws", label: "Parity key", category: "ops", baseUrl: "https://api.example", connection: { token: "saved-value" },
  });
  const module = {
    id: "parity", capabilities: { hosted: true, feedback: false, domainVerification: true },
    create: () => innerMailer({ send: required.send }),
    domainStatus: async () => required.rejected ? providerRejected({ code: "unauthorized", message: DIAGNOSTIC }) : providerOk({ value: { domain: "example.com", state: "verified" as const } }),
    domainRequirements: async () => providerRejected({ code: "unauthorized", message: DIAGNOSTIC }),
  };
  const adapters: MailAdapterRegistry = { refusals: [], list: () => [{ pluginId: "fixture-mail", descriptor: {
    schemaVersion: 2, id: "parity", label: "Parity", module: "fake.mjs", credentialLabel: "Parity key", credentialKeys: ["token"], feedback: false,
    setup: { fields: [{ key: "token", label: "API key", type: "secret", required: true }] },
  }, module }] };
  const resolved = createResolvedMailer({
    workspaceId: "ws", mode: "production", customCredentialRepo: repo, sealer,
    httpClient: { send: async () => { throw new Error("no network"); } }, loadMailAdapters: async () => adapters,
    providerSetting: { read: async () => ({ transactional: "parity", bulk: "parity" }), write: async () => { throw new Error("selection already saved"); } },
    readSenderEmail: async () => "news@Example.COM", clock: { nowMs: () => Date.parse(AT) }, warn: () => {},
  });
  await resolved.ready;
  return resolved;
}

test("parity: complete serialized status DTO and failed-send projection", async () => {
  const resolved = await resolver({ send: async () => ({ ok: false, retryable: false, errorCode: "unauthorized", message: DIAGNOSTIC }) });
  const golden = {
    state: "ready", lanes: [{ lane: "transactional", providerId: "parity", state: "ready" }, { lane: "bulk", providerId: "parity", state: "ready" }], warnings: [],
    providers: [
      { id: "smtp", label: "SMTP server", origin: "core", hosted: true, lanes: [], capabilities: { feedback: false, domainVerification: false },
        credential: { required: true, saved: false, label: "Tovu Mail — SMTP Server" }, selectable: false,
        refusal: 'has no complete saved credential "Tovu Mail — SMTP Server" under Access Tokens (category "ops")',
        setup: { fields: [
          { key: "baseUrl", label: "SMTP server", type: "url", required: true, placeholder: "https://smtp.example.com:465", help: "Host and port after https://. Ports 465 and 443 use implicit TLS; any other port uses STARTTLS." },
          { key: "username", label: "Username", type: "text", required: true }, { key: "token", label: "Password", type: "secret", required: true },
        ] } },
      { id: "console", label: "Console (local development, sends nothing)", origin: "core", hosted: false, lanes: [], capabilities: { feedback: false, domainVerification: false },
        credential: { required: false, saved: false }, selectable: false, refusal: "only prints mail locally and never delivers it", setup: { fields: [] } },
      { id: "parity", label: "Parity", origin: "plugin", hosted: true, lanes: ["transactional", "bulk"], pluginId: "fixture-mail", capabilities: { feedback: false, domainVerification: true },
        credential: { required: true, saved: true, label: "Parity key", credentialId: "cred-parity", updatedAt: AT }, selectable: true,
        setup: { fields: [{ key: "token", label: "API key", type: "secret", required: true }] } },
    ], refusals: [], checkedAt: AT, senderDomainVerification: { state: "verified", domain: "example.com", providerId: "parity" },
  };
  assert.equal(JSON.stringify(await resolved.status()), JSON.stringify(golden));
  assert.deepEqual(await resolved.mailer.send(MESSAGE, OPTIONS), { ok: false, retryable: false, errorCode: "unauthorized", message: SAFE_DIAGNOSTIC });
  assert.equal(JSON.stringify(await resolved.status()), JSON.stringify({ ...golden, state: "degraded", lastError: {
    providerId: "parity", source: "send", message: "The provider did not confirm acceptance. Check provider configuration.", at: AT,
  } }));
});

test("parity: sign-in provider redaction survives domain verdicts, ToolInputError and throws", async () => {
  assert.deepEqual(credentialSecrets({ credential: { token: "saved-value", count: 2 } }), ["saved-value"]);
  assert.equal(safeMailProviderText({ text: DIAGNOSTIC }, { secrets: ["saved-value"] }), SAFE_DIAGNOSTIC);
  assert.equal(safeMailProviderText({ text: `saved-value ${"x".repeat(1100)}` }, { secrets: ["saved-value"] }), `[REDACTED:exact_secret] ${"x".repeat(976)}`);
  const resolved = await resolver({ rejected: true, send: async () => { throw new Error(DIAGNOSTIC); } });
  assert.deepEqual(await resolved.senderDomainVerification(), { state: "unknown", domain: "example.com", providerId: "parity", reason: `unauthorized: ${SAFE_DIAGNOSTIC}` });
  await assert.rejects(resolved.domainRequirements({ workspaceId: "ws" }), error => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, `unauthorized: ${SAFE_DIAGNOSTIC}`);
    return true;
  });
  await assert.rejects(resolved.mailer.send(MESSAGE, OPTIONS), { name: "Error", message: SAFE_DIAGNOSTIC });
  assert.equal(await resolved.domainRequirements({ workspaceId: "other-workspace" }), null);
});

function delivery(required: { mode?: MailTestModeSetting; rejectSecond?: boolean } = {}, _options = {}) {
  const effects: unknown[] = [];
  const wrap = createMailPolicyWrapper({
    ledger: {
      reserve: async (input, options) => { effects.push({ reserve: input, options }); return { status: "reserved" }; },
      mark: async input => { effects.push({ mark: input }); },
    },
    suppression: { isSuppressed: async input => { effects.push({ suppression: input }); return false; }, suppress: async () => {} },
    readTestMode: async () => required.mode ?? { mode: "off" },
    observe: async ({ result }) => { effects.push({ observe: result }); },
  });
  const mailer = innerMailer({ send: async (message, options) => {
    effects.push({ send: { message, options } });
    return required.rejectSecond && options.idempotencyKey.endsWith(":1")
      ? { ok: false, retryable: false, errorCode: "fixture_refused", message: "second refused" } : ACCEPTED;
  } });
  const provider: MailProviderModule = { id: "parity", label: "Parity", credentialKeys: [], capabilities: { hosted: true, feedback: false, domainVerification: false }, create: () => { throw new Error("unused"); } };
  return { mailer: wrap({ providerId: "parity", provider, mailer }), effects };
}

test("parity: indexed batch keys, original hashes, redirect headers and ordered partial results", async () => {
  const { mailer, effects } = delivery({ mode: { mode: "redirect", to: "owner@example.com" }, rejectSecond: true });
  const second = { ...MESSAGE, to: { email: "second@example.com" } };
  const refused = { ok: false, retryable: false, errorCode: "fixture_refused", message: "second refused" };
  assert.deepEqual(await mailer.sendBatch([MESSAGE, second], OPTIONS), [ACCEPTED, refused]);
  assert.deepEqual(effects, [
    { suppression: { workspaceId: "ws", normalizedAddress: "reader@example.com", lane: "transactional" } },
    { reserve: { workspaceId: "ws", idempotencyKey: "parity:0", recipient: "reader@example.com", payloadHash: "bdb0c6d1e8847e632089468aba4c8db9c4bddd94c0dad36cbd474d974b2d2e29", lane: "transactional", providerId: "parity" }, options: { reclaimUnknown: false } },
    { send: { message: { ...MESSAGE, to: { email: "owner@example.com" }, headers: { "X-Original-To": "Reader@Example.com" } }, options: { ...OPTIONS, idempotencyKey: "parity:0" } } },
    { mark: { workspaceId: "ws", idempotencyKey: "parity:0", recipient: "reader@example.com", outcome: "sent", providerMessageId: "pm-1" } }, { observe: ACCEPTED },
    { suppression: { workspaceId: "ws", normalizedAddress: "second@example.com", lane: "transactional" } },
    { reserve: { workspaceId: "ws", idempotencyKey: "parity:1", recipient: "second@example.com", payloadHash: "31fd30c15a95e1e50e186051386eced86cc80cf049613f30b27ffcab62553216", lane: "transactional", providerId: "parity" }, options: { reclaimUnknown: false } },
    { send: { message: { ...second, to: { email: "owner@example.com" }, headers: { "X-Original-To": "second@example.com" } }, options: { ...OPTIONS, idempotencyKey: "parity:1" } } },
    { mark: { workspaceId: "ws", idempotencyKey: "parity:1", recipient: "second@example.com", outcome: "failed", errorCode: "fixture_refused" } }, { observe: refused },
  ]);
});

test("parity: approval drift and capture without a sink refuse before any effects", async () => {
  const drift = delivery({ mode: { mode: "redirect", to: "changed@example.com" } });
  assert.deepEqual(await drift.mailer.send(MESSAGE, { ...OPTIONS, mailTestApproval: {
    providerId: "parity", driver: "parity", from: MESSAGE.from, mode: "off", effectiveRecipient: MESSAGE.to.email,
  } }), { ok: false, retryable: false, errorCode: "MAIL_TEST_APPROVAL_CHANGED", message: "Mail configuration changed. Prepare a new approval; nothing was sent." });
  assert.deepEqual(drift.effects, []);
  const capture = delivery({ mode: { mode: "capture" } });
  assert.deepEqual(await capture.mailer.send(MESSAGE, OPTIONS), { ok: false, retryable: false, errorCode: "MAIL_TEST_CAPTURE_UNAVAILABLE", message: "mail test mode is set to capture, but no capture store is available; nothing was sent" });
  assert.deepEqual(capture.effects, []);
});

test("parity: only forbidden permits one account-key retry; sending context stays unchanged", async () => {
  const ctx: MailProviderCallContext = { workspaceId: "ws", mode: "live", credential: { token: "sending" }, httpClient: { send: async () => { throw new Error("no network"); } } };
  const original = { ...ctx, credential: { ...ctx.credential } };
  const cases = [
    { code: "forbidden", status: "rejected", retried: true }, { code: "unauthorized", status: "rejected", retried: false },
    { code: "not_found", status: "rejected", retried: false }, { code: "rate_limited", status: "rejected", retried: false },
    { code: "timeout", status: "unknown", retried: false }, { code: "network", status: "unknown", retried: false },
  ] as const;
  for (const { code, status, retried } of cases) {
    const effects: unknown[] = [];
    const rejection: ProviderResult<string> = status === "unknown"
      ? providerUnknown({ code, message: "provider refused" }) : providerRejected({ code, message: "provider refused" });
    const result = await readMailDomain({ ctx, providerId: "parity",
      read: async context => { effects.push({ read: context }); return context.credential.token === "sending" ? rejection : providerOk({ value: "verified" }); },
      resolveDomainReadCredential: async input => { effects.push({ lookup: input }); return { token: "account", baseUrl: "https://account.example" }; },
    });
    assert.deepEqual(result, retried ? { status: "ok", value: "verified" } : { status, error: { code, message: "provider refused" } });
    assert.deepEqual(effects, retried ? [
      { read: original }, { lookup: { id: "parity" } }, { read: { ...original, credential: { token: "account", baseUrl: "https://account.example" } } },
    ] : [{ read: original }]);
    assert.deepEqual(ctx, original);
  }
  for (const unavailable of [async () => null, async () => { throw new Error("vault unavailable"); }]) {
    let reads = 0;
    assert.deepEqual(await readMailDomain({ ctx, providerId: "parity", read: async () => { reads++; return providerRejected({ code: "forbidden", message: "no account" }); }, resolveDomainReadCredential: unavailable }), { status: "rejected", error: { code: "forbidden", message: "no account" } });
    assert.equal(reads, 1);
  }
  let lookups = 0;
  await assert.rejects(readMailDomain({ ctx, providerId: "parity", read: async () => { throw new Error("network timeout"); }, resolveDomainReadCredential: async () => { lookups++; return { token: "account" }; } }), { message: "network timeout" });
  assert.equal(lookups, 0);
});
