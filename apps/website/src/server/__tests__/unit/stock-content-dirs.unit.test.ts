import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

import { builtInThemesDir, bundledAgentPluginsDir } from "../../runtime/composition/deps.js";

/**
 * @file Regression coverage for the 2026-08-27 `src/` -> `content/` stock-data move.
 *
 * Purpose:
 * Shipped DATA (themes, templates, bundled agent plugins, the `/agent-icons` static tree) no longer
 * lives inside `src/`. It lives in a tracked, read-only top-level `content/`. Two things can break
 * silently when that tree moves, and neither is caught by `tsc` (none of these directories holds a
 * single `.ts` file, so nothing imports them):
 *
 *  1. **Layout portability.** Every one of these paths is resolved via `resolveProductRoot()`
 *     (`product-root.ts`), a walk-up that finds the nearest ancestor with both a `package.json` and a
 *     `content/` dir — deliberately NOT a fixed `../` count off `import.meta.dirname` (CR-R04 — see
 *     `deps.ts`'s `builtInThemesDir` header). Since the 2026-08-27 `apps/website/` rename, the SOURCE
 *     tree (`apps/website/src/server/` -> `<repo-root>/content`) and the COMPILED tree
 *     (`dist/src/server/` -> `dist/content`) sit at DIFFERENT depths below their own root, so a fixed
 *     relative offset can never be correct in both at once (`product-root.ts`'s own header). This file
 *     asserts the resolved ABSOLUTE destination against the real filesystem instead — the one thing
 *     both trees actually have to agree on.
 *
 *  2. **Build staleness.** `dist/` is never cleaned wholesale, so an asset copy that only ever adds
 *     files leaves deleted themes behind forever. Before this change `dist/src/themes/` carried four
 *     theme folders (`column`, `grayscale`, `handlebars`, `liquidjs`) that had not existed in source
 *     for weeks, and a published image shipped them. Deleting them once fixes nothing; the copy step
 *     has to clean its own target.
 *
 * Architectural role:
 * A repo-invariant test, not a unit of product logic. It reads the real `package.json` and the real
 * `deps.ts` exports rather than a fixture, because a fixture could not observe either regression.
 */

/** `apps/website/src/server/__tests__/unit/` -> repo root. */
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");

/** The directory `deps.ts` itself resolves from, i.e. what `import.meta.dirname` sees there. */
const DEPS_DIR = path.join(REPO_ROOT, "apps", "website", "src", "server");

/** The directory `site-dir/read-template.ts` resolves `TEMPLATES_ROOT` from. */
const SITE_DIR_DIR = path.join(REPO_ROOT, "apps", "website", "src", "platform", "site-dir");

/**
 * Both env overrides must be unset for these assertions to describe the package-relative default
 * rather than whatever a developer exported. Asserted rather than deleted: silently mutating the
 * process env would make a real misconfiguration look like a pass.
 */
function assertNoStockDirOverride(): void {
  assert.equal(
    process.env.TOVU_STOCK_THEMES_DIR,
    undefined,
    "TOVU_STOCK_THEMES_DIR is set; this test asserts the package-relative DEFAULT",
  );
  assert.equal(
    process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR,
    undefined,
    "TOVU_BUNDLED_AGENT_PLUGINS_DIR is set; this test asserts the package-relative DEFAULT",
  );
}

