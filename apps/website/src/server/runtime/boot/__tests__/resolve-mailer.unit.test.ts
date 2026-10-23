import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import {
  createCustomCredential,
  InMemoryCustomCredentialSetRepo,
  type CustomCredentialWriteDeps,
} from "#src/features/custom-credentials/index";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";
import type { SmtpMailPayload, SmtpTransport } from "#src/platform/mail/index";
import type { CustomCredentialSetRecord, CustomCredentialSetRepoPort } from "#src/features/custom-credentials/index";
import type { MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { createResolvedMailer, parseSmtpEndpoint, MAIL_SMTP_CREDENTIAL_LABEL, type MailProviderSettingPort, type ResolveMailerDeps } from "../resolve-mailer.js";
import type { MailProviderSetting } from "@jini-ai/platform/mail";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file `createResolvedMailer` — explicit per-lane selection from `core.mail.provider`, the
 * initialization as unconfigured and production refusal. Plugin modules and SMTP transports
 * are injected fakes; no real plugin source or network is used.
 */

const WORKSPACE = "ws-1";

/** The label sites already saved their Resend key under; it now lives in the plugin's descriptor. */
const MAIL_HTTP_API_CREDENTIAL_LABEL = "Tovu Mail — Resend API";

/** Synthetic provider uses the same injected HTTP port as any plugin adapter. */
async function loadBundledMailAdapters(): Promise<MailAdapterRegistry> {
  return { refusals: [], list: () => [{ pluginId: "fixture-mail", descriptor: {
    schemaVersion: 2, id: "resend", label: "Resend", module: "fake.mjs", credentialLabel: MAIL_HTTP_API_CREDENTIAL_LABEL, credentialKeys: ["token"], feedback: false,
  }, module: {
    id: "resend", capabilities: { hosted: true, feedback: false, domainVerification: false },
    create: ({ credential, kit }: { credential: { token: string }; kit: { httpClient: HttpClientPort } }) => ({
      capabilities: () => ({ driver: "resend", supportsIdempotencyKey: true, supportsWebhookFeedback: true, maxBatchSize: 100, supportsAttachments: true }),
      send: async () => {
        await kit.httpClient.send({ method: "POST", url: "https://mail.example/send", idleTimeoutMs: 1000, headers: { Authorization: `Bearer ${credential.token}` } });
        return { ok: true, providerMessageId: "fixture-id", acceptedAt: "2026-10-22T00:00:00Z" };
      },
      sendBatch: async () => [],
    }),
  } as never }] };
}

const EMPTY_REGISTRY: MailAdapterRegistry = { list: () => [], refusals: [] };

class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    return { status: 200, headers: {}, bodyText: '{"id":"resend-id"}' };
  }
}

class NeverCalledSmtpTransport implements SmtpTransport {
  async sendMail(): Promise<{ messageId: string }> {
    throw new Error("must not be called in this test");
  }
}

/** Wraps a real repo but delays `listByWorkspace` (the one call `resolveCustomCredentialByLabel`
 *  awaits) so a test can call `mailer.send()` while the boot-time credential lookup is still
 *  in flight, reproducing the startup-race window this file's header documents. The same vault
 *  must remain available: credential resolution opens the selected row through that owner. */
class DelayedListRepo implements CustomCredentialSetRepoPort {
  readonly vault: NonNullable<CustomCredentialSetRepoPort["vault"]>;
  constructor(
    private readonly inner: CustomCredentialSetRepoPort,
    private readonly released: Promise<void>
  ) {
    assert.ok(inner.vault, "the delayed fixture must preserve the credential vault");
    this.vault = inner.vault;
  }
  insert(record: CustomCredentialSetRecord): Promise<void> {
    return this.inner.insert(record);
  }
  update(record: CustomCredentialSetRecord): Promise<void> {
    return this.inner.update(record);
  }
  findById(input: { workspaceId: string; id: string }): Promise<CustomCredentialSetRecord | null> {
    return this.inner.findById(input);
  }
  async listByWorkspace(input: { workspaceId: string }): Promise<CustomCredentialSetRecord[]> {
    await this.released;
    return this.inner.listByWorkspace(input);
  }
  delete(input: { workspaceId: string; id: string }): Promise<void> {
    return this.inner.delete(input);
  }
}

