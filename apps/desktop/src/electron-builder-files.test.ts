/**
 * @file The `files:` list in `electron-builder.yml` must actually ship every file the main process
 * resolves at runtime — asserted against the real config, with the real matcher semantics.
 *
 * ## The defect this exists for
 *
 * `main.ts`'s `announceDesktopToolsToSite` generates the MCP launcher with
 * `bridgePath: path.join(__dirname, "bin", "mcp-bridge.ts")`. In a packaged app `__dirname` is the
 * `app.asar` root, so that path is only real if `bin/` was packed. It was not: the `files:` list
 * named `main.js`, `package.json`, `dist/**` and `src/**`, and `bin/` matched none of them.
 *
 * The reason this is easy to get wrong is that electron-builder's default is `(all-files glob)` — but only
 * CONDITIONALLY. `app-builder-lib/out/fileMatcher.js`:
 *
 *     if (!matcher.isSpecifiedAsEmptyArray && (matcher.isEmpty() || matcher.containsOnlyIgnore())) {
 *       customFirstPatterns.push("(all-files glob)");
 *     }
 *
 * The permissive default is prepended ONLY when the list is empty or contains nothing but `!`
 * negations. The moment one positive pattern is added, the list becomes exhaustive and every
 * further file has to be named. So adding a positive entry silently un-ships everything unnamed,
 * which is the opposite of what the intuition ("patterns narrow a default") predicts.
 *
 * Measured consequence before the fix, against a real signed bundle: the launcher pointed at a
 * nonexistent script, the spawned child produced nothing, and `attachFederatedMcpTools` gave up
 * with `connect timed out after 15000ms`. Because `announceDesktopToolsToSite` is fire-and-forget,
 * that surfaced as a 15-second stall at every site open and an assistant silently missing its
 * desktop tools — no error the operator could see.
 *
 * ## Why the second test matters
 *
 * A test that only asserts the current config passes would also pass if {@link shipsPath} were
 * `() => true`. The pre-fix pattern list is therefore kept here as a literal and asserted to be
 * REFUSED, which pins the predicate's teeth without reverting the working tree.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import os from "node:os";
import { getMainFileMatchers, getNodeModuleFileMatcher, getFileMatchers, copyFiles, type FileMatcher } from "app-builder-lib/out/fileMatcher.js";

/** The packager fields read by the installed internal matcher implementation. */
interface MatcherPackager {
  config: Parameters<typeof getFileMatchers>[0];
  projectDir: string;
  buildResourcesDir: string;
  isPrepackedAppAsar?: boolean;
  debugLogger: { isEnabled: boolean; add(key: string, patterns: string[]): void };
}

// electron-builder exports these functions in fileMatcher.js but strips their @internal
// declarations from fileMatcher.d.ts. Keep the real production helpers in these tests;
// describe their consumed inputs instead of casting incomplete packagers to never.
declare module "app-builder-lib/out/fileMatcher.js" {
  export function getMainFileMatchers(
    appDir: string, destination: string, macroExpander: (pattern: string) => string,
    platformSpecificBuildOptions: Parameters<typeof getFileMatchers>[3]["customBuildOptions"],
    platformPackager: { info: MatcherPackager }, outDir: string, isElectronCompile: boolean,
  ): FileMatcher[];
  export function getNodeModuleFileMatcher(
    appDir: string, destination: string, macroExpander: (pattern: string) => string,
    platformSpecificBuildOptions: Parameters<typeof getFileMatchers>[3]["customBuildOptions"],
    packager: MatcherPackager,
  ): FileMatcher;
  export function copyFiles(matchers: FileMatcher[] | null, transformer: undefined, isUseHardLink: boolean): Promise<void | void[]>;
}

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(DESKTOP_ROOT, "electron-builder.yml");

/** The exact list as it stood before 2026-09-12, kept so the predicate below can be shown to reject
 *  it. Do not "fix" this fixture — it is the bug, preserved on purpose. */
const PRE_FIX_PATTERNS = ["main.ts", "package.json", "dist/**", "src/**", "!**/*.map", "!src/**/*.test.js", "!src/**/*.test.ts"];

/** Use the production matcher builder, including its built-in exclusions. */
function matcherPackager(patterns: readonly string[]) {
  return { config: { files: [...patterns] }, projectDir: DESKTOP_ROOT, buildResourcesDir: "build",
    debugLogger: { isEnabled: false, add: () => assert.fail("disabled debug logger must not be called") } };
}

function shipsPath(patterns: readonly string[], relPath: string): boolean {
  const matchers = getMainFileMatchers(DESKTOP_ROOT, "/fixture-dest", (value: string) => value, {},
    { info: matcherPackager(patterns) }, path.join(DESKTOP_ROOT, "release"), false);
  const matcher = matchers[0];
  assert.ok(matcher);
  return matcher.createFilter()(path.join(DESKTOP_ROOT, relPath), { isDirectory: () => false } as fs.Stats);
}

