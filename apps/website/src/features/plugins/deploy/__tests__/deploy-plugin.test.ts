/**
 * @file SPIKE (probe/deploy-plugin-cloud-sandbox) — tests for the deploy plugin (`../deploy-plugin`).
 *
 * Proves: the plugin declares its table through the core dataModule seam (mirrors
 * `store-plugin.test.ts`), the Vercel path fails gracefully with a typed error when no token is
 * configured (the expected outcome in this environment — see `deploy-plugin.ts`'s file header),
 * shapes a correct request when a token IS present, surfaces non-2xx/transport failures as typed
 * errors rather than throwing, and rejects unimplemented targets without ever calling HTTP.
 *
 * `FakeHttpClient` mirrors `comments/__tests__/spam.external.test.ts`'s local fake — never a real
 * network call.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";
import { activateDeploy, InMemoryDeployTokenKeyring } from "../deploy-plugin.js";

type ScriptedResponse = HttpResponse | (() => HttpResponse);

class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly responses: readonly ScriptedResponse[];
  private cursor = 0;

  constructor(responses: readonly ScriptedResponse[] = [{ status: 200, headers: {}, bodyText: "{}" }]) {
    this.responses = responses;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const entry = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (typeof entry === "function") return entry();
    return entry;
  }
}

function tempDb(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-deploy-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return { db, dbPath, dir };
}

function cleanup(db: Database.Database, dir: string): void {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

test("deploy: activation declares p_deploy__deploys (via the never-brick seam)", async () => {
  const { db, dbPath, dir } = tempDb();
  const http = new FakeHttpClient();
  const tokenPort = new InMemoryDeployTokenKeyring();
  await activateDeploy({ db, dbPath, httpClient: http, tokenPort });

  const tableExists = !!db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='p_deploy__deploys'`)
    .get();
  assert.ok(tableExists, "the plugin-owned table was created by core");

  cleanup(db, dir);
});

test("deploy: vercel fails gracefully with NO_TOKEN_CONFIGURED when no token is set, without calling HTTP", async () => {
  const { db, dbPath, dir } = tempDb();
  const http = new FakeHttpClient();
  const tokenPort = new InMemoryDeployTokenKeyring(); // no token seeded
  const deployApi = await activateDeploy({ db, dbPath, httpClient: http, tokenPort });

  const result = await deployApi.deploy("vercel", { projectId: "proj-1", ref: "main" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "NO_TOKEN_CONFIGURED");
  }
  assert.equal(http.calls.length, 0, "no HTTP call was made without a token");

  const history = deployApi.listHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "failed");
  assert.equal(history[0].target, "vercel");

  cleanup(db, dir);
});

test("deploy: vercel shapes the request correctly (endpoint, bearer auth, body) when a token is present", async () => {
  const { db, dbPath, dir } = tempDb();
  const http = new FakeHttpClient([
    { status: 200, headers: {}, bodyText: JSON.stringify({ id: "dpl_123", url: "proj-1-abc.vercel.app" }) },
  ]);
  const tokenPort = new InMemoryDeployTokenKeyring({ vercel: "test-vercel-token" });
  const deployApi = await activateDeploy({ db, dbPath, httpClient: http, tokenPort });

  const result = await deployApi.deploy("vercel", { projectId: "proj-1", ref: "main", teamId: "team-1" });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.deploymentId, "dpl_123");
    assert.equal(result.deploymentUrl, "https://proj-1-abc.vercel.app");
  }

  assert.equal(http.calls.length, 1);
  const call = http.calls[0];
  assert.equal(call.method, "POST");
  assert.equal(call.url, "https://api.vercel.com/v13/deployments?teamId=team-1");
  assert.equal(call.headers.authorization, "Bearer test-vercel-token");
  assert.equal(call.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(call.body ?? "{}"), { name: "proj-1", project: "proj-1", gitSource: { ref: "main" } });

  const history = deployApi.listHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "triggered");

  cleanup(db, dir);
});

test("deploy: a non-2xx Vercel response becomes a typed PROVIDER_ERROR, not a throw", async () => {
  const { db, dbPath, dir } = tempDb();
  const http = new FakeHttpClient([{ status: 403, headers: {}, bodyText: "Forbidden" }]);
  const tokenPort = new InMemoryDeployTokenKeyring({ vercel: "test-vercel-token" });
  const deployApi = await activateDeploy({ db, dbPath, httpClient: http, tokenPort });

  const result = await deployApi.deploy("vercel", { projectId: "proj-1", ref: "main" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_ERROR");
    assert.equal(result.error.providerStatus, 403);
  }

  cleanup(db, dir);
});

test("deploy: a transport error becomes a typed TRANSPORT_ERROR, not a throw", async () => {
  const { db, dbPath, dir } = tempDb();
  const http = new FakeHttpClient([
    () => {
      throw new Error("egress refused: private address");
    },
  ]);
  const tokenPort = new InMemoryDeployTokenKeyring({ vercel: "test-vercel-token" });
  const deployApi = await activateDeploy({ db, dbPath, httpClient: http, tokenPort });

  const result = await deployApi.deploy("vercel", { projectId: "proj-1", ref: "main" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "TRANSPORT_ERROR");
    assert.match(result.error.message, /egress refused/);
  }

  cleanup(db, dir);
});

test("deploy: an invalid vercel config is rejected before any HTTP call", async () => {
  const { db, dbPath, dir } = tempDb();
  const http = new FakeHttpClient();
  const tokenPort = new InMemoryDeployTokenKeyring({ vercel: "test-vercel-token" });
  const deployApi = await activateDeploy({ db, dbPath, httpClient: http, tokenPort });

  const result = await deployApi.deploy("vercel", { projectId: "" });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "INVALID_CONFIG");
  assert.equal(http.calls.length, 0);

  cleanup(db, dir);
});

test("deploy: an unimplemented target is rejected without calling HTTP", async () => {
  const { db, dbPath, dir } = tempDb();
  const http = new FakeHttpClient();
  const tokenPort = new InMemoryDeployTokenKeyring({ netlify: "some-token" });
  const deployApi = await activateDeploy({ db, dbPath, httpClient: http, tokenPort });

  const result = await deployApi.deploy("netlify", { siteId: "site-1" });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "TARGET_NOT_IMPLEMENTED");
  assert.equal(http.calls.length, 0);

  cleanup(db, dir);
});

test("deploy: EnvDeployTokenKeyring reads the per-target env var", async () => {
  const { EnvDeployTokenKeyring } = await import("../deploy-plugin.js");
  const previous = process.env.TOVU_DEPLOY_TOKEN_VERCEL;
  process.env.TOVU_DEPLOY_TOKEN_VERCEL = "from-env";
  try {
    const port = new EnvDeployTokenKeyring();
    assert.equal(await port.getToken("vercel"), "from-env");
    assert.equal(await port.getToken("netlify"), null);
  } finally {
    if (previous === undefined) delete process.env.TOVU_DEPLOY_TOKEN_VERCEL;
    else process.env.TOVU_DEPLOY_TOKEN_VERCEL = previous;
  }
});
