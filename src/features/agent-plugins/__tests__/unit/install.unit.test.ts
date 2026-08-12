import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveAgentPluginLayout } from "../../layout";
import {
  AgentPluginInstallError,
  installAgentPlugin,
  type AgentPluginArchiveEntry,
  type AgentPluginArchiveReaderPort,
} from "../../install";

/**
 * @file `installAgentPlugin()` — content-addressed extraction of one Agent Plugin archive.
 *
 * This is the highest-risk unit in the feature (team directive: "Extraction hardening... is where
 * containment actually breaks"). Every adversarial case below is drawn from a named, cited attack
 * class rather than invented: symlink-entry escape and lexical zip-slip are the two independent
 * zip-slip vectors (Snyk's zip-slip research, JFrog's `archiver` writeup); the decompression-bomb
 * and entry-count caps guard the "declared size lies" and "million small files" variants of the same
 * resource-exhaustion class.
 *
 * The archive format itself is abstracted behind `AgentPluginArchiveReaderPort` (this repo's own
 * port+adapter discipline — `mcp-federation/ports.ts`'s `McpSessionPort`/`McpStdioChannel` split is
 * the precedent) so these tests drive real extraction/containment/limit logic with a scripted
 * in-memory archive and no zip/tar library dependency. See `install.ts`'s header for why a REAL
 * archive-reader adapter (wrapping an actual zip/tar library) is explicitly out of this slice.
 */

function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

function fileEntry(entryPath: string, content: string, overrides: Partial<AgentPluginArchiveEntry> = {}): AgentPluginArchiveEntry {
  const bytes = Buffer.from(content, "utf8");
  return {
    kind: "file",
    entryPath,
    declaredSize: bytes.byteLength,
    executable: false,
    async *openReadStream() {
      yield bytes;
    },
    ...overrides,
  } as AgentPluginArchiveEntry;
}

const VALID_MANIFEST = JSON.stringify({
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "ui-ux-design",
  version: "1.1.0",
});

function validPackageEntries(): AgentPluginArchiveEntry[] {
  return [
    fileEntry("plugin.json", VALID_MANIFEST),
    fileEntry("skills/ui-ux-design/SKILL.md", "# UI/UX Design\n\nGuidance."),
  ];
}

async function freshLayout() {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-install-test-"));
  return { cwd, layout: resolveAgentPluginLayout({ cwd, env: {} }) };
}

/** Test-only cleanup: a successful install deliberately freezes its published package root
 * read-only (`install.ts`'s `freezeTree`), so a plain recursive `rm` on the enclosing temp dir fails
 * EACCES trying to unlink/rmdir inside it — that failure is proof the freeze worked, not a bug.
 * Restores write permission everywhere under `root` first, then removes it. */
async function forceRemove(root: string): Promise<void> {
  async function makeWritable(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await chmod(dir, 0o700).catch(() => undefined);
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await makeWritable(absolute);
      else await chmod(absolute, 0o600).catch(() => undefined);
    }
  }
  await makeWritable(root);
  await rm(root, { recursive: true, force: true });
}

test("installs a valid package and indexes its skills", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const entries = validPackageEntries();
    const archive = new Uint8Array(Buffer.from("archive-bytes-1"));
    const digest = createHash("sha256").update(archive).digest("hex");

    const installed = await installAgentPlugin({
      archive,
      expectedSha256: digest,
      archiveReader: reader(entries),
      layout,
    });

    assert.equal(installed.pluginId, "ui-ux-design");
    assert.equal(installed.archiveDigest, digest);
    assert.deepEqual(installed.skills, [{ name: "ui-ux-design", skillPath: "skills/ui-ux-design/SKILL.md" }]);
    assert.deepEqual([...installed.files].sort(), ["plugin.json", "skills/ui-ux-design/SKILL.md"]);

    const published = await readFile(path.join(installed.packageRoot, "plugin.json"), "utf8");
    assert.equal(published, VALID_MANIFEST);
  } finally {
    await forceRemove(cwd);
  }
});

test("a symlink ENTRY is rejected outright, and no package is published", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-symlink"));
    const digest = createHash("sha256").update(archive).digest("hex");

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader([
            { kind: "symlink", entryPath: "skills", linkTarget: "/etc" } as AgentPluginArchiveEntry,
            fileEntry("skills/a/SKILL.md", "# A"),
          ]),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "SYMLINK_ENTRY_REJECTED",
    );

    const publishedDirs = await readdir(layout.packages).catch(() => []);
    assert.deepEqual(publishedDirs, [], "no digest directory may be published after a rejected install");
  } finally {
    await forceRemove(cwd);
  }
});

test("a lexical zip-slip path ('../../..') is rejected", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-traversal"));
    const digest = createHash("sha256").update(archive).digest("hex");

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader([fileEntry("../../../outside.txt", "leaked")]),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "UNSAFE_ENTRY_PATH",
    );

    assert.deepEqual(await readdir(layout.packages).catch(() => []), []);
  } finally {
    await forceRemove(cwd);
  }
});