function makeCredentialWriteDeps(): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  return {
    repo: new InMemoryCustomCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: createFakeClock({ startIso: "2026-08-31T00:00:00.000Z" }),
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
  };
}

/** In-memory `core.mail.provider`; `writes` records every persisted value. */
function memorySetting(initial: MailProviderSetting | null = null): MailProviderSettingPort & { writes: MailProviderSetting[]; value: MailProviderSetting | null } {
  const port = {
    value: initial,
    writes: [] as MailProviderSetting[],
    read: async () => port.value,
    write: async (value: MailProviderSetting) => { port.writes.push(value); port.value = value; },
  };
  return port;
}

function makeResolveDeps(overrides: Partial<ResolveMailerDeps> = {}, warnings: string[] = []): ResolveMailerDeps {
  const credentialDeps = makeCredentialWriteDeps();
  return {
    providerSetting: memorySetting(),
    log: () => {},
    workspaceId: WORKSPACE,
    customCredentialRepo: credentialDeps.repo,
    sealer: credentialDeps.sealer,
    httpClient: new FakeHttpClient(),
    mode: "production",
    loadMailAdapters: loadBundledMailAdapters,
    createSmtpTransport: () => new NeverCalledSmtpTransport(),
    warn: (message: string) => warnings.push(message),
    ...overrides,
  };
}

const MESSAGE = { workspaceId: WORKSPACE, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "hi", text: "hi" };
const OPTIONS = { idempotencyKey: "k1", workspaceId: WORKSPACE, sourceContext: { module: "test" } };

async function saveResendKey(credentialDeps: CustomCredentialWriteDeps): Promise<void> {
  await createCustomCredential(credentialDeps, { workspaceId: WORKSPACE, label: MAIL_HTTP_API_CREDENTIAL_LABEL, category: "ops", baseUrl: "https://api.resend.com", connection: { token: "re_live_key" } });
}

async function saveSmtpKey(credentialDeps: CustomCredentialWriteDeps, connection: { token: string; username?: string } = { token: "app-password", username: "mailer@example.com" }): Promise<void> {
  await createCustomCredential(credentialDeps, { workspaceId: WORKSPACE, label: MAIL_SMTP_CREDENTIAL_LABEL, category: "ops", baseUrl: "https://smtp.example.com:465", connection });
}

test("parseSmtpEndpoint: explicit 465/443 are secure, 587 and other ports are not, and a portless https URL defaults to 443", () => {
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com:465"), { host: "smtp.example.com", port: 465, secure: true });
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com:587"), { host: "smtp.example.com", port: 587, secure: false });
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com"), { host: "smtp.example.com", port: 443, secure: true });
});

test("first boot with a saved hosted-API key stays unconfigured without calling the provider", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  const httpClient = new FakeHttpClient();
  const providerSetting = memorySetting();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, httpClient, providerSetting }));
  await ready;
  assert.deepEqual(providerSetting.writes, [{ transactional: null, bulk: null }]);
  assert.equal(mailer.capabilities().driver, "console");
  const sent = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(!sent.ok && sent.errorCode, "MAIL_UNCONFIGURED");
  assert.equal(httpClient.calls.length, 0);
});

test("first boot with a saved SMTP key stays unconfigured and never constructs a transport", async () => {
  const credentials = makeCredentialWriteDeps();
  await saveSmtpKey(credentials);
  const providerSetting = memorySetting();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentials.repo, sealer: credentials.sealer, providerSetting,
    createSmtpTransport: () => assert.fail("a saved key cannot select SMTP"),
  }));
  await ready;
  assert.deepEqual(providerSetting.value, { transactional: null, bulk: null });
  const result = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(!result.ok && result.errorCode, "MAIL_UNCONFIGURED");
});

test("an explicit SMTP selection uses the saved key and parsed endpoint", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveSmtpKey(credentialDeps);
  let captured: unknown;
  const providerSetting = memorySetting({ transactional: "smtp", bulk: "smtp" });
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting, loadMailAdapters: async () => EMPTY_REGISTRY,
    createSmtpTransport: (config) => { captured = config; return { sendMail: async () => ({ messageId: "smtp-1" }) }; },
  }));
  await ready;
  assert.deepEqual(providerSetting.writes, []);
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.deepEqual(captured, { host: "smtp.example.com", port: 465, secure: true, auth: { user: "mailer@example.com", pass: "app-password" } });
});

