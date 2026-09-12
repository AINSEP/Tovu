import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR, themeFileDiffersFromOriginal } from "../../features/theme/index.js";
import { getThemesAgentToolCatalog } from "../../features/theme/agent-tools.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { TOOL_SEARCH_KEYWORDS } from "../tool-search-keywords.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeThemesTools } from "../../features/theme/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

resetToolContributorsForTests();
registerToolContributor(contributeThemesTools());

/**
 * @file `theme_reset_file` and `theme_copy_file` — the last two gaps
 * `ADS-memory/reports/2026-09-12-theme-agent-tools-survey.md` found between the human Explore
 * screen's per-file operations and this domain's agent-tool catalog. `theme_write_file`/
 * `theme_edit_file`/`theme_rename_file` already have their own suites; this file covers only what
 * is NEW here:
 *
 * - `theme_reset_file`'s two DISTINCT "nothing to reset from" refusals (no catalog at all vs. a
 *   catalog that exists but never had this file), a successful reset overwriting the live file with
 *   the catalog's bytes exactly, and that it shares `theme_write_file`'s own generated-tree/trash
 *   refusals via `assertThemeFileWritable` rather than re-deriving them.
 * - `theme_copy_file`'s server-computed destination naming (including the collision LOOP running
 *   more than once), a missing source, and the identical generated-tree/trash refusals.
 * - Both tools' `../` containment refusal, proving neither can reach a SIBLING theme's files —
 *   the per-call half of this domain's site-scoping argument (the other half, one `themesDir` per
 *   server process, cannot be exercised from inside one process; see the survey's own Section D).
 */

const WORKSPACE_ID = "ws-themes-reset-copy";
const PRINCIPAL_ID = "principal-under-test";

const PLAIN_MANIFEST = JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 });
const NO_ORIGINAL_MANIFEST = JSON.stringify({ id: "no-original", name: "No Original", version: "1.0.0", tier: "static", engine: 1 });
const COMPILED_MANIFEST = JSON.stringify({
  id: "compiled",
  name: "Compiled",
  version: "1.0.0",
  tier: "static",
  engine: 1,
  build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
});

