import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryPublishContentPeerRepo } from "#src/features/publish-content/peers";
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
 * No `process.chdir()`: the test process's own cwd IS the repo root, which already carries a real
 * `fly.toml` (`TOVU_PUBLIC_URL = "https://tovu.fly.dev"`) — the exact same fixture the old,
 * cwd-relative code would have found. That coincidence is used deliberately as the adversarial
 * check: the fake candidate below is a URL that does NOT appear in the real repo-root `fly.toml`,
 * so a resolver that silently fell back to `process.cwd()` instead of honoring `TOVU_REPO_ROOT`
 * would find the WRONG (real) config and fail this assertion, not merely return `null`.
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

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  createPublishContentModule(buildDeps()).registerRoutes(app);
  return app;
}

test("GET .../destination reads the candidate from TOVU_REPO_ROOT's fly.toml, not the process's cwd", async (t) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "publish-content-repo-root-"));
  await writeFile(path.join(repoRoot, "fly.toml"), 'app = "example"\n\n[env]\n  TOVU_PUBLIC_URL = "https://tovu-repo-root-test.example"\n');

  const previous = process.env.TOVU_REPO_ROOT;
  process.env.TOVU_REPO_ROOT = repoRoot;
  t.after(() => {
    if (previous === undefined) delete process.env.TOVU_REPO_ROOT;
    else process.env.TOVU_REPO_ROOT = previous;
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
  const previous = process.env.TOVU_REPO_ROOT;
  delete process.env.TOVU_REPO_ROOT;
  t.after(() => {
    if (previous !== undefined) process.env.TOVU_REPO_ROOT = previous;
  });

  const server = await startTestServer(buildApp(), t);
  const res = await fetch(`${server}${BASE}`);
  const body = (await res.json()) as { candidateUrl: string | null };

  // The test process's own cwd is this repo's root, which carries a real, committed `fly.toml`.
  assert.equal(body.candidateUrl, "https://tovu.fly.dev");
});