test("first boot with nothing configured: unconfigured is written; production refuses MAIL_UNCONFIGURED and warns once", async () => {
  const warnings: string[] = [];
  const providerSetting = memorySetting();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({ providerSetting, loadMailAdapters: async () => EMPTY_REGISTRY }, warnings));
  await ready;
  assert.deepEqual(providerSetting.writes, [{ transactional: null, bulk: null }]);
  const result = await mailer.send(MESSAGE, OPTIONS);
  assert.deepEqual({ ok: result.ok, code: !result.ok && result.errorCode, retryable: !result.ok && result.retryable }, { ok: false, code: "MAIL_UNCONFIGURED", retryable: false });
  assert.equal(mailer.capabilities().driver, "console", "a refusing lane never counts as real delivery");
  assert.deepEqual(await mailer.sendBatch([MESSAGE], OPTIONS), [result]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /no transactional mail provider is configured/);
});

test("an SMTP key without a username does not count: nothing is configured", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveSmtpKey(credentialDeps, { token: "pw" });
  const providerSetting = memorySetting();
  const { ready } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting, loadMailAdapters: async () => EMPTY_REGISTRY }));
  await ready;
  assert.deepEqual(providerSetting.writes, [{ transactional: null, bulk: null }]);
});

test("local mode: an unconfigured lane logs through the console provider and succeeds", async () => {
  const lines: string[] = [];
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({ mode: "local", loadMailAdapters: async () => EMPTY_REGISTRY, log: (line) => lines.push(line) }));
  await ready;
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.equal(mailer.capabilities().driver, "console");
  assert.match(lines[0]!, /\[mail:console\] to=a@example.com/);
});

test("installing a plugin after first boot never selects it through a saved key", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  const providerSetting = memorySetting();
  let installed = false;
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting,
    loadMailAdapters: () => (installed ? loadBundledMailAdapters() : Promise.resolve(EMPTY_REGISTRY)),
  }));
  await ready;
  assert.deepEqual(providerSetting.writes, [{ transactional: null, bulk: null }]);
  installed = true;
  const sent = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(!sent.ok && sent.errorCode, "MAIL_UNCONFIGURED");
  assert.deepEqual(providerSetting.value, { transactional: null, bulk: null });
});

test("after the setting exists, selection reads only it: a saved resend key does not override smtp", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  await saveSmtpKey(credentialDeps);
  const deliveries: string[] = [];
  const providerSetting = memorySetting({ transactional: "smtp", bulk: "resend" });
  const httpClient = new FakeHttpClient();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting, httpClient,
    createSmtpTransport: () => ({ sendMail: async (mail) => { deliveries.push(mail.subject); return { messageId: "smtp-1" }; } }),
  }));
  await ready;
  assert.equal(mailer.capabilities().driver, "smtp");
  await mailer.send(MESSAGE, OPTIONS);
  assert.deepEqual(deliveries, ["hi"]);
  assert.equal(httpClient.calls.length, 0);
  // The bulk lane routes to its own provider.
  await mailer.send(MESSAGE, { ...OPTIONS, purpose: "bulk" });
  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0]!.headers.Authorization, "Bearer re_live_key");
  assert.deepEqual(providerSetting.writes, []);
});

test("a selected provider without a credential refuses in production (and is retried), and logs locally", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  const deps = makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting: memorySetting({ transactional: "resend", bulk: "resend" }) }, warnings);
  const { mailer } = createResolvedMailer(deps);
  const refused = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(!refused.ok && refused.errorCode, "MAIL_PROVIDER_UNAVAILABLE");
  assert.match(warnings[0]!, /'resend' has no saved credential "Tovu Mail — Resend API"/);
  await saveResendKey(credentialDeps);
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true, "a key saved later is picked up on the next send");

  const local = createResolvedMailer({ ...deps, mode: "local", providerSetting: memorySetting({ transactional: "nope", bulk: null }) });
  assert.equal((await local.mailer.send(MESSAGE, OPTIONS)).ok, true);
});