/**
 * Four themes under one root:
 * - `plain`: has a catalog original. Its live `tokens.json` has DIVERGED from that original (proving
 *   reset overwrites rather than no-ops), and it carries an `author-added.txt` with no catalog
 *   counterpart (proving the per-file "not in original" refusal). `pages/about.html` and
 *   `pages/about-1.html` both already exist, so copying `pages/about.html` must land on `-2`.
 * - `no-original`: has NO catalog directory at all (proving the whole-theme "no stored original"
 *   refusal).
 * - `compiled`: a built theme (ADR-020 §5) whose `pages/index.html` is generated-readonly (proving
 *   both tools refuse a built theme's generated tree rather than attempting anything with it).
 */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-themes-reset-copy-"));

  const plain = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(plain, "pages"), { recursive: true });
  fs.writeFileSync(path.join(plain, "theme.json"), PLAIN_MANIFEST, "utf8");
  fs.writeFileSync(path.join(plain, "tokens.json"), '{"--ink":"#111"}', "utf8");
  fs.writeFileSync(path.join(plain, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(plain, "pages", "about.html"), "<html><body>about</body></html>", "utf8");
  fs.writeFileSync(path.join(plain, "pages", "about-1.html"), "<html><body>already taken</body></html>", "utf8");
  fs.writeFileSync(path.join(plain, "author-added.txt"), "added after install, not in the original", "utf8");
  // CRLF live, LF in the catalog: a line-ending-only difference, which reset must treat as modified.
  fs.mkdirSync(path.join(plain, "css"), { recursive: true });
  fs.writeFileSync(path.join(plain, "css", "line-endings.css"), "a{}\r\nb{}\r\n", "utf8");
  // A previously-trashed file, exactly as `theme_trash_file` would leave one — used to prove reset
  // and copy both refuse it the same way `theme_write_file`/`theme_edit_file` already do.
  fs.mkdirSync(path.join(plain, ".trash", "1700000000000"), { recursive: true });
  fs.writeFileSync(path.join(plain, ".trash", "1700000000000", "old.css"), "body{color:red}", "utf8");

  const plainCatalog = path.join(root, THEME_CATALOG_DIR, "static", "plain");
  fs.mkdirSync(path.join(plainCatalog, "pages"), { recursive: true });
  fs.writeFileSync(path.join(plainCatalog, "theme.json"), PLAIN_MANIFEST, "utf8");
  fs.writeFileSync(path.join(plainCatalog, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(plainCatalog, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.mkdirSync(path.join(plainCatalog, "css"), { recursive: true });
  fs.writeFileSync(path.join(plainCatalog, "css", "line-endings.css"), "a{}\nb{}\n", "utf8");
  // Deliberately no `author-added.txt` and no `pages/about-1.html` in the catalog.

  const noOriginal = path.join(root, "static", "no-original");
  fs.mkdirSync(path.join(noOriginal, "pages"), { recursive: true });
  fs.writeFileSync(path.join(noOriginal, "theme.json"), NO_ORIGINAL_MANIFEST, "utf8");
  fs.writeFileSync(path.join(noOriginal, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(noOriginal, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  // No `__original-themes__/static/no-original` directory at all.

  const compiled = path.join(root, "static", "compiled");
  fs.mkdirSync(path.join(compiled, "pages"), { recursive: true });
  fs.mkdirSync(path.join(compiled, "src"), { recursive: true });
  fs.writeFileSync(path.join(compiled, "theme.json"), COMPILED_MANIFEST, "utf8");
  fs.writeFileSync(path.join(compiled, "pages", "index.html"), "<html><body>generated</body></html>", "utf8");
  fs.writeFileSync(path.join(compiled, "src", "Header.tsx"), "source", "utf8");

  return root;
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const themesDir = makeThemesRoot();
  const authorize = async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" });
  const deps = {
    workspaceId: WORKSPACE_ID,
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    authorize,
  };
  return { deps: deps as unknown as RouteDeps, themesDir };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function readFile(themesDir: string, themeId: string, relativePath: string): string {
  return fs.readFileSync(path.join(themesDir, "static", themeId, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// theme_reset_file
// ---------------------------------------------------------------------------

test("theme_reset_file: overwrites a diverged live file with the catalog's original bytes", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_reset_file").handler(
    executionContext({ themeId: "plain", path: "tokens.json" })
  )) as { path: string; content: string; bytesWritten: number; wasModified: boolean; status: string };

  assert.equal(result.path, "tokens.json");
  assert.equal(result.wasModified, true);
  assert.equal(result.content, '{"--ink":"#000"}', "the ORIGINAL bytes, not the diverged live ones");
  assert.equal(result.bytesWritten, '{"--ink":"#000"}'.length);
  assert.equal(readFile(themesDir, "plain", "tokens.json"), '{"--ink":"#000"}');
});

test("theme_reset_file: a file already byte-identical to its original is not rewritten, and reports wasModified: false", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const livePath = path.join(themesDir, "static", "plain", "pages", "index.html");
  // A reset copies into a temp file and renames it over the target, so any write at all gives the
  // path a new inode. An unchanged inode is the proof nothing was written.
  const inodeBefore = fs.statSync(livePath).ino;

  const result = (await wired(deps, "theme_reset_file").handler(
    executionContext({ themeId: "plain", path: "pages/index.html" })
  )) as { themeId: string; path: string; wasModified: boolean; bytesWritten: number; content: string; status: string };

  assert.deepEqual(
    { themeId: result.themeId, path: result.path, wasModified: result.wasModified, bytesWritten: result.bytesWritten, content: result.content, status: result.status },
    { themeId: "plain", path: "pages/index.html", wasModified: false, bytesWritten: 0, content: "<html><body>x</body></html>", status: "valid" }
  );
  assert.equal(fs.statSync(livePath).ino, inodeBefore, "an unmodified file must not be rewritten");
});

test("theme_reset_file: a CRLF-only difference from an LF original counts as modified, and the LF bytes are restored", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_reset_file").handler(
    executionContext({ themeId: "plain", path: "css/line-endings.css" })
  )) as { wasModified: boolean; bytesWritten: number };

  assert.equal(result.wasModified, true);
  assert.equal(result.bytesWritten, "a{}\nb{}\n".length);
  assert.equal(readFile(themesDir, "plain", "css/line-endings.css"), "a{}\nb{}\n");
});

/** A real PNG signature, then bytes that are not valid UTF-8: `FF` and `FE` never occur in UTF-8,
 *  and `80` is a lone continuation byte. */
const BINARY_ORIGINAL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80]);

/** Writes `original` into `plain`'s catalog copy and `live` into its live folder at `relativePath`,
 *  returning the live file's absolute path. */
function seedPlainFile(themesDir: string, relativePath: string, original: Buffer, live: Buffer): string {
  const originalPath = path.join(themesDir, THEME_CATALOG_DIR, "static", "plain", relativePath);
  const livePath = path.join(themesDir, "static", "plain", relativePath);
  for (const [target, bytes] of [[originalPath, original], [livePath, live]] as const) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return livePath;
}

function plainFileDiffersFromOriginal(themesDir: string, relativePath: string): boolean | null {
  return themeFileDiffersFromOriginal({
    themeDir: path.join(themesDir, "static", "plain"),
    themesRoot: themesDir,
    originalDir: path.join(themesDir, THEME_CATALOG_DIR, "static", "plain"),
    originalsRoot: path.join(themesDir, THEME_CATALOG_DIR),
    relativePath,
  });
}

function assertSameBytes(actual: Buffer, expected: Buffer): void {
  assert.ok(
    actual.equals(expected),
    `expected ${expected.length} original bytes, got ${actual.length} bytes; first 16 expected ${expected.subarray(0, 16).toString("hex")}, got ${actual.subarray(0, 16).toString("hex")}`
  );
}

test("theme_reset_file: restores a binary original's exact bytes, including bytes that are not valid UTF-8, and the file then compares unmodified", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const edited = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
  const livePath = seedPlainFile(themesDir, "assets/logo.png", BINARY_ORIGINAL, edited);

  const result = (await wired(deps, "theme_reset_file").handler(
    executionContext({ themeId: "plain", path: "assets/logo.png" })
  )) as { wasModified: boolean; bytesWritten: number };

  assertSameBytes(fs.readFileSync(livePath), BINARY_ORIGINAL);
  assert.equal(result.wasModified, true);
  assert.equal(result.bytesWritten, BINARY_ORIGINAL.length);
  assert.equal(plainFileDiffersFromOriginal(themesDir, "assets/logo.png"), false);
});

