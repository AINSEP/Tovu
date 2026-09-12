/**
 * @file The `files:` list in `electron-builder.yml` must actually ship every file the main process
 * resolves at runtime — asserted against the real config, with the real matcher semantics.
 *
 * ## The defect this exists for
 *
 * `main.js`'s `announceDesktopToolsToSite` generates the MCP launcher with
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
import { Minimatch } from "minimatch";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(DESKTOP_ROOT, "electron-builder.yml");

/** The exact list as it stood before 2026-09-12, kept so the predicate below can be shown to reject
 *  it. Do not "fix" this fixture — it is the bug, preserved on purpose. */
const PRE_FIX_PATTERNS = ["main.ts", "package.json", "dist/**", "src/**", "!**/*.map", "!src/**/*.test.js", "!src/**/*.test.ts"];

/**
 * Whether `relPath` survives `patterns`, using electron-builder's own last-match-wins ordering.
 *
 * Mirrors `app-builder-lib`'s matcher closely enough for this assertion: positive patterns include,
 * `!` patterns exclude, and the last pattern that matches decides. The conditional `(all-files glob)`
 * default is applied on the same condition the real matcher applies it — only when the list is
 * empty or holds nothing but negations.
 *
 * @complexity O(n) in the pattern count.
 */
function shipsPath(patterns: readonly string[], relPath: string): boolean {
  const containsOnlyIgnore = patterns.length > 0 && patterns.every((pattern) => pattern.startsWith("!"));
  const effective = patterns.length === 0 || containsOnlyIgnore ? ["**/*", ...patterns] : patterns;

  let included = false;
  for (const pattern of effective) {
    const negated = pattern.startsWith("!");
    const body = negated ? pattern.slice(1) : pattern;
    // A bare directory entry in electron-builder means the directory and everything under it.
    const matcher = new Minimatch(body, { dot: true });
    const directoryMatcher = new Minimatch(`${body}/**/*`, { dot: true });
    if (matcher.match(relPath) || directoryMatcher.match(relPath)) included = !negated;
  }
  return included;
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
 * node_modules is filtered by a SECOND, differently-built matcher —
 * `getNodeModuleFileMatcher` (`app-builder-lib/out/fileMatcher.js:177-220`) — which keeps only the
 * `!` entries of `files:` and then `prependPattern("**{{/}}*")`. Positive patterns are dropped
 * entirely, which is why `node_modules` ships despite never being named in `files:`, and why a
 * negation is the only lever there is over it. {@link shipsPath} mirrors the MAIN matcher and would
 * answer this question wrongly.
 *
 * @complexity O(n) in the pattern count.
 */
function shipsNodeModulePath(patterns: readonly string[], relPath: string): boolean {
  return shipsPath(["**/*", ...patterns.filter((pattern) => pattern.startsWith("!"))], relPath);
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
