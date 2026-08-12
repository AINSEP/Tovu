import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove";
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
 * resource-exhaustion class. A dedicated cross-workspace isolation test proves the tenant-grade
 * layout decision (`layout.ts`'s header, 2026-08-12) end to end at the install level, not only at
 * the pure path-computation level `layout.unit.test.ts` already covers.
 *
 * The archive format itself is abstracted behind `AgentPluginArchiveReaderPort` (this repo's own
 * port+adapter discipline — `mcp-federation/ports.ts`'s `McpSessionPort`/`McpStdioChannel` split is
 * the precedent) so these tests drive real extraction/containment/limit logic with a scripted
 * in-memory archive. The identical adversarial suite is re-run against the REAL `yauzl`-backed
 * reader in `yauzl-archive-reader.unit.test.ts` — per the team directive, that file is the
 * acceptance criteria for the real archive library, not a duplicate of this one.
 */

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

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
  return { cwd, layout: resolveAgentPluginLayout({ cwd, env: {} }).forWorkspace(WORKSPACE_ID) };
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

test("TENANT-GRADE: two workspaces installing the identical archive extract INDEPENDENTLY -- no sharing", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-install-test-"));
  try {
    const instanceLayout = resolveAgentPluginLayout({ cwd, env: {} });
    const workspaceA = instanceLayout.forWorkspace("11111111-1111-4111-8111-111111111111");
    const workspaceB = instanceLayout.forWorkspace("22222222-2222-4222-8222-222222222222");

    const archive = new Uint8Array(Buffer.from("archive-bytes-shared-by-two-workspaces"));
    const digest = createHash("sha256").update(archive).digest("hex");

    let extractCount = 0;
    const countingReader: AgentPluginArchiveReaderPort = {
      async *entries() {
        extractCount += 1;
        yield* validPackageEntries();
      },
    };

    const installedA = await installAgentPlugin({ archive, expectedSha256: digest, archiveReader: countingReader, layout: workspaceA });
    const installedB = await installAgentPlugin({ archive, expectedSha256: digest, archiveReader: countingReader, layout: workspaceB });

    // The tenancy property itself: byte-identical content installed by two DIFFERENT workspaces
    // is extracted TWICE, into two entirely disjoint package roots -- the opposite of
    // install.ts's own within-one-workspace dedup test above, and that contrast is the point.
    assert.equal(extractCount, 2, "a second workspace's install must not be satisfied by the first workspace's bytes");
    assert.notEqual(installedA.packageRoot, installedB.packageRoot);
    assert.equal(path.relative(workspaceB.root, installedA.packageRoot).startsWith(".."), true);

    // Deleting workspace A's entire tree must not touch workspace B's copy -- proves the two
    // package roots are not merely different paths but structurally independent on disk.
    await forceRemove(workspaceA.root);
    const stillThere = await readFile(path.join(installedB.packageRoot, "plugin.json"), "utf8");
    assert.equal(stillThere, VALID_MANIFEST);
  } finally {
    await forceRemove(cwd);
  }
});

// ---------------------------------------------------------------------------
// PROVEN, security pass 2026-08-13 (ADS-memory/reports/security/2026-08-13-post-session-security-pass.md):
// the tenant-isolation guarantee above holds only when every caller derives `layout` via
// `instanceLayout.forWorkspace(workspaceId)`. `AgentPluginWorkspaceLayout` (layout.ts) is a plain
// interface of four string/function fields with no `workspaceId` tag and no back-reference to the
// instance root it came from -- `installAgentPlugin` never re-derives or re-validates `layout`
// against any expected workspace. This was flagged as "convention, not compiler-enforced" and
// requested as a negative test; it did not exist before this pass. The two tests below prove it two
// ways: a layout stitched from two DIFFERENT real workspaces' own directories, and a layout that is
// not derived from `forWorkspace` at all.
// ---------------------------------------------------------------------------