test("an unknown provider id reports the plugin refusals; a settings fault becomes a refusal, never a throw", async () => {
  const warnings: string[] = [];
  const { mailer } = createResolvedMailer(makeResolveDeps({
    providerSetting: memorySetting({ transactional: "postal", bulk: null }),
    loadMailAdapters: async () => ({ list: () => [], refusals: ["plugin 'postal' is disabled"] }),
  }, warnings));
  const result = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(!result.ok && result.errorCode, "MAIL_PROVIDER_UNAVAILABLE");
  assert.match(warnings[0]!, /'postal' is not installed \(plugin 'postal' is disabled\)/);

  const broken = createResolvedMailer(makeResolveDeps({ providerSetting: { read: async () => { throw new Error("db down"); }, write: async () => {} } }));
  const refused = await broken.mailer.send(MESSAGE, OPTIONS);
  assert.equal(!refused.ok && refused.message, "Mail provider selection failed; check configuration.");
});

test("a failed initialization write warns without leaking detail and leaves delivery unconfigured", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  const { mailer } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer,
    providerSetting: { read: async () => null, write: async () => { throw new Error("locked (password=migration-secret)"); } },
  }, warnings));
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, false);
  assert.equal(warnings[0], "[mail] the mail provider setting could not be saved; retrying on the next send");
  assert.doesNotMatch(warnings.join("\n"), /locked|migration-secret/);
});

test("wrapProviderMailer decorates each resolved provider once", async () => {
  const wrapped: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  const { mailer } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting: memorySetting({ transactional: "resend", bulk: "resend" }),
    wrapProviderMailer: ({ providerId, mailer: inner }) => { wrapped.push(providerId); return inner; },
  }));
  await mailer.send(MESSAGE, OPTIONS);
  await mailer.send(MESSAGE, { ...OPTIONS, purpose: "bulk" });
  assert.deepEqual(wrapped, ["resend"]);
});

test("status: ready lanes, the providers on offer, and sender warnings", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveSmtpKey(credentialDeps);
  const base = { customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting: memorySetting({ transactional: "smtp", bulk: "smtp" }) };
  const unknownSender = await createResolvedMailer(makeResolveDeps(base)).status();
  assert.equal(unknownSender.state, "ready");
  assert.deepEqual(unknownSender.warnings, ["sender_unknown"]);
  assert.deepEqual(unknownSender.providers.map((p) => [p.id, p.origin, p.hosted]), [["smtp", "core", true], ["console", "core", false], ["resend", "plugin", true]]);
  // SMTP cannot verify domains, so a configured sender raises no domain warning.
  const known = await createResolvedMailer(makeResolveDeps({ ...base, readSenderEmail: async () => "news@example.com" })).status();
  assert.deepEqual(known.warnings, []);

  const unconfigured = await createResolvedMailer(makeResolveDeps({ providerSetting: memorySetting({ transactional: null, bulk: null }) })).status();
  assert.equal(unconfigured.state, "unconfigured");
});

test("status: the active provider's domainStatus drives sender_unverified", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  let state: "verified" | "pending" = "pending";
  const registry: MailAdapterRegistry = {
    refusals: [],
    list: () => [{
      pluginId: "fixture", descriptor: { schemaVersion: 2, id: "resend", label: "Resend", module: "a.mjs", credentialLabel: MAIL_HTTP_API_CREDENTIAL_LABEL, credentialKeys: ["token"], feedback: false },
      module: {
        id: "resend", capabilities: { hosted: true, feedback: false, domainVerification: true },
        domainRequirements: async () => ({ status: "ok", value: { purpose: "mail", domain: "example.com", providerId: "resend", records: [] } }),
        domainStatus: async (_ctx: unknown, { domain }: { domain: string }) => ({ status: "ok", value: { domain, state } }),
        create: () => { throw new Error("unused"); },
      } as never,
    }],
  };
  const deps = makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, loadMailAdapters: async () => registry, readSenderEmail: async () => "news@Example.com", providerSetting: memorySetting({ transactional: "resend", bulk: "resend" }) });
  assert.deepEqual((await createResolvedMailer(deps).status()).warnings, ["sender_unverified"]);
  state = "verified";
  assert.deepEqual((await createResolvedMailer(deps).status()).warnings, []);
});

/** A one-adapter plugin registry around a fake provider module. */
function fixtureRegistry(module: Record<string, unknown>, descriptor: Record<string, unknown> = {}): MailAdapterRegistry {
  return {
    refusals: [],
    list: () => [{
      pluginId: "fixture",
      descriptor: { schemaVersion: 2, id: "postal", label: "Postal", module: "a.mjs", credentialLabel: "Postal key", credentialKeys: ["token"], feedback: false, ...descriptor },
      module: { id: "postal", capabilities: { hosted: true, feedback: false, domainVerification: false }, ...module } as never,
    }],
  };
}

