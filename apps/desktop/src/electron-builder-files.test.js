/**
 * @file The `files:` list in `electron-builder.yml` must actually ship every file the main process
 * resolves at runtime — asserted against the real config, with the real matcher semantics.
 *
 * ## The defect this exists for
 *
 * `main.js`'s `announceDesktopToolsToSite` generates the MCP launcher with
 * `bridgePath: path.join(__dirname, "bin", "mcp-bridge.mjs")`. In a packaged app `__dirname` is the
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
const PRE_FIX_PATTERNS = ["main.js", "package.json", "dist/**", "src/**", "!**/*.map", "!src/**/*.test.js", "!src/**/*.test.ts"];

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
function shipsPath(patterns, relPath) {
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

function configuredFilePatterns() {
  const config = yaml.load(fs.readFileSync(CONFIG_PATH, "utf8"));
  assert.ok(Array.isArray(config.files), "electron-builder.yml must declare a files: array");
  return config.files;
}

test("the packaged app ships bin/mcp-bridge.mjs, which the generated MCP launcher execs", () => {
  assert.equal(
    shipsPath(configuredFilePatterns(), "bin/mcp-bridge.mjs"),
    true,
    "electron-builder.yml's files: list does not ship bin/mcp-bridge.mjs. main.js builds the MCP " +
      "launcher's bridgePath as __dirname/bin/mcp-bridge.mjs, which in a packaged app is inside " +
      "app.asar — so omitting it makes every federated connect time out after 15s with no visible error.",
  );
});

test("the pre-fix files: list is REFUSED, so the check above cannot pass vacuously", () => {
  assert.equal(shipsPath(PRE_FIX_PATTERNS, "bin/mcp-bridge.mjs"), false);
  // Same list, a path it really did ship — proves the refusal above is about bin/, not a broken matcher.
  assert.equal(shipsPath(PRE_FIX_PATTERNS, "src/sites-mcp-registration.js"), true);
  assert.equal(shipsPath(PRE_FIX_PATTERNS, "main.js"), true);
});

test("the files: list still excludes test files it is meant to exclude", () => {
  const patterns = configuredFilePatterns();
  assert.equal(shipsPath(patterns, "src/sites-mcp-registration.test.js"), false);
  assert.equal(shipsPath(patterns, "src/sites-mcp-registration.js"), true);
});
