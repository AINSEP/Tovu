import assert from "node:assert/strict";
import test from "node:test";

import type { SettingsRepoPort } from "@jini-ai/cms/settings";
import { operatorLocaleLedger } from "../fixtures/operator-locale-ledger.js";
import { resolveOperatorLocale, type GetEffectiveSetting } from "../../operator-locale.js";

/** @file The operator's admin locale for Agent Plugin dialogs: the per-user `core.language.locale` read and its English fallbacks. */

const repo = {} as SettingsRepoPort;
const required = { deps: { settingsRepo: repo }, workspaceId: "ws-1", principalId: "operator-1" };

test("reads core.language.locale for this workspace and operator from the settings ledger", async () => {
  const reads: unknown[] = [];
  const getEffective: GetEffectiveSetting = async (deps, input) => { reads.push({ repo: deps.repo, ...input }); return { value: "pt-BR" }; };
  assert.equal(await resolveOperatorLocale(required, { getEffective }), "pt-BR");
  assert.deepEqual(reads, [{ repo, namespace: "core.language", key: "locale", scopeContext: { workspaceId: "ws-1", principalId: "operator-1" } }]);
});

test("unset, empty, non-string values and a failed read all fall back to English", async () => {
  for (const resolved of [null, { value: "" }, { value: 7 }]) {
    assert.equal(await resolveOperatorLocale(required, { getEffective: async () => resolved }), "en", JSON.stringify(resolved));
  }
  assert.equal(await resolveOperatorLocale(required, { getEffective: async () => { throw new Error("ledger unavailable"); } }), "en");
});

test("deps without a settings ledger get English without any read", async () => {
  let read = false;
  assert.equal(await resolveOperatorLocale({ ...required, deps: {} }, { getEffective: async () => { read = true; return { value: "es" }; } }), "en");
  assert.equal(read, false);
});

test("with the real ledger, each operator gets their own saved admin language and others get the 'en' default", async () => {
  const { settingsRepo, saveOperatorLocale } = await operatorLocaleLedger("ws-1");
  await saveOperatorLocale("operator-1", "es");
  assert.equal(await resolveOperatorLocale({ ...required, deps: { settingsRepo } }), "es");
  assert.equal(await resolveOperatorLocale({ ...required, principalId: "operator-2", deps: { settingsRepo } }), "en");
});
