import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { registerConfiguredOriginOn, seedDevCapabilityOriginOn, SqlOriginSettingRepo } from "#src/platform/db/repos/origin-repo";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { seedDevCapabilityOrigin, SqliteOriginSettingRepo } from "#src/platform/db/sqlite/origin-repo.sqlite";
import { InMemoryOriginSettingRepo } from "../repo.memory.js";
import { createVerifiedOrigin } from "@jini-ai/http-kit/verified-origin";
import type { OriginSettingRepoPort } from "../ports.js";

/**
 * @file ADR-046 Phase 1 — shared `OriginSettingRepoPort` read-contract suite, run against BOTH
 * `repo.memory.ts` and `db/repos/origin-repo.ts` (rule-of-two, ADR-006), the latter on every
 * dialect (SQLite + PGlite, storage plan §4).
 *
 * Unlike every other rule-of-two suite in this codebase, the two adapters' WRITE paths are not
 * symmetric — `OriginSettingRepoPort` itself declares no write method (no admin route or
 * verification flow exists yet, see `origin-repo.ts`'s file header); the in-memory adapter
 * seeds via its constructor, the SQL adapter via the standalone `seedDevCapabilityOriginOn`
 * function. `runContractSuite` therefore takes an ALREADY-SEEDED repo factory rather than seeding
 * internally, so the shared assertions stay identical while each adapter is seeded its own way.
 */

const WORKSPACE_ID = "workspace-1";

function seedOrigin() {
  return createVerifiedOrigin({
    scheme: "https",
    host: "example.com",
    verifiedAt: "2026-07-16T00:00:00.000Z",
    source: "workspace-setting",
  });
}

function runContractSuite(label: string, makeSeededRepo: () => OriginSettingRepoPort, makeEmptyRepo: () => OriginSettingRepoPort) {
  test(`[${label}] findByWorkspaceId returns null when nothing is registered`, async () => {
    assert.equal(await makeEmptyRepo().findByWorkspaceId(WORKSPACE_ID), null);
  });

  test(`[${label}] findByWorkspaceId returns the registered origin`, async () => {
    const found = await makeSeededRepo().findByWorkspaceId(WORKSPACE_ID);
    assert.deepEqual(found, seedOrigin());
  });

  test(`[${label}] findRedirectAllowlist/findEgressAllowlist return the registered lists, normalized`, async () => {
    const repo = makeSeededRepo();
    assert.deepEqual(await repo.findRedirectAllowlist(WORKSPACE_ID), ["allowed.example"]);
    assert.deepEqual(await repo.findEgressAllowlist(WORKSPACE_ID), ["api.example.com"]);
  });

  test(`[${label}] findRedirectAllowlist/findEgressAllowlist return [] for an unregistered workspace`, async () => {
    const repo = makeEmptyRepo();
    assert.deepEqual(await repo.findRedirectAllowlist(WORKSPACE_ID), []);
    assert.deepEqual(await repo.findEgressAllowlist(WORKSPACE_ID), []);
  });
}

runContractSuite(
  "memory",
  () =>
    new InMemoryOriginSettingRepo([
      { workspaceId: WORKSPACE_ID, origin: seedOrigin(), redirectAllowlist: ["Allowed.example"], egressAllowlist: ["api.example.com"] },
    ]),
  () => new InMemoryOriginSettingRepo([])
);

/**
 * `registerConfiguredOrigin` — the SECOND writer (2026-09-18; design note:
 * `ADS-memory/reports/2026-09-18-public-origin-registration-design.md`). Deliberately a separate
 * function rather than a change to `seedDevCapabilityOrigin`: the certified idempotency assertion
 * above protects "a re-run of the boot seed can never clobber a real registered origin", and this
 * work must not weaken it. An operator-declared origin is a different authority (whoever can set
 * the process environment) and therefore a different contract — insert-or-correct, not
 * find-or-create.
 */
