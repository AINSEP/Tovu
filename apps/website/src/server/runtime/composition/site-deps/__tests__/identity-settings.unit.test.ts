import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock, type TestContext } from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { composeIdentitySettings } from "../identity-settings.js";

/**
 * @file `composeIdentitySettings` over a real in-memory content database: the settings principal
 * lookup's `list`/`save` reach the identity principal repo; the site display name and creation time
 * zone come from the bound site folder (never for `:memory:`); and the opt-in boot password reset
 * does nothing when the caller supplied its own database, and logs its failure when owner
 * recovery storage is gone by the time identity is ready.
 */

type Required = Parameters<typeof composeIdentitySettings>[0];
const NOW = Date.parse("2031-02-03T04:05:06.000Z");

function siteFolder(t: TestContext, config: Record<string, unknown> | undefined) {
  const dir = mkdtempSync(join(tmpdir(), "tovu-identity-settings-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (config) writeFileSync(join(dir, "config.json"), JSON.stringify(config));
  return dir;
}

function compose(t: TestContext, { dbPath = ":memory:", overrides = {} }: { dbPath?: string; overrides?: Required["overrides"] } = {}) {
  const db = openContentDb(":memory:");
  db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run("site-7", "site-7", "site-7", "2031-01-01T00:00:00.000Z");
  const kernel = contentKernel({ store: db });
  const restorePoints: unknown[] = [];
  let ids = 0;
  const deps = composeIdentitySettings({
    kernel, workspaceId: "site-7", clock: { nowMs: () => NOW, nowIso: () => new Date(NOW).toISOString() },
    idGen: { newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}` },
    storeBound: { dbOps: { captureRestorePoint: async (input: unknown) => { restorePoints.push(input); } } },
    overrides, dbPath,
  } as unknown as Required);
  t.after(async () => { await deps.siteTitleReady.catch(() => undefined); await deps.adminPasswordResetReady; await kernel.close(); });
  return { deps, restorePoints };
}

function withResetPassword(t: TestContext) {
  const before = process.env.TOVU_ADMIN_RESET_PASSWORD;
  process.env.TOVU_ADMIN_RESET_PASSWORD = "pw-reset-7";
  t.after(() => { if (before === undefined) delete process.env.TOVU_ADMIN_RESET_PASSWORD; else process.env.TOVU_ADMIN_RESET_PASSWORD = before; });
}

function captureErrors(t: TestContext) {
  const errors: string[] = [];
  const spy = mock.method(console, "error", (...args: unknown[]) => { errors.push(args.map(String).join(" ")); });
  t.after(() => spy.mock.restore());
  return errors;
}

test("the settings principal lookup's list and save reach the identity principal repo", async t => {
  const { deps } = compose(t);
  await deps.identity.identityReady;
  const listed = await deps.settingsPrincipals.list({ workspaceId: "site-7" });
  assert.deepEqual(listed.map(row => row.id).sort(), (await deps.identity.principalRepo.list({ workspaceId: "site-7" })).map(row => row.id).sort());
  const ownerId = await deps.identity.ownerPrincipalId;
  const owner = listed.find(row => row.id === ownerId);
  assert.ok(owner, "the seeded owner principal is listed");
  await deps.settingsPrincipals.save({ ...owner, displayName: "Renamed Owner" });
  const reread = (await deps.identity.principalRepo.list({ workspaceId: "site-7" })).find(row => row.id === owner.id);
  assert.equal(reread?.displayName, "Renamed Owner");
});

test("a :memory: database has no site display name or creation zone, even with a bound site folder", async t => {
  const dir = siteFolder(t, { name: "Bakery", timezone: "Pacific/Auckland" });
  const { deps } = compose(t, { overrides: { siteBinding: { dir, name: "bakery" } } as Required["overrides"] });
  await deps.siteSettingsReady;
  assert.equal(deps.siteDisplayName.read(), undefined);
  assert.equal(await deps.siteTimeZone.resolveTimeZone({ workspaceId: "site-7" }), Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test("a bound site folder, not the database's folder, supplies the display name and creation zone", async t => {
  const dir = siteFolder(t, { name: "Bakery", timezone: "Pacific/Auckland" });
  const dbDir = siteFolder(t, undefined);
  mkdirSync(join(dbDir, "data"));
  const { deps } = compose(t, { dbPath: join(dbDir, "data", "content.db"), overrides: { siteBinding: { dir, name: "bakery" } } as Required["overrides"] });
  await deps.siteSettingsReady;
  assert.equal(deps.siteDisplayName.read(), "Bakery");
  assert.equal(await deps.siteTimeZone.resolveTimeZone({ workspaceId: "site-7" }), "Pacific/Auckland");
});

for (const supplied of ["db", "store"] as const) {
  test(`the boot password reset does nothing when the caller supplied its own ${supplied}`, async t => {
    withResetPassword(t);
    const errors = captureErrors(t);
    const { deps, restorePoints } = compose(t, { overrides: { [supplied]: {} } as Required["overrides"] });
    assert.equal(await deps.adminPasswordResetReady, undefined);
    await deps.identity.identityReady;
    assert.deepEqual(restorePoints, []);
    assert.deepEqual(errors.filter(line => line.includes("[admin-password-reset]")), []);
  });
}

test("the boot password reset logs its failure when owner recovery storage is gone once identity is ready", async t => {
  withResetPassword(t);
  const errors = captureErrors(t);
  const { deps, restorePoints } = compose(t);
  delete deps.identity.recoveryCodes;
  await deps.adminPasswordResetReady;
  const logged = errors.filter(line => line.includes("[admin-password-reset]"));
  assert.equal(logged.length, 1);
  assert.match(logged[0] ?? "", /^\[admin-password-reset\] FAILED: the owner password could not be reset\./);
  assert.match(logged[0] ?? "", /Owner recovery storage is unavailable/);
  assert.deepEqual(restorePoints, [], "no backup before a reset that never ran");
});
