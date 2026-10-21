import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo, set as packageSet, ValueValidationFailedError, type AuthorizeFn } from "@jini-ai/core/settings";

import { createSettingsPrincipalLookup } from "../../settings/index.js";
import {
  ensureSearchProviderSetting, isSearchProviderId, readSearchProviderSetting, SEARCH_PROVIDER_KEY, SEARCH_SETTINGS_NAMESPACE, writeSearchProviderSetting,
} from "../settings.js";

/** @file `core.search/provider` on the real settings ledger (in-memory repo): default, typed write, grammar on both sides. */

const WS = "ws-search-settings";
const clock = { nowIso: () => "2026-10-21T12:00:00.000Z", nowMs: () => Date.parse("2026-10-21T12:00:00.000Z") };
let counter = 0;
const ids = { newId: () => `search-setting-${++counter}` };
const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: "test" });

function ledger() {
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  const deps = { repo: settingsRepo, clock, ids, authorize: allowAll, principals };
  return { settingsRepo, deps, ensure: () => ensureSearchProviderSetting({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" }) };
}

test("the id grammar", () => {
  for (const id of ["builtin", "meilisearch", "a", `a${"b".repeat(63)}`, "algolia_v2"]) assert.equal(isSearchProviderId(id), true, id);
  for (const id of ["", "Builtin", "1meili", "meili-search", `a${"b".repeat(64)}`, 7, null]) assert.equal(isSearchProviderId(id), false, String(id));
});

test("reads the builtin default before and after registration; a typed write is read back", async () => {
  const { settingsRepo, deps, ensure } = ledger();
  const read = readSearchProviderSetting({ settingsRepo });
  assert.equal(await read({ workspaceId: WS }), "builtin", "an unregistered definition reads as the default");
  await ensure();
  assert.equal(await read({ workspaceId: WS }), "builtin");
  const result = await writeSearchProviderSetting({ deps })({ workspaceId: WS, callerPrincipalId: "owner", providerId: "meilisearch" });
  assert.equal(result.value, "meilisearch");
  assert.equal(await read({ workspaceId: WS }), "meilisearch");
  assert.equal(await read({ workspaceId: "ws-other" }), "builtin", "per site");
});

test("a write outside the grammar is refused before the ledger; a stored bad value is refused on read", async () => {
  const { settingsRepo, deps, ensure } = ledger();
  await ensure();
  const write = writeSearchProviderSetting({ deps });
  await assert.rejects(write({ workspaceId: WS, callerPrincipalId: "owner", providerId: "Meili-Search" }), ValueValidationFailedError);
  const read = readSearchProviderSetting({ settingsRepo });
  assert.equal(await read({ workspaceId: WS }), "builtin");
  // Stored around the typed write (e.g. the generic settings route), still a string.
  await packageSet({ deps, input: { namespace: SEARCH_SETTINGS_NAMESPACE, key: SEARCH_PROVIDER_KEY, scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: "../evil" } });
  await assert.rejects(read({ workspaceId: WS }), (error: unknown) => error instanceof ValueValidationFailedError && /core\.search\.provider.*"\.\.\/evil"/.test(error.message));
});
