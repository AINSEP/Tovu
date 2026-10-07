import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JourneySiteCleanupReporter from "../support/journey-site-cleanup-reporter.js";
import type { IsolatedJourneySite } from "../support/isolated-journey-site.js";

test("after server teardown, the reporter deletes and proves deletion of its isolated SQLite site", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "tovu-journeys-cleanup-test-"));
  t.after(() => rm(runtimeDir, { recursive: true, force: true }));
  const siteDir = path.join(runtimeDir, "sites", "journey-site");
  await mkdir(siteDir, { recursive: true });
  await writeFile(path.join(siteDir, "content.db"), "fixture database");
  await writeFile(path.join(runtimeDir, "storage-state.json"), "fixture session");
  const site = { ownerPid: process.pid, runtimeDir, siteDir } as IsolatedJourneySite;
  assert.equal(await new JourneySiteCleanupReporter({ site }).onEnd(), undefined);
  await assert.rejects(access(siteDir), { code: "ENOENT" });
  await assert.rejects(access(runtimeDir), { code: "ENOENT" });
});

test("the reporter deletes read-only installed package directories inside the site", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "tovu-journeys-cleanup-test-"));
  const siteDir = path.join(runtimeDir, "sites", "journey-site");
  const packageDir = path.join(siteDir, "agent-plugins", "package", "sha256", "abc");
  t.after(async () => {
    await chmod(packageDir, 0o755).catch(() => undefined);
    await rm(runtimeDir, { recursive: true, force: true });
  });
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, "mcp.json"), "{}");
  await chmod(path.join(packageDir, "mcp.json"), 0o444);
  await chmod(packageDir, 0o555);
  const site = { ownerPid: process.pid, runtimeDir, siteDir } as IsolatedJourneySite;
  assert.equal(await new JourneySiteCleanupReporter({ site }).onEnd(), undefined);
  await assert.rejects(access(runtimeDir), { code: "ENOENT" });
});
