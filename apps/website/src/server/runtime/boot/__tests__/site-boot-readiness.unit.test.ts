import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { awaitSiteBootReadiness, SITE_BOOT_READINESS_KEYS } from "../site-boot-readiness.js";

/**
 * @file The boot-readiness list both top-level boot paths (`index.ts`, `cli/commands/serve.ts`)
 * await before spawning the agent daemon used to be hand-copied into each. A key added to one copy
 * and not the other reopens the first-boot seeding race the list exists to close (see
 * `site-boot-readiness.ts`'s header), so it now lives in one module both call.
 */

type ReadinessDeps = Parameters<typeof awaitSiteBootReadiness>[0]["deps"];

function deferredDeps(): { deps: ReadinessDeps; resolveAll: () => void; reject: (key: (typeof SITE_BOOT_READINESS_KEYS)[number], error: Error) => void } {
  const resolvers = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const deps = Object.fromEntries(
    SITE_BOOT_READINESS_KEYS.map((key) => [key, new Promise<void>((resolve, reject) => resolvers.set(key, { resolve, reject }))]),
  ) as unknown as ReadinessDeps;
  return {
    deps,
    resolveAll: () => resolvers.forEach(({ resolve }) => resolve()),
    reject: (key, error) => resolvers.get(key)!.reject(error),
  };
}

test("the readiness list is exactly the boot-time seeders both entrypoints awaited before the extraction", () => {
  assert.deepEqual([...SITE_BOOT_READINESS_KEYS], [
    "identityReady",
    "settingsReady",
    "seoReady",
    "commentsReady",
    "commentsSettingsReady",
    "executionSettingsReady",
    "settingsUiTabsReady",
    "analyticsSettingsReady",
    "siteTitleReady",
  ]);
});

test("awaitSiteBootReadiness settles only after every listed promise has resolved", async () => {
  const { deps, resolveAll } = deferredDeps();
  let settled = false;
  const pending = awaitSiteBootReadiness({ deps }).then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  resolveAll();
  await pending;
  assert.equal(settled, true);
});

test("awaitSiteBootReadiness rejects with the first rejection so the caller can decline to spawn", async () => {
  const { deps, reject } = deferredDeps();
  const boom = new Error("UNIQUE constraint failed");
  reject("executionSettingsReady", boom);
  await assert.rejects(awaitSiteBootReadiness({ deps }), (error) => error === boom);
});

test("both top-level boot paths await the shared list instead of an inline copy", () => {
  const src = path.resolve(import.meta.dirname, "../../../..");
  for (const file of ["index.ts", "cli/commands/serve.ts"]) {
    const source = fs.readFileSync(path.join(src, file), "utf8");
    assert.ok(source.includes("awaitSiteBootReadiness({ deps })"), `${file} must await awaitSiteBootReadiness({ deps })`);
    assert.ok(!/Promise\.all\(\[\s*deps\.identityReady/.test(source), `${file} still carries an inline readiness Promise.all copy`);
  }
});