test("stock themes resolve to content/themes via the product-root walk-up, landing on the real repo root's content/", () => {
  assertNoStockDirOverride();

  // Not a fixed `../` count: `builtInThemesDir()` walks up via `resolveProductRoot()` precisely
  // because a fixed offset from `DEPS_DIR` cannot be correct in both the source tree
  // (`apps/website/src/server`, four levels above `content/`) and the compiled tree (`dist/src/server`,
  // two levels above `dist/content/`) at once -- see `product-root.ts`'s own header. What both trees
  // DO share is the absolute destination, so that -- not the relative offset -- is what this asserts.
  assert.equal(
    path.relative(DEPS_DIR, builtInThemesDir()),
    path.join("..", "..", "..", "..", "content", "themes"),
    "builtInThemesDir() must land on <repo-root>/content/themes from this source tree's DEPS_DIR",
  );
  assert.equal(builtInThemesDir(), path.join(REPO_ROOT, "content", "themes"));
  assert.ok(existsSync(builtInThemesDir()), `${builtInThemesDir()} does not exist`);
  assert.ok(existsSync(path.join(builtInThemesDir(), "static", "tovu-theme", "theme.json")));
});

test("bundled agent plugins resolve to content/agent-plugins via the product-root walk-up", () => {
  assertNoStockDirOverride();

  assert.equal(
    path.relative(DEPS_DIR, bundledAgentPluginsDir()),
    path.join("..", "..", "..", "..", "content", "agent-plugins"),
  );
  assert.equal(bundledAgentPluginsDir(), path.join(REPO_ROOT, "content", "agent-plugins"));
  assert.ok(existsSync(path.join(bundledAgentPluginsDir(), "site-compliance")));
});

test("stock resolvers work from a dist/src module layout independently of cwd", (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "tovu-stock-layout-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const product = path.join(fixture, "dist");
  const elsewhere = path.join(fixture, "unrelated-cwd");
  mkdirSync(path.join(product, "content", "themes"), { recursive: true });
  mkdirSync(path.join(product, "content", "agent-plugins"), { recursive: true });
  mkdirSync(elsewhere);
  writeFileSync(path.join(product, "package.json"), JSON.stringify({ type: "module", imports: { "#src/*": "./src/*.ts" } }));
  // Preserve the module location while loading the real source with tsx; no hand-copied resolver.
  symlinkSync(path.join(REPO_ROOT, "apps", "website", "src"), path.join(product, "src"), "dir");
  symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(product, "node_modules"), "dir");
  const moduleUrl = pathToFileURL(path.join(product, "src", "platform", "site-dir", "product-root.ts")).href;
  const worker = path.join(product, "stock-paths.mjs");
  // Only the two real resolver bodies need the product-root port. Importing the entire composition
  // also loads every feature and its boot graph under a second symlink identity; none of that is
  // part of this path contract, and it exhausted the child deadline in the snapshot run.
  const source = ts.createSourceFile("deps.ts", readFileSync(path.join(REPO_ROOT, "apps/website/src/server/runtime/composition/deps.ts"), "utf8"), ts.ScriptTarget.Latest, true);
  const resolverSource = ["builtInThemesDir", "bundledAgentPluginsDir"].map((name) => {
    const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration, `missing resolver ${name}`);
    return declaration.getText(source).replace(/^export\s+/, "");
  }).join("\n");
  const compiled = ts.transpileModule(resolverSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  writeFileSync(worker, `import { join } from "node:path"; const { resolveProductRoot } = await import(${JSON.stringify(moduleUrl)});\n${compiled}\nconsole.log(JSON.stringify([builtInThemesDir(), bundledAgentPluginsDir()]));`);
  const env = { ...process.env };
  delete env.TOVU_STOCK_THEMES_DIR;
  delete env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
  const result = spawnSync(process.execPath, [
    "--preserve-symlinks", "--import", import.meta.resolve("tsx"), worker,
  ], { cwd: elsewhere, env, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), [path.join(product, "content", "themes"), path.join(product, "content", "agent-plugins")]);
});

