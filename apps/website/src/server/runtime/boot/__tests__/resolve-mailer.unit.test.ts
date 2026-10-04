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
import { createResolvedMailer, parseSmtpEndpoint, MAIL_SMTP_CREDENTIAL_LABEL, type ResolveMailerDeps } from "../resolve-mailer.js";

/**
 * @file `createResolvedMailer` — the plugin-adapter -> SMTP -> console resolution chain and its
 * production-only warning. No test in this file sends a real email or makes a live API call: the
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
 *  in flight, reproducing the startup-race window this file's header documents. */
class DelayedListRepo implements CustomCredentialSetRepoPort {
  constructor(
    private readonly inner: CustomCredentialSetRepoPort,
    private readonly delayMs: number
  ) {}
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
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
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
    clock: { nowMs: () => Date.parse("2026-08-31T00:00:00.000Z"), nowIso: () => "2026-08-31T00:00:00.000Z" },
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
  };
}

function makeResolveDeps(overrides: Partial<ResolveMailerDeps> = {}, warnings: string[] = []): ResolveMailerDeps {
  const credentialDeps = makeCredentialWriteDeps();
  return {
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

test("parseSmtpEndpoint: explicit 465/443 are secure, explicit 587 and other nonstandard ports are not, and a portless https URL defaults to 443 (implicit TLS)", () => {
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com:465"), { host: "smtp.example.com", port: 465, secure: true });
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com:443"), { host: "smtp.example.com", port: 443, secure: true });
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com:587"), { host: "smtp.example.com", port: 587, secure: false });
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com:2525"), { host: "smtp.example.com", port: 2525, secure: false });
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com"), { host: "smtp.example.com", port: 443, secure: true });
});

test("settle refreshes console configuration without sending a message", async () => {
  const credentials = makeCredentialWriteDeps();
  const resolved = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentials.repo, sealer: credentials.sealer, loadMailAdapters: async () => EMPTY_REGISTRY }));
  await resolved.ready;
  assert.equal(resolved.mailer.capabilities().driver, "console");
  await createCustomCredential(credentials, { workspaceId: WORKSPACE, label: MAIL_SMTP_CREDENTIAL_LABEL, category: "ops", baseUrl: "https://smtp.example.com:587", connection: { token: "smtp-password", username: "smtp-user" } });
  await resolved.settle();
  assert.equal(resolved.mailer.capabilities().driver, "smtp");
});

test("no credential configured + production mode: falls back to console and warns naming both labels", async () => {
  const warnings: string[] = [];
  const deps = makeResolveDeps({}, warnings);
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;

  assert.equal(mailer.capabilities().driver, "console");
  assert.equal(warnings.length, 1);
  assert.equal(
    warnings[0],
    '[mail] no working mail credential found — neither is configured — falling back to ConsoleMailerAdapter, so ' +
      'outbound mail (form notifications, newsletter, member verification) will NOT actually be sent. ' +
      `Add a "${MAIL_HTTP_API_CREDENTIAL_LABEL}" (recommended) or "${MAIL_SMTP_CREDENTIAL_LABEL}" ` +
      'credential under Access Tokens (category "ops") to fix this.'
  );
});

test("no credential configured + local mode: falls back to console silently (no warning)", async () => {
  const warnings: string[] = [];
  const deps = makeResolveDeps({ mode: "local" }, warnings);
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;

  assert.equal(mailer.capabilities().driver, "console");
  assert.equal(warnings.length, 0);
});

test("hosted-API credential configured: resolves to the resend plugin's adapter and does not warn", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE,
    label: MAIL_HTTP_API_CREDENTIAL_LABEL,
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "re_live_key" },
  });
  const httpClient = new FakeHttpClient();
  const deps = makeResolveDeps(
    { customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer, httpClient },
    warnings
  );
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;

  assert.equal(mailer.capabilities().driver, "resend");
  assert.equal(warnings.length, 0);

  // Prove the resolved adapter is actually wired to the injected HttpClientPort, not a stray
  // second instance.
  await mailer.send(
    { workspaceId: WORKSPACE, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "hi", text: "hi" },
    { idempotencyKey: "k1", workspaceId: WORKSPACE, sourceContext: { module: "test" } }
  );
  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0].headers.Authorization, "Bearer re_live_key");
});

