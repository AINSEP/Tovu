import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssistantDaemonRegistry,
  readPreviousAssistantDaemon,
  resolveAssistantDaemonRegistryPath,
} from "../assistant-daemon-registry.js";

/** Both production callers use these adapters. Exercise their ports, so a change to either
 * caller's path precedence fails without touching the filesystem or starting a process. */
for (const scenario of [
  { name: "binding directory", env: {}, expected: "/binding/site/ops/assistant-daemon.json" },
  { name: "TOVU_SITE_DIR differs from binding directory", env: { TOVU_SITE_DIR: "/operator/site" }, expected: "/operator/site/ops/assistant-daemon.json" },
]) {
  test(`registry discovery and publication share the same path when ${scenario.name}`, async () => {
    const paths: string[] = [];
    const registry = { readLive: async () => null, write: async () => {}, removeIfCurrent: async () => {} };
    const required = { siteDir: "/binding/site" };
    const publication = createAssistantDaemonRegistry(required, {
      env: scenario.env,
      createRegistry: ({ registryPath }) => { paths.push(registryPath); return registry; },
    });
    assert.equal(await readPreviousAssistantDaemon(required, {
      env: scenario.env,
      readRegistry: async ({ registryPath }) => { paths.push(registryPath); return null; },
    }), null);
    assert.equal(resolveAssistantDaemonRegistryPath(required, { env: scenario.env }), scenario.expected);
    assert.equal(publication.registryPath, scenario.expected);
    assert.equal(publication.registry, registry);
    assert.deepEqual(paths, [scenario.expected, scenario.expected]);
  });
}

/** Production callers pass no ports: the defaults must read the live sidecar registry file and
 * resolve the path from the real process environment. A missing registry file reads as "no
 * previous daemon" rather than throwing. */
test("default ports read the real registry file and fall back to process.env", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "assistant-daemon-registry-"));
  try {
    const required = { siteDir: dir };
    const expected = join(process.env.TOVU_SITE_DIR ?? dir, "ops", "assistant-daemon.json");
    assert.equal(resolveAssistantDaemonRegistryPath(required), expected);
    assert.equal(await readPreviousAssistantDaemon(required, { env: {} }), null);
    const publication = createAssistantDaemonRegistry(required, { env: {} });
    assert.equal(publication.registryPath, join(dir, "ops", "assistant-daemon.json"));
    assert.equal(await publication.registry.readLive(), null);
    assert.equal(createAssistantDaemonRegistry(required).registryPath, expected);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
