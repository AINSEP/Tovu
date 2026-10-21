import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo, type AuthorizeFn, type SetValueRequired } from "@jini-ai/core/settings";

import { createSettingsPrincipalLookup, set } from "../index.js";
import {
  ensureMailProviderSettings, MAIL_PROVIDER_KEY, MAIL_PROVIDER_NAMESPACE, MAIL_TEST_MODE_KEY,
  parseMailProviderSetting, parseMailTestMode, readMailProviderSetting, readMailTestMode, writeMailProviderSetting,
} from "../mail-provider.js";

/**
 * @file `core.mail.provider` / `core.mail.testMode`: "never stored" is distinct from an explicit
 * unconfigured value, and malformed values fail closed.
 */

const WS = "ws-mail-provider-unit";

async function ledger({ register = true }: { register?: boolean } = {}) {
  const clock = { nowIso: () => "2026-10-21T00:00:00.000Z", nowMs: () => Date.parse("2026-10-21T00:00:00.000Z") };
  let next = 0;
  const ids = { newId: () => `mail-provider-unit-${++next}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  if (register) await ensureMailProviderSettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
  const deps: SetValueRequired["deps"] = { repo: settingsRepo, clock, ids, authorize, principals };
  const write = (key: string, value: SetValueRequired["input"]["value"]) =>
    set({ deps, input: { namespace: MAIL_PROVIDER_NAMESPACE, key, scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value } });
  return { settingsRepo, deps, write };
}

test("readMailProviderSetting is null while never stored, and when the definition is not registered", async () => {
  assert.equal(await readMailProviderSetting({ settingsRepo: (await ledger()).settingsRepo, workspaceId: WS }), null);
  assert.equal(await readMailProviderSetting({ settingsRepo: (await ledger({ register: false })).settingsRepo, workspaceId: WS }), null);
});

test("writeMailProviderSetting stores both lanes, including an explicit unconfigured value", async () => {
  const { settingsRepo, deps } = await ledger();
  await writeMailProviderSetting({ deps, workspaceId: WS, callerPrincipalId: "owner", value: { transactional: "smtp", bulk: "resend" } });
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "smtp", bulk: "resend" });
  await writeMailProviderSetting({ deps, workspaceId: WS, callerPrincipalId: "owner", value: { transactional: null, bulk: null } });
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: null, bulk: null });
});

test("a malformed stored provider reads as both lanes unconfigured, never as unset", async () => {
  const { settingsRepo, write } = await ledger();
  await write(MAIL_PROVIDER_KEY, { transactional: 3 });
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: null, bulk: null });
});

test("parseMailProviderSetting accepts lane ids and null, refuses everything else", () => {
  assert.deepEqual(parseMailProviderSetting({ value: { transactional: "smtp", bulk: null } }), { transactional: "smtp", bulk: null });
  for (const value of [null, "smtp", ["smtp"], { transactional: "", bulk: null }, { transactional: "smtp", bulk: 1 }, undefined]) {
    assert.deepEqual(parseMailProviderSetting({ value: value as never }), { transactional: null, bulk: null }, JSON.stringify(value));
  }
});

test("parseMailTestMode: redirect needs an address; anything unknown is off", () => {
  assert.deepEqual(parseMailTestMode({ value: { mode: "redirect", to: " owner@example.com " } }), { mode: "redirect", to: "owner@example.com" });
  assert.deepEqual(parseMailTestMode({ value: { mode: "capture" } }), { mode: "capture" });
  for (const value of [undefined, null, "capture", [], { mode: "redirect" }, { mode: "redirect", to: "nobody" }, { mode: "loud" }]) {
    assert.deepEqual(parseMailTestMode({ value: value as never }), { mode: "off" }, JSON.stringify(value));
  }
});

test("readMailTestMode defaults to off and reads a stored mode fresh", async () => {
  const { settingsRepo, write } = await ledger();
  assert.deepEqual(await readMailTestMode({ settingsRepo, workspaceId: WS }), { mode: "off" });
  await write(MAIL_TEST_MODE_KEY, { mode: "capture" });
  assert.deepEqual(await readMailTestMode({ settingsRepo, workspaceId: WS }), { mode: "capture" });
  assert.deepEqual(await readMailTestMode({ settingsRepo: (await ledger({ register: false })).settingsRepo, workspaceId: WS }), { mode: "off" });
});
