import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { createRouteDeps } from "#src/server/app";
import { readDockerfileSource, writeDockerfileSource } from "../../dockerfile";
import { InMemoryDeploymentsReadRepo } from "../../repo.memory";
import { buildDeploymentsRegistrations, type DeploymentsToolDeps } from "../../tool-registrations";

/**
 * @file The Deployments domain's agent tools — the assistant's own path to triggering/polling a
 * static export, reading the deployments read-model, and reading/writing the repo-root Dockerfile.
 *
 * "Integration" (mirrors `features/plugin-runtime/__tests__/integration/activation.integration.test.ts`'s
 * precedent for this naming) because `DeploymentsToolDeps` cannot be a small hand-built fixture the
 * way `features/pages/__tests__/tool-registrations.test.ts`'s harness is: `deployment_trigger_export`
 * needs the full composition-root deps bag `exportSite` boots a real in-process app from (see
 * `tool-registrations.ts`'s own file header for why), so every test here starts from the real
 * `createRouteDeps()` hermetic fixture `server/app.ts`'s own route tests already use, overriding only
 * `authorize`/`deploymentsReadRepo` where a test needs to.
 *
 * `TOVU_EXPORT_DIR` is pointed at a throwaway temp directory for this whole file (module-level, not
 * per-test), mirroring `export-site-route.test.ts` exactly — this suite really runs `exportSite` and
 * must not write into the checked-out repo's own `infra/export`.
 *
 * The Dockerfile round-trip tests write to the SAME real repo-root `Dockerfile` the HTTP route tests
 * do (there is no path input to redirect them elsewhere, by design — see `dockerfile.ts`'s header).
 * Each captures the real before-state via `readDockerfileSource()` and restores it in `t.after()`.
 *
 * `getExportRunSnapshot()`'s `currentRun` (`export-run.ts`) is a process-local singleton shared by
 * every test in THIS file — the "idle" test is declared before the "trigger" test so its precondition
 * (no run has started yet in this process) holds, the same ordering discipline
 * `export-site-route.test.ts` already documents for its own file.
 */

const exportOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-deployments-tools-test-"));
process.env.TOVU_EXPORT_DIR = exportOutputDir;

function ctx(input: unknown) {
  return { principal: { id: "admin-1", kind: "user" as const }, signal: new AbortController().signal, input };
}

/** The real hermetic fixture, with `authorize` overridden to grant everything — the same division
 *  of labor `features/pages/__tests__/tool-registrations.test.ts`'s harness comment states: real
 *  authorize()/403 behavior is exercised by each wrapped route's own HTTP test
 *  (`export-site-route.test.ts`, `dockerfile-source-route.test.ts`, `deployments-list-route.test.ts`);
 *  these assertions are about the tools' own wrapping. */
function grantingDeps(): DeploymentsToolDeps {
  return { ...createRouteDeps(), authorize: async () => ({ allowed: true }) };
}

test("all 5 deployments tools are registered with input schemas the model needs", () => {
  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const ids = registrations.map((r) => r.descriptor.id).sort();
  assert.deepEqual(ids, [
    "deployment_get_dockerfile",
    "deployment_get_export_status",
    "deployment_list",
    "deployment_set_dockerfile",
    "deployment_trigger_export",
  ]);
  for (const entry of registrations) {
    assert.ok(entry.descriptor.inputSchema, `${entry.descriptor.id} must publish an input schema`);
  }
});

test("deployment_list returns this workspace's rows from the deployments read-model, scoped to it", async () => {
  const base = grantingDeps();
  const repo = new InMemoryDeploymentsReadRepo({
    environments: [
      { workspaceId: base.workspaceId, id: "env-1", name: "production", slug: "production", isProduction: true, createdAtIso: "2026-08-01T00:00:00.000Z", version: 1 },
      { workspaceId: "some-other-workspace", id: "env-2", name: "not-mine", slug: "not-mine", isProduction: false, createdAtIso: "2026-08-01T00:00:00.000Z", version: 1 },
    ],
  });
  const deps: DeploymentsToolDeps = { ...base, deploymentsReadRepo: repo };
  const registrations = buildDeploymentsRegistrations(deps);
  const tool = registrations.find((r) => r.descriptor.id === "deployment_list")!;

  const result = (await tool.handler(ctx(undefined) as never)) as {
    environments: { id: string }[];
    targets: unknown[];
    releases: unknown[];
    runs: unknown[];
  };
  assert.deepEqual(
    result.environments.map((e) => e.id),
    ["env-1"],
    "only this workspace's environment, never the other workspace's row"
  );
  assert.deepEqual(result.targets, []);
  assert.deepEqual(result.releases, []);
  assert.deepEqual(result.runs, []);
});