test("SMTP credential configured (no hosted-API credential): resolves to SmtpMailerAdapter using the parsed host/port/secure and injected transport factory", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE,
    label: MAIL_SMTP_CREDENTIAL_LABEL,
    category: "ops",
    baseUrl: "https://smtp.example.com:465",
    connection: { token: "app-password", username: "mailer@example.com" },
  });

  let capturedConfig: unknown;
  const deliveries: SmtpMailPayload[] = [];
  const fakeTransport: SmtpTransport = { sendMail: async (mail) => { deliveries.push(mail); return { messageId: "smtp-1" }; } };
  const deps = makeResolveDeps(
    {
      customCredentialRepo: credentialDeps.repo,
      sealer: credentialDeps.sealer,
      createSmtpTransport: (config) => {
        capturedConfig = config;
        return fakeTransport;
      },
    },
    warnings
  );
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;

  assert.equal(mailer.capabilities().driver, "smtp");
  assert.equal(warnings.length, 0);
  assert.deepEqual(capturedConfig, {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    auth: { user: "mailer@example.com", pass: "app-password" },
  });
  const delivered = await mailer.send(
    { workspaceId: WORKSPACE, from: { email: "sender@example.com", name: "Sender" }, to: { email: "reader@example.com" }, subject: "SMTP resolution delivery", text: "Distinct SMTP body" },
    { workspaceId: WORKSPACE, idempotencyKey: "smtp-delivery", sourceContext: { module: "test" } },
  );
  assert.equal(delivered.ok, true);
  assert.deepEqual(deliveries, [{ from: { name: "Sender", address: "sender@example.com" }, to: { address: "reader@example.com" }, subject: "SMTP resolution delivery", text: "Distinct SMTP body" }]);
});

test("an SMTP credential with no username is treated as not-configured (unauthenticated relay is not representable)", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE,
    label: MAIL_SMTP_CREDENTIAL_LABEL,
    category: "ops",
    baseUrl: "https://smtp.example.com:25",
    connection: { token: "irrelevant" },
  });
  const deps = makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: credentialDeps.sealer }, warnings);
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;

  assert.equal(mailer.capabilities().driver, "console");
  assert.equal(warnings.length, 1);
  assert.equal(
    warnings[0],
    '[mail] no working mail credential found — neither is configured — falling back to ConsoleMailerAdapter, so ' +
      'outbound mail (form notifications, newsletter, member verification) will NOT actually be sent. ' +
      `Add a "${MAIL_HTTP_API_CREDENTIAL_LABEL}" (recommended) or "${MAIL_SMTP_CREDENTIAL_LABEL}" ` +
      'credential under Access Tokens (category "ops") to fix this.'
  );
});

test("hosted-API row is corrupted (fails to decrypt) but the SMTP row is fine: falls through to SMTP instead of console", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  const httpApiCred = await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE,
    label: MAIL_HTTP_API_CREDENTIAL_LABEL,
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "re_live_key" },
  });
  await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE,
    label: MAIL_SMTP_CREDENTIAL_LABEL,
    category: "ops",
    baseUrl: "https://smtp.example.com:587",
    connection: { token: "app-password", username: "mailer@example.com" },
  });

  // Corrupt ONLY the hosted-API row's ciphertext (splice in garbage nonce bytes) so its AES-GCM
  // auth tag fails to verify — the SAME "wrong bytes fail to open" technique `vendor-credentials/
  // __tests__/store.unit.test.ts`'s "does not open under a DIFFERENT credential set's own derived
  // AAD" test uses. Both rows still share the SAME real sealer/keyring — only this one row's
  // stored bytes are bad, proving the fallback is per-row, not "any decrypt failure nukes
  // everything".
  const row = await credentialDeps.repo.findById({ workspaceId: WORKSPACE, id: httpApiCred.id });
  await credentialDeps.repo.update({ ...row!, sealed: { ...row!.sealed, nonce: Buffer.alloc(12, 1).toString("base64") } });

  const fakeTransport: SmtpTransport = { sendMail: async () => ({ messageId: "smtp-fallback-1" }) };
  const deps = makeResolveDeps(
    {
      customCredentialRepo: credentialDeps.repo,
      sealer: credentialDeps.sealer,
      createSmtpTransport: () => fakeTransport,
    },
    warnings
  );
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;

  assert.equal(mailer.capabilities().driver, "smtp");
  // Falls through to a WORKING tier — no warning, since outbound mail genuinely still works.
  assert.equal(warnings.length, 0);
});

