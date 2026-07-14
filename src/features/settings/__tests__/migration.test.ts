import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "../../../identity/repo.memory";
import { ALLOWED_THEME_IDS, InMemoryPresentationSettingsRepo, type PresentationSettingsRecord } from "../../presentation";
import { migrateLegacyPresentationSettings } from "../migration";
import { InMemorySettingsRepo } from "../repo.memory";
import { getEffective } from "../settings";

/**
 * @file T030 — failing-first tests for `migrateLegacyPresentationSettings`
 * (SPEC-007 REQ-08/AC-14; ADR-PIPE-007 Migration Safety).
 *
 * Covers: post-migration `getEffective` equivalence with the pre-migration
 * `PresentationSettingsRepoPort.findByWorkspaceId` value, idempotent rerun
 * (no duplicate definitions/growing revision ledger when nothing changed),
 * and the `theme.{themeId}` availability-definition backfill.
 */

const clock = { nowIso: () => "2026-07-12T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `migration-id-${++idCounter}` };
const SYSTEM_PRINCIPAL_ID = "system-settings-migration";

function makeDeps(rows: PresentationSettingsRecord[]) {
  return {
    presentationRepo: new InMemoryPresentationSettingsRepo(rows),
    settingsRepo: new InMemorySettingsRepo(),
    clock,
    ids,
    principals: new InMemoryPrincipalRepo([]),
    systemPrincipalId: SYSTEM_PRINCIPAL_ID,
  };
}

test("migrateLegacyPresentationSettings: getEffective equals the pre-migration PresentationSettingsRepoPort value for the fixture workspace", async () => {
  const legacyRow: PresentationSettingsRecord = {
    workspaceId: "workspace-1",
    activeThemeId: "atlas",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const deps = makeDeps([legacyRow]);

  const preMigration = await deps.presentationRepo.findByWorkspaceId("workspace-1");
  assert.ok(preMigration, "fixture row must exist pre-migration");

  await migrateLegacyPresentationSettings(deps);

  const effective = await getEffective(
    { repo: deps.settingsRepo },
    { namespace: "core.presentation", key: "activeThemeId", scopeContext: { workspaceId: "workspace-1" } }
  );

  assert.ok(effective, "getEffective must resolve the migrated definition");
  assert.equal(effective!.value, preMigration!.activeThemeId);
  assert.equal(effective!.sourceLayer, "global");
});

test("migrateLegacyPresentationSettings: is idempotent on rerun — same end state, no duplicate definitions or growing revisions", async () => {
  const legacyRow: PresentationSettingsRecord = {
    workspaceId: "workspace-1",
    activeThemeId: "glassmorphic",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const deps = makeDeps([legacyRow]);

  const first = await migrateLegacyPresentationSettings(deps);
  assert.equal(first.migratedCount, 1);
  assert.equal(first.failedWorkspaceIds.length, 0);

  const definition = await deps.settingsRepo.findActiveDefinition({
    namespace: "core.presentation",
    key: "activeThemeId",
    workspaceId: null,
  });
  assert.ok(definition);
  const revisionsAfterFirst = await deps.settingsRepo.listRevisions({ settingId: definition!.settingId });

  const second = await migrateLegacyPresentationSettings(deps);
  assert.equal(second.migratedCount, 0, "rerun with no changed legacy data must write nothing new");
  assert.equal(second.skippedCount, 1);

  const revisionsAfterSecond = await deps.settingsRepo.listRevisions({ settingId: definition!.settingId });
  assert.equal(
    revisionsAfterSecond.length,
    revisionsAfterFirst.length,
    "rerun must not append duplicate revisions when the value is unchanged"
  );

  const allCoreDefs = (await deps.settingsRepo.listActiveDefinitions({ workspaceId: null })).filter(
    (d) => d.namespace === "core.presentation" && d.key === "activeThemeId"
  );
  assert.equal(allCoreDefs.length, 1, "rerun must not double-register the definition");

  const effective = await getEffective(
    { repo: deps.settingsRepo },
    { namespace: "core.presentation", key: "activeThemeId", scopeContext: { workspaceId: "workspace-1" } }
  );
  assert.equal(effective?.value, "glassmorphic");
});

test("migrateLegacyPresentationSettings: backfills a theme.{themeId} availability definition for every legacy ALLOWED_THEME_IDS entry", async () => {
  const deps = makeDeps([]);

  await migrateLegacyPresentationSettings(deps);

  for (const themeId of ALLOWED_THEME_IDS) {
    const def = await deps.settingsRepo.findActiveDefinition({
      namespace: `theme.${themeId}`,
      key: "available",
      workspaceId: null,
    });
    assert.ok(def, `expected a theme.${themeId} definition to be registered`);
    assert.equal(def!.defaultValue, true);
    assert.equal(def!.ownerKind, "theme");
  }
});

test("migrateLegacyPresentationSettings: prefers caller-supplied availableThemeIds (discovered themes) over the legacy ALLOWED_THEME_IDS fallback", async () => {
  const deps = { ...makeDeps([]), availableThemeIds: ["tovu-official", "column"] };

  await migrateLegacyPresentationSettings(deps);

  const discovered = await deps.settingsRepo.findActiveDefinition({
    namespace: "theme.tovu-official",
    key: "available",
    workspaceId: null,
  });
  assert.ok(discovered);

  const legacyOnly = await deps.settingsRepo.findActiveDefinition({
    namespace: "theme.paper",
    key: "available",
    workspaceId: null,
  });
  assert.equal(legacyOnly, null, "the legacy fallback ids must not be registered once discovered ids are supplied");
});

test("migrateLegacyPresentationSettings: with no legacy rows, registers the core definition with a sane fallback default and migrates nothing", async () => {
  const deps = makeDeps([]);

  const result = await migrateLegacyPresentationSettings(deps);
  assert.equal(result.migratedCount, 0);
  assert.equal(result.skippedCount, 0);

  const definition = await deps.settingsRepo.findActiveDefinition({
    namespace: "core.presentation",
    key: "activeThemeId",
    workspaceId: null,
  });
  assert.ok(definition);
  assert.equal(definition!.defaultValue, ALLOWED_THEME_IDS[0]);
});
