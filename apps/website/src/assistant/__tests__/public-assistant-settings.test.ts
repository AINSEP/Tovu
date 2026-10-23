import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemorySettingsRepo,
  ForbiddenError,
  getEffective,
  ensureSettingDefinitions,
  set,
} from "../../features/settings/index.js";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import {
  ensurePublicAssistantSettingDefinitions,
  getPublicAssistantSettings,
  isPublicAssistantEnabled,
  setPublicAssistantSettings,
  PublicAssistantSettingsValidationError,
} from "../public-assistant-settings.js";

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
const clock = { nowMs: () => Date.parse("2026-07-30T00:00:00.000Z"), nowIso: () => "2026-07-30T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `assistant-settings-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

/**
 * `settingsRepo`/`principals` plus a fully-wired `deps` bag covering every deps interface this file
 * exercises (`EnsurePublicAssistantSettingDefinitionsDeps` and `PublicAssistantSettingsWriteDeps` —
 * a superset of `GetPublicAssistantSettingsDeps`). `ensureSettingDefinitions`/
 * `getEffective`/`set` are the real `features/settings` functions, used
 * directly rather than faked: test files are exempt from `check:architecture`'s module-cycle graph
 * (the reason these are injected in production code at all — see `public-assistant-settings.ts`'s
 * header), and this file's whole point is proving the real ledger's behavior through this surface.
 */
function makeDeps() {
  const settingsRepo = new InMemorySettingsRepo();
  const principals = new InMemoryPrincipalRepo({}, { initialRows: [] });
  return {
    settingsRepo,
    principals,
    deps: {
      settingsRepo,
      clock,
      ids,
      authorize: alwaysAllow,
      principals: createSettingsPrincipalLookup({ repo: principals }),
      ensureSettingDefinitions,
      getEffective,
      // These tests own ledger semantics; readiness itself is covered by visitorai API tests.
      set: (required: Parameters<typeof set>[0]) => set(required, { canEnablePublicAssistant: async () => true }),
    },
  };
}

/** `GetPublicAssistantSettingsDeps` for the many read-only call sites below (`getPublicAssistantSettings`/
 *  `isPublicAssistantEnabled`), which only ever need `settingsRepo` + the real `getEffective`. */
function readOnlyDeps(settingsRepo: InMemorySettingsRepo) {
  return { settingsRepo, getEffective };
}

async function withDefinitions() {
  const built = makeDeps();
  await ensurePublicAssistantSettingDefinitions(built.deps, { workspaceId: WORKSPACE, systemPrincipalId: "system-assistant-settings" });
  return built;
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

test("ensurePublicAssistantSettingDefinitions is idempotent — switch and widget definitions register once", async () => {
  const { settingsRepo, deps } = makeDeps();
  const input = { workspaceId: WORKSPACE, systemPrincipalId: "system-assistant-settings" };

  await ensurePublicAssistantSettingDefinitions(deps, input);
  await ensurePublicAssistantSettingDefinitions(deps, input);

  const registered = (await settingsRepo.listActiveDefinitions({ workspaceId: WORKSPACE })).filter((d) => d.namespace === "site.assistant");
  assert.equal(registered.length, 3);
  assert.equal(registered[0].key, "public_enabled");
  assert.equal(registered[1].key, "widget");
  assert.equal(registered[2].key, "visitor_tools");
  assert.deepEqual(registered[2].defaultValue, { version: 1, tools: {} });
});

test("wcmp: widget defaults to React, persists per site, and switching does not enable the assistant", async () => {
  const { deps } = await withDefinitions();
  await ensurePublicAssistantSettingDefinitions(deps, { workspaceId: OTHER_WORKSPACE, systemPrincipalId: "system-assistant-settings" });
  assert.equal((await getPublicAssistantSettings(deps, { workspaceId: WORKSPACE })).widget, "react");
  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { widget: "vanilla" }, callerPrincipalId: "principal-1" });
  assert.deepEqual(await getPublicAssistantSettings(deps, { workspaceId: WORKSPACE }), { publicEnabled: false, widget: "vanilla" });
  assert.equal((await getPublicAssistantSettings(deps, { workspaceId: OTHER_WORKSPACE })).widget, "react");
  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });
  assert.deepEqual(await getPublicAssistantSettings(deps, { workspaceId: WORKSPACE }), { publicEnabled: true, widget: "vanilla" });
  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { widget: "react" }, callerPrincipalId: "principal-1" });
  assert.deepEqual(await getPublicAssistantSettings(deps, { workspaceId: WORKSPACE }), { publicEnabled: true, widget: "react" });
});