function configuredFilePatterns(): string[] {
  // `as`: js-yaml's `load` returns `unknown` (the YAML could hold anything); the assert right below
  // is this file's actual runtime check that `files` is really an array, same as before annotation.
  const config = yaml.load(fs.readFileSync(CONFIG_PATH, "utf8")) as { files?: unknown };
  assert.ok(Array.isArray(config.files), "electron-builder.yml must declare a files: array");
  return config.files as string[];
}

test("the packaged app ships bin/mcp-bridge.ts, which the generated MCP launcher execs", () => {
  assert.equal(
    shipsPath(configuredFilePatterns(), "bin/mcp-bridge.ts"),
    true,
    "electron-builder.yml's files: list does not ship bin/mcp-bridge.ts. main.ts builds the MCP " +
      "launcher's bridgePath as __dirname/bin/mcp-bridge.ts, which in a packaged app is inside " +
      "app.asar — so omitting it makes every federated connect time out after 15s with no visible error.",
  );
});

test("the pre-fix files: list is REFUSED, so the check above cannot pass vacuously", () => {
  assert.equal(shipsPath(PRE_FIX_PATTERNS, "bin/mcp-bridge.ts"), false);
  // Same list, a path it really did ship — proves the refusal above is about bin/, not a broken matcher.
  assert.equal(shipsPath(PRE_FIX_PATTERNS, "src/sites-mcp-registration.ts"), true);
  assert.equal(shipsPath(PRE_FIX_PATTERNS, "main.ts"), true);
});

test("the files: list still excludes test files it is meant to exclude", () => {
  const patterns = configuredFilePatterns();
  assert.equal(shipsPath(patterns, "src/sites-mcp-registration.test.ts"), false);
  assert.equal(shipsPath(patterns, "src/sites-mcp-registration.ts"), true);
});

/**
 * Whether `relPath` under `node_modules/` survives `patterns`.
 *
 * Uses electron-builder's separate node-module matcher, which applies the files negations.
 * Positive shell paths do not control which dependency files ship.
 *
 * @complexity O(n) in the pattern count.
 */
function shipsNodeModulePath(patterns: readonly string[], relPath: string): boolean {
  const matcher = getNodeModuleFileMatcher(DESKTOP_ROOT, "/fixture-dest", (value: string) => value, {}, matcherPackager(patterns));
  return matcher.createFilter()(path.join(DESKTOP_ROOT, relPath), { isDirectory: () => false } as fs.Stats);
}

test("the packaged shell does NOT ship the Bun runtimes or the Rollup natives", () => {
  const patterns = configuredFilePatterns();
  // Both @oven copies npm resolved for this host: the plain build and the no-AVX2 "baseline" one,
  // 67 MB each. They landed in app.asar.unpacked, so they cost their full size installed.
  assert.equal(shipsNodeModulePath(patterns, "node_modules/@oven/bun-darwin-x64/bin/bun"), false);
  assert.equal(shipsNodeModulePath(patterns, "node_modules/@oven/bun-darwin-x64-baseline/bin/bun"), false);
  assert.equal(shipsNodeModulePath(patterns, "node_modules/@oven/bun-darwin-x64/package.json"), false);
  assert.equal(shipsNodeModulePath(patterns, "node_modules/@rollup/rollup-darwin-x64/rollup.darwin-x64.node"), false);
});

test("those exclusions are narrow — the packages the shell actually loads still ship", () => {
  const patterns = configuredFilePatterns();
  // @jini-ai/chat is apps/desktop's ONLY production dependency; excluding it would empty the app.
  assert.equal(shipsNodeModulePath(patterns, "node_modules/@jini-ai/chat/dist/index.js"), true);
  // A sibling scope whose name shares the `@` prefix but nothing else.
  assert.equal(shipsNodeModulePath(patterns, "node_modules/@mcp-ui/server/dist/index.js"), true);
  // Not `@oven`: a package whose name merely starts with the same letters.
  assert.equal(shipsNodeModulePath(patterns, "node_modules/@ovenlike/thing/index.js"), true);
});

test("the node_modules matcher is not the main matcher — proved on the same patterns", () => {
  // Without this, `shipsNodeModulePath` could be `shipsPath` in disguise and the assertions above
  // would be testing the wrong matcher. `files:` names no positive node_modules pattern, so the
  // MAIN matcher refuses every node_modules path while the node_modules matcher admits it.
  const patterns = configuredFilePatterns();
  assert.equal(shipsPath(patterns, "node_modules/@jini-ai/chat/dist/index.js"), false);
  assert.equal(shipsNodeModulePath(patterns, "node_modules/@jini-ai/chat/dist/index.js"), true);
});

