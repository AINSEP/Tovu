/**
 * @file `publish-files-plan-2026-09-24.md` §6 S-F3 — `packThemeFilesEntities`: tree discovery,
 * generated-path exclusion, symlink exclusion, deny-list blocking, and hash stability.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createHash } from "node:crypto";
import type { PackedEntity } from "#src/features/publish-content/type-registry";
import { contentHash } from "#src/features/publish-content/content-hash";
import { createFileBlobIndex } from "#src/features/publish-content/file-blob-index";
import { contributeThemeFilesPublish, packThemeFilesEntities } from "../publish-content.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

function makeThemesDir(): string {
  return mkdtempSync(path.join(tmpdir(), "theme-publish-content-"));
}

test("packs one entity for a real theme tree, excluding generated paths, and leaves __original-themes__ untouched", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "basic");
    mkdirSync(path.join(themeDir, "render", "pages"), { recursive: true });
    mkdirSync(path.join(themeDir, "preview", "dark"), { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"basic"}');
    writeFileSync(path.join(themeDir, "render", "pages", "x.html"), "<html></html>");
    writeFileSync(path.join(themeDir, "preview", "dark", "p.png"), "not-really-a-png");
    writeFileSync(path.join(themeDir, "index.html"), "<html>generated</html>");

    const originalDir = path.join(themesDir, "__original-themes__", "static", "basic");
    mkdirSync(originalDir, { recursive: true });
    writeFileSync(path.join(originalDir, "theme.json"), '{"id":"basic"}');

    symlinkSync("/etc/passwd", path.join(themeDir, "evil-link"));

    const { entities, skipped } = await packThemeFilesEntities({ themesDir });
    assert.equal(skipped.length, 0);
    assert.equal(entities.length, 1);
    const entity = entities[0]!;
    assert.equal(entity.entityType, "theme-files");
    assert.equal(entity.id, "static/basic");
    const files = (entity.state.files as { path: string }[]).map((f) => f.path);
    assert.deepEqual(files, ["render/pages/x.html", "theme.json"]);
    assert.deepEqual(entity.requiredBlobs, [
      createHash("sha256").update("<html></html>").digest("hex"),
      createHash("sha256").update('{"id":"basic"}').digest("hex"),
    ]);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("hash is stable for an unchanged tree and changes for edited bytes or a renamed file", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "basic");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"basic"}');

    mkdirSync(path.join(themeDir, "render/pages"), { recursive: true });
    writeFileSync(path.join(themeDir, "render/pages/x.html"), "<h1>A</h1>");
    const first = await packThemeFilesEntities({ themesDir });
    const second = await packThemeFilesEntities({ themesDir });
    assert.equal(first.entities[0]!.contentHash, second.entities[0]!.contentHash);
    writeFileSync(path.join(themeDir, "render/pages/x.html"), "<h1>B</h1>");
    const edited = await packThemeFilesEntities({ themesDir });
    assert.notEqual(edited.entities[0]!.contentHash, first.entities[0]!.contentHash);
    renameSync(path.join(themeDir, "render/pages/x.html"), path.join(themeDir, "render/pages/y.html"));
    const renamed = await packThemeFilesEntities({ themesDir });
    assert.notEqual(renamed.entities[0]!.contentHash, edited.entities[0]!.contentHash);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("a theme.json name labels the row without touching the packed state or its hash", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "basic");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"basic","name":"Basic Theme"}');

    const entity = (await packThemeFilesEntities({ themesDir })).entities[0]!;
    assert.equal(entity.displayLabel, "Basic Theme");
    // `state` is exactly the pre-label shape, so the hash is the one every existing build computes.
    assert.deepEqual(Object.keys(entity.state).sort(), ["files", "kind", "title", "treeKey"]);
    assert.equal(entity.state.title, "Theme: static/basic");
    const preLabelHash = contentHash("theme-files", {
      title: "Theme: static/basic",
      kind: "theme-files",
      treeKey: "static/basic",
      files: entity.state.files,
    });
    assert.equal(entity.contentHash, preLabelHash);
    // …and the destination half, re-hashing the same tree, agrees: the row can never look changed.
    const handler = contributeThemeFilesPublish().build({
      workspaceId: "ws1",
      clock: createFakeClock({ startIso: "2026-09-25T00:00:00.000Z" }),
      idGen: { newId: () => "id1" },
      ports: { "theme-files": { themesDir } },
    });
    assert.equal((await handler.inspect("static/basic"))?.hash, entity.contentHash);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("a theme.json with no name (or none at all) sets no displayLabel", async () => {
  const themesDir = makeThemesDir();
  try {
    mkdirSync(path.join(themesDir, "static", "plain"), { recursive: true });
    writeFileSync(path.join(themesDir, "static", "plain", "theme.json"), '{"id":"plain","name":"  "}');
    mkdirSync(path.join(themesDir, "static", "bare"), { recursive: true });
    writeFileSync(path.join(themesDir, "static", "bare", "style.css"), "body{}");

    const { entities } = await packThemeFilesEntities({ themesDir });
    assert.deepEqual(entities.map((e) => [e.id, "displayLabel" in e]), [["static/bare", false], ["static/plain", false]]);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("a planted .env blocks the whole tree — no entity, reported in skipped", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "basic");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"basic"}');
    writeFileSync(path.join(themeDir, ".env"), "SECRET=1");

    const { entities, skipped } = await packThemeFilesEntities({ themesDir });
    assert.equal(entities.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0]!.treeKey, "static/basic");
    assert.match(skipped[0]!.reason, /^Theme: static\/basic was not published: /);
    assert.match(skipped[0]!.reason, /environment file/);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("a credential in theme CSS blocks packing and indexing the whole tree", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "basic");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"basic"}');
    writeFileSync(path.join(themeDir, "theme.css"), `body{} /* ${"sk-ant-" + "a".repeat(95)} */`);

    const fileBlobIndex = createFileBlobIndex();
    const { entities, skipped } = await packThemeFilesEntities({ themesDir, fileBlobIndex });
    assert.deepEqual(entities, []);
    assert.equal(fileBlobIndex.size, 0);
    assert.deepEqual(skipped, [{
      treeKey: "static/basic",
      reason: 'Theme: static/basic was not published: "theme.css" looks like it holds a key (Anthropic API key (sk-ant-))',
    }]);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("a .DS_Store (and other OS junk) is ignored during pack — never blocks the tree, never uploaded", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "basic");
    mkdirSync(path.join(themeDir, "render"), { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"basic"}');
    writeFileSync(path.join(themeDir, ".DS_Store"), "junk");
    writeFileSync(path.join(themeDir, "render", ".DS_Store"), "junk");
    writeFileSync(path.join(themeDir, "Thumbs.db"), "junk");
    writeFileSync(path.join(themeDir, "._theme.json"), "junk");

    const fileBlobIndex = createFileBlobIndex();
    const { entities, skipped } = await packThemeFilesEntities({ themesDir, fileBlobIndex });
    assert.equal(skipped.length, 0);
    assert.equal(entities.length, 1);
    const files = (entities[0]!.state.files as { path: string }[]).map((f) => f.path);
    assert.deepEqual(files, ["theme.json"]);
    // Never indexed for upload — asserting the index holds exactly the one real file's blob.
    assert.equal(fileBlobIndex.size, 1);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("fills the file blob index as it packs, keyed by each file's real sha256", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "basic");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"basic"}');

    const fileBlobIndex = createFileBlobIndex();
    const handler = contributeThemeFilesPublish().build({
      workspaceId: "ws1", clock: createFakeClock({ startIso: "2026-09-25T00:00:00.000Z" }),
      idGen: { newId: () => "id1" }, ports: { "theme-files": { themesDir, fileBlobIndex } },
    });
    const entities: PackedEntity[] = [];
    for await (const entity of handler.pack()) entities.push(entity);
    assert.equal(entities.length, 1);
    assert.equal(entities[0].entityType, "theme-files");
    assert.equal(entities[0].id, "static/basic");
    assert.deepEqual(entities[0].requiredBlobs, [createHash("sha256").update('{"id":"basic"}').digest("hex")]);
    const sha256 = (entities[0]!.state.files as { path: string; sha256: string }[])[0]!.sha256;
    const indexed = fileBlobIndex.get(sha256);
    assert.ok(indexed);
    assert.equal(fileBlobIndex.size, 1);
    assert.equal(indexed.size, 14);
    assert.equal(indexed!.absPath, path.join(themeDir, "theme.json"));
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("a tier folder that does not exist yet contributes no entities and no error", async () => {
  const themesDir = makeThemesDir();
  try {
    const { entities, skipped } = await packThemeFilesEntities({ themesDir });
    assert.deepEqual(entities, []);
    assert.deepEqual(skipped, []);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("the handler's listSkipped() reports a whole-tree refusal by its exact SkippedThemeTree reason", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "kuinetic-showcase");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"kuinetic-showcase"}');
    writeFileSync(path.join(themeDir, "video.mp4"), "not-really-a-video");

    const handler = contributeThemeFilesPublish().build({
      workspaceId: "ws1",
      clock: createFakeClock({ startIso: "2026-09-25T00:00:00.000Z" }),
      idGen: { newId: () => "id1" },
      ports: { "theme-files": { themesDir } },
    });
    const skipped = await handler.listSkipped!();
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0]!.entityType, "theme-files");
    assert.equal(skipped[0]!.id, "static/kuinetic-showcase");
    // Same name every other theme row in the table carries (`treeTitle`), not the bare tree key.
    assert.equal(skipped[0]!.label, "Theme: static/kuinetic-showcase");
    // The disallowed-extension reason is terse and preformatted (no title prefix — the row's own
    // label column already carries it) via `file-tree-policy.ts`'s `wrapTreePolicyReason`.
    assert.equal(skipped[0]!.reason, "Can't publish: contains a video file (video.mp4)");
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("the handler's listSkipped() names a refused tree by its theme.json name when it has one", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "static", "kuinetic-showcase");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"kuinetic-showcase","name":"kUInetic Showcase"}');
    writeFileSync(path.join(themeDir, "video.mp4"), "not-really-a-video");

    const handler = contributeThemeFilesPublish().build({
      workspaceId: "ws1",
      clock: createFakeClock({ startIso: "2026-09-25T00:00:00.000Z" }),
      idGen: { newId: () => "id1" },
      ports: { "theme-files": { themesDir } },
    });
    const skipped = await handler.listSkipped!();
    assert.equal(skipped[0]!.label, "kUInetic Showcase");
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});

test("the handler's listSkipped() is empty when there is no themesDir configured", async () => {
  const handler = contributeThemeFilesPublish().build({
    workspaceId: "ws1",
    clock: createFakeClock({ startIso: "2026-09-25T00:00:00.000Z" }),
    idGen: { newId: () => "id1" },
    ports: {},
  });
  assert.deepEqual(await handler.listSkipped!(), []);
});

test("the handlebars tier is never packed (deliberate narrowing per the plan)", async () => {
  const themesDir = makeThemesDir();
  try {
    const themeDir = path.join(themesDir, "handlebars", "old");
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, "theme.json"), '{"id":"old"}');

    const { entities } = await packThemeFilesEntities({ themesDir });
    assert.deepEqual(entities, []);
  } finally {
    rmSync(themesDir, { recursive: true, force: true });
  }
});
