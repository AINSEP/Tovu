import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sql } from "kysely";
import type { Express, Request, Response } from "express";
import { vaultRepo } from "#src/platform/db/__tests__/vault-credential.fixture";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { SecretsVaultService, VAULT_KINDS, type VaultKind, type VaultMeta } from "@jini-ai/platform/secrets/credential-sets";
import { FixedSiteKeyKeyring, fingerprintSiteKeyHex } from "#src/features/webhooks/keyring.env";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { secretsVaultStatements } from "#src/platform/db/migrations/0012_secrets_vault";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { registerAdminCredentialCopyRoutes } from "#src/server/inbound/admin-http/routes/system/credential-copy";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { createLocalCredentialCopy, LocalCredentialCopyError } from "../local-credential-copy.js";
import { loadBundledDeployTargets } from "#src/features/deployments/deploy-targets/__tests__/bundled-deploy-targets.fixture";
import { VendorCredentialSetVaultRepo } from "#src/features/vendor-credentials/vault-adapter";
import { createDbPublishCredentialSource } from "#src/features/deployments/static-publish/credentials";

const stamp = "2026-10-11T12:00:00.000Z";
const token = "copy-test-secret-1234567890";
const registry = createTovuVaultKinds({ policy: {
  validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => undefined,
} });
const context = (workspaceId: string, kind: VaultKind) => ({ workspaceId, kind: kind === "custom" ? "vendor" as const : kind, ownerKey: "tovu",
  principalId: kind === "personal-execution" ? "source-person" : null,
  binding: kind === "mcp-env" || kind === "mcp-auth" ? "server" : null });

/** Real temporary folders, file-backed SQLite and distinct root keys; setup never uses source boot. */
async function fixture(placement: "inSite" | "appData" = "inSite") {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-credential-copy-")));
  const workspace = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, sourceRoots: [], appDataDir: path.join(home, "app") });
  const logs: unknown[] = [];
  const handles: { opened: number; closed: number } = { opened: 0, closed: 0 };
  const site = async (id: string, hex: string) => {
    const dir = path.join(home, id);
    fs.mkdirSync(dir);
    fs.mkdirSync(path.join(home, ".tovu", "site-keys"), { recursive: true });
    const keyPath = path.join(home, ".tovu", "site-keys", `${id}.hex`);
    fs.writeFileSync(keyPath, hex);
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: id, siteKeyId: id,
      siteKeyFingerprint: fingerprintSiteKeyHex(hex), storage: { kind: "sqlite" } }));
    workspace.registry({}).merge({ entries: [{ id, path: dir, name: id, createdBy: "copy-test", lastOpened: null }] });
    const dbPath = resolveSiteDatabasePaths({ dir }, { workspace, placement, reserveIdentity: false }).contentDbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const kernel = openSqliteFileKernel<ContentDatabase>(dbPath);
    // Use the host's actual vault DDL, including FK, singleton, scope, hint and default indexes.
    await kernel.execute(sql`CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT, slug TEXT, created_at TEXT)`);
    await kernel.execute(sql`CREATE TABLE principals(id TEXT PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO workspaces VALUES(${id},${id},${id},${stamp})`);
    await kernel.execute(sql`INSERT INTO principals VALUES('source-person')`);
    for (const statement of secretsVaultStatements({ dialect: "sqlite" })) await kernel.execute(sql.raw(statement));
    const keyring = new FixedSiteKeyKeyring(hex);
    const sealer = new AesGcmSecretSealer({ keyring });
    const repo = vaultRepo(kernel);
    const service = new SecretsVaultService({ repo, keyring, sealer, metaParsers: registry.metaParsers,
      authorize: async () => {}, now: () => stamp, newId: () => "unused" });
    return { id, dir, dbPath, keyPath, kernel, keyring, sealer, repo, service };
  };
  const source = await site("source", "11".repeat(32));
  const target = await site("target", "22".repeat(32));
  const required = { targetKernel: target.kernel, targetWorkspaceId: target.id, targetSiteDir: target.dir,
    keyring: target.keyring, sealer: target.sealer, registry };
  const options = { workspace, home, localHost: true, desktopStartAvailable: true, operationId: () => "operation-1",
    logger: { info: (message: unknown, fields: unknown) => logs.push({ message, fields }) },
    openSource: (<DB>(filePath: string, optional: { readOnly?: boolean } = {}) => {
      assert.equal(optional.readOnly, true);
      const kernel = openSqliteFileKernel<DB>(filePath, optional);
      handles.opened++;
      return { ...kernel, transaction: async () => assert.fail("source must never begin a transaction"),
        close: async () => { handles.closed++; await kernel.close(); } };
    }) as typeof openSqliteFileKernel,
  };
  return { home, workspace, source, target, logs, handles, required, options,
    copy: createLocalCredentialCopy(required, options),
    close: async () => { await source.kernel.close(); await target.kernel.close(); fs.rmSync(home, { recursive: true, force: true }); } };
}
async function save(site: Awaited<ReturnType<typeof fixture>>["source"], kind: VaultKind, id: string = kind, value = token) {
  const meta: VaultMeta = kind === "publish-peer" ? { baseUrl: "https://peer.example.test", remoteWorkspaceId: "remote" }
    : kind === "database-destination" ? { description: { host: "db.example.test", port: "5432", database: "content", user: "writer" }, lastRun: null }
    : kind === "custom" ? { credentialType: "custom", worksFor: id === "Production access" ? ["vercel"] : [], category: "general", baseUrl: "https://api.example.test", additionalHosts: [], username: null }
    : kind === "vendor" ? { credentialType: "vendor", worksFor: [] } : {};
  return site.service.put({ ...context(site.id, kind), id, expectedRevision: null, provider: kind === "media-provider" ? "media-test" : kind === "vendor" ? "vendor-test" : null,
    label: id, meta, payload: { token: value }, hintToken: value });
}

