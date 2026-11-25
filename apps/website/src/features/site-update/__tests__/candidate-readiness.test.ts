import assert from "node:assert/strict";
import test from "node:test";
import { createFakeSiteUpdate, runSiteUpdate, type MigrationReadiness, type SiteUpdatePlan } from "@jini-ai/devops/deploy";
import { createCandidateReadiness, createSnapshotCopyRehearsal, rehearsalUnavailable, type RehearseMigration } from "../candidate-readiness.js";
import { createRestorePointBackup, createUpdateBackupRegistry } from "../restore-point-backup.js";

/** @file Readiness for an update is a rehearsal of the staged candidate's own migrations on a copy of the backup. */

const LIVE_DB = "/site/content.db";
const ARTIFACT = "/site/ops/restore-points/site-update-1.db";
const PLAN: SiteUpdatePlan = { fromVersion: "1.2.0", toVersion: "1.3.0", notes: "n" };

function snapshotDbOps() {
  return {
    getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }),
    captureRestorePoint: async () => ({ artifactRef: ARTIFACT, watermarkAtCapture: 1 }),
    restoreFromArtifact: async () => ({ restartRequired: true }),
  } as never;
}

async function updateWith(rehearseMigration: RehearseMigration) {
  const fake = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: { version: "1.3.0", notes: "n" } });
  let n = 0;
  const registry = createUpdateBackupRegistry({ ids: { newId: () => `id-${++n}` } });
  const ports = createRestorePointBackup({ dbOps: snapshotDbOps(), ...registry, ...createCandidateReadiness({ rehearseMigration }) });
  const result = await runSiteUpdate({ ports: { site: fake.ports.site, backup: ports.backup, readiness: ports.readiness, ids: fake.ports.ids }, plan: PLAN, approval: { kind: "owner-approval", approvedBy: "owner-1", toVersion: "1.3.0" } });
  return { result, deployed: fake.calls.filter((c) => c.startsWith("applyUpdate")) };
}

test("a snapshot-capable database with a failing candidate migration never deploys", async () => {
  const failing: RehearseMigration = async () => ({ status: "blocked", reason: "Database change 0042 failed on the copy." });
  const failed = await updateWith(failing);
  assert.equal(failed.result.outcome, "blocked");
  assert.match(failed.result.summary, /Database change 0042 failed on the copy\./);
  assert.deepEqual(failed.deployed, []);
  for (const rehearsal of [rehearsalUnavailable, async () => { throw new Error("/secret/path exploded"); }, async () => ({ status: "fine" }) as unknown as MigrationReadiness]) {
    const { result, deployed } = await updateWith(rehearsal);
    assert.equal(result.outcome, "blocked", "an unavailable, broken or unrecognised rehearsal blocks");
    assert.doesNotMatch(result.summary, /secret/);
    assert.deepEqual(deployed, []);
  }
});

test("migration rehearsal uses a copy of the approved backup with the exact target release", async () => {
  const events: string[] = [];
  const rehearse = (staged: (version: string) => string) => createSnapshotCopyRehearsal({
    copySnapshot: async ({ artifactRef }) => { events.push(`copy:${artifactRef}`); return { databasePath: "/tmp/rehearsal-1/content.db", dispose: async () => void events.push("dispose") }; },
    stagedCandidate: async ({ version }) => ({ version: staged(version), release: `staged-${staged(version)}` }),
    runCandidateMigrations: async ({ candidate, databasePath }) => { events.push(`migrate:${candidate.release}:${databasePath}`); return { status: "ok" }; },
  });
  const { result, deployed } = await updateWith(rehearse((version) => version));
  assert.equal(result.outcome, "updated");
  assert.deepEqual(events, [`copy:${ARTIFACT}`, "migrate:staged-1.3.0:/tmp/rehearsal-1/content.db", "dispose"]);
  assert.ok(events.every((event) => !event.includes(LIVE_DB)), "the live database is never rehearsed on");
  assert.equal(deployed.length, 1);
  events.length = 0;
  const substituted = await updateWith(rehearse(() => "1.3.1"));
  assert.equal(substituted.result.outcome, "blocked", "a staged release other than the approved one is not a candidate");
  assert.deepEqual(events, [], "nothing is copied or migrated for a substituted candidate");
});
