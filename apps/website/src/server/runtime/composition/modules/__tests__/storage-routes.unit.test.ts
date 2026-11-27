import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { createCleanupPreviewStore, type RetentionPassResult } from "@jini-ai/platform/retention";
import { adminSameOriginWrites, mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { SiteStorageReport } from "#src/features/storage/measure";
import { STORAGE_ROUTE_PATHS, mountStorageRoutes, passView, servingStoragePaths, storageOwnerFrom, storageToolPorts, type SiteStoragePort } from "../storage-routes.js";

const OWNER = "owner-1";

function fakeReport(): SiteStorageReport {
  const amount = { bytes: 10, knownBytes: 10, files: 1 };
  return {
    siteDir: "/secret/site", totalBytes: 10, knownBytes: 10,
    categories: { logs: { ...amount, class: "automatic" } } as unknown as SiteStorageReport["categories"],
    classes: { automatic: amount, yours: amount, "report-only": amount },
    databases: [{ category: "content-database", path: "/secret/site/content.db", mainBytes: 1, walBytes: 0, shmBytes: 0 }],
    skippedSymlinks: ["/secret/site/link"], unknownPaths: ["/secret/site/locked"],
  };
}

/** A recording storage port: every pass answers with the dryRun it was asked for; `plan.bytes` is what a dry run sees. */
function fakeStorage(): SiteStoragePort & { calls: boolean[]; plan: { bytes: number } } {
  const calls: boolean[] = [];
  const plan = { bytes: 5 };
  let tokens = 0;
  const pass = (dryRun: boolean): RetentionPassResult => ({ status: "completed", dryRun, startedAt: 1, finishedAt: 2,
    policies: [{ id: "share-files", kind: "old-copy", status: dryRun ? "measured" : "swept", ...(dryRun ? { measurement: { bytes: plan.bytes, items: 1 } } : { result: { freedBytes: 5, removed: 1 } }) } as never] });
  return {
    calls, plan,
    cleanupPreviews: createCleanupPreviewStore({ randomToken: () => `grant-${++tokens}`, mono: () => 0 }),
    measure: async () => fakeReport(),
    runOnce: async ({ dryRun }) => { calls.push(dryRun); return pass(dryRun); },
    lastPass: () => (calls.length === 0 ? undefined : pass(calls.at(-1)!)),
  };
}

async function harness({ serving = true } = {}) {
  const routeErrors = createRouteIncidentReporter().errors;
  const storage = serving ? fakeStorage() : undefined;
  const app = express();
  app.use(express.json());
  app.use("/api/admin/storage", (req, res, next) => {
    res.locals.principal = { id: String(req.headers["x-test-principal"] ?? OWNER) };
    res.locals.authCredentialKind = String(req.headers["x-test-kind"] ?? "session");
    next();
  });
  mountStorageRoutes({ app, storage, authorizeOwner: storageOwnerFrom({ ownerPrincipalId: async () => OWNER }),
    adminPorts: { errors: routeErrors, mount: mountAdminJsonRoute, deps: { workspaceId: "ws", authorize: (() => ({ ok: true })) as never }, origin: adminSameOriginWrites } }, {});
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: "GET" | "POST", body?: unknown, { principal = OWNER, kind = "session", sameOrigin = true } = {}) => {
    const res = await fetch(`${origin}${method === "GET" ? STORAGE_ROUTE_PATHS.report : STORAGE_ROUTE_PATHS.cleanup}`, {
      method, headers: { "content-type": "application/json", "x-test-principal": principal, "x-test-kind": kind, origin: sameOrigin ? origin : "https://evil.example" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json().catch(() => null) as Record<string, any> | null };
  };
  return { call, storage, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test("cleanup defaults to dryRun", async () => {
  const h = await harness();
  try {
    const answer = await h.call("POST", {});
    assert.equal(answer.status, 200);
    assert.equal(answer.body?.dryRun, true);
    assert.deepEqual(h.storage?.calls, [true]);
    assert.equal((await h.call("POST", { dryRun: "no" })).status, 400, "only a real false runs live");
    assert.deepEqual(h.storage?.calls, [true]);
  } finally { await h.close(); }
});

test("content class refused in plain words", async () => {
  const h = await harness();
  try {
    for (const kind of ["chats", "revisions", "screenshots", "media"]) {
      const answer = await h.call("POST", { dryRun: false, classes: ["old-copy", kind] });
      assert.equal(answer.status, 400);
      assert.equal(answer.body?.code, "PROTECTED_CONTENT");
      assert.match(String(answer.body?.error), /never cleans up your chats, revisions, screenshots or media/);
    }
    assert.equal((await h.call("POST", { classes: ["bogus"] })).body?.code, "INVALID_INPUT");
    assert.deepEqual(h.storage?.calls, [], "no refused request reached the runner");
  } finally { await h.close(); }
});

test("storage routes answer only the site owner's own session (builtin admin and peer credentials refused)", async () => {
  const h = await harness();
  try {
    for (const method of ["GET", "POST"] as const) {
      const builtin = await h.call(method, method === "POST" ? {} : undefined, { principal: "builtin-admin" });
      assert.deepEqual([builtin.status, builtin.body?.code], [403, "OWNER_ONLY"], `${method} builtin admin`);
      const peer = await h.call(method, method === "POST" ? {} : undefined, { kind: "publish-token" });
      assert.deepEqual([peer.status, peer.body?.code], [403, "FORBIDDEN"], `${method} peer credential`);
    }
    assert.equal((await h.call("POST", {}, { sameOrigin: false })).status, 403, "cross-origin write refused");
    assert.deepEqual(h.storage?.calls, []);
    const report = await h.call("GET");
    assert.equal(report.status, 200);
    assert.equal(report.body?.categories.logs.bytes, 10);
    assert.equal(report.body?.unknownLocations, 1);
    assert.equal(report.body?.lastPass, null);
    assert.doesNotMatch(JSON.stringify(report.body), /secret/, "no raw paths on the wire");
  } finally { await h.close(); }
});

test("a live cleanup runs only with the grant its own preview minted, and the report shows the last pass", async () => {
  const h = await harness();
  try {
    const preview = await h.call("POST", {});
    assert.deepEqual([preview.status, preview.body?.dryRun, typeof preview.body?.previewToken], [200, true, "string"]);
    const live = await h.call("POST", { dryRun: false, previewToken: preview.body?.previewToken });
    assert.deepEqual([live.status, live.body?.dryRun], [200, false]);
    assert.deepEqual(h.storage?.calls, [true, true, false], "preview, the plan re-check, then one live pass");
    assert.deepEqual(live.body?.policies[0], { id: "share-files", kind: "old-copy", status: "swept", freedBytes: 5, removed: 1 });
    assert.equal((await h.call("GET")).body?.lastPass?.status, "completed");
  } finally { await h.close(); }
});

test("a live cleanup without a grant is refused and deletes nothing", async () => {
  const h = await harness();
  try {
    for (const body of [{ dryRun: false }, { dryRun: false, previewToken: "made-up" }]) {
      const answer = await h.call("POST", body);
      assert.deepEqual([answer.status, answer.body?.code], [409, "CLEANUP_NOT_APPROVED"]);
    }
    assert.equal((await h.call("POST", { dryRun: false, previewToken: 7 })).status, 400);
    assert.ok(!h.storage?.calls.includes(false));
  } finally { await h.close(); }
});

test("a grant for a different preview is refused", async () => {
  const h = await harness();
  try {
    const preview = await h.call("POST", {});
    h.storage!.plan.bytes = 9;
    const answer = await h.call("POST", { dryRun: false, previewToken: preview.body?.previewToken });
    assert.deepEqual([answer.status, answer.body?.code], [409, "CLEANUP_NOT_APPROVED"]);
    assert.ok(!h.storage?.calls.includes(false));
  } finally { await h.close(); }
});

test("a replayed grant is refused; the live pass runs once", async () => {
  const h = await harness();
  try {
    const { body } = await h.call("POST", {});
    assert.equal((await h.call("POST", { dryRun: false, previewToken: body?.previewToken })).status, 200);
    const replay = await h.call("POST", { dryRun: false, previewToken: body?.previewToken });
    assert.deepEqual([replay.status, replay.body?.code], [409, "CLEANUP_NOT_APPROVED"]);
    assert.equal(h.storage?.calls.filter(dryRun => !dryRun).length, 1);
  } finally { await h.close(); }
});

test("a process that does not serve the site refuses in plain words", async () => {
  const h = await harness({ serving: false });
  try {
    const answer = await h.call("POST", {});
    assert.deepEqual([answer.status, answer.body?.code], [503, "NOT_SERVING"]);
    assert.deepEqual([(await h.call("POST", {}, { principal: "builtin-admin" })).status], [403], "owner check still comes first");
  } finally { await h.close(); }
});

test("a stopped storage pass never claims policy results, and a completed pass projects failed and itemless policies", () => {
  assert.deepEqual(passView({ pass: { status: "stopped", dryRun: false } }), { status: "stopped", dryRun: false });
  assert.deepEqual(passView({ pass: {
    status: "completed", dryRun: true, startedAt: 27, finishedAt: 38,
    policies: [
      { id: "share-cache", kind: "old-copy", status: "failed", message: "Could not measure old copies" },
      { id: "legacy-preview", kind: "old-copy", status: "measured", measurement: { bytes: 83 } },
    ],
  } }), {
    status: "completed", dryRun: true, startedAt: 27, finishedAt: 38,
    policies: [
      { id: "share-cache", kind: "old-copy", status: "failed", message: "Could not measure old copies" },
      { id: "legacy-preview", kind: "old-copy", status: "measured", bytes: 83 },
    ],
  });
});

test("storage tool owner lookup is live and absent serving storage refuses without exposing paths", async () => {
  let owner = "original-owner";
  const tool = storageToolPorts({ storage: undefined, ownerPrincipalId: async () => owner });
  await tool.authorizeOwner({ principalId: "original-owner" });
  owner = "replacement-owner";
  await assert.rejects(tool.authorizeOwner({ principalId: "original-owner" }), {
    message: "Only the site owner can see or clean up this site's storage.",
  });
  await tool.authorizeOwner({ principalId: "replacement-owner" });
  await assert.rejects(tool.measure(), {
    message: "Storage cleanup runs only in the app that is serving this site. Start the site and try again.",
  });
  // `async`: the gate is built per call, so an absent port throws as the awaited call is made.
  await assert.rejects(async () => tool.cleanup.preview({ principalId: "replacement-owner" }), {
    message: "Storage cleanup runs only in the app that is serving this site. Start the site and try again.",
  });
});

test("serving storage paths omit roots and sibling paths, but keep nested database ops and logs", () => {
  const parent = path.resolve("storage-fixtures");
  const siteDir = path.join(parent, "site");
  assert.deepEqual(servingStoragePaths({
    siteDir, contentDbPath: path.join(siteDir, "db", "content.db"),
    mediaUploadsDir: path.join(parent, "site-sibling", "uploads"), themesDir: siteDir,
  }), [
    { category: "content-database", path: path.join(siteDir, "db", "content.db") },
    { category: "screenshots", path: path.join(siteDir, ".captures") },
    { category: "shares", path: path.join(siteDir, "db", "ops", "shares") },
    { category: "logs", path: path.join(siteDir, "ops", "logs") },
  ]);
});
