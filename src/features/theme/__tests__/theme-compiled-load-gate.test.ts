import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTheme } from "../theme.js";

/**
 * @file ADR-020 §5 (2026-08-12) — the install-time gate `loadTheme()` runs for a `build.source:
 * "compiled"` theme (`build-conformance.ts`, wired at `theme.ts`'s `loadStaticTierAssets` call site).
 * Verifies it is a HARD failure (`status: "invalid"`), not the runtime `console.warn`
 * `static-render.ts` uses for the same missing-sentinel/unrewritten-asset conditions — and that an
 * authored theme (no `build`, all 7 live themes) never runs any of this, unchanged.
 */

const SENTINEL = '<link rel="stylesheet" href="../css/styles.css" />';

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/** A minimally valid compiled theme: one page, one stylesheet, correct hashes for both. Callers
 * mutate the returned `pageHtml`/extra files before writing to exercise one failure mode at a time. */
function writeCompiledTheme(
  root: string,
  id: string,
  options: {
    pageHtml?: string;
    cssContent?: string;
    artifactHashesOverride?: Record<string, string>;
    extraFiles?: Record<string, string>;
  } = {}
): string {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  const pageHtml =
    options.pageHtml ?? `<!doctype html><html><head>${SENTINEL}</head><body>Compiled home</body></html>`;
  const cssContent = options.cssContent ?? "body{margin:0}";

  fs.writeFileSync(path.join(dir, "pages", "index.html"), pageHtml, "utf8");
  fs.writeFileSync(path.join(dir, "css", "styles.css"), cssContent, "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "src", "Header.tsx"), "export const Header = () => null;", "utf8");

  for (const [relativePath, content] of Object.entries(options.extraFiles ?? {})) {
    const absolute = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, "utf8");
  }

  const artifactHashes = options.artifactHashesOverride ?? {
    "pages/index.html": sha256(pageHtml),
    "css/styles.css": sha256(cssContent),
    // tokens.json (written above) is neither "theme.json" nor under sourceDir, so it counts as
    // generated too (resolveThemeFileWriteScope has no special case for it, see explore-built-theme-
    // gate.test.ts's own comment on the identical fixture shape) -- the full-tree inventory now flags
    // it as an unlisted file if it's left out here.
    "tokens.json": sha256("{}"),
  };

  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({
      id,
      name: id,
      version: "1.0.0",
      tier: "static",
      engine: 1,
      author: "Aurora Themes Co.",
      build: { source: "compiled", framework: "react", sourceDir: "src", artifactHashes },
    })
  );

  return dir;
}

test("a well-formed compiled theme (sentinel, rewritable assets, matching hashes) loads valid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const dir = writeCompiledTheme(root, "aurora-react");
  const theme = loadTheme({ themeDir: dir, id: "aurora-react", source: "site" });

  assert.equal(theme.status, "valid", `expected valid, got errors: ${JSON.stringify(theme.errors)}`);
});

test("a missing stylesheet sentinel is a HARD install-time failure, not a runtime warning", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const pageHtml = "<!doctype html><html><head></head><body>no sentinel</body></html>";
  const dir = writeCompiledTheme(root, "no-sentinel", { pageHtml });

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  let theme;
  try {
    theme = loadTheme({ themeDir: dir, id: "no-sentinel", source: "site" });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e.includes("stylesheet-sentinel") && e.includes("missing the literal stylesheet tag")),
    `expected a stylesheet-sentinel error, got ${JSON.stringify(theme.errors)}`
  );
  // The install-time gate is a HARD failure at load time, not the runtime console.warn path —
  // loadTheme() never reaches renderStaticPage, so no warning should have fired here at all.
  assert.deepEqual(warnings, []);
});

test("a stylesheet sentinel duplicated on the page is also rejected (later duplicates would get no tokens)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const pageHtml = `<!doctype html><html><head>${SENTINEL}${SENTINEL}</head><body>x</body></html>`;
  const dir = writeCompiledTheme(root, "double-sentinel", { pageHtml });

  const theme = loadTheme({ themeDir: dir, id: "double-sentinel", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(theme.errors.some((e) => e.includes("stylesheet-sentinel") && e.includes("appears 2 times")));
});

test("an unquoted asset href that the rewriter cannot recognize fails the gate, naming the reference", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const pageHtml = `<!doctype html><html><head>${SENTINEL}<link rel="stylesheet" href=../css/extra.css /></head><body>x</body></html>`;
  const dir = writeCompiledTheme(root, "bad-asset-path", { pageHtml });

  const theme = loadTheme({ themeDir: dir, id: "bad-asset-path", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e.includes("asset-path") && e.includes("cannot be rewritten")),
    `expected an asset-path error, got ${JSON.stringify(theme.errors)}`
  );
});