test("copy inventory retains every eligible kind, labels custom host compatibility, and copied Vercel keys resolve for publishing", async () => {
  const f = await fixture();
  try {
    for (const kind of VAULT_KINDS.filter(kind => registry.isCopyableKind[kind])) await save(f.source, kind);
    await save(f.source, "custom", "Production access");
    await save(f.source, "custom", "Vercel");
    const before = fs.readFileSync(f.source.dbPath);
    const copy = createLocalCredentialCopy({ ...f.required, loadDeployTargets: loadBundledDeployTargets }, f.options);
    const sources = await copy.list({});
    assert.equal(sources[0].keys.length, 8);
    assert.deepEqual(sources[0].keys.find(key => key.label === "Production access")?.worksFor, ["vercel"]);
    assert.deepEqual(sources[0].keys.find(key => key.label === "Production access")?.publishHosts, ["vercel"]);
    assert.deepEqual((await copy.list({}))[0].keys.find(key => key.label === "Vercel")?.publishHosts, []);
    assert.deepEqual((await copy.copy({ sourceSiteId: "source", ids: ["Production access"], overwrite: false, actorId: "owner" }))
      .map(row => [row.id, row.status]), [["Production access", "copied"]]);
    const publish = createDbPublishCredentialSource({ repo: new VendorCredentialSetVaultRepo({ vault: f.target.repo, kind: "vendor", vendor: true }),
      sealer: f.target.sealer, loadDeployTargets: loadBundledDeployTargets });
    assert.deepEqual(await publish.isConfigured({ workspaceId: "target", target: "vercel" }), { configured: true });
    assert.deepEqual(await publish.resolve({ workspaceId: "target", target: "vercel" }), { ok: true, token, credentialId: "Production access" });
    assert.deepEqual(fs.readFileSync(f.source.dbPath), before);
  } finally { await f.close(); }
});