test("PROVEN GAP: a layout literal stitching workspace A's `packages` onto workspace B's `staging` type-checks and installAgentPlugin honors it uncritically -- nothing here is tied back to one workspace", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-install-test-"));
  try {
    const instanceLayout = resolveAgentPluginLayout({ cwd, env: {} });
    const workspaceA = instanceLayout.forWorkspace("11111111-1111-4111-8111-111111111111");
    const workspaceB = instanceLayout.forWorkspace("22222222-2222-4222-8222-222222222222");

    // Nothing prevents this: every field a real `forWorkspace()` result exposes is a plain string or
    // function, so a mixed object satisfies `AgentPluginWorkspaceLayout` structurally. This is the
    // "hand-built literal satisfies the workspace type" gap named in the dispatch brief -- reproduced
    // here with directories that already exist as two DIFFERENT real workspaces' own trees, not with
    // fabricated strings, so the result below is not an artifact of an invalid path.
    const confusedLayout = {
      root: workspaceA.root,
      packages: workspaceB.packages, // <- workspace B's real package tree
      staging: workspaceB.staging, // <- workspace B's real staging tree
      pluginDataDir: workspaceA.pluginDataDir,
    };

    const archive = new Uint8Array(Buffer.from("archive-bytes-confused-layout"));
    const digest = createHash("sha256").update(archive).digest("hex");

    const installed = await installAgentPlugin({
      archive,
      expectedSha256: digest,
      archiveReader: reader(validPackageEntries()),
      layout: confusedLayout,
    });

    // The bytes landed under workspace B's tree, not workspace A's -- a caller that believed it was
    // installing "for workspace A" (the id embedded in `confusedLayout.root` and `pluginDataDir`) in
    // fact wrote into workspace B's package store. `installAgentPlugin` raised no error and performed
    // no consistency check between `root`/`pluginDataDir` (A) and `packages`/`staging` (B).
    assert.equal(path.relative(workspaceB.root, installed.packageRoot).startsWith(".."), false);
    assert.equal(path.relative(workspaceA.root, installed.packageRoot).startsWith(".."), true);

    const publishedInB = await readFile(path.join(workspaceB.packages, digest, "plugin.json"), "utf8");
    assert.equal(publishedInB, VALID_MANIFEST, "the archive was published into workspace B's real package store");
  } finally {
    await forceRemove(cwd);
  }
});

test("PROVEN GAP: a layout never derived from forWorkspace() at all -- arbitrary strings -- is accepted with no origin check, extracting outside the entire agent-plugins tree", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-install-test-"));
  try {
    // A location that has nothing to do with `infra/agent-plugins`, `resolveAgentPluginLayout`, or
    // any workspace id at all -- simulating a caller-side bug (wrong variable, stale closure, a
    // future code path that assembles a layout object by hand instead of calling `forWorkspace`).
    const rogueRoot = path.join(cwd, "somewhere-else-entirely");

    const rogueLayout = {
      root: rogueRoot,
      packages: path.join(rogueRoot, "packages", "sha256"),
      staging: path.join(rogueRoot, "staging"),
      pluginDataDir: (pluginId: string) => path.join(rogueRoot, "data", pluginId),
    };

    const archive = new Uint8Array(Buffer.from("archive-bytes-rogue-layout"));
    const digest = createHash("sha256").update(archive).digest("hex");

    const installed = await installAgentPlugin({
      archive,
      expectedSha256: digest,
      archiveReader: reader(validPackageEntries()),
      layout: rogueLayout,
    });

    // installAgentPlugin performed every containment/size/symlink check inside the package it was
    // given -- none of those checks are the gap. The gap is one level up: nothing verifies the
    // package ROOT itself is under a real, workspace-scoped `AgentPluginLayout` at all.
    assert.equal(installed.packageRoot, path.join(rogueRoot, "packages", "sha256", digest));
    const published = await readFile(path.join(rogueRoot, "packages", "sha256", digest, "plugin.json"), "utf8");
    assert.equal(published, VALID_MANIFEST);
  } finally {
    await forceRemove(cwd);
  }
});
