import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import type { spawn } from "node:child_process";
import { buildAdmin, journeyAdminBundle } from "../../local-admin-bundle.js";

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


test("admin build redacts both streams and preserves failure code and signal", async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let output = "";
  for (const stream of [stdout, stderr]) stream.on("data", bytes => { output += bytes.toString(); });
  const spawnBuild = (() => child) as unknown as typeof spawn;
  const build = buildAdmin({ repoRoot: "/repo", output: "/tmp/admin", env: {} }, { spawnBuild, stdout, stderr });
  const rejected = assert.rejects(build, /code 7, signal SIGABRT/);
  const secret = ["sk", "-", "x".repeat(40)].join("");
  const homePath = path.join(os.homedir(), "private/build.ts");
  for (const stream of [child.stdout, child.stderr]) {
    stream.write(`build failed ${secret.slice(0, 4)}`);
    stream.end(`${secret.slice(4)} ${homePath}`);
  }
  await Promise.all([once(child.stdout, "end"), once(child.stderr, "end")]);
  child.emit("close", 7, "SIGABRT");
  await rejected;
  assert.match(output, /build failed/);
  assert.ok(!output.includes(secret));
  assert.ok(!output.includes(homePath));
  assert.ok(output.length < 4_100);
});
