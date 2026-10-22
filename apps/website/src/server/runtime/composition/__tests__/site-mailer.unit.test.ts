import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import type { MailCapturePort, MailSendLedgerPort } from "@jini-ai/platform/mail";

import { createSettingsPrincipalLookup, set } from "#src/features/settings/index";
import { ensureMailProviderSettings, readMailProviderSetting } from "#src/features/settings/mail-provider";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createSiteMailer, type SiteMailerRequired } from "../site-mailer.js";

/**
 * @file `createSiteMailer` composes the settings-backed provider port (waiting for the definitions),
 * the first-boot system write, the delivery policy with the site's test mode, and the sender read.
 */

const WS = "ws-site-mailer";
const MESSAGE = { workspaceId: WS, to: { email: "reader@example.com" }, from: { email: "news@example.com" }, subject: "hi", text: "hi" };
const OPTIONS = { idempotencyKey: "k1", workspaceId: WS, sourceContext: { module: "forms" } };

function ledger(): MailSendLedgerPort & { reserved: string[] } {
  const reserved: string[] = [];
  return { reserved, reserve: async ({ recipient }) => { reserved.push(recipient); return { status: "reserved" }; }, mark: async () => {} };
}

async function rig(optional: { capture?: MailCapturePort; testMode?: unknown } = {}) {
  const clock = { nowIso: () => "2026-10-21T00:00:00.000Z", nowMs: () => 0 };
  let n = 0;
  const ids = { newId: () => `id-${++n}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  let release: () => void = () => {};
  const settingsReady = new Promise<void>((done) => { release = done; }).then(() => ensureMailProviderSettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" }));
  const sendLedger = ledger();
  const lines: string[] = [];
  const keyring = new InMemoryKeyring();
  const required: SiteMailerRequired = {
    resolve: {
      workspaceId: WS, mode: "local", customCredentialRepo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring),
      httpClient: { send: async () => { throw new Error("unused"); } }, loadMailAdapters: async () => ({ list: () => [], refusals: [] }), log: (line) => lines.push(line),
    },
    settings: { repo: settingsRepo, deps: { clock, ids, principals }, systemPrincipalId: "system", authorize: async ({ principalId }) => ({ allowed: principalId === "owner", reason: principalId === "owner" ? "grant" : "no_grant" }) },
    settingsReady,
    delivery: { ledger: sendLedger, suppression: { isSuppressed: async () => false, suppress: async () => {} }, ...(optional.capture ? { capture: optional.capture } : {}) },
    readSenderEmail: async () => "news@example.com",
  };
  return { required, release, settingsRepo, sendLedger, lines };
}

test("reads wait for the settings definitions, then the first boot writes unconfigured as the system principal", async () => {
  const { required, release, settingsRepo, sendLedger, lines } = await rig();
  const resolved = createSiteMailer(required);
  let settled = false;
  void resolved.ready.then(() => { settled = true; });
  await new Promise((done) => setImmediate(done));
  assert.equal(settled, false, "nothing resolves before the definitions are registered");
  release();
  await resolved.ready;
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: null, bulk: null });
  // Local mode: the unconfigured lane logs through the console provider, behind the delivery policy.
  assert.equal((await resolved.mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.deepEqual(sendLedger.reserved, ["reader@example.com"]);
  assert.match(lines[0]!, /\[mail:console\]/);
  const status = await resolved.status();
  assert.deepEqual(status.warnings, []);
  assert.equal(status.state, "unconfigured");
});

test("the site's test mode is applied through the capture store", async () => {
  const captured: string[] = [];
  const { required, release, settingsRepo } = await rig({ capture: { capture: async ({ message }) => { captured.push(message.to.email); return { id: "c1" }; } } });
  release();
  await required.settingsReady;
  await set({ deps: { ...required.settings.deps, repo: settingsRepo, authorize: async () => ({ allowed: true, reason: "test" }) }, input: {
    namespace: "core.mail", key: "testMode", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: { mode: "capture" },
  } });
  const result = await createSiteMailer(required).mailer.send(MESSAGE, OPTIONS);
  assert.equal(result.ok && result.providerMessageId, "captured:c1");
  assert.deepEqual(captured, ["reader@example.com"]);
});

test("selectProvider writes both lanes as the calling principal, through its own authorization", async () => {
  const { required, release, settingsRepo } = await rig();
  release();
  const mailer = createSiteMailer(required);
  await mailer.selectProvider({ id: "smtp", principalId: "owner" });
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "smtp", bulk: "smtp" });
  await assert.rejects(mailer.selectProvider({ id: "console", principalId: "intruder" }));
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "smtp", bulk: "smtp" });
});

test("a successful switch drops the cached status at once; a refused one leaves it cached", async () => {
  const { required, release } = await rig();
  release();
  const mailer = createSiteMailer(required);
  const before = await mailer.status();
  assert.equal(before.lanes[0]!.providerId, null);
  await assert.rejects(mailer.selectProvider({ id: "console", principalId: "intruder" }));
  assert.equal(await mailer.status(), before, "a failed write keeps the cached report");
  await mailer.selectProvider({ id: "smtp", principalId: "owner" });
  assert.equal((await mailer.status()).lanes[0]!.providerId, "smtp", "no TTL wait after a switch");
});