test("wcmp: invalid widget rejects a combined patch before changing the switch", async () => {
  const { deps } = await withDefinitions();
  for (const widget of ["lightweight", "", null, 1, {}]) {
    await assert.rejects(() => setPublicAssistantSettings(deps, {
      workspaceId: WORKSPACE, patch: { publicEnabled: true, widget: widget as never }, callerPrincipalId: "principal-1",
    }), { name: "Error", message: "widget must be react or vanilla" });
    assert.deepEqual(await getPublicAssistantSettings(deps, { workspaceId: WORKSPACE }), { publicEnabled: false, widget: "react" });
  }
});

test("wcmp: a denied principal cannot change the widget", async () => {
  const { deps } = await withDefinitions();
  await assert.rejects(() => setPublicAssistantSettings({ ...deps, authorize: async () => ({ allowed: false, reason: "insufficient_permission" }) }, {
    workspaceId: WORKSPACE, patch: { widget: "vanilla" }, callerPrincipalId: "principal-1",
  }), ForbiddenError);
  assert.equal((await getPublicAssistantSettings(deps, { workspaceId: WORKSPACE })).widget, "react");
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
  assert.deepEqual(await getPublicAssistantSettings(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), { publicEnabled: false, widget: "react" });
  assert.equal(await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), false);
});

test("registering the definition does not turn anything on — the registered default is false", async () => {
  const { settingsRepo } = await withDefinitions();
  assert.deepEqual(await getPublicAssistantSettings(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), { publicEnabled: false, widget: "react" });
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
      originPluginId: null,
      valueJson: written as never,
      state: "set",
      defVersion: definition.version,
      seq: ++seq,
      updatedBy: "test",
      updatedAt: clock.nowIso(),
    });
    assert.equal(
      await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }),
      false,
      `a stored ${JSON.stringify(written)} must read as OFF, never as on`,
    );
  }

  // Sanity: the fail-closed rule is not simply "always false".
  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });
  assert.equal(await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), true);
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

test("setPublicAssistantSettings turns the switch on and back off, and returns the persisted state", async () => {
  const { settingsRepo, deps } = await withDefinitions();

  const on = await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });
  assert.deepEqual(on, { publicEnabled: true, widget: "react" });
  assert.equal(await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), true);

  const off = await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: false }, callerPrincipalId: "principal-1" });
  assert.deepEqual(off, { publicEnabled: false, widget: "react" });
  assert.equal(await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), false);
});

test("an empty patch is a no-op read, not an accidental reset", async () => {
  const { deps } = await withDefinitions();
  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });

  const unchanged = await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: {}, callerPrincipalId: "principal-1" });
  assert.deepEqual(unchanged, { publicEnabled: true, widget: "react" });
});

test("a non-boolean publicEnabled is rejected before any write happens", async () => {
  const { settingsRepo, deps } = await withDefinitions();

  for (const bad of ["true", 1, null]) {
    await assert.rejects(
      () => setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: bad as never }, callerPrincipalId: "principal-1" }),
      PublicAssistantSettingsValidationError,
    );
  }
  assert.equal(await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), false, "a rejected write must leave the switch untouched");
});

test("a denied principal cannot flip the switch", async () => {
  const { settingsRepo, deps } = await withDefinitions();
  const denyingDeps = { ...deps, authorize: async () => ({ allowed: false, reason: "insufficient_permission" }) };
  await assert.rejects(
    () => setPublicAssistantSettings(denyingDeps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" }),
    (error: unknown) => error instanceof ForbiddenError && /not authorized.*admin\.assistant\.manage.*insufficient_permission/.test(error.message),
  );
  assert.equal(await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), false);
});

test("the switch is workspace-scoped — enabling one workspace does not enable another", async () => {
  const { settingsRepo, deps } = await withDefinitions();
  await ensurePublicAssistantSettingDefinitions(deps, { workspaceId: OTHER_WORKSPACE, systemPrincipalId: "system-assistant-settings" });

  await setPublicAssistantSettings(deps, { workspaceId: WORKSPACE, patch: { publicEnabled: true }, callerPrincipalId: "principal-1" });

  assert.equal(await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: WORKSPACE }), true);
  assert.equal(await isPublicAssistantEnabled(readOnlyDeps(settingsRepo), { workspaceId: OTHER_WORKSPACE }), false);
});
