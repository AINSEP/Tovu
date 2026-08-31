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

test("parseSmtpEndpoint: port 465 is secure, 587 is not, and a missing port defaults to 587", () => {
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com:465"), { host: "smtp.example.com", port: 465, secure: true });
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com:587"), { host: "smtp.example.com", port: 587, secure: false });
  assert.deepEqual(parseSmtpEndpoint("https://smtp.example.com"), { host: "smtp.example.com", port: 587, secure: false });
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
