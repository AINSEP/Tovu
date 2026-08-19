import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/cms/identity";
import { InMemorySettingsRepo } from "../../features/settings/index.js";
import { CommentsSettingsValidationError } from "../errors.js";
import {
  ensureCommentsSettingDefinitions,
  getCommentsSettings,
  setCommentsSettings,
} from "../settings.js";

/**
 * @file SPEC-035 — `ensureCommentsSettingDefinitions`/`getCommentsSettings`/`setCommentsSettings`,
 * mirroring `seo/__tests__/settings.definitions.test.ts` + `settings.test.ts`'s shape.
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-07-16T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `comments-settings-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function makeDeps() {
  const settingsRepo = new InMemorySettingsRepo();
  const principals = new InMemoryPrincipalRepo([]);
  return {
    settingsRepo,
    deps: { settingsRepo, clock, ids, authorize: alwaysAllow, principals },
  };
}

test("ensureCommentsSettingDefinitions: idempotent — calling twice registers exactly 6 definitions, not 12", async () => {
  const { settingsRepo, deps } = makeDeps();
  const input = { workspaceId: WORKSPACE, systemPrincipalId: "system-comments-settings" };

  await ensureCommentsSettingDefinitions(deps, input);
  const firstPass = (await settingsRepo.listActiveDefinitions({ workspaceId: WORKSPACE })).filter((d) => d.namespace === "site.comments");
  assert.equal(firstPass.length, 6);

  await ensureCommentsSettingDefinitions(deps, input);
  const secondPass = (await settingsRepo.listActiveDefinitions({ workspaceId: WORKSPACE })).filter((d) => d.namespace === "site.comments");
  assert.equal(secondPass.length, 6, "rerun must not double-register");
});

test("getCommentsSettings before any definitions exist falls back to the pre-ledger defaults", async () => {
  const { settingsRepo } = makeDeps();
  const settings = await getCommentsSettings({ settingsRepo }, { workspaceId: WORKSPACE });
  assert.deepEqual(settings, {
    enabled: true,
    requireModeration: true,
    maxDepth: 5,
    closeAfterDays: null,
    spamAutoRejectScore: 0.5,
    maxPerIpPerHour: 20,
  });
});

test("getCommentsSettings after ensureCommentsSettingDefinitions reads the same defaults from the ledger", async () => {
  const { settingsRepo, deps } = makeDeps();
  await ensureCommentsSettingDefinitions(deps, { workspaceId: WORKSPACE, systemPrincipalId: "system-comments-settings" });
  const settings = await getCommentsSettings({ settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(settings.enabled, true);
  assert.equal(settings.maxDepth, 5);
  assert.equal(settings.closeAfterDays, null);
});

test("setCommentsSettings writes a partial patch; getCommentsSettings reflects it", async () => {
  const { settingsRepo, deps } = makeDeps();
  await ensureCommentsSettingDefinitions(deps, { workspaceId: WORKSPACE, systemPrincipalId: "system-comments-settings" });

  const updated = await setCommentsSettings(
    { settingsRepo, clock, ids, authorize: alwaysAllow, principals: deps.principals },
    { workspaceId: WORKSPACE, patch: { requireModeration: false, maxDepth: 2 }, callerPrincipalId: "principal-1" }
  );
  assert.equal(updated.requireModeration, false);
  assert.equal(updated.maxDepth, 2);
  // Unpatched fields are untouched.
  assert.equal(updated.enabled, true);
  assert.equal(updated.spamAutoRejectScore, 0.5);

  const reread = await getCommentsSettings({ settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(reread.requireModeration, false);
  assert.equal(reread.maxDepth, 2);
});

test("setCommentsSettings rejects an out-of-range spamAutoRejectScore, all-or-nothing", async () => {
  const { settingsRepo, deps } = makeDeps();
  await ensureCommentsSettingDefinitions(deps, { workspaceId: WORKSPACE, systemPrincipalId: "system-comments-settings" });

  await assert.rejects(
    () =>
      setCommentsSettings(
        { settingsRepo, clock, ids, authorize: alwaysAllow, principals: deps.principals },
        { workspaceId: WORKSPACE, patch: { spamAutoRejectScore: 1.5, requireModeration: false }, callerPrincipalId: "principal-1" }
      ),
    CommentsSettingsValidationError
  );

  // All-or-nothing: the valid `requireModeration` field in the SAME patch must not have been
  // written either.
  const settings = await getCommentsSettings({ settingsRepo }, { workspaceId: WORKSPACE });
  assert.equal(settings.requireModeration, true);
});

test("setCommentsSettings rejects a negative maxDepth", async () => {
  const { settingsRepo, deps } = makeDeps();
  await ensureCommentsSettingDefinitions(deps, { workspaceId: WORKSPACE, systemPrincipalId: "system-comments-settings" });
  await assert.rejects(
    () =>
      setCommentsSettings(
        { settingsRepo, clock, ids, authorize: alwaysAllow, principals: deps.principals },
        { workspaceId: WORKSPACE, patch: { maxDepth: -1 }, callerPrincipalId: "principal-1" }
      ),
    CommentsSettingsValidationError
  );
});