test("theme_reset_file: a file over the 1 MB text-read limit resets to its exact bytes, and content is null", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  // 200 KB past `MAX_THEME_FILE_BYTES`, with every byte value present.
  const size = 1_000_000 + 200_000;
  const original = Buffer.from(Array.from({ length: size }, (_, i) => (i * 31) & 0xff));
  const livePath = seedPlainFile(themesDir, "assets/big.bin", original, Buffer.alloc(size, 0x61));

  const result = (await wired(deps, "theme_reset_file").handler(
    executionContext({ themeId: "plain", path: "assets/big.bin" })
  )) as { wasModified: boolean; bytesWritten: number; content: string | null };

  assertSameBytes(fs.readFileSync(livePath), original);
  assert.equal(result.wasModified, true);
  assert.equal(result.bytesWritten, size);
  assert.equal(result.content, null, "a file past the text-read limit has no text content to return");
  assert.equal(plainFileDiffersFromOriginal(themesDir, "assets/big.bin"), false);
});

test("theme_reset_file: a live file deleted after install is recreated from its original, wasModified: true", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  fs.rmSync(path.join(themesDir, "static", "plain", "tokens.json"));

  const result = (await wired(deps, "theme_reset_file").handler(
    executionContext({ themeId: "plain", path: "tokens.json" })
  )) as { wasModified: boolean; bytesWritten: number };

  assert.equal(result.wasModified, true);
  assert.equal(result.bytesWritten, '{"--ink":"#000"}'.length);
  assert.equal(readFile(themesDir, "plain", "tokens.json"), '{"--ink":"#000"}');
});

