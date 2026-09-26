/**
 * @file `publish-files-plan-2026-09-24.md` §2's static test, items (a)-(e), plus direct coverage of
 * every exported function in `../file-tree-policy.ts`.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  checkMcpJsonSecretPlaceholders,
  checkTreeFiles,
  checkTreePath,
  FILE_TREE_KINDS,
  FILE_TREE_LIMITS,
  isIgnoredTreeFileName,
  normalizeMode,
  resolveTreeRelativePath,
  THEME_FILE_TREE_ALLOWED_EXTENSIONS,
  type FileTreeFileInput,
} from "../file-tree-policy.js";

// (a) The kind set is exactly these 4, and never silently gains/loses one.
test("FILE_TREE_KINDS is exactly the 4 kinds from §1's inventory table", () => {
  assert.deepEqual(
    Object.keys(FILE_TREE_KINDS).sort(),
    ["agent-plugin", "agent-skill", "site-plugin", "theme-files"].sort()
  );
});

// (b) No kind's resolved root can ever land on a site-root file, for any valid id segments.
test("no kind's resolved root can ever equal a site-root file name", () => {
  const siteRootFiles = ["config.json", ".site-meta.json", ".fs-custom-root.json", ".mcp.x.json", "content.db", "chat.db"];
  for (const kind of Object.keys(FILE_TREE_KINDS) as (keyof typeof FILE_TREE_KINDS)[]) {
    const spec = FILE_TREE_KINDS[kind];
    // Every spec's baseDir is a fixed, non-empty literal — the structural guarantee itself.
    assert.ok(spec.baseDir.length > 0, `${kind} must have a non-empty baseDir`);
    assert.ok(!spec.baseDir.includes("/"), `${kind}'s baseDir must be one segment`);
    const idSegments = Array.from({ length: spec.idSegmentCount }, (_, i) => `seg${i}`);
    const resolved = resolveTreeRelativePath(kind, idSegments);
    assert.ok(resolved !== null, `${kind} should resolve valid id segments`);
    assert.ok(resolved!.startsWith(`${spec.baseDir}/`), `${kind}'s resolved path must be nested under its baseDir`);
    for (const siteRootFile of siteRootFiles) {
      assert.notEqual(resolved, siteRootFile);
    }
  }
});

// (c) Each deny name/extension blocks a tree.
test("checkTreePath blocks every deny-listed segment, name and extension", () => {
  const cases: readonly string[] = [
    "theme.json/.git/x",
    "vendor/node_modules/x.js",
    ".publish-staging/x",
    ".publish-previous/x",
    ".env",
    ".env.production",
    ".npmrc",
    ".netrc",
    ".mcp.foo.json",
    ".fs-custom-root.json",
    "nested/.fs-custom-root.json",
    "id_rsa",
    "id_rsa.bak",
    "id_ed25519",
    "secrets.pem",
    "keys/site.key",
    "data.db",
    "data.sqlite",
    "data.db-wal",
    "data.db-shm",
  ];
  for (const relPath of cases) {
    assert.ok(checkTreePath(relPath) !== null, `expected "${relPath}" to be blocked`);
  }
});

test("checkTreePath blocks config.json/.site-meta.json only at tree root, not nested", () => {
  assert.ok(checkTreePath("config.json") !== null);
  assert.ok(checkTreePath(".site-meta.json") !== null);
  assert.equal(checkTreePath("fixtures/config.json"), null);
  assert.equal(checkTreePath("fixtures/.site-meta.json"), null);
});

test("checkTreePath blocks path-shape violations (.., leading /, backslash, depth, length, empty segment)", () => {
  assert.ok(checkTreePath("../x") !== null);
  assert.ok(checkTreePath("a/../b") !== null);
  assert.ok(checkTreePath("./a") !== null);
  assert.ok(checkTreePath("/abs/path") !== null);
  assert.ok(checkTreePath("a\\b") !== null);
  assert.ok(checkTreePath("a//b") !== null); // empty segment
  assert.ok(checkTreePath("") !== null);
  assert.ok(checkTreePath("a".repeat(600)) !== null);
  assert.ok(checkTreePath(Array.from({ length: 17 }, (_, i) => `d${i}`).join("/")) !== null);
});

test("checkTreePath accepts an ordinary theme source path", () => {
  assert.equal(checkTreePath("render/pages/index.html"), null);
  assert.equal(checkTreePath("theme.json"), null);
  assert.equal(checkTreePath("preview/screenshot.png"), null);
});

// OS junk files are IGNORED (silently excluded before packing), never a whole-tree DENY reason —
// `render/.DS_Store` recreated by Finder must not make `checkTreePath` refuse the path either, since
// a walker (`walkThemeTree`) is what keeps it out of a tree at all; `checkTreePath` on its own is a
// per-path shape check a caller could still run directly.
test("isIgnoredTreeFileName recognizes every documented OS junk name", () => {
  assert.ok(isIgnoredTreeFileName(".DS_Store"));
  assert.ok(isIgnoredTreeFileName("Thumbs.db"));
  assert.ok(isIgnoredTreeFileName("desktop.ini"));
  assert.ok(isIgnoredTreeFileName("._resource-fork"));
  assert.ok(isIgnoredTreeFileName(".Spotlight-V100"));
  assert.ok(isIgnoredTreeFileName(".Trashes"));
  assert.equal(isIgnoredTreeFileName("theme.json"), false);
  assert.equal(isIgnoredTreeFileName(".env"), false);
});

test("checkTreePath no longer blocks a .DS_Store path — it is ignored upstream, not denied here", () => {
  assert.equal(checkTreePath(".DS_Store"), null);
  assert.equal(checkTreePath("render/.DS_Store"), null);
});

// The walker is the ONE place junk is ignored. `checkTreeFiles` also runs on the destination over a
// file list the source sent, and every file in that list gets written — so a junk name reaching it
// is refused, never waved through past the '..', cap, extension and scan checks.
test("checkTreeFiles refuses an OS junk file that reached it, with a plain reason", () => {
  const files: FileTreeFileInput[] = [
    { path: "theme.json", size: 10, mode: 0o644, textSample: '{"id":"basic"}' },
    { path: "render/.DS_Store", size: 6148, mode: 0o644 },
  ];
  assert.equal(checkTreeFiles("theme-files", files), `"render/.DS_Store" is a system file that is never published`);
  assert.equal(
    checkTreeFiles("theme-files", [{ path: "._id_rsa.png", size: 1, mode: 0o644 }]),
    `"._id_rsa.png" is a system file that is never published`
  );
});

test("checkTreeFiles still runs the '..' and size checks on a junk-looking name", () => {
  assert.equal(
    checkTreeFiles("theme-files", [{ path: "../outside/._x.png", size: 1, mode: 0o644 }]),
    `"../outside/._x.png" contains a '..' segment, which is never allowed`
  );
  assert.notEqual(
    checkTreeFiles("theme-files", [{ path: "Thumbs.db", size: FILE_TREE_LIMITS.maxTreeBytes + 1, mode: 0o644 }]),
    null
  );
});

// (d) A planted credential in theme.css blocks the tree with the exact reason.
test("checkTreeFiles blocks a tree holding a planted Anthropic key, exact reason", () => {
  const planted = "sk-ant-" + "a".repeat(95);
  const files: FileTreeFileInput[] = [
    { path: "theme.json", size: 10, mode: 0o644, textSample: '{"id":"basic"}' },
    { path: "css/theme.css", size: 200, mode: 0o644, textSample: `body{}\n/* ${planted} */` },
  ];
  const reason = checkTreeFiles("theme-files", files);
  assert.equal(reason, `"css/theme.css" looks like it holds a key (Anthropic API key (sk-ant-))`);
});

test("checkTreeFiles blocks a tree holding a planted GitHub PAT", () => {
  const planted = "ghp_" + "a".repeat(36);
  const files: FileTreeFileInput[] = [{ path: "readme-notes.md", size: 50, mode: 0o644, textSample: planted }];
  const reason = checkTreeFiles("theme-files", files);
  assert.match(reason ?? "", /looks like it holds a key/);
});

test("checkTreeFiles blocks a tree holding a planted PEM private key block", () => {
  const pemHeader = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
  const files: FileTreeFileInput[] = [{ path: "static/blob.txt", size: 50, mode: 0o644, textSample: pemHeader }];
  const reason = checkTreeFiles("theme-files", files);
  assert.match(reason ?? "", /looks like it holds a key/);
});

test("checkTreeFiles does not scan a binary-extension file even if its sample matches a pattern", () => {
  const planted = "sk-ant-" + "a".repeat(95);
  const files: FileTreeFileInput[] = [{ path: "preview/shot.png", size: 50, mode: 0o644, textSample: planted }];
  assert.equal(checkTreeFiles("theme-files", files), null);
});

test("checkTreeFiles skips the scan (does not block) when textSample is omitted", () => {
  const files: FileTreeFileInput[] = [{ path: "theme.json", size: 50, mode: 0o644 }];
  assert.equal(checkTreeFiles("theme-files", files), null);
});

// (e) Every file-backed publish-content contributor uses this module (grep-style source check).
test("every file-backed publish-content contributor imports file-tree-policy", () => {
  const registeredTypes = new Set(["theme-files", "agent-skill", "agent-plugin", "site-plugin"]);
  const manifestPath = path.resolve(
    import.meta.dirname,
    "../../../server/runtime/composition/publish-content-manifest.ts"
  );
  const manifestSrc = readFileSync(manifestPath, "utf8");
  const registeredHere = [...registeredTypes].filter((type) => manifestSrc.includes(type));

  const featuresDir = path.resolve(import.meta.dirname, "../../../features");
  for (const dir of readdirSync(featuresDir)) {
    const contributorFile = path.join(featuresDir, dir, "publish-content.ts");
    let src: string;
    try {
      src = readFileSync(contributorFile, "utf8");
    } catch {
      continue;
    }
    const isFileBacked = registeredHere.some((type) => src.includes(`entityType = "${type}"`) || src.includes(`entityType: "${type}"`));
    if (!isFileBacked) continue;
    assert.match(
      src,
      /file-tree-policy/,
      `${contributorFile} contributes a file-backed type and must import file-tree-policy`
    );
  }
});

test("checkTreeFiles blocks case-insensitively duplicate paths", () => {
  const files: FileTreeFileInput[] = [
    { path: "render/Index.html", size: 10, mode: 0o644, textSample: "<html></html>" },
    { path: "render/index.html", size: 10, mode: 0o644, textSample: "<html></html>" },
  ];
  const reason = checkTreeFiles("theme-files", files);
  assert.match(reason ?? "", /differ only by letter case/);
});

test("checkTreeFiles blocks a disallowed extension for theme-files", () => {
  const files: FileTreeFileInput[] = [{ path: "server.php", size: 10, mode: 0o644, textSample: "<?php ?>" }];
  const reason = checkTreeFiles("theme-files", files);
  assert.match(reason ?? "", /not allowed for this tree/);
});

test("checkTreeFiles allows every extension for a code-class kind (agent-skill)", () => {
  const files: FileTreeFileInput[] = [{ path: "scripts/run.py", size: 10, mode: 0o644, textSample: "print(1)" }];
  assert.equal(checkTreeFiles("agent-skill", files), null);
});

test("checkTreeFiles blocks a tree over the per-file byte cap", () => {
  const files: FileTreeFileInput[] = [{ path: "big.png", size: FILE_TREE_LIMITS.maxFileBytes + 1, mode: 0o644 }];
  assert.match(checkTreeFiles("theme-files", files) ?? "", /per-file limit/);
});

test("checkTreeFiles blocks a tree over the total byte cap", () => {
  const files: FileTreeFileInput[] = [
    { path: "a.png", size: FILE_TREE_LIMITS.maxTreeBytes, mode: 0o644 },
    { path: "b.png", size: 1, mode: 0o644 },
  ];
  assert.match(checkTreeFiles("theme-files", files) ?? "", /byte limit/);
});

test("checkTreeFiles blocks a tree over the file-count cap", () => {
  const files: FileTreeFileInput[] = Array.from({ length: FILE_TREE_LIMITS.maxTreeFiles + 1 }, (_, i) => ({
    path: `f${i}.txt`,
    size: 1,
    mode: 0o644,
  }));
  assert.match(checkTreeFiles("theme-files", files) ?? "", /file limit/);
});

test("normalizeMode collapses any exec bit to 0o755 and everything else to 0o644", () => {
  assert.equal(normalizeMode(0o644), 0o644);
  assert.equal(normalizeMode(0o600), 0o644);
  assert.equal(normalizeMode(0o755), 0o755);
  assert.equal(normalizeMode(0o700), 0o755);
  // setuid + world-writable + exec — must still collapse to plain 0o755, never carry setuid through.
  assert.equal(normalizeMode(0o4777), 0o755);
  // setuid with no exec bit at all — collapses to plain 0o644, never carries setuid through either.
  assert.equal(normalizeMode(0o4666), 0o644);
});

test("resolveTreeRelativePath rejects a wrong segment count and an invalid segment", () => {
  assert.equal(resolveTreeRelativePath("theme-files", ["static"]), null);
  assert.equal(resolveTreeRelativePath("theme-files", ["static", "Basic Theme"]), null);
  assert.equal(resolveTreeRelativePath("theme-files", ["static", ""]), null);
  assert.equal(resolveTreeRelativePath("theme-files", ["static", "a".repeat(65)]), null);
  assert.equal(resolveTreeRelativePath("theme-files", ["static", "basic"]), "themes/static/basic");
});

test("checkMcpJsonSecretPlaceholders allows empty/placeholder env values and blocks a literal token", () => {
  assert.equal(checkMcpJsonSecretPlaceholders(JSON.stringify({ env: { API_KEY: "${API_KEY}", OTHER: "" } })), null);
  const blocked = checkMcpJsonSecretPlaceholders(JSON.stringify({ env: { API_KEY: "sk-live-abc123" } }));
  assert.match(blocked ?? "", /move it to live's settings/);
  assert.equal(checkMcpJsonSecretPlaceholders("not json"), null);
});

test("THEME_FILE_TREE_ALLOWED_EXTENSIONS covers every extension used by the real static/basic theme", () => {
  const themeDir = path.resolve(import.meta.dirname, "../../../../../../sites/tovu-com/themes/static/basic");
  let files: string[];
  try {
    files = listFilesRecursive(themeDir);
  } catch {
    return; // No local site checked out in this environment — nothing to pin against.
  }
  for (const file of files) {
    const ext = file.includes(".") ? file.slice(file.lastIndexOf(".") + 1).toLowerCase() : "";
    assert.ok(
      THEME_FILE_TREE_ALLOWED_EXTENSIONS.includes(ext),
      `real theme file "${file}" has extension "${ext}", missing from the allow-list`
    );
  }
});

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    // Mirrors `walkThemeTree`: Finder recreates `.DS_Store` in a real theme folder on its own.
    if (isIgnoredTreeFileName(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}
