import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "../../identity/repo.memory";
import { InMemorySettingsRepo } from "../../features/settings/repo.memory";
import { INSTRUCTIONS_NAMESPACE, ensureSettingsUiTabDefinitions } from "../../features/settings/ui-tab-definitions";
import {
  createCustomInstructionsCache,
  formatCustomInstructionsOverlay,
  resolveCustomInstructions,
} from "../custom-instructions";

/**
 * @file `resolveCustomInstructions`/`formatCustomInstructionsOverlay`/`createCustomInstructionsCache`
 * — the read half of the Instructions tab's system-prompt seam (see `custom-instructions.ts`'s
 * module doc). The case that matters most here is the one a naive `getEffective` call would get
 * wrong: a value written directly against the repo (standing in for a write from Tovu's OTHER
 * process, which holds its own repo instance and its own cache) must still be visible on the very
 * next read, not masked by this process's first cached read.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const clock = { nowIso: () => "2026-07-31T00:00:00.000Z" };

function makeDeps() {
  const settingsRepo = new InMemorySettingsRepo();
  const principals = new InMemoryPrincipalRepo([]);
  const ids = { newId: (() => { let n = 0; return () => `custom-instructions-test-id-${++n}`; })() };
  return { settingsRepo, deps: { settingsRepo, clock, ids, principals } };
}

async function withDefinitions() {
  const built = makeDeps();
  await ensureSettingsUiTabDefinitions(built.deps, { systemPrincipalId: "system-custom-instructions" });
  return built;
}

async function writeCustomInstructions(settingsRepo: InMemorySettingsRepo, workspaceId: string, text: string, seq = 1) {
  const definition = (await settingsRepo.listActiveDefinitions({ workspaceId: null })).find(
    (d) => d.namespace === INSTRUCTIONS_NAMESPACE && d.key === "custom",
  );
  assert.ok(definition, "core.instructions.custom must be registered before writing a value");
  await settingsRepo.saveWorkspaceValue({
    settingId: definition.settingId,
    scope: "workspace",
    workspaceId,
    principalId: null,
    valueJson: text,
    state: "set",
    defVersion: definition.version,
    seq,
    updatedBy: "test",
    updatedAt: clock.nowIso(),
  });
}

// ---------------------------------------------------------------------------
// resolveCustomInstructions
// ---------------------------------------------------------------------------

test("resolveCustomInstructions reads '' when the definition has not been registered yet", async () => {
  const { settingsRepo } = makeDeps();
  assert.equal(await resolveCustomInstructions({ settingsRepo }, { workspaceId: WORKSPACE }), "");
});

test("resolveCustomInstructions reads the registered default ('') when no value has been set", async () => {
  const { settingsRepo } = await withDefinitions();
  assert.equal(await resolveCustomInstructions({ settingsRepo }, { workspaceId: WORKSPACE }), "");
});

test("resolveCustomInstructions sees a value written directly to the repo, bypassing write-service's own cache invalidation", async () => {
  const { settingsRepo } = await withDefinitions();

  // First read populates this process's `getEffective` cache for (WORKSPACE, core.instructions).
  assert.equal(await resolveCustomInstructions({ settingsRepo }, { workspaceId: WORKSPACE }), "");

  // Written straight at the repo — standing in for Tovu's MAIN process writing through its own,
  // different `SettingsRepoPort` instance, which cannot invalidate THIS process's cache. This is
  // exactly the scenario `custom-instructions.ts`'s module doc describes as the reason
  // `invalidateWorkspaceValueCache` is called before every read.
  await writeCustomInstructions(settingsRepo, WORKSPACE, "Always respond in pirate slang.");

  assert.equal(
    await resolveCustomInstructions({ settingsRepo }, { workspaceId: WORKSPACE }),
    "Always respond in pirate slang.",
    "a naive cached getEffective would still return '' here — this is the bug this file exists to close",
  );
});

test("resolveCustomInstructions is workspace-scoped — one workspace's instructions do not leak into another's", async () => {
  const { settingsRepo } = await withDefinitions();
  await writeCustomInstructions(settingsRepo, WORKSPACE, "Only for workspace-1.");

  assert.equal(await resolveCustomInstructions({ settingsRepo }, { workspaceId: WORKSPACE }), "Only for workspace-1.");
  assert.equal(await resolveCustomInstructions({ settingsRepo }, { workspaceId: OTHER_WORKSPACE }), "");
});

test("resolveCustomInstructions fails open ('') when settingsReady rejects, rather than throwing", async () => {
  const { settingsRepo } = await withDefinitions();
  await writeCustomInstructions(settingsRepo, WORKSPACE, "Should never be read.");

  const result = await resolveCustomInstructions(
    { settingsRepo, settingsReady: Promise.reject(new Error("boot registration failed")) },
    { workspaceId: WORKSPACE },
  );
  assert.equal(result, "");
});

// ---------------------------------------------------------------------------
// formatCustomInstructionsOverlay
// ---------------------------------------------------------------------------

test("formatCustomInstructionsOverlay returns null for empty or whitespace-only text", () => {
  assert.equal(formatCustomInstructionsOverlay(""), null);
  assert.equal(formatCustomInstructionsOverlay("   \n\t "), null);
});

test("formatCustomInstructionsOverlay wraps non-empty, trimmed text in the overlay header", () => {
  const overlay = formatCustomInstructionsOverlay("  Always respond in pirate slang.  ");
  assert.ok(overlay !== null);
  assert.ok(overlay.includes("Always respond in pirate slang."));
  assert.ok(!overlay.startsWith(" "), "leading whitespace from the stored value must be trimmed");
  assert.ok(overlay.startsWith("The site operator has configured"));
});

// ---------------------------------------------------------------------------
// createCustomInstructionsCache
// ---------------------------------------------------------------------------

test("createCustomInstructionsCache.readOverlay() is null before the first refresh()", () => {
  const { settingsRepo } = makeDeps();
  const cache = createCustomInstructionsCache({ settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(cache.readOverlay(), null);
});

test("createCustomInstructionsCache.refresh() makes the latest ledger value readable synchronously", async () => {
  const { settingsRepo } = await withDefinitions();
  const cache = createCustomInstructionsCache({ settingsRepo }, { workspaceId: WORKSPACE });

  await cache.refresh();
  assert.equal(cache.readOverlay(), null, "no value set yet");

  await writeCustomInstructions(settingsRepo, WORKSPACE, "Be extremely terse.");
  assert.equal(cache.readOverlay(), null, "readOverlay() must not re-fetch on its own between refreshes");

  await cache.refresh();
  assert.ok(cache.readOverlay()?.includes("Be extremely terse."));
});

test("createCustomInstructionsCache.refresh() never rejects, even when the underlying read fails", async () => {
  const { settingsRepo } = makeDeps();
  const cache = createCustomInstructionsCache(
    { settingsRepo, settingsReady: Promise.reject(new Error("boot registration failed")) },
    { workspaceId: WORKSPACE },
  );
  await assert.doesNotReject(() => cache.refresh());
  assert.equal(cache.readOverlay(), null);
});
