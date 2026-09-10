import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { ToolInputError } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { readDockerfileSource, writeDockerfileSource } from "../../dockerfile.js";
import { InMemoryDeploymentsReadRepo } from "../../repo.memory.js";
import { buildDeploymentsRegistrations, type DeploymentsToolDeps } from "../../tool-registrations.js";

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
 * `RouteDeps.exportOutputRootDir` is pointed at a throwaway temp directory for this whole file (via
 * {@link grantingDeps}, module-level, not per-test), mirroring `export-site-route.test.ts` exactly
 * — this suite really runs `exportSite` and must not write into the checked-out repo's own
 * `infra/export`.
 *
 * The Dockerfile round-trip tests write to the SAME real repo-root `Dockerfile` the HTTP route tests
 * do (there is no path input to redirect them elsewhere, by design — see `dockerfile.ts`'s header).
 * Each captures the real before-state via `readDockerfileSource()` and restores it in `t.after()`.
 *
 * `getExportRunSnapshot()`'s `currentRun` (`export-run.ts`) is a process-local singleton shared by
 * every test in THIS file — the "idle" test is declared before the "trigger" test so its precondition
 * (no run has started yet in this process) holds, the same ordering discipline
 * `export-site-route.test.ts` already documents for its own file.
 *
 * ## 2026-08-15 — `ifMatch` (Terra audit finding C5)
 *
 * `deployment_set_dockerfile` now requires `ifMatch` in its input, so every test below that expects
 * a successful write reads a real etag from `deployment_get_dockerfile` (or an earlier successful
 * `deployment_set_dockerfile` response) first — never a hand-typed placeholder standing in for one.
 * The refused-authorization test still omits `contents`'s partner-in-shape but now also supplies
 * SOME `ifMatch` string, so the assertion stays pinned to the authorization failure it names, not to
 * the newer shape check (see that test's own comment for why this matters).
 */

const exportOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-deployments-tools-test-"));

function ctx(input: unknown) {
  return { principal: { id: "admin-1", kind: "user" as const }, signal: new AbortController().signal, input };
}

/** The real hermetic fixture, with `authorize` overridden to grant everything — the same division
 *  of labor `features/pages/__tests__/tool-registrations.test.ts`'s harness comment states: real
 *  authorize()/403 behavior is exercised by each wrapped route's own HTTP test
 *  (`export-site-route.test.ts`, `dockerfile-source-route.test.ts`, `deployments-list-route.test.ts`);
 *  these assertions are about the tools' own wrapping. `exportOutputRootDir` is redirected to this
 *  file's own throwaway temp dir — `startExportRun` reads that `RouteDeps` field instead of
 *  `process.env.TOVU_EXPORT_DIR` (export-run.ts no longer reads env vars at all). */
function grantingDeps(): DeploymentsToolDeps {
  return { ...createRouteDeps(), exportOutputRootDir: exportOutputDir, authorize: async () => ({ allowed: true }) };
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

  // `ifMatch` is present (any string — the authorization check runs before this handler ever
  // compares it against disk) purely so this rejection is unambiguously attributable to the
  // authorization denial under test, not to the newer "ifMatch is required" shape check.
  await assert.rejects(
    tool.handler(ctx({ contents: "FROM node:20\n", ifMatch: "\"whatever\"" }) as never),
    /not authorized for 'system\.write'/
  );
  assert.deepEqual(readDockerfileSource(), before, "a refused call must never touch the file");
});

test("deployment_set_dockerfile refuses when 'ifMatch' is missing from input, even for an otherwise-authorized caller, and never touches the file", async (t) => {
  const before = readDockerfileSource();
  t.after(() => {
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const tool = registrations.find((r) => r.descriptor.id === "deployment_set_dockerfile")!;

  await assert.rejects(tool.handler(ctx({ contents: "FROM node:20\n" }) as never), /'ifMatch'/);
  assert.deepEqual(readDockerfileSource(), before, "a shape-rejected call must never touch the file");
});

test("deployment_get_dockerfile / deployment_set_dockerfile round-trip the repo-root Dockerfile with a real etag", async (t) => {
  const before = readDockerfileSource();
  t.after(() => {
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const byId = new Map(registrations.map((r) => [r.descriptor.id, r]));

  const initialRead = (await byId.get("deployment_get_dockerfile")!.handler(ctx(undefined) as never)) as { etag: string };
  assert.match(initialRead.etag, /^("[0-9a-f]{64}"|W\/"missing")$/, "deployment_get_dockerfile must report a real content-hash etag");

  const newContents = `# tool-written ${Date.now()}\nFROM node:20-slim\n`;
  const writeResult = (await byId
    .get("deployment_set_dockerfile")!
    .handler(ctx({ contents: newContents, ifMatch: initialRead.etag }) as never)) as { exists: boolean; contents: string; etag: string };
  assert.equal(writeResult.exists, true);
  assert.equal(writeResult.contents, newContents);
  assert.notEqual(writeResult.etag, initialRead.etag, "a real content change must advance the etag");

  const readResult = await byId.get("deployment_get_dockerfile")!.handler(ctx(undefined) as never);
  assert.deepEqual(
    readResult,
    { exists: true, contents: newContents, etag: writeResult.etag },
    "a read right after a write must observe it, not stale bytes, and must report the SAME etag the write itself just returned"
  );
});

test("deployment_set_dockerfile refuses a stale ifMatch with a message the assistant can act on, and never touches the file — the actual lost-update reproduction", async (t) => {
  const before = readDockerfileSource();
  t.after(() => {
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const byId = new Map(registrations.map((r) => [r.descriptor.id, r]));

  // The assistant reads first, via its own tool, and gets a real etag.
  const initialRead = (await byId.get("deployment_get_dockerfile")!.handler(ctx(undefined) as never)) as { etag: string };

  // A SECOND, independent writer — e.g. the human admin UI's own save, or another agent run — saves
  // a real change to the same real file in between. Reproduced with a real second `writeFileSync`
  // (via the domain function the HTTP route itself calls), not a hand-crafted mismatched string.
  const concurrentContents = `# concurrent human edit ${Date.now()}\nFROM node:22\n`;
  writeDockerfileSource(concurrentContents);

  // The assistant now tries to save its own edit, still carrying the etag from before the
  // concurrent write.
  const staleAttemptContents = `# assistant's stale attempt (should be rejected) ${Date.now()}\nFROM node:18\n`;
  await assert.rejects(
    byId.get("deployment_set_dockerfile")!.handler(ctx({ contents: staleAttemptContents, ifMatch: initialRead.etag }) as never),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      // `ToolInputError`, not a bare `Error` (500-redact defect, RED->GREEN): `@jini-ai/daemon`'s
      // `ToolExecutor` only tags a rejection `errorKind: 'validation'` (-> 400 with this message
      // intact) when it is `instanceof ToolInputError`; anything else is 'internal' and
      // `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` SEC-005-redacts it into a message-stripped
      // 500 — which would have stripped the exact recovery instructions this test asserts below.
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      // The message is the model's ENTIRE channel for what to do next (see the handler's own
      // comment) — pin that it actually names the recovery path, not just that a rejection occurred.
      assert.match(err.message, /deployment_get_dockerfile/, "must point the assistant back at re-reading");
      assert.match(err.message, new RegExp(concurrentContents.split("\n")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "must surface the CURRENT contents so the assistant can reconcile in the same turn");
      return true;
    }
  );

  // The core property under test: the assistant's stale write must never have landed.
  const after = readDockerfileSource();
  assert.equal(after.contents, concurrentContents, "a rejected stale write must not overwrite the concurrent writer's real save — this is the lost-update bug itself");
  assert.notEqual(after.contents, staleAttemptContents);
});

test("deployment_get_export_status reports idle before any trigger in this process", async () => {
  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const tool = registrations.find((r) => r.descriptor.id === "deployment_get_export_status")!;

  const result = await tool.handler(ctx(undefined) as never);
  assert.deepEqual(result, { status: "idle", startedAtIso: null, finishedAtIso: null, outputDir: null });
});

test("RouteDeps.exportSiteBound ignores a caller-forwarded 'routeDeps' key and always exports with its own closed-over RouteDeps — regression for the composition-root spread-ordering bug", async (t) => {
  // Not a `deployment_trigger_export` handler call — it targets `exportSiteBound` directly, one
  // level below the tool wiring, because that is where the actual bug class lives (see
  // `DeploymentsToolDeps`'s own doc in `../../tool-registrations.js`). Placed in this file anyway
  // (not a new test file) because this is `deployment_trigger_export`'s own dependency and this
  // suite already has the exact hermetic `createRouteDeps()` harness a real `exportSite` pass needs.
  const outputDir = mkdtempSync(path.join(tmpdir(), "tovu-export-site-bound-ordering-test-"));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const deps = createRouteDeps();

  // Simulates the exact shape a naive caller could forward: `ExportEngine<T>`'s own options object
  // (`export-run.ts`) ALWAYS carries a `routeDeps` field — a caller who forwards that whole bag
  // straight into `exportSiteBound` instead of destructuring `{outputDir, clean, basePath}`
  // explicitly (the way `deployment_trigger_export`'s own handler does) would carry an extra
  // `routeDeps` key that `exportSiteBound`'s own type declares no parameter for, so `tsc` would not
  // catch it (excess properties on a non-literal argument pass silently). Built as a `const` rather
  // than an inline literal for the same reason — passing it as a fresh literal argument WOULD trip
  // excess-property checking and defeat the point of this test.
  const bogusRouteDepsMarker = { bogus: "not-a-real-RouteDeps" };
  const maliciousOptions = { outputDir, clean: true, routeDeps: bogusRouteDepsMarker };

  // If the composition root's binding ever regresses to `{ routeDeps, ...opts }` (closed-over value
  // FIRST, so a caller-supplied one wins on spread), `maliciousOptions.routeDeps` overwrites the
  // real one and the real `exportSite` receives a bare `{bogus: ...}` object in place of `RouteDeps`
  // — which satisfies none of the ~50 fields `createApp`/every route needs, so the run rejects
  // instead of completing. With the fix (`{ ...opts, routeDeps }`, closed-over value LAST), the
  // bogus key is simply overwritten back to the real `RouteDeps` and the export succeeds normally.
  const report = await deps.exportSiteBound(maliciousOptions);
  assert.equal(report.routes.failed.length, 0, "the real, closed-over RouteDeps must be what exportSite actually uses — a forwarded 'routeDeps' key must never win");
  assert.ok(report.routes.succeeded.length > 0, "the hermetic fixture's own routes must have actually exported using the real RouteDeps, not the bogus forwarded one");
});

test("deployment_trigger_export: a non-object input is a ToolInputError (400), not a bare Error (redacted 500)", async () => {
  // Runs before any real export starts (no state touched — the check is this handler's very first
  // line), so it is safe regardless of this file's own process-local `getExportRunSnapshot()`
  // ordering discipline documented in the file header.
  const registrations = buildDeploymentsRegistrations(grantingDeps());
  const trigger = registrations.find((r) => r.descriptor.id === "deployment_trigger_export")!;

  await assert.rejects(
    trigger.handler(ctx("not-an-object") as never),
    (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}`);
      assert.match((err as Error).message, /input must be an object/);
      return true;
    },
  );
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
