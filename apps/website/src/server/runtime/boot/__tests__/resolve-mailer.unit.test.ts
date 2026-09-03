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
import {
  createResolvedMailer,
  parseSmtpEndpoint,
  MAIL_HTTP_API_CREDENTIAL_LABEL,
  MAIL_SMTP_CREDENTIAL_LABEL,
  type ResolveMailerDeps,
} from "../resolve-mailer.js";

/**
 * @file `createResolvedMailer` — the hosted-API -> SMTP -> console resolution chain and its
 * production-only warning. No test in this file sends a real email or makes a live API call: the
 * hosted-API branch is driven by a fake `HttpClientPort` and the SMTP branch by an injected fake
 * transport factory (never the real `createNodemailerSmtpTransport`).
 */

const WORKSPACE = "ws-1";

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
    clock: { nowIso: () => "2026-08-31T00:00:00.000Z" },
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

test("hosted-API credential configured: resolves to HttpApiMailerAdapter and does not warn", async () => {
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
  const fakeTransport: SmtpTransport = { sendMail: async () => ({ messageId: "smtp-1" }) };
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