test("both credentials present but both fail to decrypt: falls back to console and the warning names the decrypt failure", async () => {
  const warnings: string[] = [];
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE,
    label: MAIL_HTTP_API_CREDENTIAL_LABEL,
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "re_live_key" },
  });
  await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE, label: MAIL_SMTP_CREDENTIAL_LABEL, category: "ops", baseUrl: "https://smtp.example.com:587",
    connection: { token: "smtp-unopenable", username: "mailer@example.com" },
  });

  const brokenOpenSealer = {
    seal: credentialDeps.sealer.seal.bind(credentialDeps.sealer),
    open: async () => {
      throw new Error("simulated decrypt failure");
    },
  };
  const deps = makeResolveDeps({ customCredentialRepo: credentialDeps.repo, sealer: brokenOpenSealer }, warnings);
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;

  assert.equal(mailer.capabilities().driver, "console");
  assert.equal(warnings.length, 1);
  assert.equal(
    warnings[0],
    `[mail] no working mail credential found (the "${MAIL_HTTP_API_CREDENTIAL_LABEL}" credential is saved but could ` +
      "not be decrypted (custom credential could not be decrypted (secret store unconfigured, or the stored row is " +
      "corrupted): simulated decrypt failure); " +
      `the "${MAIL_SMTP_CREDENTIAL_LABEL}" credential is saved but could not be decrypted (custom credential could not be decrypted (secret store unconfigured, or the stored row is ` +
      "corrupted): simulated decrypt failure)) — falling back to ConsoleMailerAdapter, so outbound mail (form " +
      "notifications, newsletter, member verification) will NOT actually be sent. " +
      `Add a "${MAIL_HTTP_API_CREDENTIAL_LABEL}" (recommended) or "${MAIL_SMTP_CREDENTIAL_LABEL}" ` +
      'credential under Access Tokens (category "ops") to fix this.'
  );
});

test("mailer.send()/sendBatch() delegate through capabilities() consistently before and after the background swap settles", async () => {
  // Regression for the startup-race disclosure in this module's own header: even before `ready`
  // resolves, `mailer` must be a fully usable MailerPort (Console), never `undefined`/a partial
  // object.
  const warnings: string[] = [];
  const deps = makeResolveDeps({}, warnings);
  const { mailer, ready } = createResolvedMailer(deps);

  assert.equal(mailer.capabilities().driver, "console");
  const preSwapResult = await mailer.send(
    { workspaceId: WORKSPACE, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "hi", text: "hi" },
    { idempotencyKey: "k1", workspaceId: WORKSPACE, sourceContext: { module: "test" } }
  );
  assert.equal(preSwapResult.ok, true);

  await ready;
  assert.equal(mailer.capabilities().driver, "console");
});

test("send() called during the boot-time credential-resolution window must not report success unless the message actually reached the resolved adapter", async () => {
  // A real, working hosted-API credential IS configured — but `listByWorkspace` (the read
  // `resolveCustomCredentialByLabel` awaits) is delayed, so `mailer.send()` below is called
  // while `current` is still the `ConsoleMailerAdapter` fallback. Before the fix, `send()`
  // delegated to whatever `current` was AT CALL TIME instead of waiting for resolution, so this
  // send was silently logged to the console (never reaching the fake HTTP client) while still
  // reporting `{ ok: true }` — the exact "reports success, never delivered" bug this test guards.
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE,
    label: MAIL_HTTP_API_CREDENTIAL_LABEL,
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "re_live_key" },
  });
  const httpClient = new FakeHttpClient();
  const warnings: string[] = [];
  const deps = makeResolveDeps(
    {
      customCredentialRepo: new DelayedListRepo(credentialDeps.repo, 20),
      sealer: credentialDeps.sealer,
      httpClient,
    },
    warnings
  );
  const { mailer, ready } = createResolvedMailer(deps);

  const result = await mailer.send(
    { workspaceId: WORKSPACE, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "hi", text: "hi" },
    { idempotencyKey: "k1", workspaceId: WORKSPACE, sourceContext: { module: "test" } }
  );
  await ready;

  assert.equal(result.ok, true);
  assert.equal(
    httpClient.calls.length,
    1,
    "the message must actually reach the resolved (real) adapter, not be swallowed by the Console fallback while still reporting success"
  );
});