test("copy inventory keeps source keys without publishHosts when deploy targets cannot load", async () => {
  const f = await fixture();
  try {
    await save(f.source, "custom", "Production access");
    const copy = createLocalCredentialCopy({ ...f.required, loadDeployTargets: async () => {
      throw new Error("private-registry-error");
    } }, f.options);
    const sources = await copy.list({});
    assert.deepEqual(sources.map(source => ({ siteId: source.siteId,
      keys: source.keys.map(({ kind, id, label, provider }) => ({ kind, id, label, provider })) })), [
      { siteId: "source", keys: [{ kind: "vendor", id: "Production access", label: "Production access", provider: null }] },
    ]);
    assert.equal(Object.hasOwn(sources[0].keys[0], "publishHosts"), false);
    assert.equal(f.handles.opened, f.handles.closed);
  } finally { await f.close(); }
});

for (const placement of ["inSite", "appData"] as const) test(`${placement}: copied keys reopen under the target key/AAD, preserving IDs; source stays byte-identical`, async () => {
  const f = await fixture(placement);
  try {
    const kinds = VAULT_KINDS.filter(kind => registry.isCopyableKind[kind]);
    for (const kind of kinds) await save(f.source, kind);
    const before = fs.readFileSync(f.source.dbPath);
    const keyBefore = fs.readFileSync(f.source.keyPath);
    const metaBefore = fs.readFileSync(path.join(f.source.dir, ".site-meta.json"));
    const inventory = await f.copy.list({});
    assert.deepEqual(inventory.map(choice => choice.siteId), ["source"]);
    assert.equal(inventory[0].keys.length, 6);
    assert.deepEqual(Object.keys(inventory[0].keys[0]).sort(), ["id", "kind", "label", "last4", "provider", "worksFor"]);
    assert.equal(inventory[0].keys.find(key => key.kind === "database-destination")!.last4, undefined);
    assert.equal(inventory[0].keys.find(key => key.kind === "vendor")!.last4, "7890");
    const results = await f.copy.copy({ actorId: "owner", sourceSiteId: "source", ids: kinds, overwrite: false });
    assert.ok(results.every(row => row.status === "copied"));
    for (const kind of kinds) {
      const opened = await f.target.service.get({ ...context("target", kind), id: kind });
      assert.deepEqual(opened?.payload, { token });
      assert.equal(opened?.summary.id, kind);
      const a = (await f.source.repo.find({ workspaceId: "source", id: kind }))!;
      const b = (await f.target.repo.find({ workspaceId: "target", id: kind }))!;
      assert.notEqual(a.sealed?.ciphertext, b.sealed?.ciphertext);
      assert.notEqual(a.sealed?.nonce, b.sealed?.nonce);
    }
    assert.equal(results.find(row => row.kind === "database-destination")?.last4, undefined);
    assert.deepEqual(fs.readFileSync(f.source.dbPath), before);
    assert.deepEqual(fs.readFileSync(f.source.keyPath), keyBefore);
    assert.deepEqual(fs.readFileSync(path.join(f.source.dir, ".site-meta.json")), metaBefore);
    assert.equal(f.handles.opened, f.handles.closed);
    assert.equal(f.logs.length, 1);
    const serialized = JSON.stringify({ inventory, results, logs: f.logs });
    for (const secret of [token, "11".repeat(32), "22".repeat(32), f.home]) assert.ok(!serialized.includes(secret));
    assert.ok(!serialized.includes("ciphertext"));
    assert.deepEqual(f.logs[0], { message: { message: "credentials.copy" }, fields: { meta: {
      operationId: "operation-1", actorId: "owner", sourceSiteId: "source", targetSiteId: "target",
      copied: 6, skipped: 0, failed: 0, reasonCodes: [],
    } } });
  } finally { await f.close(); }
});