test("deployment_set_dockerfile refuses when the caller lacks system.write, and never touches the file", async (t) => {
  const before = readDockerfileSource();
  t.after(() => {
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const deps: DeploymentsToolDeps = { ...createRouteDeps(), authorize: async () => ({ allowed: false, reason: "no grant" }) };
  const registrations = buildDeploymentsRegistrations(deps);
  const tool = registrations.find((r) => r.descriptor.id === "deployment_set_dockerfile")!;

  await assert.rejects(tool.handler(ctx({ contents: "FROM node:20\n" }) as never), /not authorized for 'system\.write'/);
  assert.deepEqual(readDockerfileSource(), before, "a refused call must never touch the file");
});

test("deployment_get_dockerfile / deployment_set_dockerfile round-trip the repo-root Dockerfile", async (t) => {
  const before = readDockerfileSource();
  t.after(() => {
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const byId = new Map(registrations.map((r) => [r.descriptor.id, r]));

  const newContents = `# tool-written ${Date.now()}\nFROM node:20-slim\n`;
  const writeResult = await byId.get("deployment_set_dockerfile")!.handler(ctx({ contents: newContents }) as never);
  assert.deepEqual(writeResult, { exists: true, contents: newContents });

  const readResult = await byId.get("deployment_get_dockerfile")!.handler(ctx(undefined) as never);
  assert.deepEqual(readResult, { exists: true, contents: newContents }, "a read right after a write must observe it, not stale bytes");
});

test("deployment_get_export_status reports idle before any trigger in this process", async () => {
  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const tool = registrations.find((r) => r.descriptor.id === "deployment_get_export_status")!;

  const result = await tool.handler(ctx(undefined) as never);
  assert.deepEqual(result, { status: "idle", startedAtIso: null, finishedAtIso: null, outputDir: null });
});

test("deployment_trigger_export starts a real run, a concurrent second call is refused, and status settles to completed", async (t) => {
  t.after(() => rmSync(exportOutputDir, { recursive: true, force: true }));

  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const byId = new Map(registrations.map((r) => [r.descriptor.id, r]));
  const trigger = byId.get("deployment_trigger_export")!;
  const status = byId.get("deployment_get_export_status")!;

  const first = (await trigger.handler(ctx({}) as never)) as { status: string; outputDir: string | null; finishedAtIso: string | null };
  assert.equal(first.status, "running");
  assert.equal(first.outputDir, exportOutputDir);
  assert.equal(first.finishedAtIso, null);

  // Fired immediately, no delay — mirrors `export-site-route.test.ts`'s identical concurrency
  // assertion: a tool call and (if this ran through the SAME process as the HTTP route) a
  // concurrent trigger must never both observe "not running".
  await assert.rejects(trigger.handler(ctx({}) as never), /an export is already running/);

  let final: { status: string; ok?: boolean; counts?: { routesSucceeded: number; routesFailed: number } } = { status: "running" };
  for (let attempt = 0; attempt < 100 && final.status === "running"; attempt++) {
    await delay(50);
    final = (await status.handler(ctx(undefined) as never)) as typeof final;
  }
  assert.equal(final.status, "completed", `export did not settle in time: ${JSON.stringify(final)}`);
  assert.equal(final.ok, true);
  assert.ok(final.counts && final.counts.routesSucceeded > 0, "the hermetic fixture's own routes must have actually exported");
  assert.equal(final.counts?.routesFailed, 0);
});