test("first boot after upgrade: the bundled plugin is not installed yet when the boot lookup runs, and the next send still goes through it", async () => {
  // Boot order: the mailer's lookup starts while `bundled-agent-plugins` is still seeding, so the
  // first registry read is empty. A site with a saved Resend key must not drop mail until a restart.
  const credentialDeps = makeCredentialWriteDeps();
  await createCustomCredential(credentialDeps, {
    workspaceId: WORKSPACE,
    label: MAIL_HTTP_API_CREDENTIAL_LABEL,
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "re_live_key" },
  });
  let seeded = false;
  const httpClient = new FakeHttpClient();
  const deps = makeResolveDeps({
    customCredentialRepo: credentialDeps.repo,
    sealer: credentialDeps.sealer,
    httpClient,
    loadMailAdapters: async () => (seeded ? loadBundledMailAdapters() : EMPTY_REGISTRY),
  });
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;
  assert.equal(mailer.capabilities().driver, "console");

  seeded = true;
  const result = await mailer.send(
    { workspaceId: WORKSPACE, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "hi", text: "hi" },
    { idempotencyKey: "k1", workspaceId: WORKSPACE, sourceContext: { module: "test" } }
  );

  assert.equal(result.ok, true);
  assert.equal(httpClient.calls.length, 1, "the send must reach the plugin's adapter, not the Console fallback");
  assert.equal(mailer.capabilities().driver, "resend");
});

test("no plugin adds a mail adapter and nothing is configured: the production warning names only SMTP, once across retried sends", async () => {
  const warnings: string[] = [];
  const deps = makeResolveDeps({ loadMailAdapters: async () => EMPTY_REGISTRY }, warnings);
  const { mailer, ready } = createResolvedMailer(deps);
  await ready;
  await mailer.send(
    { workspaceId: WORKSPACE, to: { email: "a@example.com" }, from: { email: "b@example.com" }, subject: "hi", text: "hi" },
    { idempotencyKey: "k1", workspaceId: WORKSPACE, sourceContext: { module: "test" } }
  );

  assert.equal(mailer.capabilities().driver, "console");
  assert.deepEqual(warnings, [
    '[mail] no working mail credential found — none is configured — falling back to ConsoleMailerAdapter, so ' +
      'outbound mail (form notifications, newsletter, member verification) will NOT actually be sent. ' +
      `Add a "${MAIL_SMTP_CREDENTIAL_LABEL}" credential under Access Tokens (category "ops") to fix this.`,
  ]);
});

test("registry load rejection diagnoses the failure and a later successful load delivers through the adapter", async () => {
  const credentials = makeCredentialWriteDeps();
  await createCustomCredential(credentials, { workspaceId: WORKSPACE, label: MAIL_HTTP_API_CREDENTIAL_LABEL, category: "ops", baseUrl: "https://api.resend.com", connection: { token: "registry-recovery-key" } });
  let failLoad = true;
  const warnings: string[] = [];
  const httpClient = new FakeHttpClient();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({
    customCredentialRepo: credentials.repo, sealer: credentials.sealer, httpClient,
    loadMailAdapters: async () => { if (failLoad) throw new Error("registry unavailable"); return loadBundledMailAdapters(); },
  }, warnings));
  await ready;
  assert.equal(mailer.capabilities().driver, "console");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /plugin mail adapters could not be listed \(registry unavailable\)/);
  failLoad = false;
  const result = await mailer.send(
    { workspaceId: WORKSPACE, from: { email: "sender@example.com" }, to: { email: "reader@example.com" }, subject: "Registry recovery", text: "Recovered body" },
    { workspaceId: WORKSPACE, idempotencyKey: "registry-recovery", sourceContext: { module: "test" } },
  );
  assert.equal(result.ok, true);
  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0].headers.Authorization, "Bearer registry-recovery-key");
  assert.equal(JSON.parse(httpClient.calls[0].body!).subject, "Registry recovery");
  assert.equal(warnings.length, 1);
});

