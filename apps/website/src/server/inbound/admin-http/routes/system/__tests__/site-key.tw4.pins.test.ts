import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { isolatedCatalogHome } from "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { registerAdminSiteKeyRoutes, type AdminSiteKeyDeps, type SiteKeyKeyWriter, type SiteKeyEnsureOutcome, type SiteKeyKeyCheck, type SiteKeyInstallOutcome } from "../site-key.js";
import { fingerprintSiteKeyHex } from "#src/features/webhooks/keyring.env";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

async function fixture({ t }: { t: TestContext }, _options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tw4-site-key-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ["TOVU_SITE_KEY", "TOVU_RUNTIME_MODE"]) {
    const previous = process.env[name]; delete process.env[name];
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  const siteKeyId = randomUUID();
  const meta = ({ fingerprint }: { fingerprint?: string }, _options = {}) => writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteKeyId, siteKeyFingerprint: fingerprint }));
  meta({});
  const events: string[] = [];
  let ensured: SiteKeyEnsureOutcome | undefined = { action: "noop", fingerprint: "fingerprint", perSiteFilePath: "/fixture/key" };
  let check: SiteKeyKeyCheck = { sealed: 1, opens: 1, storageSecret: "absent" };
  let installed: SiteKeyInstallOutcome | undefined = { outcome: "installed", keyFilePath: "/fixture/key", fingerprint: "fingerprint" };
  let available = true;
  const writer: SiteKeyKeyWriter = {
    ensureSiteKeyForSite: async () => { events.push("ensure"); return ensured; },
    checkKey: async () => { events.push("check"); return check; },
    resealFrom: async input => { events.push(`reseal:${input.previousHex}`); return { resealed: 2, unreadable: 0 }; },
    installSiteKey: () => { events.push("install"); return installed; },
    mintSiteKeyHex: () => { throw new Error("unexpected mint"); },
    discardNotOpening: async () => { throw new Error("unexpected discard"); },
  };
  const dbOps: AdminSiteKeyDeps["dbOps"] = {
    getCapabilities: async () => ({ restorePoint: { costClass: available ? "cheap" : "unavailable", kind: "file-snapshot" } }),
    captureRestorePoint: async () => { events.push("capture"); return { artifactRef: "fixture", watermarkAtCapture: 0 }; },
    restoreFromArtifact: async () => { throw new Error("unexpected restore"); },
  };
  const save: AdminSiteKeyDeps["restorePointsRepo"]["save"] = async row => { events.push(`save:${row.trigger}`); };
  const ports = {
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "fixture" }),
    siteBinding: { dir, name: "fixture", dirOverridden: true, switcherCompatible: false },
    dbOps, idGen: { newId: () => randomUUID() }, clock: { nowMs: () => 0, nowIso: () => "2026-10-20T00:00:00.000Z" },
  } satisfies Pick<AdminSiteKeyDeps, "workspaceId" | "authorize" | "siteBinding" | "dbOps" | "idGen" | "clock">;
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  const baseDeps = createRouteDeps();
  t.mock.method(baseDeps.restorePointsRepo, "save", save);
  registerAdminSiteKeyRoutes(app, { ...baseDeps, ...ports }, writer);
  const base = await startTestServer(app, t);
  const post = async ({ verb, body = {} }: { verb: string; body?: unknown }, _options = {}) => {
    const response = await fetch(`${base}/api/admin/v1/workspaces/ws/system/site-key/${verb}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  const currentKey = ({ hex }: { hex: string }, _options = {}) => {
    const folder = join(isolatedCatalogHome, ".tovu", "site-keys"); mkdirSync(folder, { recursive: true });
    const file = join(folder, `${siteKeyId}.hex`); writeFileSync(file, hex); t.after(() => rmSync(file, { force: true }));
  };
  return { post, events, dir, meta, currentKey,
    setEnsure: ({ value }: { value: SiteKeyEnsureOutcome | undefined }, _options = {}) => { ensured = value; },
    setCheck: ({ value }: { value: SiteKeyKeyCheck }, _options = {}) => { check = value; },
    setInstalled: ({ value }: { value: SiteKeyInstallOutcome | undefined }, _options = {}) => { installed = value; },
    unavailable: (_required = {}, _options = {}) => { available = false; },
  };
}

test("generate preserves every shared-writer result and missing-result guard", async t => {
  const f = await fixture({ t });
  for (const [action, outcome, status] of [["noop", "already-active", 200], ["adopt", "recovered", 200], ["mint", "created", 201]] as const) {
    f.setEnsure({ value: { action, fingerprint: "fingerprint", perSiteFilePath: "/fixture/key" } });
    const result = await f.post({ verb: "generate" }); assert.equal(result.status, status); assert.equal(result.body.outcome, outcome); assert.equal(result.body.fingerprint, "fingerprint"); assert.equal(result.body.keyFilePath, "/fixture/key"); assert.equal(result.cache, "no-store");
    for (const value of [{ action, fingerprint: "fingerprint" }, { action, perSiteFilePath: "/fixture/key" }] as const) {
      f.setEnsure({ value }); const invalid = await f.post({ verb: "generate" }); assert.equal(invalid.status, 500); assert.equal(invalid.body.code, "INTERNAL_ERROR");
    }
  }
  for (const [action, error] of [["refuse", "KEY_DEPENDENT_DATA"], ["mismatch", "KEY_MISMATCH"], ["invalid", "KEY_INVALID"]] as const) {
    f.setEnsure({ value: { action } }); const result = await f.post({ verb: "generate" }); assert.equal(result.status, 409); assert.equal(result.body.error, error);
  }
  f.setEnsure({ value: undefined }); assert.equal((await f.post({ verb: "generate" })).body.error, "SITE_META_UNREADABLE");
  f.events.length = 0; writeFileSync(join(f.dir, ".site-meta.json"), "{");
  assert.equal((await f.post({ verb: "generate" })).body.error, "SITE_META_UNREADABLE"); assert.deepEqual(f.events, []);
});

test("generate delegates production-noop and production mode to the active environment key", async t => {
  const f = await fixture({ t }); process.env.TOVU_SITE_KEY = randomBytes(32).toString("hex");
  f.setEnsure({ value: { action: "production-noop" } });
  const result = await f.post({ verb: "generate" }); assert.equal(result.status, 200); assert.equal(result.body.outcome, "already-active");
  process.env.TOVU_RUNTIME_MODE = "production"; f.setEnsure({ value: undefined });
  assert.equal((await f.post({ verb: "generate" })).body.outcome, "already-active");
});

test("import rejects malformed keys before checking or writing", async t => {
  const f = await fixture({ t });
  for (const siteKey of [undefined, 1, "not-a-key"]) {
    assert.equal((await f.post({ verb: "import", body: { siteKey } })).body.error, "SITE_KEY_INVALID");
  }
  assert.deepEqual(f.events, []);
});

for (const proof of ["none", "value", "storage", "stamp"] as const) {
  test(`import preserves ${proof} proof before writes`, async t => {
    const f = await fixture({ t }), hex = randomBytes(32).toString("hex");
    f.setCheck({ value: { sealed: 1, opens: proof === "value" ? 1 : 0, storageSecret: proof === "storage" ? "opens" : "absent" } });
    f.meta({ fingerprint: proof === "stamp" ? fingerprintSiteKeyHex(hex) : undefined });
    const result = await f.post({ verb: "import", body: { siteKey: hex } });
    assert.equal(result.status, proof === "none" ? 409 : 200); assert.equal(result.cache, "no-store");
    assert.deepEqual(f.events, proof === "none" ? ["check"] : ["check", "install"]);
    if (proof !== "none") assert.equal(result.body.resealed, 0);
  });
}

test("import accepts the same environment key but refuses a different environment key before writes", async t => {
  const f = await fixture({ t }), hex = randomBytes(32).toString("hex");
  process.env.TOVU_SITE_KEY = hex;
  assert.equal((await f.post({ verb: "import", body: { siteKey: hex } })).status, 200); assert.deepEqual(f.events, ["check", "install"]);
  process.env.TOVU_SITE_KEY = randomBytes(32).toString("hex"); f.events.length = 0;
  assert.equal((await f.post({ verb: "import", body: { siteKey: hex } })).body.error, "ENV_KEY_SET"); assert.deepEqual(f.events, []);
});

for (const current of ["absent", "same", "different"] as const) {
  for (const legacy of [undefined, 0, 1]) {
    test(`import restore/reseal ordering with ${current} current key and legacy=${legacy}`, async t => {
      const f = await fixture({ t }), hex = randomBytes(32).toString("hex");
      const previous = current === "different" ? randomBytes(32).toString("hex") : hex;
      if (current !== "absent") f.currentKey({ hex: previous });
      f.setCheck({ value: { sealed: 1, opens: 1, storageSecret: "absent", legacy } });
      const result = await f.post({ verb: "import", body: { siteKey: hex } });
      const reseals = current === "different" || legacy === 1;
      assert.equal(result.status, 200); assert.equal(result.body.resealed, reseals ? 2 : 0);
      assert.deepEqual(f.events, reseals ? ["check", "capture", "save:site-key-import", `reseal:${previous}`, "install"] : ["check", "install"]);
    });
  }
}

test("import refuses unavailable restore points and preserves installation refusals", async t => {
  const f = await fixture({ t }), hex = randomBytes(32).toString("hex");
  f.setCheck({ value: { sealed: 1, opens: 1, storageSecret: "absent", legacy: 1 } }); f.unavailable();
  assert.equal((await f.post({ verb: "import", body: { siteKey: hex } })).body.error, "RESTORE_POINT_UNAVAILABLE"); assert.deepEqual(f.events, ["check"]);
  f.setCheck({ value: { sealed: 1, opens: 1, storageSecret: "absent" } });
  for (const [value, error] of [[undefined, "SITE_META_UNREADABLE"], [{ outcome: "env-key-set" }, "ENV_KEY_SET"]] as const) {
    f.setInstalled({ value }); const result = await f.post({ verb: "import", body: { siteKey: hex } }); assert.equal(result.status, 409); assert.equal(result.body.error, error);
  }
});
