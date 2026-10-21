import assert from "node:assert/strict";
import test from "node:test";

import { createMailProviderRegistry, type MailProviderModule } from "@jini-ai/platform/mail";

import { contributeMailProviders, defaultCredentialLabel, parseMailAdaptersFile, type LoadedMailAdapter, type MailAdapterDescriptor, type MailAdapterRegistry } from "../../mail-adapter-registry.js";

/**
 * @file schemaVersion 2 mail-adapter descriptors and their contribution into Jini's keyed
 * mail-provider registry: v1 still loads, v2 must agree with its module, and every refusal surfaces.
 */

const TOVU_MAILER = {
  capabilities: () => ({ driver: "fixture", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
  send: async (_message: unknown, options: { idempotencyKey: string }) => ({ ok: true as const, providerMessageId: `sent:${options.idempotencyKey}`, acceptedAt: "2026-10-21T00:00:00.000Z" }),
  sendBatch: async () => [],
};

const PARSER = { verify: () => true, parse: () => [] };

function adapter(descriptor: Partial<MailAdapterDescriptor>, module: Record<string, unknown> = {}): LoadedMailAdapter {
  return {
    pluginId: "fixture-plugin",
    descriptor: { id: "fixture", label: "Fixture", module: "a.mjs", credentialLabel: "Fixture key", ...descriptor },
    module: { create: () => TOVU_MAILER, ...module } as unknown as LoadedMailAdapter["module"],
  };
}

function adapters(list: readonly LoadedMailAdapter[], refusals: readonly string[] = []): MailAdapterRegistry {
  return { list: () => list, refusals };
}

const V2 = { id: "postal", label: "Postal", module: "adapters/postal.mjs", credentialKeys: ["token"], feedback: true };

test("parseMailAdaptersFile accepts schemaVersion 2 with credentialKeys/feedback and defaults the credential label", () => {
  assert.deepEqual(parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [V2] })), {
    ok: true,
    descriptors: [{ schemaVersion: 2, id: "postal", label: "Postal", module: "adapters/postal.mjs", credentialLabel: "Tovu Mail — Postal API", credentialKeys: ["token"], feedback: true }],
  });
  const labelled = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...V2, credentialLabel: "Postal key" }] }));
  assert.equal(labelled.ok && labelled.descriptors[0]!.credentialLabel, "Postal key");
  assert.equal(defaultCredentialLabel({ label: "Resend" }), "Tovu Mail — Resend API");
});

test("parseMailAdaptersFile refuses malformed v2 entries", () => {
  const parse = (entry: unknown) => parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [entry] }));
  assert.deepEqual(parse("x"), { ok: false, reason: "adapters[0] must be an object" });
  assert.deepEqual(parse({ ...V2, id: "Bad-Id" }), { ok: false, reason: "adapters[0].id must match ^[a-z][a-z0-9_]{0,63}$" });
  assert.deepEqual(parse({ ...V2, module: "x.js" }), { ok: false, reason: "adapters[0].module must be a relative path ending in .mjs" });
  assert.deepEqual(parse({ ...V2, credentialKeys: "token" }), { ok: false, reason: "adapters[0].credentialKeys must be an array of field names" });
  assert.deepEqual(parse({ ...V2, credentialKeys: [""] }), { ok: false, reason: "adapters[0].credentialKeys must be an array of field names" });
  assert.deepEqual(parse({ ...V2, feedback: "yes" }), { ok: false, reason: "adapters[0].feedback must be true or false" });
});

test("contributeMailProviders registers a v1 adapter as a hosted provider whose mailer keeps the plugin's call shape", async () => {
  const registry = createMailProviderRegistry();
  const result = contributeMailProviders({ registry, adapters: adapters([adapter({ id: "resend", label: "Resend" })], ["loader refusal"]) });
  assert.deepEqual(result, { accepted: ["resend"], refusals: ["loader refusal"] });
  const entry = registry.get({ id: "resend" })!;
  assert.equal(entry.origin, "plugin");
  assert.deepEqual(entry.provider.capabilities, { hosted: true, feedback: false, domainVerification: false });
  assert.deepEqual(entry.provider.credentialKeys, ["token", "baseUrl"]);
  const mailer = entry.provider.create({ credential: { token: "t" }, kit: { httpClient: { send: async () => { throw new Error("unused"); } } } });
  const sent = await mailer.send({ message: { workspaceId: "ws", to: { email: "a@b.c" }, from: { email: "f@b.c" }, subject: "s" }, idempotencyKey: "k", workspaceId: "ws", sourceContext: { module: "m" } });
  assert.deepEqual(sent, { ok: true, providerMessageId: "sent:k", acceptedAt: "2026-10-21T00:00:00.000Z" });
});

test("contributeMailProviders keeps a v2 module's declared capabilities and feedback parser", () => {
  const registry = createMailProviderRegistry();
  const module = { id: "postal", capabilities: { hosted: true, feedback: true, domainVerification: false, rateLimit: { perSecond: 2, burst: 4 } }, feedback: PARSER };
  const result = contributeMailProviders({ registry, adapters: adapters([adapter({ ...V2, schemaVersion: 2 }, module)]) });
  assert.deepEqual(result, { accepted: ["postal"], refusals: [] });
  const provider: MailProviderModule = registry.get({ id: "postal" })!.provider;
  assert.equal(provider.feedback, PARSER);
  assert.deepEqual(provider.capabilities.rateLimit, { perSecond: 2, burst: 4 });
  assert.deepEqual(provider.credentialKeys, ["token"]);
});

test("contributeMailProviders refuses a v2 module whose id or feedback claim disagrees with its descriptor", () => {
  const registry = createMailProviderRegistry();
  const caps = { hosted: true, feedback: true, domainVerification: false };
  const result = contributeMailProviders({ registry, adapters: adapters([
    adapter({ ...V2, schemaVersion: 2 }, { id: "other", capabilities: caps, feedback: PARSER }),
    adapter({ ...V2, schemaVersion: 2, id: "nofeed" }, { id: "nofeed", capabilities: caps }),
  ]) });
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.refusals, [
    "mail adapter 'postal' from 'fixture-plugin' was not loaded: its module id 'other' does not match the descriptor id 'postal'",
    "mail adapter 'nofeed' from 'fixture-plugin' was not loaded: its descriptor feedback flag does not match the module's feedback parser",
  ]);
});

test("contributeMailProviders surfaces registry refusals: a v1 hyphenated id and a duplicate of a built-in", () => {
  const registry = createMailProviderRegistry();
  registry.register({ definition: { id: "smtp", provider: { id: "smtp", label: "SMTP", credentialKeys: [], capabilities: { hosted: true, feedback: false, domainVerification: false }, create: () => { throw new Error("unused"); } } as MailProviderModule } });
  const result = contributeMailProviders({ registry, adapters: adapters([adapter({ id: "my-mail" }), adapter({ id: "smtp" })]) });
  assert.deepEqual(result.accepted, []);
  assert.equal(result.refusals.length, 2);
  assert.match(result.refusals[0]!, /my-mail/);
  assert.match(result.refusals[1]!, /already registered by the built-in provider/);
});
