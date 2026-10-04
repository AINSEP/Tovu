import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

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
  const moduleUrl = pathToFileURL(path.join(product, "src", "server", "runtime", "composition", "deps.ts")).href;
  const worker = path.join(product, "stock-paths.mjs");
  writeFileSync(worker, `const { builtInThemesDir, bundledAgentPluginsDir } = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify([builtInThemesDir(), bundledAgentPluginsDir()]));`);
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
 * Every `cp -R <src>/. <dest>/` pair in the `build` script, in command order.
 *
 * @complexity O(n) over the length of the build script string.
 */
function assetCopies(buildScript: string): { from: string; to: string; at: number }[] {
  const copies: { from: string; to: string; at: number }[] = [];
  const pattern = /cp -R (\S+)\/\. (\S+)\/(?=\s|$)/g;
  for (let m = pattern.exec(buildScript); m !== null; m = pattern.exec(buildScript)) {
    copies.push({ from: m[1], to: m[2], at: m.index });
  }
  return copies;
}

/**
 * The root `build` script with every root-level `npm run <script>` it delegates to inlined in place,
 * i.e. the command chain `npm run build` actually executes. Since 505f46df7 `build` is only the
 * linked-Jini guard plus `npm run build:server`; the asset copies live in `build:server`. Reading
 * `scripts.build` alone would see no copies at all. `--workspace=` runs are left as-is: they execute
 * another package's script, not a root one.
 *
 * @complexity O(n) over the total length of the inlined scripts.
 */
function expandedBuildScript(): string {
  const scripts = (JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  }).scripts;
  const expand = (name: string, seen: Set<string>): string => {
    assert.ok(!seen.has(name), `package.json script "${name}" delegates to itself`);
    const body = scripts[name];
    assert.equal(typeof body, "string", `package.json has no "${name}" script`);
    return body.replace(/npm run ([\w:-]+)(?![^&|]*--workspace)/g, (_, next: string) =>
      expand(next, new Set([...seen, name])),
    );
  };
  return expand("build", new Set());
}

test("the build script copies stock data to dist/content, not dist/src", () => {
  const buildScript = expandedBuildScript();

  const stock = assetCopies(buildScript).filter((c) => c.from.startsWith("content/"));
  assert.deepEqual(
    stock.map((c) => `${c.from} -> ${c.to}`).sort(),
    [
      "content/agent-plugins -> dist/content/agent-plugins",
      "content/public -> dist/content/public",
      "content/templates -> dist/content/templates",
      "content/themes -> dist/content/themes",
    ],
    "all four stock trees must be copied from content/ to dist/content/",
  );
});

test("every asset copy in the build script cleans its destination first", (t) => {
  const buildScript = expandedBuildScript();

  for (const copy of assetCopies(buildScript)) {
    // Any `rm -rf` BEFORE this copy that names the destination or one of its ancestors. Ancestors
    // count because `rm -rf dist/content` legitimately cleans `dist/content/themes` too.
    const ancestors = new Set<string>();
    const segments = copy.to.split("/");
    for (let i = 1; i <= segments.length; i += 1) ancestors.add(segments.slice(0, i).join("/"));

    const cleaned = [...buildScript.slice(0, copy.at).matchAll(/rm -rf ([^&|]+)/g)]
      .flatMap((m) => m[1].trim().split(/\s+/))
      .some((target) => ancestors.has(target));

    assert.ok(
      cleaned,
      `build script copies into ${copy.to} without an earlier "rm -rf" of it or an ancestor; ` +
        `deleted source files would survive in dist/ forever (this is how dist/src/themes/ came to ` +
        `ship column, grayscale, handlebars and liquidjs after they were removed from source)`,
    );
  }

  // Execute the actual asset commands, with compilation excluded, in a disposable tree.
  const fixture = mkdtempSync(path.join(tmpdir(), "tovu-asset-copy-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const copies = assetCopies(buildScript);
  assert.ok(copies.length > 0);
  for (const copy of copies) {
    mkdirSync(path.join(fixture, copy.from), { recursive: true });
    mkdirSync(path.join(fixture, copy.to), { recursive: true });
    writeFileSync(path.join(fixture, copy.from, "current.txt"), `current ${copy.from}`);
    writeFileSync(path.join(fixture, copy.to, "stale.txt"), "deleted from source");
    assert.ok(existsSync(path.join(fixture, copy.to, "stale.txt")));
  }
  for (const command of buildScript.split("&&").map(part => part.trim())) {
    if (!/\b(?:rm -rf|mkdir -p|cp -R)\b/.test(command)) continue;
    const result = spawnSync("sh", ["-c", command], { cwd: fixture, encoding: "utf8" });
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  }
  for (const copy of copies) {
    assert.equal(existsSync(path.join(fixture, copy.to, "stale.txt")), false, `${copy.to} retained stale data`);
    assert.equal(readFileSync(path.join(fixture, copy.to, "current.txt"), "utf8"), `current ${copy.from}`);
  }
});
