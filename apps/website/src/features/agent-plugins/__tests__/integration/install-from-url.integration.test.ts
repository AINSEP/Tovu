import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildZipFixture } from "../fixtures/build-zip.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { AgentPluginInstallError } from "../../install.js";
import { installAgentPluginFromUrl } from "../../install-from-url.js";
import { resolveAgentPluginLayout } from "../../layout.js";

/**
 * @file End-to-end proof of `installAgentPluginFromUrl()`: a real loopback HTTP server serving a real
 * zip, read by the real `yauzl` adapter (the module's own default — never overridden here), landing
 * on a real temp `cwd`. No step is doubled: this is the "URL -> bytes on disk" seam
 * `fetch-archive.ts`'s and `install-from-url.ts`'s own headers describe, proven working together
 * rather than only typechecking together.
 */

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

async function withZipServer(zip: Buffer, run: (url: string) => Promise<void>): Promise<void> {
  const handler = (_req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, { "content-type": "application/zip" });
    res.end(zip);
  };
  const server: Server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the loopback server to report an AddressInfo");
  }
  try {
    await run(`http://127.0.0.1:${address.port}/plugin.zip`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("installAgentPluginFromUrl downloads a real archive over loopback HTTP and installs it via the real yauzl reader", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-install-from-url-test-"));
  try {
    const manifest = JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "ui-ux-design",
      version: "1.1.0",
      description: "UI/UX design skills.",
    });
    const skillMarkdown = "# UI/UX Design\n\nGuidance for interface work.";
    const zip = await buildZipFixture([
      { path: "plugin.json", content: manifest },
      { path: "skills/ui-ux-design/SKILL.md", content: skillMarkdown },
    ]);
    const expectedDigest = createHash("sha256").update(zip).digest("hex");

    const layout = resolveAgentPluginLayout({ cwd, env: {} });

    await withZipServer(zip, async (url) => {
      const result = await installAgentPluginFromUrl({
        url,
        integrity: { kind: "pinned", sha256: expectedDigest },
        layout,
        workspaceId: WORKSPACE_ID,
      });

      assert.equal(result.sha256, expectedDigest);
      assert.equal(result.digestWasPinned, true);
      assert.equal(result.resolvedUrl, url);
      assert.equal(result.installed.pluginId, "ui-ux-design");
      assert.deepEqual(result.installed.skills, [{ name: "ui-ux-design", skillPath: "skills/ui-ux-design/SKILL.md" }]);

      const expectedRoot = path.join(cwd, "sites", "tovu-com", "agent-plugins", "ws", WORKSPACE_ID, "packages", "sha256", expectedDigest);
      assert.equal(result.installed.packageRoot, expectedRoot);

      const info = await stat(expectedRoot);
      assert.equal(info.isDirectory(), true);
      const rootEntries = (await readdir(expectedRoot)).sort();
      assert.deepEqual(rootEntries, ["plugin.json", "skills"]);
      const skillEntries = await readdir(path.join(expectedRoot, "skills", "ui-ux-design"));
      assert.deepEqual(skillEntries, ["SKILL.md"]);
    });
  } finally {
    await forceRemove(cwd);
  }
});

test("installAgentPluginFromUrl installs with trust-on-first-use integrity, echoing the downloaded digest as unpinned", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-install-from-url-test-"));
  try {
    const manifest = JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "trust-first-use-plugin",
    });
    const zip = await buildZipFixture([{ path: "plugin.json", content: manifest }]);
    const expectedDigest = createHash("sha256").update(zip).digest("hex");
    const layout = resolveAgentPluginLayout({ cwd, env: {} });

    await withZipServer(zip, async (url) => {
      const result = await installAgentPluginFromUrl({
        url,
        integrity: { kind: "trust-on-first-use" },
        layout,
        workspaceId: WORKSPACE_ID,
      });

      assert.equal(result.digestWasPinned, false);
      assert.equal(result.sha256, expectedDigest);
      assert.equal(result.installed.pluginId, "trust-first-use-plugin");
    });
  } finally {
    await forceRemove(cwd);
  }
});

test("installAgentPluginFromUrl refuses a pinned digest mismatch with DIGEST_MISMATCH and publishes nothing", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-install-from-url-test-"));
  try {
    const manifest = JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "ui-ux-design",
    });
    const zip = await buildZipFixture([{ path: "plugin.json", content: manifest }]);
    const realDigest = createHash("sha256").update(zip).digest("hex");
    const wrongDigest = "0".repeat(64);
    const layout = resolveAgentPluginLayout({ cwd, env: {} });

    await withZipServer(zip, async (url) => {
      await assert.rejects(
        () =>
          installAgentPluginFromUrl({
            url,
            integrity: { kind: "pinned", sha256: wrongDigest },
            layout,
            workspaceId: WORKSPACE_ID,
          }),
        (error: unknown) => {
          assert.ok(error instanceof AgentPluginInstallError);
          assert.equal(error.code, "DIGEST_MISMATCH");
          assert.equal(
            error.message,
            `archive SHA-256 '${realDigest}' does not match the expected '${wrongDigest}' — refusing to extract unverified bytes`,
          );
          return true;
        },
      );
    });

    // Nothing published: the digest check happens before extraction ever touches the archive
    // reader, so not even the workspace's own `packages/sha256` directory should exist yet, let
    // alone a digest-named directory for the real bytes.
    const expectedRoot = path.join(cwd, "infra", "agent-plugins", "ws", WORKSPACE_ID, "packages", "sha256", realDigest);
    await assert.rejects(() => stat(expectedRoot), (error: unknown) => {
      return (error as NodeJS.ErrnoException).code === "ENOENT";
    });
  } finally {
    await forceRemove(cwd);
  }
});
