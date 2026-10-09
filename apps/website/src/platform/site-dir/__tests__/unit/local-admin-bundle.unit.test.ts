import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { journeyAdminBundle } from "../../local-admin-bundle.js";

test("journey and local boot share one origin-neutral production bundle with failed-build recovery", async (t) => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-bundle-"));
  t.after(() => fs.rmSync(runtimeDir, { recursive: true, force: true }));
  let calls = 0;
  const required = { runtimeDir, repoRoot: "/repo" };
  await assert.rejects(journeyAdminBundle(required, { build: async () => { throw new Error("build failed"); } }), /build failed/);
  const build = async ({ env }: { env: NodeJS.ProcessEnv }) => {
    calls++; assert.equal(env.VITE_TOVU_SITE_URL, undefined); assert.equal(env.NODE_ENV, "production");
  };
  const options = { env: { VITE_TOVU_SITE_URL: "https://localhost:3000", NODE_ENV: "development" }, build };
  const outputs = await Promise.all([journeyAdminBundle(required, options), journeyAdminBundle(required, options)]);
  assert.deepEqual(outputs, [path.join(runtimeDir, "admin-build/dist"), path.join(runtimeDir, "admin-build/dist")]);
  assert.equal(calls, 1);
});