test("multiple working adapters select the first in registry order, ahead of a configured SMTP credential", async () => {
  const bundled = (await loadBundledMailAdapters()).list()[0];
  assert.ok(bundled);
  const second = { ...bundled, descriptor: { ...bundled.descriptor, id: "second", credentialLabel: "Second Mail API" } };
  const credentials = makeCredentialWriteDeps();
  for (const [label, token, baseUrl, username] of [
    [MAIL_HTTP_API_CREDENTIAL_LABEL, "first-api-key", "https://api.first.test", undefined],
    ["Second Mail API", "second-api-key", "https://api.second.test", undefined],
    [MAIL_SMTP_CREDENTIAL_LABEL, "smtp-key", "https://smtp.example.com:465", "mailer"],
  ]) {
    await createCustomCredential(credentials, { workspaceId: WORKSPACE, label: label!, category: "ops", baseUrl: baseUrl!, connection: { token: token!, ...(username ? { username } : {}) } });
  }
  for (const [adapters, token, origin] of [
    [[bundled, second], "first-api-key", "https://api.first.test"],
    [[second, bundled], "second-api-key", "https://api.second.test"],
  ] as const) {
    const httpClient = new FakeHttpClient();
    const { mailer, ready } = createResolvedMailer(makeResolveDeps({
      customCredentialRepo: credentials.repo, sealer: credentials.sealer, httpClient,
      loadMailAdapters: async () => ({ list: () => adapters, refusals: [] }),
      createSmtpTransport: () => { assert.fail("working plugin adapters must win over SMTP"); },
    }));
    await ready;
    await mailer.send({ workspaceId: WORKSPACE, from: { email: "sender@example.com" }, to: { email: "reader@example.com" }, subject: "Ordered delivery", text: "Order probe" },
      { workspaceId: WORKSPACE, idempotencyKey: "ordered", sourceContext: { module: "test" } });
    assert.equal(httpClient.calls.length, 1);
    assert.equal(httpClient.calls[0].url, `${origin}/emails`);
    assert.equal(httpClient.calls[0].headers.Authorization, `Bearer ${token}`);
  }
});

test("sendBatch waits for pending resolution and delivers each distinct message and its options before and after readiness", async () => {
  const credentials = makeCredentialWriteDeps();
  await createCustomCredential(credentials, { workspaceId: WORKSPACE, label: MAIL_HTTP_API_CREDENTIAL_LABEL, category: "ops", baseUrl: "https://api.resend.com", connection: { token: "batch-api-key" } });
  let release!: (registry: MailAdapterRegistry) => void;
  const registry = new Promise<MailAdapterRegistry>((resolve) => { release = resolve; });
  const httpClient = new FakeHttpClient();
  const { mailer, ready } = createResolvedMailer(makeResolveDeps({ customCredentialRepo: credentials.repo, sealer: credentials.sealer, httpClient, loadMailAdapters: () => registry }));
  const messages = ["one", "two"].map((id) => ({ workspaceId: WORKSPACE, from: { email: "sender@example.com" }, to: { email: `${id}@example.com` }, subject: `Batch ${id}`, text: `Body ${id}` }));
  let settled = false;
  const pending = mailer.sendBatch(messages, { workspaceId: WORKSPACE, idempotencyKey: "pending-batch", timeoutMs: 4321, sourceContext: { module: "test" } }).then((result) => { settled = true; return result; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false, "a configured batch cannot report console success while resolution is pending");
  assert.deepEqual(httpClient.calls, []);
  release(await loadBundledMailAdapters());
  const pendingResults = await pending;
  await ready;
  assert.equal(pendingResults.length, 2);
  assert.ok(pendingResults.every((result) => result.ok));
  const afterResults = await mailer.sendBatch(messages, { workspaceId: WORKSPACE, idempotencyKey: "ready-batch", timeoutMs: 7654, sourceContext: { module: "test" } });
  assert.equal(afterResults.length, 2);
  assert.ok(afterResults.every((result) => result.ok));
  assert.equal(httpClient.calls.length, 4);
  assert.deepEqual(httpClient.calls.map((call) => ({
    method: call.method, url: call.url, token: call.headers.Authorization,
    key: call.headers["Idempotency-Key"], timeout: call.timeoutMs, body: JSON.parse(call.body!),
  })), [
    { method: "POST", url: "https://api.resend.com/emails", token: "Bearer batch-api-key", key: "pending-batch:0", timeout: 4321, body: { from: "sender@example.com", to: "one@example.com", subject: "Batch one", text: "Body one" } },
    { method: "POST", url: "https://api.resend.com/emails", token: "Bearer batch-api-key", key: "pending-batch:1", timeout: 4321, body: { from: "sender@example.com", to: "two@example.com", subject: "Batch two", text: "Body two" } },
    { method: "POST", url: "https://api.resend.com/emails", token: "Bearer batch-api-key", key: "ready-batch:0", timeout: 7654, body: { from: "sender@example.com", to: "one@example.com", subject: "Batch one", text: "Body one" } },
    { method: "POST", url: "https://api.resend.com/emails", token: "Bearer batch-api-key", key: "ready-batch:1", timeout: 7654, body: { from: "sender@example.com", to: "two@example.com", subject: "Batch two", text: "Body two" } },
  ]);
});
