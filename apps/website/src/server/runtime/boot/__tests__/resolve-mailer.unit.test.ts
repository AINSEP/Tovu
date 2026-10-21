import assert from "node:assert/strict";
import path from "node:path";
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
import { loadMailAdapterRegistryFromSource, type MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { createResolvedMailer, parseSmtpEndpoint, MAIL_SMTP_CREDENTIAL_LABEL, type MailProviderSettingPort, type ResolveMailerDeps } from "../resolve-mailer.js";
import type { MailProviderSetting } from "@jini-ai/platform/mail";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file `createResolvedMailer` — explicit per-lane selection from `core.mail.provider`, the
 * first-boot migration that replays the old plugin -> SMTP -> console chain once, and the
 * production refusal of unconfigured lanes. No test in this file sends a real email or makes a live API call: the
 * plugin branch runs the bundled `resend` plugin's real adapter (read from its source directory)
 * over a fake `HttpClientPort`, and the SMTP branch an injected fake transport factory (never the
 * real `createNodemailerSmtpTransport`).
 */

const WORKSPACE = "ws-1";

/** The label sites already saved their Resend key under; it now lives in the plugin's descriptor. */
const MAIL_HTTP_API_CREDENTIAL_LABEL = "Tovu Mail — Resend API";

const RESEND_PLUGIN_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/resend");

let bundledRegistry: Promise<MailAdapterRegistry> | undefined;

/** The bundled `resend` plugin's registry, as an enabled, seeded install would load it. */
function loadBundledMailAdapters(): Promise<MailAdapterRegistry> {
  bundledRegistry ??= loadMailAdapterRegistryFromSource({ pluginId: "resend", packageRoot: RESEND_PLUGIN_ROOT });
  return bundledRegistry;
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

test("first boot with a saved hosted-API key: the old chain's pick (resend) is written for both lanes and delivers", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  const httpClient = new FakeHttpClient();
  const providerSetting = memorySetting();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, httpClient, providerSetting }));
  await ready;
  assert.deepEqual(providerSetting.writes, [{ transactional: "resend", bulk: "resend" }]);
  assert.equal(mailer.capabilities().driver, "resend");
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.equal(httpClient.calls[0]!.headers.Authorization, "Bearer re_live_key");
});

test("first boot with only an SMTP key: smtp is written, and the transport gets the parsed endpoint", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveSmtpKey(credentialDeps);
  let captured: unknown;
  const providerSetting = memorySetting();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting, loadMailAdapters: async () => EMPTY_REGISTRY,
    createSmtpTransport: (config) => { captured = config; return { sendMail: async () => ({ messageId: "smtp-1" }) }; },
  }));
  await ready;
  assert.deepEqual(providerSetting.writes, [{ transactional: "smtp", bulk: "smtp" }]);
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

test("first boot after an upgrade: a mail key whose plugin is not installed yet is not pinned as unconfigured", async () => {
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  const providerSetting = memorySetting();
  let installed = false;
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, providerSetting,
    loadMailAdapters: () => (installed ? loadBundledMailAdapters() : Promise.resolve(EMPTY_REGISTRY)),
  }));
  await ready;
  assert.deepEqual(providerSetting.writes, [], "nothing persisted while the key's plugin is missing");
  installed = true;
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.deepEqual(providerSetting.writes, [{ transactional: "resend", bulk: "resend" }]);
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
  assert.equal(!refused.ok && refused.message, "mail provider selection failed (db down)");
});

test("a failed migration write warns and still serves this send from the computed setting", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  await saveResendKey(credentialDeps);
  const { mailer } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer,
    providerSetting: { read: async () => null, write: async () => { throw new Error("locked"); } },
  }, warnings));
  assert.equal((await mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.match(warnings[0]!, /could not be saved \(locked\)/);
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
