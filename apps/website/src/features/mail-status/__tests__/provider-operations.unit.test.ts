import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createCustomCredential, InMemoryCustomCredentialSetRepo, resolveCustomCredentialByLabel, type CustomCredentialWriteDeps } from "#src/features/custom-credentials/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { MailProviderConfiguration, MailProviderConfigurationReport, MailProviderControl } from "#src/platform/mail/mail-status";
import {
  activateMailProvider,
  checkMailProvider,
  MailProviderOperationError,
  planMailProviderCredential,
  readMailProviderConfigurations,
  saveMailProviderCredential,
} from "../provider-operations.js";

/**
 * @file The shared provider operations behind the admin routes and the assistant tools: configure
 * without activating (create/rotate through the custom-credentials store), and a switch that
 * re-checks and changes nothing when refused or when the write fails.
 */

const WS = "ws-ops";
const LABEL = "Tovu Mail — Fake API";

function provider(overrides: Partial<MailProviderConfiguration> = {}): MailProviderConfiguration {
  return {
    id: "fakemail", label: "Fake", origin: "plugin", hosted: true, lanes: [], capabilities: { feedback: false, domainVerification: false },
    credential: { required: true, saved: false, label: LABEL }, selectable: false, refusal: "no key",
    setup: { fields: [{ key: "token", label: "API key", type: "secret", required: true }, { key: "baseUrl", label: "API", type: "url", required: true, defaultValue: "https://api.fake.test" }] },
    ...overrides,
  };
}

function report(providers: MailProviderConfiguration[]): MailProviderConfigurationReport {
  return { setting: { transactional: "smtp", bulk: "smtp" }, providers, refusals: [] };
}

type Calls = { selects: string[]; invalidations: number };

function control(describe: () => Promise<MailProviderConfigurationReport>, optional: { check?: MailProviderControl["check"]; select?: MailProviderControl["select"] } = {}): MailProviderControl & { calls: Calls } {
  const calls: Calls = { selects: [], invalidations: 0 };
  return {
    calls, describe,
    check: optional.check ?? (async () => ({ ok: true, label: "Fake" })),
    select: optional.select ?? (async ({ id }) => { calls.selects.push(id); }),
    invalidate: () => { calls.invalidations += 1; },
  };
}

function credentials(): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let n = 0;
  return { repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring, clock: createFakeClock({ startIso: "2026-10-22T00:00:00.000Z" }), idGen: { newId: () => `cred-${++n}` } };
}

/** describe() over the real store, so the saved row's presence is what the next read reports. */
function liveControl(creds: CustomCredentialWriteDeps, base: MailProviderConfiguration = provider()): MailProviderControl & { calls: Calls } {
  return control(async () => {
    const row = (await creds.repo.listByWorkspace({ workspaceId: WS })).find((r) => r.label === LABEL);
    return report([row ? provider({ ...base, credential: { required: true, saved: true, label: LABEL, credentialId: row.id, updatedAt: row.updatedAt } }) : base]);
  });
}

async function rejectsWith(run: () => Promise<unknown>, code: string, message?: RegExp): Promise<void> {
  await assert.rejects(run, (err: unknown) => err instanceof MailProviderOperationError && err.code === code && (!message || message.test(err.message)));
}

test("without a control (or one that cannot describe) every operation refuses and changes nothing", async () => {
  await rejectsWith(() => readMailProviderConfigurations({ control: undefined }), "MAIL_PROVIDER_CONTROL_UNAVAILABLE");
  await rejectsWith(() => planMailProviderCredential({ control: { check: async () => ({ ok: true, label: "x" }), select: async () => {} }, providerId: "x" }), "MAIL_PROVIDER_CONTROL_UNAVAILABLE");
  await rejectsWith(() => activateMailProvider({ control: undefined, providerId: "x", principalId: "p" }), "MAIL_PROVIDER_CONTROL_UNAVAILABLE");
  const err = new MailProviderOperationError({ code: "MAIL_PROVIDER_INPUT", message: "m" });
  assert.equal(err.name, "MailProviderOperationError");
});

test("plan: create with the catalog's label, category and default endpoint; rotate once a row exists; refuse unknown and keyless", async () => {
  const fresh = await planMailProviderCredential({ control: control(async () => report([provider()])), providerId: "fakemail" });
  assert.deepEqual(fresh.credential, { action: "create", label: LABEL, category: "ops", baseUrl: "https://api.fake.test" });
  const saved = provider({ credential: { required: true, saved: true, label: LABEL, credentialId: "cred-9" }, setup: { fields: [] } });
  const rotation = await planMailProviderCredential({ control: control(async () => report([saved])), providerId: "fakemail" });
  assert.deepEqual(rotation.credential, { action: "rotate", label: LABEL, category: "ops", credentialId: "cred-9" });
  await rejectsWith(() => planMailProviderCredential({ control: control(async () => report([provider()])), providerId: "nope" }), "MAIL_PROVIDER_NOT_FOUND", /installed: fakemail/);
  const keyless = provider({ id: "console", credential: { required: false, saved: false } });
  await rejectsWith(() => planMailProviderCredential({ control: control(async () => report([keyless])), providerId: "console" }), "MAIL_PROVIDER_KEYLESS");
});

