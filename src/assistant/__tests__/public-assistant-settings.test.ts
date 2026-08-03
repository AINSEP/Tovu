import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo } from "../../features/settings";
import { InMemoryPrincipalRepo } from "../../identity";
import {
  ensurePublicAssistantSettingDefinitions,
  getPublicAssistantSettings,
  isPublicAssistantEnabled,
  setPublicAssistantSettings,
  PublicAssistantSettingsValidationError,
} from "../public-assistant-settings";

/**
 * @file `ensurePublicAssistantSettingDefinitions`/`getPublicAssistantSettings`/
 * `isPublicAssistantEnabled`/`setPublicAssistantSettings`, mirroring
 * `comments/__tests__/settings.test.ts`'s shape (which itself mirrors SEO's).
 *
 * The assertions that matter most here are the two about being OFF: that a workspace nobody has
 * configured reads as off, and that an unreadable/garbage value reads as off. Every other setting in
 * this codebase can afford to be lenient about a missing value; a switch whose job is to keep a
 * cost-bearing, LLM-backed surface off the public internet cannot.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const clock = { nowIso: () => "2026-07-30T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `assistant-settings-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function makeDeps() {
  const settingsRepo = new InMemorySettingsRepo();
  const principals = new InMemoryPrincipalRepo([]);
  return { settingsRepo, principals, deps: { settingsRepo, clock, ids, authorize: alwaysAllow, principals } };
}

async function withDefinitions() {
  const built = makeDeps();
  await ensurePublicAssistantSettingDefinitions(built.deps, { workspaceId: WORKSPACE, systemPrincipalId: "system-assistant-settings" });
  return built;
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

test("ensurePublicAssistantSettingDefinitions is idempotent — two calls register one definition, not two", async () => {
  const { settingsRepo, deps } = makeDeps();
  const input = { workspaceId: WORKSPACE, systemPrincipalId: "system-assistant-settings" };

  await ensurePublicAssistantSettingDefinitions(deps, input);
  await ensurePublicAssistantSettingDefinitions(deps, input);

  const registered = (await settingsRepo.listActiveDefinitions({ workspaceId: WORKSPACE })).filter((d) => d.namespace === "site.assistant");
  assert.equal(registered.length, 1);
  assert.equal(registered[0].key, "public_enabled");
});

test("the definition is namespaced under 'site.' — the ledger's owner fence rejects a bare namespace", async () => {
  const { settingsRepo } = await withDefinitions();
  const [definition] = (await settingsRepo.listActiveDefinitions({ workspaceId: WORKSPACE })).filter((d) => d.namespace.startsWith("site.assistant"));
  assert.equal(definition.namespace, "site.assistant");
  assert.equal(definition.ownerKind, "site");
});

// ---------------------------------------------------------------------------
// Default off, and fail-closed
// ---------------------------------------------------------------------------

test("a brand-new site is OFF before any definition exists at all", async () => {
  const { settingsRepo } = makeDeps();
  assert.deepEqual(await getPublicAssistantSettings({ settingsRepo }, { workspaceId: WORKSPACE }), { publicEnabled: false });
  assert.equal(await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: WORKSPACE }), false);
});

test("registering the definition does not turn anything on — the registered default is false", async () => {
  const { settingsRepo } = await withDefinitions();
  assert.deepEqual(await getPublicAssistantSettings({ settingsRepo }, { workspaceId: WORKSPACE }), { publicEnabled: false });
});

test("the read fails CLOSED — anything that is not literally true reads as off", async () => {
  const { settingsRepo, deps } = await withDefinitions();
  const definition = (await settingsRepo.listActiveDefinitions({ workspaceId: WORKSPACE })).find((d) => d.namespace === "site.assistant");
  assert.ok(definition);

  let seq = 0;
  for (const written of ["true", 1, null, {}]) {
    // Written straight at the repo, past `setPublicAssistantSettings`' own type check, on purpose:
    // the assertion is about what the READ does when the stored value is not a boolean, however it
    // came to be that way (a hand-edited database, a future careless caller, a schema change).
    await settingsRepo.saveWorkspaceValue({
      settingId: definition.settingId,
      scope: "workspace",
      workspaceId: WORKSPACE,
      principalId: null,
      valueJson: written as never,
      state: "set",
      defVersion: definition.version,
      seq: ++seq,
      updatedBy: "test",
      updatedAt: clock.nowIso(),
    });
    assert.equal(
      await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: WORKSPACE }),
      false,
      `a stored ${JSON.stringify(written)} must read as OFF, never as on`,
    );
  }

  // Sanity: the fail-closed rule is not simply "always false".
  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });
  assert.equal(await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: WORKSPACE }), true);
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

test("setPublicAssistantSettings turns the switch on and back off, and returns the persisted state", async () => {
  const { settingsRepo, deps } = await withDefinitions();

  const on = await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });
  assert.deepEqual(on, { publicEnabled: true });
  assert.equal(await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: WORKSPACE }), true);

  const off = await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: false }, callerPrincipalId: "principal-1" });
  assert.deepEqual(off, { publicEnabled: false });
  assert.equal(await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: WORKSPACE }), false);
});

test("an empty patch is a no-op read, not an accidental reset", async () => {
  const { deps } = await withDefinitions();
  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });

  const unchanged = await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: {}, callerPrincipalId: "principal-1" });
  assert.deepEqual(unchanged, { publicEnabled: true });
});

test("a non-boolean publicEnabled is rejected before any write happens", async () => {
  const { settingsRepo, deps } = await withDefinitions();

  for (const bad of ["true", 1, null]) {
    await assert.rejects(
      () => setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: bad as never }, callerPrincipalId: "principal-1" }),
      PublicAssistantSettingsValidationError,
    );
  }
  assert.equal(await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: WORKSPACE }), false, "a rejected write must leave the switch untouched");
});

test("a denied principal cannot flip the switch", async () => {
  const { settingsRepo, principals } = await withDefinitions();
  const denyingDeps = {
    settingsRepo,
    clock,
    ids,
    principals,
    authorize: async () => ({ allowed: false, reason: "insufficient_permission" }),
  };

  await assert.rejects(() =>
    setPublicAssistantSettings(denyingDeps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" }),
  );
  assert.equal(await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: WORKSPACE }), false);
});

test("the switch is workspace-scoped — enabling one workspace does not enable another", async () => {
  const { settingsRepo, deps } = await withDefinitions();
  await ensurePublicAssistantSettingDefinitions(deps, { workspaceId: OTHER_WORKSPACE, systemPrincipalId: "system-assistant-settings" });

  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });

  assert.equal(await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: WORKSPACE }), true);
  assert.equal(await isPublicAssistantEnabled({ settingsRepo }, { workspaceId: OTHER_WORKSPACE }), false);
});