test("site templates resolve to content/templates via the product-root walk-up", () => {
  // `read-template.ts` holds `TEMPLATES_ROOT` in a module-private const with no accessor, so the
  // offset is asserted against the source text. Weaker than calling an export, but it is the only
  // way to observe the constant, and the alternative -- asserting only that `readTemplate("starter")`
  // succeeds -- would pass just as happily on a cwd-relative path that breaks under `dist/`.
  const source = readFileSync(path.join(SITE_DIR_DIR, "read-template.ts"), "utf8");
  assert.match(
    source,
    /path\.join\(\s*resolveProductRoot\(\),\s*"content",\s*"templates"\s*\)/,
    "read-template.ts must resolve TEMPLATES_ROOT via resolveProductRoot(), not a fixed ../ count, so it lands correctly in both the source and compiled trees",
  );
  assert.ok(existsSync(path.join(REPO_ROOT, "content", "templates", "starter", "template.json")));
});

test("no stock data directory is left behind inside src/", () => {
  for (const stale of ["themes", "templates", "public", "agent-plugins"]) {
    for (const sourceRoot of ["src", "apps/website/src"]) {
      assert.equal(
        existsSync(path.join(REPO_ROOT, sourceRoot, stale)),
        false,
        `${sourceRoot}/${stale} still exists; stock data belongs in content/`,
      );
    }
  }
});

/**
 * Stage the real build owner's assets in a disposable tree, with only its compiler/process port
 * replaced. The old shell's `cp -R`/`rm -rf` spelling is no longer the contract: deleted source
 * files must not survive in dist/ (this is how dist/src/themes shipped column, grayscale,
 * handlebars and liquidjs after they were removed from source).
 * `build` delegates to `build:server`; reading scripts.build alone misses the actual asset owner.
 * @complexity O(n) fixture writes for the fixed asset roots, plus buildServer's filesystem copies.
 */
async function stageBuildAssets(t: import("node:test").TestContext): Promise<string> {
  const scripts = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).scripts;
  assert.match(scripts.build, /npm run build:server/);
  assert.equal(scripts["build:server"], "node development/scripts/build-server.mjs");
  const { buildServer } = await import(pathToFileURL(path.join(REPO_ROOT, "development/scripts/build-server.mjs")).href);
  const fixture = mkdtempSync(path.join(tmpdir(), "tovu-asset-copy-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const relative of ["content/templates", "content/themes", "content/agent-plugins", "content/public", "src/platform/db/drizzle"]) {
    const source = relative.startsWith("src/") ? path.join(fixture, "apps/website", relative) : path.join(fixture, relative);
    const destination = path.join(fixture, "dist", relative);
    mkdirSync(source, { recursive: true });
    mkdirSync(destination, { recursive: true });
    writeFileSync(path.join(source, ".current"), relative);
    writeFileSync(path.join(destination, "stale.txt"), "deleted from source");
    assert.ok(existsSync(path.join(destination, "stale.txt")));
  }
  // Execute the actual asset commands, with compilation excluded, in a disposable tree.
  buildServer({ repoRoot: fixture }, { npmCli: "/fake/npm-cli.js", tscCli: "/fake/tsc", runNode: () => {} });
  return fixture;
}

test("the build script copies stock data to dist/content, not dist/src", async (t) => {
  const fixture = await stageBuildAssets(t);
  for (const relative of ["content/templates", "content/themes", "content/agent-plugins", "content/public"]) {
    assert.equal(readFileSync(path.join(fixture, "dist", relative, ".current"), "utf8"), relative);
    assert.equal(existsSync(path.join(fixture, "dist/src", relative.slice("content/".length))), false);
  }
});

test("every asset copy in the build script cleans its destination first", async (t) => {
  const fixture = await stageBuildAssets(t);
  for (const relative of ["content/templates", "content/themes", "content/agent-plugins", "content/public", "src/platform/db/drizzle"]) {
    // An ancestor clean counts: cleaning dist/content also cleans dist/content/themes. The
    // observable contract is that deleted source files cannot survive, whatever the command syntax.
    assert.equal(existsSync(path.join(fixture, "dist", relative, "stale.txt")), false, `${relative} retained stale data`);
    assert.equal(readFileSync(path.join(fixture, "dist", relative, ".current"), "utf8"), relative);
  }
});
