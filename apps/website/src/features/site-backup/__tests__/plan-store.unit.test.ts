import assert from "node:assert/strict";
import test from "node:test";

import { SiteBackupPlanStore, type SiteBackupPlanContent } from "../plan-store.js";

/**
 * @file `plan-store.ts`'s proof: a plan is single-use, bound to the principal and workspace that made
 * it, expires, and the store never holds more than its cap (each plan carries a database snapshot).
 */

const CONTENT: SiteBackupPlanContent = {
  credentialLabel: "github",
  owner: "octo",
  repo: "backups",
  folder: "demo",
  commitMessage: "backup",
  repository: { branch: "main", parentCommitSha: "tip", baseTreeSha: "tree", htmlUrl: "https://github.com/octo/backups", folderExists: false },
  include: { database: true, media: true, themes: true, plugins: true, settings: true },
  database: { bytes: Buffer.from("db"), watermarkAtCapture: 1 },
  files: [],
  skipped: [],
  scopeNotes: {},
  totalBytes: 2,
  site: { name: "Demo", folderName: "demo" },
  schema: { index: 1, tag: "0001_x" },
};

function makeStore(overrides: { maxPlans?: number } = {}): { store: SiteBackupPlanStore; clock: { ms: number } } {
  const clock = { ms: 1_000 };
  let n = 0;
  const store = new SiteBackupPlanStore({ now: () => clock.ms, ttlMs: 60_000, newId: () => `plan-${++n}`, ...overrides });
  return { store, clock };
}

const OWNER = { principalId: "owner", workspaceId: "ws" };

test("a plan can be taken once, by the principal and workspace that made it", () => {
  const { store } = makeStore();
  const plan = store.save({ ...OWNER, content: CONTENT });
  assert.equal(plan.expiresAtMs, 61_000);
  const first = store.take({ planId: plan.planId, ...OWNER });
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.plan.database?.bytes.toString(), "db");
  assert.deepEqual(store.take({ planId: plan.planId, ...OWNER }), { ok: false, code: "PLAN_NOT_FOUND" });
});

test("another principal or workspace reads the plan as not found, and cannot use it up", () => {
  const { store } = makeStore();
  const plan = store.save({ ...OWNER, content: CONTENT });
  assert.deepEqual(store.take({ planId: plan.planId, principalId: "intruder", workspaceId: "ws" }), { ok: false, code: "PLAN_NOT_FOUND" });
  assert.deepEqual(store.take({ planId: plan.planId, principalId: "owner", workspaceId: "other-ws" }), { ok: false, code: "PLAN_NOT_FOUND" });
  assert.equal(store.take({ planId: plan.planId, ...OWNER }).ok, true);
});

test("an expired plan reads as expired, and is gone afterwards", () => {
  const { store, clock } = makeStore();
  const plan = store.save({ ...OWNER, content: CONTENT });
  clock.ms = plan.expiresAtMs;
  assert.deepEqual(store.take({ planId: plan.planId, ...OWNER }), { ok: false, code: "PLAN_EXPIRED" });
  assert.deepEqual(store.take({ planId: plan.planId, ...OWNER }), { ok: false, code: "PLAN_NOT_FOUND" });
});

test("the store holds at most its cap: the oldest plan is evicted first", () => {
  const { store } = makeStore({ maxPlans: 2 });
  const a = store.save({ ...OWNER, content: CONTENT });
  const b = store.save({ ...OWNER, content: CONTENT });
  const c = store.save({ ...OWNER, content: CONTENT });
  assert.equal(store.take({ planId: a.planId, ...OWNER }).ok, false);
  assert.equal(store.take({ planId: b.planId, ...OWNER }).ok, true);
  assert.equal(store.take({ planId: c.planId, ...OWNER }).ok, true);
});

test("expired plans are swept on save, so they never push out a live one", () => {
  const { store, clock } = makeStore({ maxPlans: 2 });
  const stale = store.save({ ...OWNER, content: CONTENT });
  clock.ms += 10_000;
  const live = store.save({ ...OWNER, content: CONTENT });
  clock.ms = stale.expiresAtMs;
  const fresh = store.save({ ...OWNER, content: CONTENT });
  assert.equal(store.take({ planId: live.planId, ...OWNER }).ok, true, "the live plan survived: the expired one made the room");
  assert.equal(store.take({ planId: fresh.planId, ...OWNER }).ok, true);
});
