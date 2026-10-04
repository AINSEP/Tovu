import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryPublishContentPeerRepo } from "#src/features/publish-content/peers";
import { deriveInstallationId } from "#src/features/publish-trust/keys";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { PublishContentRouteDeps } from "#src/server/inbound/admin-http/routes/publish-content/deps";
import { createPublishContentModule } from "../publish-content.js";

/**
 * @file Regression for the 2026-09-19 live blocker: the desktop app's Publish Content dialog
 * reported "No live site is set up yet" for a site that HAD been deployed, because
 * `createPublishContentModule` resolved its committed-config paths (`fly.toml`,
 * `deploy/publish-trust.json`) against the bare process working directory — the repo root for a
 * normal `tovu serve`, but `apps/desktop` for own-server mode (`tovu-server.ts`'s `buildServeEnv`
 * doc). Screenshot: `ADS-memory/.local-artifacts/owner-screenshots-2026-09-19/publish-404.png`
 * (a DIFFERENT, already-resolved bug from the same investigation — this one surfaced once that
 * one's stale process was restarted).
 *
 * This certifies the actual WIRING `createPublishContentModule` builds, at the real HTTP boundary
 * `registerPublishContentDestinationRoutes` answers — not `findCandidateDestination` in isolation
 * (already covered by `publish-zero-setup-end-to-end.test.ts` with an injected `resolvePath`, which
 * proves the primitive works but nothing about what the composed server actually passes it; see
 * that file's own header for why that distinction is this feature's dominant defect class).
 *
 * Both committed config roots and the working directory are temporary fixtures, with distinct
 * candidates/grants, so a cwd-relative resolver cannot accidentally satisfy the checks.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/publish-content/destination`;

/** Minimal-but-real `createPublishContentModule` deps, same shape/looseness
 *  `peers.routes.test.ts` uses for the same reason: registration never reads most of these
 *  synchronously, and the destination route under test needs only `workspaceId`/`authorize`/
 *  `publishContentPeerRepo`. @complexity O(1). */
function buildDeps(): PublishContentRouteDeps {
  const keyring = new InMemoryKeyring();
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowIso: () => "2026-09-19T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    publishContentPeerRepo: new InMemoryPublishContentPeerRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    siteAssistantSecretKeyring: keyring,
    publishContentPeerHttpClient: { send: async () => ({ status: 200, headers: {}, bodyText: "{}" }) },
    workspaceRepo: { findById: async () => ({ id: WORKSPACE_ID, name: "Local Site" }) },
    blobStore: { exists: async () => false, get: async () => new Uint8Array() },
    publishContentBundleRepo: { save: async () => {}, findById: async () => null },
    postRepo: {},
    outbox: {},
    pluginBeforeSaveHook: undefined,
  } as unknown as PublishContentRouteDeps;
}

function buildApp(deps = buildDeps()): express.Express {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  createPublishContentModule(deps).registerRoutes(app);
  return app;
}

test("GET .../destination reads the candidate from TOVU_REPO_ROOT's fly.toml, not the process's cwd", async (t) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "publish-content-repo-root-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "publish-content-cwd-"));
  await writeFile(path.join(cwd, "fly.toml"), '[env]\n TOVU_PUBLIC_URL = "https://wrong-cwd.example"\n');
  await writeFile(path.join(repoRoot, "fly.toml"), 'app = "example"\n\n[env]\n  TOVU_PUBLIC_URL = "https://tovu-repo-root-test.example"\n');

  const previous = process.env.TOVU_REPO_ROOT;
  const previousCwd = process.cwd();
  process.chdir(cwd);
  process.env.TOVU_REPO_ROOT = repoRoot;
  t.after(async () => {
    process.chdir(previousCwd);
    if (previous === undefined) delete process.env.TOVU_REPO_ROOT;
    else process.env.TOVU_REPO_ROOT = previous;
    await rm(repoRoot, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  const server = await startTestServer(buildApp(), t);
  const res = await fetch(`${server}${BASE}`);
  const body = (await res.json()) as { candidateUrl: string | null; message: string };

  assert.equal(res.status, 200);
  assert.equal(
    body.candidateUrl,
    "https://tovu-repo-root-test.example",
    "must read the TOVU_REPO_ROOT-anchored fly.toml, not fall through to a cwd-relative read of the real repo's own fly.toml"
  );
  assert.equal(body.message, "Publish to tovu-repo-root-test.example?");
});

test("GET .../destination falls back to process.cwd() when TOVU_REPO_ROOT is unset — the plain `tovu serve`/production case", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "publish-content-fallback-cwd-"));
  await writeFile(path.join(cwd, "fly.toml"), '[env]\n TOVU_PUBLIC_URL = "https://fallback-cwd.example"\n');
  const previousCwd = process.cwd();
  process.chdir(cwd);
  const previous = process.env.TOVU_REPO_ROOT;
  delete process.env.TOVU_REPO_ROOT;
  t.after(async () => {
    process.chdir(previousCwd);
    if (previous !== undefined) process.env.TOVU_REPO_ROOT = previous;
    await rm(cwd, { recursive: true, force: true });
  });

  const server = await startTestServer(buildApp(), t);
  const res = await fetch(`${server}${BASE}`);
  const body = (await res.json()) as { candidateUrl: string | null };

  assert.equal(body.candidateUrl, "https://fallback-cwd.example");
});

test("POST .../disconnect removes this install's grant from TOVU_REPO_ROOT, leaving the cwd trust file untouched", async (t) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "publish-trust-repo-root-"));
  const cwd = await mkdtemp(path.join(tmpdir(), "publish-trust-cwd-"));
  const previousCwd = process.cwd();
  const previous = process.env.TOVU_REPO_ROOT;
  t.after(async () => {
    process.chdir(previousCwd);
    if (previous === undefined) delete process.env.TOVU_REPO_ROOT;
    else process.env.TOVU_REPO_ROOT = previous;
    await rm(repoRoot, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });
  const deps = buildDeps();
  const sourceInstallationId = await deriveInstallationId({ keyring: deps.siteAssistantSecretKeyring, workspaceId: WORKSPACE_ID });
  const grant = { version: 1, sourceInstallationId, publicKeys: [{ publicKeyB64u: "fixture-public-key", generation: 0 }],
    workspaceId: WORKSPACE_ID, entityTypes: ["post"], capabilities: ["publish_content.apply"], notAfter: "2027-09-19T00:00:00.000Z" };
  const document = JSON.stringify([grant]);
  for (const root of [repoRoot, cwd]) {
    await mkdir(path.join(root, "deploy"));
    await writeFile(path.join(root, "deploy/publish-trust.json"), document);
  }
  process.chdir(cwd);
  process.env.TOVU_REPO_ROOT = repoRoot;
  const server = await startTestServer(buildApp(deps), t);
  const res = await fetch(`${server}${BASE}/disconnect`, { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(await readFile(path.join(repoRoot, "deploy/publish-trust.json"), "utf8")), []);
  assert.equal(await readFile(path.join(cwd, "deploy/publish-trust.json"), "utf8"), document);
});
