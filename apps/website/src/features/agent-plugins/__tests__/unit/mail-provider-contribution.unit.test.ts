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

test("parseMailAdaptersFile v1 still refuses a non-array list, a non-object entry, a bad id and a blank label", () => {
  const v1 = (adapters: unknown) => parseMailAdaptersFile(JSON.stringify({ schemaVersion: 1, adapters }));
  const entry = { id: "a", label: "A", module: "a.mjs", credentialLabel: "A key" };
  assert.deepEqual(v1("x"), { ok: false, reason: "adapters must be an array" });
  assert.deepEqual(v1([7]), { ok: false, reason: "adapters[0] must be an object" });
  assert.deepEqual(v1([{ ...entry, id: "Bad Id" }]), { ok: false, reason: "adapters[0].id must be a lowercase hyphenated id" });
  assert.deepEqual(v1([{ ...entry, label: " " }]), { ok: false, reason: "adapters[0].label must be a non-empty string" });
});

const CARD = { title: "Connect Postal", intro: "Connect Postal to send mail.", helpUrl: "https://postal.example/keys", helpLabel: "Get a key", keyHint: "Sending access", baseUrl: "https://api.postal.example" };

test('mail cards preserve bounded usedFor text and refuse bad copy without dropping the adapter', () => {
  const usedFor = [' Send site mail ', ...Array(7).fill('x'.repeat(120))];
  const parsed = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...V2, credentialCard: { ...CARD, usedFor } }] }));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.descriptors[0]!.credentialCard?.usedFor, usedFor.map(value => value.trim()));
  for (const invalid of [null, 'Send mail', [7], [''], ['   '], ['x'.repeat(121)], Array(9).fill('Send mail')]) {
    const result = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...V2, credentialCard: { ...CARD, usedFor: invalid } }] }));
    assert.ok(result.ok, 'invalid optional copy must not disable mail');
    assert.equal(result.descriptors[0]!.credentialCard, undefined);
    assert.match(result.descriptors[0]!.credentialCardRefusal!, /usedFor/);
  }
});

test("parseMailAdaptersFile keeps a v2 credentialCard, and a descriptor without one has none", () => {
  const withCard = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...V2, credentialCard: CARD }] }));
  assert.deepEqual(withCard.ok && withCard.descriptors[0]!.credentialCard, CARD);
  const minimal = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...V2, credentialCard: { title: "Connect Postal", baseUrl: "https://api.postal.example" } }] }));
  assert.deepEqual(minimal.ok && minimal.descriptors[0]!.credentialCard, { title: "Connect Postal", baseUrl: "https://api.postal.example" });
  const without = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [V2] }));
  assert.ok(without.ok && !("credentialCard" in without.descriptors[0]!) && !("credentialCardRefusal" in without.descriptors[0]!));
});

test("an invalid credentialCard is ignored with a note, and the adapter still loads", () => {
  const parse = (credentialCard: unknown) => {
    const result = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 2, adapters: [{ ...V2, credentialCard }] }));
    assert.ok(result.ok, "a bad card never drops the adapter");
    assert.ok(!("credentialCard" in result.descriptors[0]!));
    return result.descriptors[0]!.credentialCardRefusal;
  };
  assert.equal(parse("x"), "adapters[0].credentialCard must be an object");
  assert.equal(parse({ ...CARD, title: " " }), "adapters[0].credentialCard.title must be a non-empty string");
  assert.equal(parse({ ...CARD, baseUrl: "http://api.postal.example" }), "adapters[0].credentialCard.baseUrl must be an https URL");
  assert.equal(parse({ ...CARD, helpUrl: "javascript:alert(1)" }), "adapters[0].credentialCard.helpUrl must be an https URL");
  assert.equal(parse({ ...CARD, helpUrl: `https://x.example/${"a".repeat(600)}` }), "adapters[0].credentialCard.helpUrl must be an https URL");
  assert.equal(parse({ ...CARD, intro: "x".repeat(501) }), "adapters[0].credentialCard.intro must be a non-empty string");
  assert.equal(parse({ ...CARD, keyHint: 3 }), "adapters[0].credentialCard.keyHint must be a non-empty string");
});

test("a v1 descriptor's credentialCard is not read", () => {
  const result = parseMailAdaptersFile(JSON.stringify({ schemaVersion: 1, adapters: [{ id: "a", label: "A", module: "a.mjs", credentialLabel: "A key", credentialCard: CARD }] }));
  assert.ok(result.ok && !("credentialCard" in result.descriptors[0]!));
});