test("skip/overwrite, duplicate selections, short hints and mixed failures preserve target defaults", async () => {
  const f = await fixture();
  try {
    await save(f.source, "custom");
    await save(f.source, "vendor");
    await save(f.source, "media-provider", "media", "tiny");
    await save(f.target, "custom", "custom", "target-original-secret");
    const input = { actorId: "owner", sourceSiteId: "source", ids: ["custom", "custom", "vendor", "media"], overwrite: false };
    const first = await f.copy.copy(input);
    assert.deepEqual(first.map(row => row.status), ["skipped", "copied", "copied"]);
    assert.equal(first[0].reasonCode, "target-exists");
    assert.equal(first[2].last4, undefined);
    assert.deepEqual((await f.target.service.get({ ...context("target", "custom"), id: "custom" }))?.payload, { token: "target-original-secret" });
    assert.equal((await f.copy.copy({ ...input, ids: ["custom"], overwrite: true }))[0].status, "copied");
    assert.deepEqual((await f.target.service.get({ ...context("target", "custom"), id: "custom" }))?.payload, { token });
    assert.equal((await f.target.repo.find({ workspaceId: "target", id: "custom" }))?.isDefault, true);
    await f.source.kernel.execute(sql`UPDATE secrets_vault SET sealed_ciphertext='broken' WHERE id='vendor'`);
    const mixed = await f.copy.copy({ ...input, ids: ["vendor", "media"], overwrite: true });
    assert.deepEqual(mixed.map(row => row.status), ["failed", "copied"]);
    assert.equal(mixed[0].reasonCode, "copy-failed");
    assert.equal(f.handles.opened, f.handles.closed);
  } finally { await f.close(); }
});

test("excluded kinds are hidden and refused, including explicit personal/MCP IDs", async () => {
  const f = await fixture();
  try {
    for (const kind of ["personal-execution", "mcp-env", "mcp-auth"] as const) await save(f.source, kind);
    assert.deepEqual((await f.copy.list({}))[0].keys, []);
    const result = await f.copy.copy({ actorId: "owner", sourceSiteId: "source", ids: ["personal-execution", "mcp-env", "mcp-auth"], overwrite: true });
    assert.ok(result.every(row => row.status === "skipped"));
    assert.deepEqual(result.map(row => row.reasonCode), ["kind-not-copyable", "requires-mcp-configuration", "requires-mcp-configuration"]);
    assert.deepEqual(await f.target.kernel.query(sql`SELECT id FROM secrets_vault`), []);
  } finally { await f.close(); }
});

for (const missing of [true, false]) test(`${missing ? "absent vault" : "legacy-marked rows"}: exact upgrade message, action hint, no writes and closed handle`, async () => {
  const f = await fixture();
  try {
    if (missing) await f.source.kernel.execute(sql`DROP TABLE secrets_vault`);
    else {
      await save(f.source, "custom");
      await f.source.kernel.execute(sql`UPDATE secrets_vault SET meta='{"legacyAad":null}'`);
    }
    const before = fs.readFileSync(f.source.dbPath);
    const message = "Start source once in Tovu to upgrade it, then copy.";
    assert.deepEqual((await f.copy.list({}))[0], { siteId: "source", name: "source", keys: [],
      reasonCode: "source-needs-upgrade", message, actionHint: { action: "start-site", siteId: "source", desktopSiteId: f.source.dir } });
    const noDesktop = createLocalCredentialCopy(f.required, { ...f.options, desktopStartAvailable: false });
    assert.equal((await noDesktop.list({}))[0].actionHint, undefined);
    await assert.rejects(f.copy.copy({ actorId: "owner", sourceSiteId: "source", ids: ["custom"], overwrite: false }),
      (error: unknown) => error instanceof LocalCredentialCopyError && error.reasonCode === "source-needs-upgrade" && error.message === message);
    assert.deepEqual(fs.readFileSync(f.source.dbPath), before);
    assert.equal(f.handles.opened, f.handles.closed);
  } finally { await f.close(); }
});