const FIXTURE_MAILER = {
  capabilities: () => ({ driver: "postal", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
  send: async () => ({ ok: true as const, providerMessageId: "postal-1", acceptedAt: "2026-10-21T00:00:00.000Z" }),
  sendBatch: async () => [],
};

test("a plugin provider that declares no credential keys is built without a saved key", async () => {
  const { mailer } = createResolvedMailer(makeResolveDeps({
    providerSetting: memorySetting({ transactional: "postal", bulk: null }),
    loadMailAdapters: async () => fixtureRegistry({ create: () => FIXTURE_MAILER }, { credentialKeys: [] }),
  }));
  const sent = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(sent.ok && sent.providerMessageId, "postal-1");
});

test("explicitly selecting console works in production too, but status reports it as local only", async () => {
  const deps = makeResolveDeps({ providerSetting: memorySetting({ transactional: "console", bulk: "console" }), loadMailAdapters: async () => EMPTY_REGISTRY });
  const resolved = createResolvedMailer(deps);
  assert.equal((await resolved.mailer.send(MESSAGE, OPTIONS)).ok, true);
  const status = await resolved.status();
  assert.deepEqual(status.lanes.map((lane) => lane.state), ["local_only", "local_only"]);
  assert.equal(status.state, "degraded");
});

test("capabilities() before any resolution reports console and starts resolving in the background", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  let release: () => void = () => {};
  const gate = new Promise<void>((done) => { release = done; });
  const setting = memorySetting({ transactional: "resend", bulk: "resend" });
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer,
    providerSetting: { read: async () => { await gate; return setting.read(); }, write: setting.write },
  }));
  assert.equal(mailer.capabilities().driver, "console");
  release();
  await ready;
  assert.equal(mailer.capabilities().driver, "resend");
});

test("a saved but undecryptable key for the selected provider refuses with the decrypt reason", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  const [row] = await credentialDeps.repo.listByWorkspace({ workspaceId: WORKSPACE });
  await credentialDeps.repo.update({ ...row!, sealed: { ...(row as unknown as { sealed: Record<string, unknown> }).sealed, nonce: Buffer.alloc(12, 1).toString("base64") } } as never);
  const { mailer } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting: memorySetting({ transactional: "resend", bulk: null }) }, warnings));
  const result = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(!result.ok && result.errorCode, "MAIL_PROVIDER_UNAVAILABLE");
  assert.match(warnings[0]!, /saved but could not be decrypted/);
});

test("first boot: saved SMTP and undecryptable plugin keys cannot select delivery", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  await saveSmtpKey(credentialDeps);
  const rows = await credentialDeps.repo.listByWorkspace({ workspaceId: WORKSPACE });
  const resendRow = rows.find((row) => row.label === MAIL_HTTP_API_CREDENTIAL_LABEL)!;
  await credentialDeps.repo.update({ ...resendRow, sealed: { ...(resendRow as unknown as { sealed: Record<string, unknown> }).sealed, nonce: Buffer.alloc(12, 1).toString("base64") } } as never);
  const providerSetting = memorySetting();
  const { ready } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting, createSmtpTransport: () => new NeverCalledSmtpTransport() }));
  await ready;
  assert.deepEqual(providerSetting.writes, [{ transactional: null, bulk: null }]);
});

test("first boot: a failing credential store does not prevent unconfigured initialization", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  const failing = Object.assign(Object.create(credentialDeps.repo) as CustomCredentialSetRepoPort, { vault: credentialDeps.repo.vault, listByWorkspace: async () => { throw new Error("db locked"); } });
  const providerSetting = memorySetting();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: failing, sealer: credentialDeps.sealer, providerSetting }));
  await ready;
  assert.deepEqual(providerSetting.writes, [{ transactional: null, bulk: null }]);
  const result = await mailer.send(MESSAGE, OPTIONS);
  assert.equal(!result.ok && result.errorCode, "MAIL_UNCONFIGURED");
});

