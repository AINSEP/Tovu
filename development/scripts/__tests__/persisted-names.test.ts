import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { DEPLOY_TARGETS_FILENAME } from "#src/features/deployments/deploy-targets/registry";
import { LEDGER_TABLE } from "#src/platform/db/migrations/runner";
import { CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { CONTENT_DB_FILENAME } from "#src/platform/site-dir/layout";

type PersistedNameRegistry = {
  names: Record<string, string>;
  changes: ({ key: string; from: string; to: string | null } & (
    { migrationId: string } |
    { cutover: { approval: string; owner: string; affected: string; recovery: string } }
  ))[];
};

function findUnrecordedPersistedNameChanges({ baseline, current, newContentMigrationIds }: {
  baseline: PersistedNameRegistry;
  current: PersistedNameRegistry;
  newContentMigrationIds: ReadonlySet<string>;
}): string[] {
  const failures: string[] = [];
  if (JSON.stringify(current.changes.slice(0, baseline.changes.length)) !== JSON.stringify(baseline.changes)) {
    failures.push("historical persisted-name change records must remain an intact prefix");
  }
  const appended = current.changes.slice(baseline.changes.length);
  for (const [key, from] of Object.entries(baseline.names)) {
    const to = current.names[key] ?? null;
    if (from === to) continue;
    const recorded = appended.some(change => {
      if (change.key !== key || change.from !== from || change.to !== to) return false;
      if ("migrationId" in change) return newContentMigrationIds.has(change.migrationId);
      return [change.cutover.approval, change.cutover.owner, change.cutover.affected, change.cutover.recovery]
        .every(value => typeof value === "string" && value.trim().length > 0);
    });
    if (!recorded) failures.push(`${key}: ${JSON.stringify(from)} -> ${JSON.stringify(to)} has no newly registered migration or approved cutover`);
  }
  return failures;
}

test("registered persisted names match their production declarations", async () => {
  const require = createRequire(import.meta.url);
  const registry = JSON.parse(readFileSync(new URL("../persisted-names.json", import.meta.url), "utf8"));
  const cloudflare = JSON.parse(readFileSync(require.resolve("@jini-ai/agent-plugins/cloudflare/plugin.json"), "utf8"));
  const resend = JSON.parse(readFileSync(require.resolve("@jini-ai/agent-plugins/resend/jini-mail-adapters.json"), "utf8"));
  const forms = await import(import.meta.resolve("@jini-ai/agent-plugins/cloudflare/lib/forms.mjs"));
  const mapping = await import(import.meta.resolve("@jini-ai/agent-plugins/google-workspace/form-destinations/mapping.mjs"));
  assert.deepEqual({
    "tovu.content.ledger": LEDGER_TABLE,
    "tovu.content.database": CONTENT_DB_FILENAME,
    "tovu.deploy.descriptor": DEPLOY_TARGETS_FILENAME,
    "cloudflare.plugin.id": cloudflare.extensions.jini.id,
    "cloudflare.forms.binding": forms.FORMS_BINDING,
    "cloudflare.forms.privateRoute": forms.FORMS_WORKER_ROUTES[1],
    "sheets.submission.id": mapping.SUBMISSION_ID_HEADER,
    "resend.credential.label": resend.adapters[0].credentialLabel,
  }, registry.names, "each persisted name must match its production declaration at its stable key");
});

test("an unchanged registry needs no transition evidence", () => {
  const baseline: PersistedNameRegistry = { names: { ledger: "old" }, changes: [] };
  assert.deepEqual(findUnrecordedPersistedNameChanges({ baseline, current: baseline, newContentMigrationIds: new Set() }), [],
    "unchanged persisted names need no migration or cutover");
});

test("a registry rename with no evidence reports its key and both values", () => {
  const baseline: PersistedNameRegistry = { names: { ledger: "old" }, changes: [] };
  const current: PersistedNameRegistry = { names: { ledger: "new" }, changes: [] };
  assert.deepEqual(findUnrecordedPersistedNameChanges({ baseline, current, newContentMigrationIds: new Set() }),
    ['ledger: "old" -> "new" has no newly registered migration or approved cutover'],
    "updating the registry alongside a source rename cannot hide the missing transition");
});

test("a registered new migration permits a rename but historical and unregistered steps do not", () => {
  const baseline: PersistedNameRegistry = { names: { ledger: "old" }, changes: [
    { key: "ledger", from: "legacy", to: "old", migrationId: "0001_historical" },
  ] };
  const current: PersistedNameRegistry = { names: { ledger: "new" }, changes: [
    ...baseline.changes, { key: "ledger", from: "old", to: "new", migrationId: "0043_new" },
  ] };
  const newContentMigrationIds = new Set(["0043_new"]);
  assert.deepEqual(findUnrecordedPersistedNameChanges({ baseline, current, newContentMigrationIds }), [],
    "a newly appended exact transition backed by a newly registered migration is accepted");
  for (const migrationId of ["0001_historical", "0044_unregistered"]) {
    const invalid: PersistedNameRegistry = { names: current.names, changes: [
      ...baseline.changes, { key: "ledger", from: "old", to: "new", migrationId },
    ] };
    assert.deepEqual(findUnrecordedPersistedNameChanges({ baseline, current: invalid, newContentMigrationIds }),
      ['ledger: "old" -> "new" has no newly registered migration or approved cutover'],
      `${migrationId} is not a newly registered content migration`);
  }
});

test("a removal needs an approved cutover for the exact old value", () => {
  const baseline: PersistedNameRegistry = { names: { ledger: "old" }, changes: [] };
  const cutover = { approval: "test approval", owner: "test owner", affected: "test storage and users", recovery: "restore test data" };
  const current: PersistedNameRegistry = { names: {}, changes: [{ key: "ledger", from: "old", to: null, cutover }] };
  assert.deepEqual(findUnrecordedPersistedNameChanges({ baseline, current, newContentMigrationIds: new Set() }), [],
    "an approved exact removal records its owner, affected storage and users, and recovery");
  const wrongOld: PersistedNameRegistry = { names: {}, changes: [{ key: "ledger", from: "other", to: null, cutover }] };
  assert.deepEqual(findUnrecordedPersistedNameChanges({ baseline, current: wrongOld, newContentMigrationIds: new Set() }),
    ['ledger: "old" -> null has no newly registered migration or approved cutover'],
    "a cutover for a different old value cannot authorize this removal");
});

test("persisted names match the reviewed target", { skip: process.env.SEMGREP_BASE === undefined }, () => {
  const base = process.env.SEMGREP_BASE!;
  const cwd = new URL("../../../", import.meta.url);
  const baseline: PersistedNameRegistry = JSON.parse(execFileSync("git", [
    "show", `${base}:development/scripts/persisted-names.json`,
  ], { cwd, encoding: "utf8" }));
  const current: PersistedNameRegistry = JSON.parse(readFileSync(new URL("../persisted-names.json", import.meta.url), "utf8"));
  const prefix = "apps/website/src/platform/db/migrations/";
  const added = execFileSync("git", [
    "diff", "--no-renames", "--diff-filter=A", "--name-only", base, "HEAD", "--", prefix,
  ], { cwd, encoding: "utf8" }).trim().split("\n");
  const registeredIds = new Set(CONTENT_MIGRATIONS.map(step => step.id));
  const newContentMigrationIds = new Set(added
    .filter(path => /^apps\/website\/src\/platform\/db\/migrations\/[^/]+\.ts$/.test(path))
    .map(path => path.slice(prefix.length, -3))
    .filter(id => registeredIds.has(id)));
  assert.deepEqual(findUnrecordedPersistedNameChanges({ baseline, current, newContentMigrationIds }), [],
    "persisted-name changes from the reviewed target need newly registered migrations or approved cutovers");
});