test("target env key is never a source key; missing, malformed and fingerprint-mismatched keys refuse safely", async () => {
  const f = await fixture();
  const previousKey = process.env.TOVU_SITE_KEY;
  try {
    await save(f.source, "custom");
    process.env.TOVU_SITE_KEY = "22".repeat(32);
    assert.equal((await f.copy.copy({ actorId: "owner", sourceSiteId: "source", ids: ["custom"], overwrite: false }))[0].status, "copied");
    for (const material of [undefined, "invalid", "33".repeat(32)]) {
      if (material === undefined) fs.rmSync(f.source.keyPath); else fs.writeFileSync(f.source.keyPath, material);
      assert.equal((await f.copy.list({}))[0].reasonCode, "source-key-unavailable");
      await assert.rejects(f.copy.copy({ actorId: "owner", sourceSiteId: "source", ids: ["custom"], overwrite: true }), { reasonCode: "source-key-unavailable" });
    }
    assert.equal(f.handles.opened, f.handles.closed);
    assert.ok(!JSON.stringify(f.logs).includes(process.env.TOVU_SITE_KEY));
  } finally {
    if (previousKey === undefined) delete process.env.TOVU_SITE_KEY; else process.env.TOVU_SITE_KEY = previousKey;
    await f.close();
  }
});

test("registry discovery excludes serving, missing, trash and copied identities; submitted paths never open", async () => {
  const f = await fixture();
  try {
    const trash = path.join(f.home, "site-trash", "old");
    fs.mkdirSync(trash, { recursive: true });
    fs.writeFileSync(path.join(trash, ".site-meta.json"), '{"siteId":"trash"}');
    f.workspace.registry({}).merge({ entries: [
      { id: "trash", name: "trash", path: trash, createdBy: "test", lastOpened: null },
      { id: "missing", name: "missing", path: path.join(f.home, "missing"), createdBy: "test", lastOpened: null },
    ] });
    assert.deepEqual((await f.copy.list({})).map(row => row.siteId), ["source"]);
    const copiedDir = path.join(f.home, "copied");
    fs.mkdirSync(copiedDir);
    fs.copyFileSync(path.join(f.source.dir, ".site-meta.json"), path.join(copiedDir, ".site-meta.json"));
    f.workspace.registry({}).merge({ entries: [{ id: "wrong-id", name: "copied", path: copiedDir, createdBy: "test", lastOpened: null }] });
    assert.deepEqual(await f.copy.list({}), []);
    await assert.rejects(f.copy.copy({ actorId: "owner", sourceSiteId: f.source.dir, ids: ["custom"], overwrite: false }), { reasonCode: "source-unavailable" });
    assert.equal(f.handles.opened, f.handles.closed);
  } finally { await f.close(); }
});