test("a plugin registry that cannot be listed is reported as a refusal", async () => {
  const warnings: string[] = [];
  const { mailer } = createResolvedMailer(makeResolveDeps({ providerSetting: memorySetting({ transactional: "resend", bulk: null }), loadMailAdapters: async () => { throw "disk gone"; } }, warnings));
  await mailer.send(MESSAGE, OPTIONS);
  assert.match(warnings[0]!, /could not be listed \(disk gone\)/);
  const err = createResolvedMailer(makeResolveDeps({ providerSetting: memorySetting({ transactional: "resend", bulk: null }), loadMailAdapters: async () => { throw new Error("eio"); } }, warnings));
  await err.mailer.send(MESSAGE, OPTIONS);
  assert.match(warnings[1]!, /could not be listed \(eio\)/);
});

test("selection faults use safe copy; a throwing warn is swallowed; the default warn is console.warn", async (t) => {
  const broken = createResolvedMailer(makeResolveDeps({ providerSetting: { read: async () => { throw "nope"; }, write: async () => {} } }));
  const refused = await broken.mailer.send(MESSAGE, OPTIONS);
  assert.equal(!refused.ok && refused.message, "Mail provider selection failed; check configuration.");

  const failingWrite = createResolvedMailer(makeResolveDeps({ loadMailAdapters: async () => EMPTY_REGISTRY, providerSetting: { read: async () => null, write: async () => { throw "locked"; } }, warn: () => { throw new Error("log sink down"); } }));
  const result = await failingWrite.mailer.send(MESSAGE, OPTIONS);
  assert.equal(!result.ok && result.errorCode, "MAIL_UNCONFIGURED");

  const consoleWarn = t.mock.method(console, "warn", () => {});
  const defaulted = makeResolveDeps({ loadMailAdapters: async () => EMPTY_REGISTRY, providerSetting: memorySetting({ transactional: null, bulk: null }) });
  delete (defaulted as Partial<ResolveMailerDeps>).warn;
  await createResolvedMailer(defaulted).mailer.send(MESSAGE, OPTIONS);
  assert.equal(consoleWarn.mock.callCount(), 1);
});

test("the default SMTP transport and console log are used when none is injected", async (t) => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveSmtpKey(credentialDeps);
  const smtpDeps = makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting: memorySetting({ transactional: "smtp", bulk: null }) });
  delete (smtpDeps as Partial<ResolveMailerDeps>).createSmtpTransport;
  const smtp = createResolvedMailer(smtpDeps);
  await smtp.ready;
  assert.equal(smtp.mailer.capabilities().driver, "smtp", "the real nodemailer transport is built (no connection until a send)");

  const consoleLog = t.mock.method(console, "log", () => {});
  const local = makeResolveDeps({ mode: "local", loadMailAdapters: async () => EMPTY_REGISTRY, providerSetting: memorySetting({ transactional: null, bulk: null }) });
  delete (local as Partial<ResolveMailerDeps>).log;
  await createResolvedMailer(local).mailer.send(MESSAGE, OPTIONS);
  assert.equal(consoleLog.mock.callCount(), 1);
});

test("status: an unknown lane provider has no credential; with no provider the sender still warns only when unset", async () => {
  const unknown = await createResolvedMailer(makeResolveDeps({ providerSetting: memorySetting({ transactional: "postal", bulk: null }), loadMailAdapters: async () => EMPTY_REGISTRY, readSenderEmail: async () => "news@example.com" })).status();
  assert.deepEqual(unknown.lanes.map((lane) => lane.state), ["unknown_provider", "unconfigured"]);
  assert.deepEqual(unknown.warnings, []);
  const failingSender = await createResolvedMailer(makeResolveDeps({ providerSetting: memorySetting({ transactional: null, bulk: null }), readSenderEmail: async () => { throw new Error("db"); } })).status();
  assert.deepEqual(failingSender.warnings, ["sender_unknown"]);
});