const DEV_CAPABILITY_ROW = createVerifiedOrigin({
  scheme: "http",
  host: "localhost",
  port: 3000,
  verifiedAt: "2026-07-16T00:00:00.000Z",
  source: "dev-capability",
});

function configuredOrigin(host = "tovu.fly.dev") {
  return createVerifiedOrigin({
    scheme: "https",
    host,
    verifiedAt: "2026-09-18T00:00:00.000Z",
    source: "workspace-setting",
  });
}

describeEachDialect("OriginSettingRepoPort (SQL)", { tables: ["origin_settings"], make: (kernel) => kernel }, (makeKernel) => {
  runContractSuite(
    "sql",
    () => {
      const kernel = makeKernel();
      const seeded = seedDevCapabilityOriginOn(kernel, { workspaceId: WORKSPACE_ID, origin: seedOrigin(), redirectAllowlist: ["Allowed.example"], egressAllowlist: ["api.example.com"] });
      return new SqlOriginSettingRepo(kernel, { after: seeded });
    },
    () => new SqlOriginSettingRepo(makeKernel())
  );

  test("seedDevCapabilityOrigin is idempotent — a second call never overwrites an existing row", async () => {
    const kernel = makeKernel();
    await seedDevCapabilityOriginOn(kernel, { workspaceId: WORKSPACE_ID, origin: seedOrigin() });

    // A different candidate origin — must NOT clobber the first seed (protects a future real
    // verification flow's write from being silently overwritten by a re-run of this boot seed).
    await seedDevCapabilityOriginOn(kernel, {
      workspaceId: WORKSPACE_ID,
      origin: createVerifiedOrigin({ scheme: "http", host: "some-other-host", verifiedAt: "2099-01-01T00:00:00.000Z", source: "dev-capability" }),
    });

    const repo = new SqlOriginSettingRepo(kernel);
    const found = await repo.findByWorkspaceId(WORKSPACE_ID);
    assert.equal(found?.host, "example.com", "the original seed must survive a second seed call");
  });

  test("reads wait for the boot write they are given, and fail when it failed", async () => {
    const kernel = makeKernel();
    const seeded = seedDevCapabilityOriginOn(kernel, { workspaceId: WORKSPACE_ID, origin: seedOrigin() });
    assert.equal((await new SqlOriginSettingRepo(kernel, { after: seeded }).findByWorkspaceId(WORKSPACE_ID))?.host, "example.com");
    const failed = Promise.reject(new Error("boot write failed"));
    await assert.rejects(new SqlOriginSettingRepo(kernel, { after: failed }).findEgressAllowlist(WORKSPACE_ID), /boot write failed/);
  });

  test("registerConfiguredOrigin inserts when no origin is registered yet", async () => {
    const kernel = makeKernel();
    assert.equal(await registerConfiguredOriginOn(kernel, WORKSPACE_ID, configuredOrigin()), "inserted");
    assert.deepEqual(await new SqlOriginSettingRepo(kernel).findByWorkspaceId(WORKSPACE_ID), configuredOrigin());
  });

  // THE production bug this whole change exists to fix: Fly's first boot durably persisted
  // `http://localhost:3000` (dev-capability) into prod's content.db, and `seedDevCapabilityOrigin`'s
  // find-or-create contract means that row can never self-correct. Configuring the real public origin
  // must correct it in place on the next deploy, with no migration.
  test("registerConfiguredOrigin corrects a poisoned dev-capability localhost row in place", async () => {
    const kernel = makeKernel();
    await seedDevCapabilityOriginOn(kernel, { workspaceId: WORKSPACE_ID, origin: DEV_CAPABILITY_ROW });

    assert.equal(await registerConfiguredOriginOn(kernel, WORKSPACE_ID, configuredOrigin()), "updated");

    const found = await new SqlOriginSettingRepo(kernel).findByWorkspaceId(WORKSPACE_ID);
    assert.deepEqual(found, configuredOrigin(), "the configured public origin must replace the dev-capability row");
    assert.equal(found?.port, undefined, "the dev seed's port 3000 must not survive onto a portless https origin");
  });

  // The update writes the ORIGIN columns only. A blind full-row overwrite would silently empty both
  // allowlists — in production that fail-closes every integration egress check, a behavior change
  // with no relationship to the origin bug. This is the assertion that pins the narrow UPDATE.
  test("registerConfiguredOrigin preserves both allowlists when it corrects an existing row", async () => {
    const kernel = makeKernel();
    await seedDevCapabilityOriginOn(kernel, {
      workspaceId: WORKSPACE_ID,
      origin: DEV_CAPABILITY_ROW,
      redirectAllowlist: ["Allowed.example"],
      egressAllowlist: ["api.example.com"],
    });

    await registerConfiguredOriginOn(kernel, WORKSPACE_ID, configuredOrigin());

    const repo = new SqlOriginSettingRepo(kernel);
    assert.deepEqual(await repo.findRedirectAllowlist(WORKSPACE_ID), ["allowed.example"]);
    assert.deepEqual(await repo.findEgressAllowlist(WORKSPACE_ID), ["api.example.com"]);
  });

  // A steady-state boot must not churn `verified_at` on every restart.
  test("registerConfiguredOrigin is a no-op when the stored origin already matches", async () => {
    const kernel = makeKernel();
    await registerConfiguredOriginOn(kernel, WORKSPACE_ID, configuredOrigin());

    const restamped = createVerifiedOrigin({ ...configuredOrigin(), verifiedAt: "2099-01-01T00:00:00.000Z" });
    assert.equal(await registerConfiguredOriginOn(kernel, WORKSPACE_ID, restamped), "unchanged");

    const found = await new SqlOriginSettingRepo(kernel).findByWorkspaceId(WORKSPACE_ID);
    assert.equal(found?.verifiedAt, "2026-09-18T00:00:00.000Z", "an unchanged origin must not restamp verifiedAt");
  });

  // Config is authoritative over a previously configured value: environment access (fly secrets /
  // fly.toml) is a higher privilege than an admin-UI login, and an operator who moves the site to a
  // new domain must be able to say so. Recorded as a decision, not an accident.
  test("registerConfiguredOrigin updates an existing workspace-setting row when the configured origin changes", async () => {
    const kernel = makeKernel();
    await registerConfiguredOriginOn(kernel, WORKSPACE_ID, configuredOrigin("old.example"));
    assert.equal(
      await registerConfiguredOriginOn(kernel, WORKSPACE_ID, configuredOrigin("new.example")),
      "updated"
    );
    assert.equal((await new SqlOriginSettingRepo(kernel).findByWorkspaceId(WORKSPACE_ID))?.host, "new.example");
  });
});

test("ADR-046 Phase 1: SqliteOriginSettingRepo persists across a simulated process restart (real on-disk file, fresh repo instance)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-origin-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    const db1 = openContentDb(dbPath);
    await seedDevCapabilityOrigin({ db: db1, seed: { workspaceId: WORKSPACE_ID, origin: seedOrigin(), egressAllowlist: ["api.example.com"] } });

    // "Restart": a brand-new content.db handle + a brand-new repo instance against the SAME
    // on-disk file — the in-memory adapter this replaces would have re-seeded from scratch
    // (behaviorally similar today since it's a hardcoded dev-capability seed, but a future real
    // verified origin would have been lost entirely).
    const db2 = openContentDb(dbPath);
    const repo2 = new SqliteOriginSettingRepo(db2);
    const found = await repo2.findByWorkspaceId(WORKSPACE_ID);
    assert.ok(found, "the origin must survive a restart");
    assert.equal(found?.host, "example.com");
    assert.deepEqual(await repo2.findEgressAllowlist(WORKSPACE_ID), ["api.example.com"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
