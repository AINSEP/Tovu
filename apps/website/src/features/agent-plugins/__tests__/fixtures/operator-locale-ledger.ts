import assert from "node:assert/strict";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { createSettingsPrincipalLookup, ensureSettingsUiTabDefinitions, InMemorySettingsRepo } from "#src/features/settings/index";

/** A real in-memory settings ledger with the admin settings tabs registered, plus a writer for one
 *  operator's `core.language.locale` - what the admin Language selector saves. */
export async function operatorLocaleLedger(workspaceId: string) {
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z"), nowIso: () => "2026-10-04T00:00:00.000Z" };
  let n = 0;
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}, { initialRows: [] }) });
  await ensureSettingsUiTabDefinitions({ settingsRepo, clock, ids: { newId: () => `operator-locale-id-${++n}` }, principals }, { systemPrincipalId: "system" });
  const definition = (await settingsRepo.listActiveDefinitions({ workspaceId: null })).find(d => d.namespace === "core.language" && d.key === "locale");
  assert.ok(definition, "core.language.locale must be registered by the admin settings tabs");
  const saveOperatorLocale = (principalId: string, locale: string) => settingsRepo.saveUserValue({
    settingId: definition.settingId, scope: "user", workspaceId, principalId, valueJson: locale, state: "set",
    defVersion: definition.version, seq: 1, updatedBy: "test", updatedAt: clock.nowIso(),
  });
  return { settingsRepo, saveOperatorLocale };
}