test("theme_reset_file's description states the unmodified-file no-op, and no longer claims there is no modified check", () => {
  const entry = getThemesAgentToolCatalog().find((tool) => tool.name === "theme_reset_file");
  assert.ok(entry);
  assert.ok(
    entry.description.includes(
      "If the live file already matches its original byte-for-byte, nothing is written: the call succeeds with wasModified: false and bytesWritten: 0."
    ),
    entry.description
  );
  assert.ok(
    entry.description.includes("a line-ending-only difference (CRLF vs LF) counts as modified"),
    entry.description
  );
  assert.doesNotMatch(entry.description, /regardless of whether the live file actually differs/);
  assert.doesNotMatch(entry.description, /no separate 'was this file actually modified' check/);
});

test("theme_reset_file's search keywords carry modified/changed vocabulary", () => {
  const keywords = TOOL_SEARCH_KEYWORDS["theme_reset_file"];
  assert.ok(keywords);
  assert.match(keywords, /\bmodified\b/);
  assert.match(keywords, /\bchanged\b/);
});

test("theme_reset_file: a theme with no stored original at all is refused, and nothing is touched", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = readFile(themesDir, "no-original", "tokens.json");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "no-original", path: "tokens.json" })),
    /has no stored original/
  );
  assert.equal(readFile(themesDir, "no-original", "tokens.json"), before);
});

test("theme_reset_file: a file the author added after install has no catalog counterpart and is refused", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = readFile(themesDir, "plain", "author-added.txt");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: "author-added.txt" })),
    /is not in this theme's original/
  );
  assert.equal(readFile(themesDir, "plain", "author-added.txt"), before, "a refused reset must not touch disk");
});

test("theme_reset_file: a built theme's generated-readonly file is refused outright — no whole-tree revert is offered here", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = readFile(themesDir, "compiled", "pages/index.html");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "compiled", path: "pages/index.html" })),
    /read-only/
  );
  assert.equal(readFile(themesDir, "compiled", "pages/index.html"), before);
});

test("theme_reset_file: a path inside .trash/ is refused — restore it first", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const trashedPath = ".trash/1700000000000/old.css";
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: trashedPath })),
    /inside the trash/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", trashedPath)), true);
});

test("theme_reset_file refuses when authorize() denies, and never touches disk", async () => {
  const { deps, themesDir } = fakeRouteDeps({ allow: false });
  const before = readFile(themesDir, "plain", "tokens.json");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: "tokens.json" })),
    /not authorized/
  );
  assert.equal(readFile(themesDir, "plain", "tokens.json"), before);
});

test("theme_reset_file refuses a ../ escape into a sibling theme's folder, leaving it untouched", async () => {
  // The catalog check `resetThemeFileToOriginal` does first resolves `path` against the CATALOG copy
  // of `plain`, through the identical `resolveThemeFilePath` containment check every other path in
  // this domain goes through — so `../compiled/theme.json` is refused there, before the live side is
  // ever resolved or written. The refusal surfaces as "not in this theme's original", not "outside
  // the theme folder": a catalog-side containment failure means "no original for this path", the
  // same answer `explore.ts`'s per-file reset route gives as NOT_IN_ORIGINAL. The wording
  // differs from the read/write tools' own escape message; the safety property — nothing outside
  // `plain`'s own folder is ever read or written — is the same.
  const { deps, themesDir } = fakeRouteDeps();
  const victim = path.join(themesDir, "static", "compiled", "theme.json");
  const before = fs.readFileSync(victim, "utf8");
  await assert.rejects(
    () => wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: "../compiled/theme.json" })),
    /is not in this theme's original/
  );
  assert.equal(fs.readFileSync(victim, "utf8"), before, "the sibling theme's file must be untouched");
});

