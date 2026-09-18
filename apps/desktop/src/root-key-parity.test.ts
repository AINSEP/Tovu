/**
 * @file Drift guard holding `root-key-status.ts` to its authority,
 * `apps/website/src/features/webhooks/keyring.env.ts`.
 *
 * `root-key-status.ts` reproduces that file's rules because the two live in separate packages with
 * incompatible module resolution (see its own header). A mirror that is never checked is a mirror
 * that eventually lies — and the specific lie it would tell here is the worst kind for this guard:
 * the shell reporting "no root key" while a site server happily seals credentials with one, or the
 * reverse. Both would train the operator to ignore the warning.
 *
 * So every rule is asserted against the AUTHORITY'S OWN SOURCE TEXT, read from disk, rather than
 * against a value copied into this file. When `keyring.env.ts` changes a rule, this test fails and
 * names it.
 *
 * Source text is comment-stripped before matching: both files' doc comments discuss these constants
 * and paths by name at length, so a naive substring match would pass on prose (the repo-wide
 * `.tsx`/`.ts` scanning discipline — see `tasks-nav-hidden-wiring.test.ts`).
 *
 * This test reads source files only. It never resolves a key, never reads `~/.tovu`, and contains
 * no key material.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const AUTHORITY_PATH = path.resolve(
  here,
  "..",
  "..",
  "website",
  "src",
  "features",
  "webhooks",
  "keyring.env.ts"
);
const MIRROR_PATH = path.join(here, "root-key-status.ts");

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("the authority file is where this guard expects it", () => {
  assert.equal(fs.existsSync(AUTHORITY_PATH), true, `no keyring.env.ts at ${AUTHORITY_PATH}`);
});

const authority = withoutComments(fs.readFileSync(AUTHORITY_PATH, "utf8"));
const mirror = withoutComments(fs.readFileSync(MIRROR_PATH, "utf8"));

test("both files name the same env var", () => {
  assert.match(authority, /DEFAULT_ROOT_KEY_ENV_VAR_NAME\s*=\s*"TOVU_INTEGRATIONS_ROOT_KEY"/);
  assert.match(mirror, /ROOT_KEY_ENV_VAR_NAME\s*=\s*"TOVU_INTEGRATIONS_ROOT_KEY"/);
});

test("both files require the same key length", () => {
  assert.match(authority, /ROOT_KEY_LENGTH_BYTES\s*=\s*32\b/);
  assert.match(mirror, /ROOT_KEY_LENGTH_BYTES\s*=\s*32\b/);
});

test("both files use the same hex rule", () => {
  const pattern = /HEX_KEY_PATTERN\s*=\s*\/\^\[0-9a-f\]\+\$\/i/;
  assert.match(authority, pattern);
  assert.match(mirror, pattern);
});

test("both files apply the four rejection rules in the same order, over trimmed material", () => {
  // The exact shape of `parseRootKeyHex`. Matched as a sequence so a reordering (which changes
  // which reason an operator is shown) fails here too, not only a deletion.
  const parser =
    /const hex = raw\.trim\(\);[\s\S]{0,400}?"empty"[\s\S]{0,200}?"not-hex"[\s\S]{0,200}?"odd-length"[\s\S]{0,200}?"too-short"/;
  assert.match(authority, parser);
  assert.match(mirror, parser);
});

test("both files fingerprint the key BYTES with the same truncated sha256", () => {
  const recipe =
    /createHash\("sha256"\)\.update\(Buffer\.from\(hex, "hex"\)\)\.digest\("hex"\)\.slice\(0, 12\)/;
  assert.match(authority, recipe);
  assert.match(mirror, recipe);
});

test("both files resolve the same local key-file path", () => {
  const localPath = /join\((?:homedir\(\)|readHome\(\)), "\.tovu", "integrations-root-key\.hex"\)/;
  assert.match(authority, localPath);
  assert.match(mirror, localPath);
});

test("both files resolve the same production key-file path", () => {
  const prodPath =
    /join\((?:process\.cwd\(\)|readCwd\(\)), "sites", "\.tovu", "integrations-root-key\.hex"\)/;
  assert.match(authority, prodPath);
  assert.match(mirror, prodPath);
});

test("both files split on production mode the same way", () => {
  assert.match(authority, /resolveRuntimeMode\(\) === "production"/);
  assert.match(mirror, /env\.TOVU_RUNTIME_MODE === "production"/);
});

test("neither file's rejection vocabulary has grown a case the mirror does not know", () => {
  const authorityReasons = authority.match(/export type RootKeyRejection =([^;]+);/)?.[1] ?? "";
  assert.notEqual(authorityReasons, "", "RootKeyRejection is no longer declared in keyring.env.ts");
  for (const reason of authorityReasons.match(/"([a-z-]+)"/g) ?? []) {
    assert.ok(
      mirror.includes(`export type RootKeyRejection =`) && mirror.includes(reason),
      `keyring.env.ts rejects with ${reason} but root-key-status.ts has no such case`
    );
  }
});