/**
 * `extraResources` entries — a separate top-level array from `files:`, so `shipsPath` above (which
 * only reads `files:`) says nothing about it. See `plan-desktop-bundled-npx-2026-09-24.md` §5, §6 S5.
 */
interface ExtraResourcesEntry {
  from?: unknown;
  to?: unknown;
  filter?: unknown;
}

function configuredExtraResources(): ExtraResourcesEntry[] {
  // `as`: js-yaml's `load` returns `unknown`; the assert right below is this file's actual runtime
  // check that `extraResources` is really an array, same as `configuredFilePatterns` does for `files`.
  const config = yaml.load(fs.readFileSync(CONFIG_PATH, "utf8")) as { extraResources?: unknown };
  assert.ok(Array.isArray(config.extraResources), "electron-builder.yml must declare an extraResources: array");
  return config.extraResources as ExtraResourcesEntry[];
}

test("extraResources ships the bundled npm package staged at staging/npm", () => {
  const entries = configuredExtraResources();
  const npmEntry = entries.find((entry) => entry.from === "staging/npm" && entry.to === "npm");
  assert.ok(
    npmEntry,
    "electron-builder.yml's extraResources has no `staging/npm -> npm` entry, so the bundled npm " +
      "package (scripts/stage-payload.ts's stageBundledNpm output) would not ship, and every " +
      "stdio MCP server launched via a bare npx/npm command would have nothing to run."
  );
});

test("npm's own node_modules ships as a SEPARATE extraResources entry, not folded into staging/npm -> npm", () => {
  // electron-builder's copy filter hard-refuses a source-relative path literally named
  // "node_modules" (app-builder-lib/out/util/filter.js: `if (relative === "node_modules") return
  // false`) — the same reason `staging/tovu-payload/node_modules -> tovu/node_modules` is its own
  // entry above (`:79-86`). Folding npm's node_modules into the `staging/npm -> npm` entry would
  // silently ship an npm with none of its own bundled dependencies (@npmcli/arborist, semver, …),
  // so every npx/npm launch inside the packaged app would fail to resolve.
  const entries = configuredExtraResources();
  const npmModulesEntry = entries.find((entry) => entry.from === "staging/npm/node_modules" && entry.to === "npm/node_modules");
  assert.ok(
    npmModulesEntry,
    "electron-builder.yml's extraResources has no `staging/npm/node_modules -> npm/node_modules` entry."
  );
});

test("production extraResources copies the npm CLIs, dependencies and Tovu payload", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-builder-fixture-"));
  const output = path.join(root, "resources");
  const required: Array<readonly [string, string]> = [
    ["staging/npm/bin/npx-cli.js", "npm/bin/npx-cli.js"],
    ["staging/npm/bin/npm-cli.js", "npm/bin/npm-cli.js"],
    ["staging/npm/package.json", "npm/package.json"],
    ["staging/npm/node_modules/@npmcli/arborist/lib/index.js", "npm/node_modules/@npmcli/arborist/lib/index.js"],
    ["staging/npm/node_modules/semver/index.js", "npm/node_modules/semver/index.js"],
    ["staging/tovu-payload/package.json", "tovu/package.json"],
    ["staging/tovu-payload/dist/src/cli/main.js", "tovu/dist/src/cli/main.js"],
    ["staging/tovu-payload/apps/admin/dist/index.html", "tovu/apps/admin/dist/index.html"],
    ["staging/tovu-payload/apps/site-chat/dist/index.html", "tovu/apps/site-chat/dist/index.html"],
    ["staging/tovu-payload/node_modules/better-sqlite3/build/Release/better_sqlite3.node", "tovu/node_modules/better-sqlite3/build/Release/better_sqlite3.node"],
  ];
  try {
    for (const [from] of required) {
      fs.mkdirSync(path.dirname(path.join(root, from)), { recursive: true });
      fs.writeFileSync(path.join(root, from), `fixture:${from}`);
    }
    const config = yaml.load(fs.readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
    const matchers = getFileMatchers(config, "extraResources", output, {
      defaultSrc: root, macroExpander: (value: string) => value,
      customBuildOptions: {}, globalOutDir: path.join(root, "release"),
    });
    await copyFiles(matchers, undefined, false);
    for (const [from, to] of required) {
      assert.equal(fs.readFileSync(path.join(output, to), "utf8"), `fixture:${from}`, `${to} must ship`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("production files includes every shell runtime entry point", () => {
  for (const filename of ["main.ts", "bin/mcp-bridge.ts", "src/sites-mcp-registration.ts", "src/tovu-server.ts",
    "dist/preload/preload.mjs", "dist/speech/preload-speech.cjs", "dist/contracts/project.js", "dist/renderer/index.html"]) {
    assert.equal(shipsPath(configuredFilePatterns(), filename), true, `${filename} must ship`);
  }
});
