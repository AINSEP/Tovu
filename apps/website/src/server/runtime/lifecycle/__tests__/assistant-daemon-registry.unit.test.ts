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
