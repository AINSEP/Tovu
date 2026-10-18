import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { getEffective, InMemorySettingsRepo, resolveDefinitionRaw, SCOPE_BIT } from "@jini-ai/core/settings";

import { createSettingsPrincipalLookup } from "../index.js";
import {
  ADMIN_INTERFACE_NAMESPACE,
  ADMIN_THEME_KEY,
  ADMIN_THEME_ACCENTS_KEY,
  CHAT_SHOW_THINKING_KEY,
  CHAT_SHOW_USAGE_LINE_KEY,
  CHAT_TOOL_CALLS_KEY,
  ensureAdminInterfaceSettingDefinitions,
} from "../admin-interface.js";

/**
 * @file The assistant dock's Chat settings → Display keys (owner, 2026-10-11) as the server registers
 * them in `core.interface`, over the in-memory settings ledger. The admin's
 * `components/AssistantDock/chat-display-preferences.ts` mirrors these keys and defaults; a save to a
 * key the server never registered fails, which is why the registration itself is pinned here.
 */

const SYSTEM_PRINCIPAL_ID = "system-settings-migration";
const clock = { nowIso: () => "2026-10-11T00:00:00.000Z", nowMs: () => Date.parse("2026-10-11T00:00:00.000Z") };
let idCounter = 0;
const ids = { newId: () => `admin-interface-id-${++idCounter}` };

async function registeredLedger() {
  const deps = {
    settingsRepo: new InMemorySettingsRepo(),
    clock,
    ids,
    principals: createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) }),
  };
  await ensureAdminInterfaceSettingDefinitions(deps, { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  return deps;
}

function definition(settingsRepo: InMemorySettingsRepo, key: string) {
  return resolveDefinitionRaw({ repo: settingsRepo }, { namespace: ADMIN_INTERFACE_NAMESPACE, key, workspaceId: null });
}

const PER_OPERATOR = SCOPE_BIT.user | SCOPE_BIT.workspace;

test("registers the three Chat settings → Display keys per operator with the owner's defaults", async () => {
  const { settingsRepo } = await registeredLedger();

  const toolCalls = await definition(settingsRepo, CHAT_TOOL_CALLS_KEY);
  assert.ok(toolCalls, "core.interface/chatToolCalls must be registered");
  assert.deepEqual(toolCalls.schema, { type: "enum", values: ["show", "collapsed", "hidden"] });
  assert.equal(toolCalls.defaultValue, "collapsed");
  assert.equal(toolCalls.scopes, PER_OPERATOR);

  const usageLine = await definition(settingsRepo, CHAT_SHOW_USAGE_LINE_KEY);
  assert.ok(usageLine, "core.interface/chatShowUsageLine must be registered");
  assert.deepEqual(usageLine.schema, { type: "boolean" });
  assert.equal(usageLine.defaultValue, true);
  assert.equal(usageLine.scopes, PER_OPERATOR);

  const thinking = await definition(settingsRepo, CHAT_SHOW_THINKING_KEY);
  assert.ok(thinking, "core.interface/chatShowThinking must be registered");
  assert.deepEqual(thinking.schema, { type: "boolean" });
  assert.equal(thinking.defaultValue, false);
  assert.equal(thinking.scopes, PER_OPERATOR);
});

test("keys match the admin's ledger names", () => {
  // The admin reads/writes these literal names (`CHAT_DISPLAY_KEYS`); a rename on one side alone
  // would make every read fall back to defaults and every save fail.
  assert.equal(ADMIN_INTERFACE_NAMESPACE, "core.interface");
  assert.deepEqual([CHAT_TOOL_CALLS_KEY, CHAT_SHOW_USAGE_LINE_KEY, CHAT_SHOW_THINKING_KEY], ["chatToolCalls", "chatShowUsageLine", "chatShowThinking"]);
});

test("an operator with no stored row reads the defaults from the default layer", async () => {
  const { settingsRepo } = await registeredLedger();
  const scopeContext = { workspaceId: "workspace-1", principalId: "operator-1" };
  const read = (key: string) => getEffective({ repo: settingsRepo }, { namespace: ADMIN_INTERFACE_NAMESPACE, key, scopeContext });

  assert.deepEqual(await read(CHAT_TOOL_CALLS_KEY), { value: "collapsed", sourceLayer: "default", defVersion: 1 });
  assert.deepEqual(await read(CHAT_SHOW_USAGE_LINE_KEY), { value: true, sourceLayer: "default", defVersion: 1 });
  assert.deepEqual(await read(CHAT_SHOW_THINKING_KEY), { value: false, sourceLayer: "default", defVersion: 1 });
});

test("registers the admin theme per operator, defaulting to classic", async () => {
  const { settingsRepo } = await registeredLedger();
  const adminTheme = await definition(settingsRepo, ADMIN_THEME_KEY);
  assert.ok(adminTheme, "core.interface/adminTheme must be registered");
  // A string, not an enum: a new admin theme ships without a server change.
  assert.deepEqual(adminTheme.schema, { type: "string" });
  assert.equal(adminTheme.defaultValue, "classic");
  assert.equal(adminTheme.scopes, PER_OPERATOR);
  // The admin's ledger name (`lib/settings-tabs.ts` INTERFACE_KEYS.adminTheme).
  assert.equal(ADMIN_THEME_KEY, "adminTheme");
});

test("registers per-operator admin-theme accents as a separate appearance object", async () => {
  const { settingsRepo } = await registeredLedger();
  const accents = await resolveDefinitionRaw({ repo: settingsRepo }, {
    namespace: "core.appearance", key: ADMIN_THEME_ACCENTS_KEY, workspaceId: null,
  });
  assert.ok(accents);
  assert.equal(ADMIN_THEME_ACCENTS_KEY, "adminThemeAccents");
  assert.deepEqual(accents.schema, { type: "json" });
  assert.deepEqual(accents.defaultValue, {});
  assert.equal(accents.scopes, PER_OPERATOR);
  const scopeContext = { workspaceId: "workspace-1", principalId: "operator-1" };
  assert.deepEqual(await getEffective({ repo: settingsRepo }, {
    namespace: "core.appearance", key: ADMIN_THEME_ACCENTS_KEY, scopeContext,
  }), { value: {}, sourceLayer: "default", defVersion: 1 });
});

test("registering again on the next boot leaves the definitions unchanged", async () => {
  const deps = await registeredLedger();
  const before = await definition(deps.settingsRepo, CHAT_TOOL_CALLS_KEY);
  await ensureAdminInterfaceSettingDefinitions(deps, { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  const after = await definition(deps.settingsRepo, CHAT_TOOL_CALLS_KEY);

  assert.ok(before && after);
  assert.equal(after.settingId, before.settingId);
  assert.equal(after.version, before.version);
  assert.equal(after.defaultValue, "collapsed");
});