test("GET/POST require owner session, system.write, instance permission and local capability before source I/O", async () => {
  const f = await fixture();
  try {
    await save(f.source, "custom");
    type Deps = Parameters<typeof registerAdminCredentialCopyRoutes>[0]["deps"];
    type Handler = (req: Request, res: Response) => Promise<void>;
    const handlers = new Map<string, Handler>();
    const app = { get: (_path: string, handler: Handler) => handlers.set("GET", handler),
      post: (_path: string, handler: Handler) => handlers.set("POST", handler) } as unknown as Express;
    let permitted = true;
    let instanceAllowed = true;
    const permissions: string[] = [];
    const deps = { workspaceId: "target", ownerPrincipalId: Promise.resolve("owner"), localCredentialCopy: f.copy,
      authorize: async ({ permission }: { permission: string }) => { permissions.push(permission); return { allowed: permitted, reason: "test" }; },
      gatedMutations: { gatewayDeps: { authorizeInstance: async () => ({ allowed: instanceAllowed, reason: "test" }) } },
    } as unknown as Deps;
    registerAdminCredentialCopyRoutes({ app, deps });
    const request = async (method: string, options: { actor?: string; credential?: string; remote?: string; origin?: string; body?: unknown; workspaceId?: string; forwarded?: string } = {}) => {
      let status = 200;
      let body: unknown;
      const headers: Record<string, string> = { host: "127.0.0.1:4242", origin: options.origin ?? "http://127.0.0.1:4242" };
      if (options.forwarded) headers["x-forwarded-host"] = options.forwarded;
      const req = { params: { workspaceId: options.workspaceId ?? "target" }, body: options.body,
        socket: { localAddress: "127.0.0.1", remoteAddress: options.remote ?? "127.0.0.1" }, protocol: "http", headers,
        get: (name: string) => headers[name],
      } as unknown as Request;
      const response = { locals: { principal: { id: options.actor ?? "owner" }, authCredentialKind: options.credential ?? "session" },
        setHeader: () => {}, status: (code: number) => { status = code; return response; }, json: (value: unknown) => { body = value; return response; },
      } as unknown as Response;
      await handlers.get(method)!(req, response);
      return { status, body };
    };
    const submission = { sourceSiteId: "source", ids: ["custom"], overwrite: false };
    for (const method of ["GET", "POST"]) {
      for (const options of [{ credential: "api_key" }, { credential: "publish_key" }, { actor: "editor" },
        { remote: "192.0.2.1" }, { origin: "https://hostile.example" }, { forwarded: "remote.example" }]) {
        assert.equal((await request(method, { ...options, body: submission })).status, 403);
      }
      permitted = false;
      assert.equal((await request(method, { body: submission })).status, 403);
      permitted = true; instanceAllowed = false;
      assert.equal((await request(method, { body: submission })).status, 403);
      instanceAllowed = true;
    }
    assert.equal(f.handles.opened, 0);
    deps.localCredentialCopy = createLocalCredentialCopy(f.required, { ...f.options, localHost: false });
    assert.equal((await request("GET")).status, 403);
    deps.localCredentialCopy = f.copy;
    assert.equal((await request("GET", { workspaceId: "other" })).status, 404);
    for (const body of [{ ...submission, overwrite: "yes" }, { ...submission, ids: [] }, { ...submission, ids: Array(101).fill("custom") },
      { ...submission, sourceSiteId: "../source" }, { ...submission, extra: token }]) {
      assert.equal((await request("POST", { body })).status, 400);
    }
    assert.equal(f.handles.opened, 0);
    const inventory = await request("GET");
    const result = await request("POST", { body: submission });
    assert.equal(inventory.status, 200); assert.equal(result.status, 200);
    assert.deepEqual((result.body as { results: unknown[] }).results, [{ kind: "vendor", id: "custom", status: "copied", last4: "7890" }]);
    assert.ok(!JSON.stringify({ inventory, result, logs: f.logs }).includes(token));
    assert.ok(permissions.every(permission => permission === "system.write"));
    assert.equal(f.handles.opened, f.handles.closed);
  } finally { await f.close(); }
});

test("a source database linked to the target is an ambiguous identity and never opens", async () => {
  const f = await fixture();
  try {
    fs.renameSync(f.source.dbPath, `${f.source.dbPath}.original`);
    fs.symlinkSync(f.target.dbPath, f.source.dbPath);
    assert.deepEqual(await f.copy.list({}), []);
    assert.equal(f.handles.opened, 0);
    await assert.rejects(f.copy.copy({ actorId: "owner", sourceSiteId: "source", ids: ["custom"], overwrite: true }), { reasonCode: "source-unavailable" });
    assert.ok(!JSON.stringify(f.logs).includes(f.home));
  } finally { await f.close(); }
});

test("pre-unification source without a legacy marker needs upgrade before metadata or secret access", async () => {
  const f = await fixture();
  try {
    await save(f.source, "custom");
    await f.source.kernel.execute(sql`UPDATE secrets_vault SET kind='custom',meta='{"category":"general"}'`);
    const before = fs.readFileSync(f.source.dbPath);
    const choice = (await f.copy.list({}))[0]!;
    assert.equal(choice.reasonCode, "source-needs-upgrade");
    assert.equal(choice.actionHint?.action, "start-site");
    assert.deepEqual(choice.keys, []);
    await assert.rejects(f.copy.copy({ actorId: "owner", sourceSiteId: "source", ids: ["custom"], overwrite: false }), { reasonCode: "source-needs-upgrade" });
    assert.deepEqual(fs.readFileSync(f.source.dbPath), before);
  } finally { await f.close(); }
});