test("status: a failed or rejected domain check raises no warning; a provider without a saved key is not asked", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, { workspaceId: WORKSPACE, label: "Postal key", category: "ops", baseUrl: "https://api.postal.test", connection: { token: "pk" } });
  let calls = 0;
  const domainModule = (domainStatus: () => Promise<unknown>) => fixtureRegistry({
    capabilities: { hosted: true, feedback: false, domainVerification: true },
    domainRequirements: async () => ({ status: "ok", value: { purpose: "mail", domain: "example.com", providerId: "postal", records: [] } }),
    domainStatus: async () => { calls += 1; return domainStatus(); },
    create: () => FIXTURE_MAILER,
  });
  const base = { readSenderEmail: async () => "news@example.com", providerSetting: memorySetting({ transactional: "postal", bulk: "postal" }) };
  const rejected = makeResolveDeps({ ...base, customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, loadMailAdapters: async () => domainModule(async () => ({ status: "rejected", error: { code: "unauthorized", message: "bad key" } })) });
  assert.deepEqual((await createResolvedMailer(rejected).status()).warnings, []);
  const thrown = makeResolveDeps({ ...base, customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, loadMailAdapters: async () => domainModule(async () => { throw new Error("network"); }) });
  assert.deepEqual((await createResolvedMailer(thrown).status()).warnings, []);
  assert.equal(calls, 2);
  const keyless = makeResolveDeps({ ...base, loadMailAdapters: async () => domainModule(async () => assert.fail("not asked without a key")) });
  const status = await createResolvedMailer(keyless).status();
  assert.deepEqual(status.warnings, []);
  assert.equal(status.state, "degraded");
});

test("first boot: neither a keyless nor a v1 plugin with a saved key selects delivery", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, { workspaceId: WORKSPACE, label: "Postal key", category: "ops", baseUrl: "https://api.postal.test", connection: { token: "pk" } });
  const keyless = memorySetting();
  await createResolvedMailer(makeResolveDeps({ providerSetting: keyless, loadMailAdapters: async () => fixtureRegistry({ create: () => FIXTURE_MAILER }, { credentialKeys: [] }) })).ready;
  assert.deepEqual(keyless.writes, [{ transactional: null, bulk: null }]);
  const v1Registry: MailAdapterRegistry = { refusals: [], list: () => [{ pluginId: "fixture", descriptor: { id: "postal", label: "Postal", module: "a.mjs", credentialLabel: "Postal key" }, module: { create: () => FIXTURE_MAILER } as never }] };
  const v1 = memorySetting();
  await createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting: v1, loadMailAdapters: async () => v1Registry })).ready;
  assert.deepEqual(v1.writes, [{ transactional: null, bulk: null }]);
});

test("a selected provider credential store throwing a non-Error is redacted", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  const failing = Object.assign(Object.create(credentialDeps.repo) as CustomCredentialSetRepoPort, { vault: credentialDeps.repo.vault, listByWorkspace: async () => { throw "eio"; } });
  const warnings: string[] = [];
  const providerSetting = memorySetting({ transactional: "smtp", bulk: null });
  const { mailer } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: failing, sealer: credentialDeps.sealer, providerSetting }, warnings));
  await mailer.send(MESSAGE, OPTIONS);
  assert.match(warnings[0]!, /the "Tovu Mail — SMTP Server" credential could not be read/);
  assert.doesNotMatch(warnings[0]!, /eio/);
  // Status treats an unreadable key as missing rather than failing.
  const status = await createResolvedMailer(makeResolveDeps({ customCredentialRepo: failing, sealer: credentialDeps.sealer, providerSetting, readSenderEmail: async () => "news@example.com" })).status();
  assert.equal(status.lanes[0]!.state, "missing_credential");
});

test("settle waits for the transactional lane; status with no transactional provider asks no domain check", async () => {
  const resolved = createResolvedMailer(makeResolveDeps({ loadMailAdapters: async () => EMPTY_REGISTRY, providerSetting: memorySetting({ transactional: null, bulk: null }), readSenderEmail: async () => "news@example.com" }));
  await resolved.settle();
  assert.equal(resolved.mailer.capabilities().driver, "console");
  assert.deepEqual((await resolved.status()).warnings, []);
});

test("checkProvider: a hosted provider with a usable key passes; unknown, local-only and keyless-in-store providers say why", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveSmtpKey(credentialDeps);
  const { checkProvider } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting: memorySetting({ transactional: null, bulk: null }) }));
  assert.deepEqual(await checkProvider({ id: "smtp" }), { ok: true, label: "SMTP server" });
  assert.deepEqual(await checkProvider({ id: "postal" }), { ok: false, reason: "'postal' is not an installed mail provider (installed: smtp, console, resend)" });
  assert.deepEqual(await checkProvider({ id: "console" }), { ok: false, reason: "'console' only prints mail locally and never delivers it" });
  assert.deepEqual(await checkProvider({ id: "resend" }), { ok: false, reason: `'resend' has no saved credential "${MAIL_HTTP_API_CREDENTIAL_LABEL}" under Access Tokens (category "ops")` });
  const keyless = createResolvedMailer(makeResolveDeps({ loadMailAdapters: async () => fixtureRegistry({ create: () => FIXTURE_MAILER }, { credentialKeys: [] }) }));
  assert.deepEqual(await keyless.checkProvider({ id: "postal" }), { ok: true, label: "Postal" });
});

