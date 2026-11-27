import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { isolatedCatalogHome } from "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { registerAdminSiteKeyRoutes, type AdminSiteKeyDeps, type SiteKeyKeyWriter, type SiteKeyEnsureOutcome, type SiteKeyKeyCheck, type SiteKeyInstallOutcome } from "../site-key.js";
import { fingerprintSiteKeyHex, SiteKeyFileAlreadyExistsError } from "#src/features/webhooks/keyring.env";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { STORAGE_SECRET_FILENAME } from "#src/platform/site-dir/index";

async function fixture({ t }: { t: TestContext }, { credentialKind = "session", allowed = true, scanClosedSite = false }: {
  credentialKind?: string; allowed?: boolean; scanClosedSite?: boolean;
} = {}) {
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
  let ensureError: Error | undefined;
  const recoveryWrites: unknown[] = [];
  let discard: SiteKeyKeyWriter["discardNotOpening"] = async () => { throw new Error("unexpected discard"); };
  const writer: SiteKeyKeyWriter = {
    ensureSiteKeyForSite: async () => { events.push("ensure"); if (ensureError) throw ensureError; return ensured; },
    checkKey: async () => { events.push("check"); return check; },
    resealFrom: async input => { events.push(`reseal:${input.previousHex}`); return { resealed: 2, unreadable: 0 }; },
    installSiteKey: input => { events.push("install"); recoveryWrites.push({ operation: "install", input }); return installed; },
    mintSiteKeyHex: () => { throw new Error("unexpected mint"); },
    discardNotOpening: async input => {
      events.push("discard");
      recoveryWrites.push({ operation: "discard", siteDir: input.siteDir, hex: input.hex });
      return discard(input);
    },
  };
  const dbOps: AdminSiteKeyDeps["dbOps"] = {
    getCapabilities: async () => ({ restorePoint: { costClass: available ? "cheap" : "unavailable", kind: "file-snapshot" } }),
    captureRestorePoint: async () => { events.push("capture"); return { artifactRef: "fixture", watermarkAtCapture: 0 }; },
    restoreFromArtifact: async () => { throw new Error("unexpected restore"); },
  };
  const savedPoints: Parameters<AdminSiteKeyDeps["restorePointsRepo"]["save"]>[0][] = [];
  const save: AdminSiteKeyDeps["restorePointsRepo"]["save"] = async row => { events.push(`save:${row.trigger}`); savedPoints.push(row); };
  const ports = {
    workspaceId: "ws", authorize: async () => (allowed ? { allowed: true, reason: "fixture" } : { allowed: false, reason: "insufficient_permission" }),
    siteBinding: { dir, name: "fixture", dirOverridden: true, switcherCompatible: false },
    dbOps, idGen: { newId: () => randomUUID() }, clock: { nowMs: () => 0, nowIso: () => "2026-10-20T00:00:00.000Z" },
  } satisfies Pick<AdminSiteKeyDeps, "workspaceId" | "authorize" | "siteBinding" | "dbOps" | "idGen" | "clock">;
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = credentialKind; next(); });
  const baseDeps = createRouteDeps();
  t.mock.method(baseDeps.restorePointsRepo, "save", save);
  registerAdminSiteKeyRoutes({ app, deps: { ...baseDeps, ...ports, ...(scanClosedSite ? { contentKernel: undefined } : {}) }, siteKey: writer });
  const base = await startTestServer(app, t);
  const post = async ({ verb, body = {} }: { verb: string; body?: unknown }, _options = {}) => {
    const response = await fetch(`${base}/api/admin/v1/workspaces/ws/system/site-key/${verb}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  const currentKey = ({ hex }: { hex: string }, _options = {}) => {
    const folder = join(isolatedCatalogHome, ".tovu", "site-keys"); mkdirSync(folder, { recursive: true });
    const file = join(folder, `${siteKeyId}.hex`); writeFileSync(file, hex); t.after(() => rmSync(file, { force: true }));
  };
  return { post, events, dir, meta, currentKey, base, recoveryWrites, savedPoints,
    setDiscard: (fn: SiteKeyKeyWriter["discardNotOpening"]) => { discard = fn; },
    setEnsure: ({ value }: { value: SiteKeyEnsureOutcome | undefined }, _options = {}) => { ensured = value; },
    setCheck: ({ value }: { value: SiteKeyKeyCheck }, _options = {}) => { check = value; },
    setInstalled: ({ value }: { value: SiteKeyInstallOutcome | undefined }, _options = {}) => { installed = value; },
    unavailable: (_required = {}, _options = {}) => { available = false; },
    setEnsureThrows: (error: Error) => { ensureError = error; },
  };
}

test("explicit reveal returns the stored fixture key with no-store and leaves the writer untouched", async t => {
  const f = await fixture({ t });
  const hex = "23".repeat(32);
  f.currentKey({ hex });
  const reply = await f.post({ verb: "reveal" });
  assert.equal(reply.status, 200);
  assert.equal(reply.cache, "no-store");
  assert.partialDeepStrictEqual(reply.body, { active: true, source: "file", hex, runtimeMode: "local" });
  assert.deepEqual(f.events, []);
});

test("production generation refuses over sealed storage and stamps a newly generated volume key once clear", async t => {
  const f = await fixture({ t }, { scanClosedSite: true });
  const cwd = t.mock.method(process, "cwd", () => f.dir);
  t.after(() => cwd.mock.restore());
  process.env.TOVU_RUNTIME_MODE = "production";
  const metaPath = join(f.dir, ".site-meta.json");
  const original = { siteId: "fixture-production", name: "Orchard", siteKeyFingerprint: "prior-stamp" };
  writeFileSync(metaPath, JSON.stringify(original));
  const secret = join(f.dir, STORAGE_SECRET_FILENAME);
  writeFileSync(secret, "sealed fixture");
  const keyPath = join(f.dir, "sites", ".tovu", "site-key.hex");
  const refused = await f.post({ verb: "generate" });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, "KEY_DEPENDENT_DATA");
  assert.equal(existsSync(keyPath), false);
  assert.deepEqual(JSON.parse(readFileSync(metaPath, "utf8")), original);
  rmSync(secret);
  const created = await f.post({ verb: "generate" });
  assert.equal(created.status, 201);
  const hex = readFileSync(keyPath, "utf8").trim();
  assert.match(hex, /^[0-9a-f]{64}$/);
  const fingerprint = fingerprintSiteKeyHex({ hex });
  assert.deepEqual(created.body, { outcome: "created", fingerprint, keyFilePath: keyPath, runtimeMode: "production" });
  assert.deepEqual(JSON.parse(readFileSync(metaPath, "utf8")), { ...original, siteKeyFingerprint: fingerprint });
});

test("start fresh persists a restore point before discard and installs the same checked key", async t => {
  const f = await fixture({ t });
  const hex = "be".repeat(32);
  f.currentKey({ hex });
  f.meta({ fingerprint: fingerprintSiteKeyHex({ hex }) });
  f.setDiscard(async () => ({ discarded: 3, kept: 2 }));
  const reply = await f.post({ verb: "start-fresh", body: { confirm: "START FRESH" } });
  assert.equal(reply.status, 200);
  assert.equal(reply.cache, "no-store");
  assert.deepEqual(f.events, ["check", "capture", "save:site-key-start-fresh", "discard", "install"]);
  assert.deepEqual(f.recoveryWrites, [
    { operation: "discard", siteDir: f.dir, hex },
    { operation: "install", input: { siteDir: f.dir, hex } },
  ]);
  assert.equal(f.savedPoints.length, 1);
  const point = f.savedPoints[0]!;
  assert.partialDeepStrictEqual(point, { trigger: "site-key-start-fresh", createdBy: "owner", artifactRef: "fixture" });
  assert.deepEqual(reply.body, { outcome: "started-fresh", fingerprint: "fingerprint", keyFilePath: "/fixture/key",
    discarded: 3, kept: 2, restorePointId: point.restorePointId, affectedWebhooks: [], runtimeMode: "local" });
});

test("start fresh without a restore point preserves all credentials and declines the change", async t => {
  const f = await fixture({ t });
  const hex = "be".repeat(32);
  f.currentKey({ hex });
  f.meta({ fingerprint: fingerprintSiteKeyHex({ hex }) });
  f.unavailable();
  const reply = await f.post({ verb: "start-fresh", body: { confirm: "START FRESH" } });
  assert.deepEqual(reply, { status: 409, cache: "no-store", body: { error: "RESTORE_POINT_UNAVAILABLE",
    detail: "A restore point can't be made for this site's database right now, so nothing was changed.", runtimeMode: "local" } });
  assert.deepEqual(f.events, ["check"]);
  assert.deepEqual(f.recoveryWrites, []);
  assert.deepEqual(f.savedPoints, []);
});

test("start fresh returns the install refusal instead of claiming success after discard", async t => {
  const f = await fixture({ t });
  const hex = "be".repeat(32);
  f.currentKey({ hex });
  f.meta({ fingerprint: fingerprintSiteKeyHex({ hex }) });
  f.setDiscard(async () => ({ discarded: 0, kept: 2 }));
  for (const [value, code, detail] of [
    [undefined, "SITE_META_UNREADABLE", "This site's .site-meta.json cannot be read. Repair this site first; no site key was written."],
    [{ outcome: "env-key-set" }, "ENV_KEY_SET", "A different site key is set in this server's environment and overrides the key file, so nothing was changed. Change it there instead."],
  ] as const) {
    f.setInstalled({ value });
    assert.deepEqual(await f.post({ verb: "start-fresh", body: { confirm: "START FRESH" } }), {
      status: 409, cache: "no-store", body: { error: code, detail, runtimeMode: "local" },
    });
  }
  assert.deepEqual(f.events, [
    "check", "capture", "save:site-key-start-fresh", "discard", "install",
    "check", "capture", "save:site-key-start-fresh", "discard", "install",
  ]);
});

test("a start-fresh discard failure is private and does not reach the key installer", async t => {
  const f = await fixture({ t });
  const hex = "be".repeat(32);
  f.currentKey({ hex });
  f.meta({ fingerprint: fingerprintSiteKeyHex({ hex }) });
  const logged = t.mock.method(console, "error", () => {});
  f.setDiscard(async () => { throw new Error("private recovery transaction failed"); });
  const reply = await f.post({ verb: "start-fresh", body: { confirm: "START FRESH" } });
  assert.equal(reply.status, 500);
  assert.equal(reply.cache, "no-store");
  assert.equal(reply.body.code, "INTERNAL_ERROR");
  assert.match(reply.body.error, /error ERR-/);
  assert.doesNotMatch(JSON.stringify(reply.body), /private recovery transaction failed/);
  assert.deepEqual(f.events, ["check", "capture", "save:site-key-start-fresh", "discard"]);
  assert.deepEqual(logged.mock.calls.map(call => call.arguments), [
    ["[admin-failure] reporter unavailable", { operation: "routes/system/site-key" }],
  ]);
});

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
    f.meta({ fingerprint: proof === "stamp" ? fingerprintSiteKeyHex({ hex }) : undefined });
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

// F6 fix wave (L12 Stryker top-8, site-key.ts): every route refuses an api-key credential, an
// unauthorized principal and a foreign workspace before touching the key writer; a missing JSON body
// is a 4xx refusal, never a 500; a key file appearing mid-generate is 409 ALREADY_EXISTS.
const ROUTES = [["GET", ""], ["POST", "/reveal"], ["POST", "/generate"], ["POST", "/import"], ["GET", "/start-fresh"], ["POST", "/start-fresh"]] as const;
async function call(base: string, { method, suffix, workspace = "ws" }: { method: string; suffix: string; workspace?: string }) {
  const response = await fetch(`${base}/api/admin/v1/workspaces/${workspace}/system/site-key${suffix}`, method === "GET" ? {} : { method, headers: { "content-type": "application/json" }, body: "{}" });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

test("every site-key route refuses an api-key credential with the credential-kind reason, before any writer call", async t => {
  const f = await fixture({ t }, { credentialKind: "api_key" });
  for (const [method, suffix] of ROUTES) {
    const result = await call(f.base, { method, suffix });
    assert.equal(result.status, 403, `${method} ${suffix}`);
    assert.deepEqual(result.body.details, { permission: "admin.security.site-key.manage", reason: "credential_kind_not_permitted" });
  }
  assert.deepEqual(f.events, []);
});

test("every site-key route answers a foreign workspace with 404 and an unauthorized principal with 403", async t => {
  const f = await fixture({ t });
  for (const [method, suffix] of ROUTES) {
    const result = await call(f.base, { method, suffix, workspace: "other-ws" });
    assert.equal(result.status, 404, `${method} ${suffix}`);
    assert.deepEqual(result.body, { error: "workspace was not found" });
  }
  const denied = await fixture({ t }, { allowed: false });
  for (const [method, suffix] of ROUTES) assert.equal((await call(denied.base, { method, suffix })).status, 403, `${method} ${suffix}`);
  assert.deepEqual([...f.events, ...denied.events], []);
});

test("import and start-fresh without a JSON body are refused as client errors, not 500s", async t => {
  const f = await fixture({ t });
  for (const suffix of ["/import", "/start-fresh"]) {
    const response = await fetch(`${f.base}/api/admin/v1/workspaces/ws/system/site-key${suffix}`, { method: "POST" });
    assert.ok(response.status >= 400 && response.status < 500, `${suffix}: ${response.status}`);
  }
  assert.deepEqual(f.events, []);
});

test("generate answers a key file that appears mid-request with 409 ALREADY_EXISTS", async t => {
  const f = await fixture({ t });
  f.setEnsureThrows(new SiteKeyFileAlreadyExistsError({ keyFilePath: "/fixture/key" }));
  const result = await f.post({ verb: "generate" });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "ALREADY_EXISTS");
  assert.match(String(result.body.detail), /already exists at \/fixture\/key/);
});
