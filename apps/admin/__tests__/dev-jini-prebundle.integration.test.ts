// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { createServer } from "vite";
import { adminJiniDependencyFingerprint } from "../dev-jini-deps";

/** Run the actual optimizer with production's fingerprint plugin and retain its cache on close. */
async function optimizedDependency(root: string) {
  const fingerprint = await adminJiniDependencyFingerprint({ adminDir: root });
  const server = await createServer({ root, configFile: false, logLevel: "silent",
    plugins: [{ name: `tovu:jini-deps:${fingerprint}` }],
    optimizeDeps: { include: ["@jini-ai/chat"], noDiscovery: true },
    server: { host: "127.0.0.1", port: 0, watch: null },
  });
  try {
    await server.listen();
    const origin = server.resolvedUrls!.local[0]!;
    const sourceResponse = await fetch(new URL("main.js", origin));
    expect(sourceResponse.status).toBe(200);
    const source = await sourceResponse.text();
    const dependencyPath = /from\s+["']([^"']+)["']/.exec(source)?.[1];
    expect(dependencyPath).toContain(".vite/deps/");
    const response = await fetch(new URL(dependencyPath!, origin));
    expect(response.status).toBe(200);
    const metadata = JSON.parse(await fs.readFile(path.join(root, "node_modules/.vite/deps/_metadata.json"), "utf8"));
    return { code: await response.text(), configHash: metadata.configHash };
  } finally { await server.close(); }
}

test("an installed Jini upgrade rebuilds actual Vite prebundles without clearing the cache", async ({ onTestFinished }) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "jini-prebundle-upgrade-"));
  onTestFinished(() => fs.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "apps/admin"), dependency = path.join(root, "node_modules/@jini-ai/chat");
  await fs.mkdir(dependency, { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", type: "module", dependencies: { "@jini-ai/chat": "^1.0.0" } }));
  await fs.writeFile(path.join(root, "main.js"), 'import { value } from "@jini-ai/chat"; console.log(value);');
  const writeRelease = async (version: string, value: string) => {
    await fs.writeFile(path.join(dependency, "package.json"), JSON.stringify({ name: "@jini-ai/chat", version, type: "module", exports: "./index.js" }));
    await fs.writeFile(path.join(dependency, "index.js"), `export const value = ${JSON.stringify(value)};`);
  };
  await writeRelease("1.0.0", "first-release");
  const before = await optimizedDependency(root);
  expect(before.code).toContain("first-release");
  await writeRelease("1.0.1", "upgraded-release");
  const after = await optimizedDependency(root);
  expect(after.configHash).not.toBe(before.configHash);
  expect(after.code).toContain("upgraded-release");
  expect(after.code).not.toContain("first-release");
}, 30_000);