test("domainRequirements: the active transactional provider's records for the sender domain, or null when any part is missing", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, { workspaceId: WORKSPACE, label: "Postal key", category: "ops", baseUrl: "https://api.postal.test", connection: { token: "pk" } });
  const asked: Array<{ domain: string; token: string; workspaceId: string }> = [];
  let answer: unknown = { status: "ok", value: { purpose: "mail", domain: "example.com", providerId: "postal", records: [{ type: "TXT", name: "send.example.com", value: "v=spf1 include:postal.test ~all" }] } };
  const postal = fixtureRegistry({
    capabilities: { hosted: true, feedback: false, domainVerification: true },
    domainRequirements: async (ctx: { credential: { token: string }; workspaceId: string }, { domain }: { domain: string }) => { asked.push({ domain, token: ctx.credential.token, workspaceId: ctx.workspaceId }); return answer; },
    domainStatus: async () => ({ status: "ok", value: { domain: "example.com", state: "verified" } }),
    create: () => FIXTURE_MAILER,
  });
  const keyed = { customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, loadMailAdapters: async () => postal };
  const make = (overrides: Partial<ResolveMailerDeps>) => createResolvedMailer(makeResolveDeps({ ...keyed, readSenderEmail: async () => "News@Example.com", providerSetting: memorySetting({ transactional: "postal", bulk: null }), ...overrides }));

  const requirement = await make({}).domainRequirements({ workspaceId: WORKSPACE });
  assert.equal(requirement?.providerId, "postal");
  assert.deepEqual(asked, [{ domain: "example.com", token: "pk", workspaceId: WORKSPACE }]);

  assert.equal(await make({}).domainRequirements({ workspaceId: "another-site" }), null, "a mailer answers only for its own workspace");
  assert.equal(await make({ readSenderEmail: async () => "news@" }).domainRequirements({ workspaceId: WORKSPACE }), null, "no sender domain");
  assert.equal(await make({ readSenderEmail: async () => undefined }).domainRequirements({ workspaceId: WORKSPACE }), null, "no sender configured");
  assert.equal(await make({ providerSetting: memorySetting({ transactional: null, bulk: "postal" }) }).domainRequirements({ workspaceId: WORKSPACE }), null, "no transactional provider");
  assert.equal(await make({ providerSetting: memorySetting({ transactional: "gone", bulk: null }) }).domainRequirements({ workspaceId: WORKSPACE }), null, "provider not installed");
  assert.equal(await make({ loadMailAdapters: async () => fixtureRegistry({ create: () => FIXTURE_MAILER }) }).domainRequirements({ workspaceId: WORKSPACE }), null, "provider cannot verify domains");
  assert.equal(await make({ customCredentialRepo: new InMemoryCustomCredentialSetRepo() as never }).domainRequirements({ workspaceId: WORKSPACE }), null, "provider key missing");
  assert.equal(asked.length, 1, "only the configured case reaches the provider");

  answer = { status: "rejected", error: { code: "unauthorized", message: "bad key" } };
  await assert.rejects(make({}).domainRequirements({ workspaceId: WORKSPACE }), { message: "The mail provider could not list its required DNS records." });
  // A provider that never settles must still allow mail_dns_status to return requirements_failed.
  const stalled = fixtureRegistry({ capabilities: { hosted: true, feedback: false, domainVerification: true }, domainRequirements: () => new Promise(() => {}), domainStatus: async () => ({ status: "ok", value: { domain: "example.com", state: "verified" } }), create: () => FIXTURE_MAILER });
  await assert.rejects(make({ loadMailAdapters: async () => stalled, domainRequirementsTimeoutMs: 1 }).domainRequirements({ workspaceId: WORKSPACE }), { message: "The mail provider could not list its required DNS records." });
});
