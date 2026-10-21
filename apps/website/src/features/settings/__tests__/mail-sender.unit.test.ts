import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { getEffective, InMemorySettingsRepo, type AuthorizeFn, type SetValueRequired } from "@jini-ai/core/settings";

import { createSettingsPrincipalLookup, set } from "../index.js";
import { ensureMailSenderSettings, MAIL_SENDER_EMAIL_KEY, MAIL_SENDER_NAME_KEY, MAIL_SENDER_NAMESPACE, readMailSenderSetting } from "../mail-sender.js";

/**
 * @file The site's outbound mail sender settings (`core.mail.senderEmail`/`senderName`): their
 * registered empty defaults, and the fresh read the sender-identity resolver makes.
 */

const WS = "ws-mail-sender-unit";

/** A settings ledger with an allow-all authorizer; `register: false` leaves both definitions out. */
async function ledger({ register = true }: { register?: boolean } = {}) {
  const clock = { nowIso: () => "2026-10-21T00:00:00.000Z", nowMs: () => Date.parse("2026-10-21T00:00:00.000Z") };
  let next = 0;
  const ids = { newId: () => {
    next += 1;
    return `mail-sender-unit-${next}`;
  } };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  if (register) await ensureMailSenderSettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
  const deps: SetValueRequired["deps"] = { repo: settingsRepo, clock, ids, authorize, principals };
  const write = (key: string, value: string) =>
    set({ deps, input: { namespace: MAIL_SENDER_NAMESPACE, key, scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value } });
  return { settingsRepo, write };
}

test("ensureMailSenderSettings registers core.mail.senderEmail and senderName, both defaulting to empty", async () => {
  const { settingsRepo } = await ledger();
  for (const key of [MAIL_SENDER_EMAIL_KEY, MAIL_SENDER_NAME_KEY]) {
    const found = await getEffective({ repo: settingsRepo }, { namespace: "core.mail", key, scopeContext: { workspaceId: WS } });
    assert.equal(found?.value, "", `${key} defaults to the empty string`);
  }
});

test("readMailSenderSetting reads nothing configured from the registered defaults", async () => {
  const { settingsRepo } = await ledger();
  assert.deepEqual(await readMailSenderSetting({ settingsRepo, workspaceId: WS }), {});
});

test("readMailSenderSetting reads nothing configured when the definitions were never registered", async () => {
  const { settingsRepo } = await ledger({ register: false });
  assert.deepEqual(await readMailSenderSetting({ settingsRepo, workspaceId: WS }), {});
});

test("readMailSenderSetting returns the saved address and display name, trimmed", async () => {
  const { settingsRepo, write } = await ledger();
  await write(MAIL_SENDER_EMAIL_KEY, "  hello@example.com ");
  await write(MAIL_SENDER_NAME_KEY, " Example Site ");
  assert.deepEqual(await readMailSenderSetting({ settingsRepo, workspaceId: WS }), { email: "hello@example.com", name: "Example Site" });
});

test("readMailSenderSetting leaves a blank value out, so an address alone reads without a name", async () => {
  const { settingsRepo, write } = await ledger();
  await write(MAIL_SENDER_EMAIL_KEY, "hello@example.com");
  await write(MAIL_SENDER_NAME_KEY, "   ");
  assert.deepEqual(await readMailSenderSetting({ settingsRepo, workspaceId: WS }), { email: "hello@example.com" });
});

test("readMailSenderSetting is scoped to the workspace it is asked about", async () => {
  const { settingsRepo, write } = await ledger();
  await write(MAIL_SENDER_EMAIL_KEY, "hello@example.com");
  assert.deepEqual(await readMailSenderSetting({ settingsRepo, workspaceId: "ws-other" }), {});
});