test("theme_reset_file refreshes the live routeDeps.themes entry, matching theme_write_file's live-state coupling", async () => {
  const { deps } = fakeRouteDeps();
  await wired(deps, "theme_reset_file").handler(executionContext({ themeId: "plain", path: "tokens.json" }));
  const live = deps.themes.find((t) => t.manifest.id === "plain");
  assert.equal(live?.status, "valid");
});

// ---------------------------------------------------------------------------
// theme_copy_file
// ---------------------------------------------------------------------------

test("theme_copy_file: duplicates a file under the next available name, byte-for-byte", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_copy_file").handler(
    executionContext({ themeId: "plain", path: "tokens.json" })
  )) as { path: string; copiedFrom: string };

  assert.equal(result.path, "tokens-1.json");
  assert.equal(result.copiedFrom, "tokens.json");
  assert.equal(readFile(themesDir, "plain", "tokens-1.json"), '{"--ink":"#111"}');
  // The original is untouched by its own copy.
  assert.equal(readFile(themesDir, "plain", "tokens.json"), '{"--ink":"#111"}');
});

test("theme_copy_file: when 'name-1' is already taken, the collision loop runs again and lands on '-2'", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_copy_file").handler(
    executionContext({ themeId: "plain", path: "pages/about.html" })
  )) as { path: string };
  assert.equal(result.path, "pages/about-2.html", "about.html and about-1.html both already exist, so the next free suffix is -2");
  assert.equal(readFile(themesDir, "plain", "pages/about-2.html"), "<html><body>about</body></html>");
});

test("theme_copy_file: a source path that does not exist in the theme is refused", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: "pages/nope.html" })),
    /was not found in this theme/
  );
});

test("theme_copy_file: a built theme's generated-readonly file is refused", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "compiled", path: "pages/index.html" })),
    /read-only/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "pages", "index-1.html")), false);
});

test("theme_copy_file: a path inside .trash/ is refused — copying a trashed file would be a second, unaudited way out of the trash", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: ".trash/1700000000000/old.css" })),
    /inside the trash/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "old.css")), false);
});

test("theme_copy_file refuses when authorize() denies, and never touches disk", async () => {
  const { deps, themesDir } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: "tokens.json" })),
    /not authorized/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "tokens-1.json")), false);
});

test("theme_copy_file refuses a ../ escape into a sibling theme's folder, and creates nothing there", async () => {
  // `existingPaths` comes from `listThemeFiles`, a bounded walk of `plain`'s OWN folder that never
  // descends outside it (theme-files.test.ts's own escape/symlink suite proves that walk directly) —
  // so `"../compiled/theme.json"` is simply never a member of that set, and the source-existence
  // check refuses it before `copyThemeFile`'s own (separately contained) filesystem resolution is
  // ever reached. Different refusal message than the read/write tools' direct escape check
  // ("outside the theme folder"), same guarantee: nothing outside `plain`'s own folder is read,
  // and nothing is created in the sibling theme's folder.
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: "../compiled/theme.json" })),
    /was not found in this theme/
  );
  assert.equal(fs.existsSync(path.join(themesDir, "static", "compiled", "theme-1.json")), false);
});

test("theme_copy_file refreshes the live routeDeps.themes entry, and the copy shows up in a subsequent listing", async () => {
  const { deps } = fakeRouteDeps();
  await wired(deps, "theme_copy_file").handler(executionContext({ themeId: "plain", path: "tokens.json" }));
  const filesAfter = (await wired(deps, "theme_list_files").handler(executionContext({ themeId: "plain" }))) as { files: string[] };
  assert.ok(filesAfter.files.includes("tokens-1.json"));
});