test("a rewritable (quoted) asset href does NOT fail the gate — this is not a fork of the runtime rewrite logic", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const pageHtml = `<!doctype html><html><head>${SENTINEL}<link rel="stylesheet" href='../css/extra.css' /></head><body>x</body></html>`;
  const dir = writeCompiledTheme(root, "single-quoted-asset", { pageHtml });

  const theme = loadTheme({ themeDir: dir, id: "single-quoted-asset", source: "site" });

  assert.equal(theme.status, "valid", `expected valid, got errors: ${JSON.stringify(theme.errors)}`);
});

test("an island with no server-rendered content fails the gate, naming why (crawler visibility)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const pageHtml = `<!doctype html><html><head>${SENTINEL}</head><body><div data-tovu-island="cart"></div></body></html>`;
  const dir = writeCompiledTheme(root, "empty-island", { pageHtml });

  const theme = loadTheme({ themeDir: dir, id: "empty-island", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some(
      (e) => e.includes("island-content") && e.includes("GPTBot") && e.includes("no server-rendered text content")
    ),
    `expected an island-content error, got ${JSON.stringify(theme.errors)}`
  );
});

test("an island that already contains real server-rendered content passes the gate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const pageHtml = `<!doctype html><html><head>${SENTINEL}</head><body><div data-tovu-island="cart">2 items in cart</div></body></html>`;
  const dir = writeCompiledTheme(root, "filled-island", { pageHtml });

  const theme = loadTheme({ themeDir: dir, id: "filled-island", source: "site" });

  assert.equal(theme.status, "valid", `expected valid, got errors: ${JSON.stringify(theme.errors)}`);
});

test("a generated file whose bytes drifted from its recorded artifactHashes digest fails the gate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const dir = writeCompiledTheme(root, "drifted", {
    artifactHashesOverride: { "pages/index.html": "0".repeat(64), "css/styles.css": sha256("body{margin:0}") },
  });

  const theme = loadTheme({ themeDir: dir, id: "drifted", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e.includes("artifact-hash") && e.includes("pages/index.html") && e.includes("does not match")),
    `expected an artifact-hash mismatch error, got ${JSON.stringify(theme.errors)}`
  );
});

test("an artifactHashes entry naming a file that does not exist on disk fails the gate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const dir = writeCompiledTheme(root, "missing-file", {
    artifactHashesOverride: {
      "pages/index.html": sha256(`<!doctype html><html><head>${SENTINEL}</head><body>Compiled home</body></html>`),
      "js/main.js": "a".repeat(64),
    },
  });

  const theme = loadTheme({ themeDir: dir, id: "missing-file", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e.includes("artifact-hash") && e.includes("js/main.js") && e.includes("does not exist on disk"))
  );
});

test("a sha256:-prefixed digest in theme.json is accepted the same as a bare hex digest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const cssContent = "body{margin:0}";
  const pageHtml = `<!doctype html><html><head>${SENTINEL}</head><body>Compiled home</body></html>`;
  const dir = writeCompiledTheme(root, "prefixed-hash", {
    pageHtml,
    cssContent,
    artifactHashesOverride: {
      "pages/index.html": `sha256:${sha256(pageHtml)}`,
      "css/styles.css": `sha256:${sha256(cssContent)}`,
      "tokens.json": `sha256:${sha256("{}")}`,
    },
  });

  const theme = loadTheme({ themeDir: dir, id: "prefixed-hash", source: "site" });

  assert.equal(theme.status, "valid", `expected valid, got errors: ${JSON.stringify(theme.errors)}`);
});

test("an authored theme (no build field) never runs the compiled gate at all — zero behavior change", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  const dir = path.join(root, "plain-authored");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  // Deliberately NO sentinel, NO tovu-island content, and a bogus asset href — every one of these
  // would fail the compiled gate. An authored theme still only gets the pre-existing runtime warnings.
  fs.writeFileSync(
    path.join(dir, "pages", "index.html"),
    '<!doctype html><html><head><link rel="stylesheet" href=../css/x.css /></head><body><div data-tovu-island="x"></div></body></html>'
  );
  fs.writeFileSync(path.join(dir, "css", "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain-authored", name: "Plain Authored", version: "1.0.0", tier: "static", engine: 1 })
  );

  const theme = loadTheme({ themeDir: dir, id: "plain-authored", source: "site" });

  assert.equal(theme.status, "valid", `expected valid (no compiled gate for an authored theme), got: ${JSON.stringify(theme.errors)}`);
});

test("one theme failing the compiled gate does not prevent discovery of its siblings (SPEC-004 REQ-10)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-compiled-gate-"));
  writeCompiledTheme(root, "good-compiled");
  writeCompiledTheme(root, "bad-compiled", { pageHtml: "<!doctype html><html><head></head><body>x</body></html>" });

  const good = loadTheme({ themeDir: path.join(root, "good-compiled"), id: "good-compiled", source: "site" });
  const bad = loadTheme({ themeDir: path.join(root, "bad-compiled"), id: "bad-compiled", source: "site" });

  assert.equal(good.status, "valid");
  assert.equal(bad.status, "invalid");
});