test("save creates the key without activating, invalidates, and returns the fresh configuration", async () => {
  const creds = credentials();
  const ctl = liveControl(creds);
  await rejectsWith(() => saveMailProviderCredential({ control: ctl, credentials: creds, workspaceId: WS, providerId: "fakemail", input: {} }), "MAIL_PROVIDER_INPUT");
  const saved = await saveMailProviderCredential({ control: ctl, credentials: creds, workspaceId: WS, providerId: "fakemail", input: { token: "sk-1", username: "ops@example.com" } });
  assert.equal(saved.credential.saved, true);
  assert.deepEqual(ctl.calls, { selects: [], invalidations: 1 }, "configuring never switches the provider");
  const stored = await resolveCustomCredentialByLabel({ repo: creds.repo, sealer: creds.sealer }, { workspaceId: WS, label: LABEL });
  assert.deepEqual({ baseUrl: stored!.baseUrl, category: stored!.category, connection: stored!.connection }, { baseUrl: "https://api.fake.test", category: "ops", connection: { token: "sk-1", username: "ops@example.com" } });
});

test("save rotates: a new token keeps the stored username; username and endpoint can change on their own", async () => {
  const creds = credentials();
  await createCustomCredential(creds, { workspaceId: WS, label: LABEL, category: "ops", baseUrl: "https://smtp.example.com:465", connection: { token: "old", username: "mailer@example.com" } });
  const ctl = liveControl(creds);
  const read = () => resolveCustomCredentialByLabel({ repo: creds.repo, sealer: creds.sealer }, { workspaceId: WS, label: LABEL });
  await saveMailProviderCredential({ control: ctl, credentials: creds, workspaceId: WS, providerId: "fakemail", input: { token: "new" } });
  assert.deepEqual((await read())!.connection, { token: "new", username: "mailer@example.com" });
  await saveMailProviderCredential({ control: ctl, credentials: creds, workspaceId: WS, providerId: "fakemail", input: { username: "other@example.com", baseUrl: "https://smtp.example.com:587" } });
  const after = (await read())!;
  assert.deepEqual([after.connection, after.baseUrl], [{ token: "new", username: "other@example.com" }, "https://smtp.example.com:587"]);
  await saveMailProviderCredential({ control: ctl, credentials: creds, workspaceId: WS, providerId: "fakemail", input: { token: "newer", username: "third@example.com" } });
  assert.deepEqual((await read())!.connection, { token: "newer", username: "third@example.com" });
  assert.equal(ctl.calls.invalidations, 3);
});

test("save rotation without a stored username stays without one; a provider gone after the save falls back to the plan's view", async () => {
  const creds = credentials();
  await createCustomCredential(creds, { workspaceId: WS, label: LABEL, category: "ops", baseUrl: "https://api.fake.test", connection: { token: "old" } });
  let reads = 0;
  const row = await creds.repo.listByWorkspace({ workspaceId: WS });
  const base = provider({ credential: { required: true, saved: true, label: LABEL, credentialId: row[0]!.id } });
  // The second describe (after the write) no longer lists it, e.g. its plugin was disabled meanwhile.
  const ctl = control(async () => (reads++ === 0 ? report([base]) : report([])));
  const result = await saveMailProviderCredential({ control: ctl, credentials: creds, workspaceId: WS, providerId: "fakemail", input: { token: "new" } });
  assert.equal(result, base);
  const stored = await resolveCustomCredentialByLabel({ repo: creds.repo, sealer: creds.sealer }, { workspaceId: WS, label: LABEL });
  assert.deepEqual(stored!.connection, { token: "new" });
});

test("save works with a control that has no invalidate", async () => {
  const creds = credentials();
  const live = liveControl(creds);
  const { invalidate: _drop, ...noInvalidate } = live;
  const saved = await saveMailProviderCredential({ control: noInvalidate, credentials: creds, workspaceId: WS, providerId: "fakemail", input: { token: "k" } });
  assert.equal(saved.credential.saved, true);
});

test("activate re-checks, writes both lanes once and invalidates; a refused check or failed write changes nothing", async () => {
  const ok = control(async () => report([]));
  assert.deepEqual(await activateMailProvider({ control: ok, providerId: "fakemail", principalId: "owner" }), { set: true, providerId: "fakemail", label: "Fake" });
  assert.deepEqual(ok.calls, { selects: ["fakemail"], invalidations: 1 });

  const refused = control(async () => report([]), { check: async () => ({ ok: false, reason: "'fakemail' has no saved credential" }) });
  await rejectsWith(() => activateMailProvider({ control: refused, providerId: "fakemail", principalId: "owner" }), "MAIL_PROVIDER_REFUSED", /^Cannot switch to 'fakemail' has no saved credential\. Nothing was changed\.$/);
  assert.deepEqual(refused.calls, { selects: [], invalidations: 0 });

  const failing = control(async () => report([]), { select: async () => { throw new Error("settings write denied"); } });
  await assert.rejects(() => activateMailProvider({ control: failing, providerId: "fakemail", principalId: "owner" }), /settings write denied/);
  assert.equal(failing.calls.invalidations, 0, "cached providers survive a failed switch");

  const bare: MailProviderControl = { check: async () => ({ ok: true, label: "Fake" }), select: async () => {} };
  assert.deepEqual(await activateMailProvider({ control: bare, providerId: "fakemail", principalId: "owner" }), { set: true, providerId: "fakemail", label: "Fake" });
  assert.deepEqual(await checkMailProvider({ control: bare, providerId: "fakemail" }), { label: "Fake" });
});