test("a duplicate archive entry path is rejected (never silently overwritten)", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-duplicate"));
    const digest = createHash("sha256").update(archive).digest("hex");

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader([fileEntry("plugin.json", VALID_MANIFEST), fileEntry("plugin.json", "{}")]),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "DUPLICATE_ENTRY",
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("a file exceeding the declared per-file size cap is rejected", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-oversized-declared"));
    const digest = createHash("sha256").update(archive).digest("hex");

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader([
            fileEntry("plugin.json", VALID_MANIFEST),
            fileEntry("skills/a/SKILL.md", "x", { declaredSize: 999_999_999 } as Partial<AgentPluginArchiveEntry>),
          ]),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "FILE_TOO_LARGE",
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("a decompression bomb (actual bytes exceed the declared size) is caught while streaming, not after", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-bomb"));
    const digest = createHash("sha256").update(archive).digest("hex");

    // Declares a tiny size, but the read stream actually yields far more — the lie a real
    // compressed bomb tells. The per-file byte cap must be enforced against bytes ACTUALLY
    // observed leaving the "decompressor" (this fake stream), not the declared/trusted size.
    const bomb: AgentPluginArchiveEntry = {
      kind: "file",
      entryPath: "skills/a/SKILL.md",
      declaredSize: 10,
      executable: false,
      async *openReadStream() {
        const chunk = new Uint8Array(1024 * 1024); // 1 MiB per chunk
        for (let i = 0; i < 64; i += 1) yield chunk; // 64 MiB actual, far past any per-file cap
      },
    } as AgentPluginArchiveEntry;

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader([fileEntry("plugin.json", VALID_MANIFEST), bomb]),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "DECOMPRESSION_BOMB",
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("the total-extracted-bytes cap is enforced across many small files (the 'many files' bomb variant)", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-many-files"));
    const digest = createHash("sha256").update(archive).digest("hex");

    const bigContent = "x".repeat(1024 * 1024); // 1 MiB per file
    const manyEntries: AgentPluginArchiveEntry[] = [fileEntry("plugin.json", VALID_MANIFEST)];
    for (let i = 0; i < 200; i += 1) manyEntries.push(fileEntry(`skills/a/refs/f${i}.md`, bigContent));

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader(manyEntries),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "TOTAL_SIZE_EXCEEDED",
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("the entry-count cap is enforced", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-many-entries"));
    const digest = createHash("sha256").update(archive).digest("hex");

    const manyEntries: AgentPluginArchiveEntry[] = [fileEntry("plugin.json", VALID_MANIFEST)];
    for (let i = 0; i < 5000; i += 1) manyEntries.push(fileEntry(`skills/a/refs/f${i}.md`, "x"));

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader(manyEntries),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "TOO_MANY_ENTRIES",
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("a SHA-256 digest mismatch is rejected before any extraction is attempted", async () => {
  const { cwd, layout } = await freshLayout();
  let extractionAttempted = false;
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-digest-mismatch"));
    const wrongDigest = "0".repeat(64);

    const spyReader: AgentPluginArchiveReaderPort = {
      async *entries() {
        extractionAttempted = true;
        yield* validPackageEntries();
      },
    };

    await assert.rejects(
      () => installAgentPlugin({ archive, expectedSha256: wrongDigest, archiveReader: spyReader, layout }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "DIGEST_MISMATCH",
    );
    assert.equal(extractionAttempted, false, "extraction must never run against unverified bytes");
  } finally {
    await forceRemove(cwd);
  }
});

test("installing the identical archive twice extracts only once (content-addressed dedup)", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-dedup"));
    const digest = createHash("sha256").update(archive).digest("hex");

    let extractCount = 0;
    const countingReader: AgentPluginArchiveReaderPort = {
      async *entries() {
        extractCount += 1;
        yield* validPackageEntries();
      },
    };

    const first = await installAgentPlugin({ archive, expectedSha256: digest, archiveReader: countingReader, layout });
    const second = await installAgentPlugin({ archive, expectedSha256: digest, archiveReader: countingReader, layout });

    assert.equal(extractCount, 1, "the second install of byte-identical content must not re-extract");
    assert.equal(first.packageRoot, second.packageRoot);
  } finally {
    await forceRemove(cwd);
  }
});

test("a missing plugin.json is rejected", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-no-manifest"));
    const digest = createHash("sha256").update(archive).digest("hex");

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader([fileEntry("skills/a/SKILL.md", "# A")]),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "MANIFEST_MISSING",
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("a manifest that fails Agent Plugins grammar validation is rejected", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-bad-manifest"));
    const digest = createHash("sha256").update(archive).digest("hex");

    await assert.rejects(
      () =>
        installAgentPlugin({
          archive,
          expectedSha256: digest,
          archiveReader: reader([fileEntry("plugin.json", JSON.stringify({ name: "Not Valid!" }))]),
          layout,
        }),
      (error: unknown) => error instanceof AgentPluginInstallError && error.code === "MANIFEST_INVALID",
    );
  } finally {
    await forceRemove(cwd);
  }
});

test("a published package root is frozen read-only", async () => {
  const { cwd, layout } = await freshLayout();
  try {
    const archive = new Uint8Array(Buffer.from("archive-bytes-freeze"));
    const digest = createHash("sha256").update(archive).digest("hex");

    const installed = await installAgentPlugin({
      archive,
      expectedSha256: digest,
      archiveReader: reader(validPackageEntries()),
      layout,
    });

    const rootMode = (await stat(installed.packageRoot)).mode & 0o777;
    assert.equal(rootMode, 0o555, "package root must carry no write bit after publication");
  } finally {
    await forceRemove(cwd);
  }
});
