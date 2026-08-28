import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { DEFAULT_SITE_NAME, resolveSiteRoot } from "../../site-root.js";

/**
 * @file Unit tests for `resolveSiteRoot` — the one place the `sites/<name>/` runtime-data root is
 * computed, shared by `server/deps.ts`'s `siteDir()` and the two feature layouts
 * (`features/skills/layout.ts`, `features/agent-plugins/layout.ts`) that used to hardcode
 * `<cwd>/infra/` independently.
 *
 * Every case injects `cwd`/`env` explicitly rather than mutating `process.env` or calling
 * `process.chdir()` — the same discipline the two layout unit tests already use.
 */

test("defaults to sites/<DEFAULT_SITE_NAME> under the given cwd", () => {
  assert.equal(resolveSiteRoot({ cwd: "/srv/tovu", env: {} }), path.resolve("/srv/tovu/sites/tovu-com"));
});

test("DEFAULT_SITE_NAME is the folder name the default resolves to", () => {
  assert.equal(DEFAULT_SITE_NAME, "tovu-com");
  assert.equal(resolveSiteRoot({ cwd: "/srv/tovu", env: {} }), path.resolve("/srv/tovu/sites", DEFAULT_SITE_NAME));
});

test("TOVU_SITE names a different folder under the same sites/ root", () => {
  assert.equal(
    resolveSiteRoot({ cwd: "/srv/tovu", env: { TOVU_SITE: "second-site" } }),
    path.resolve("/srv/tovu/sites/second-site")
  );
});

test("TOVU_SITE_DIR wins over TOVU_SITE and is used as the site root outright", () => {
  assert.equal(
    resolveSiteRoot({ cwd: "/srv/tovu", env: { TOVU_SITE_DIR: "/var/lib/tovu/acme", TOVU_SITE: "ignored" } }),
    path.resolve("/var/lib/tovu/acme")
  );
});

test("a relative TOVU_SITE_DIR resolves against process.cwd(), not the injected cwd", () => {
  // `resolve()` on a relative path is always `process.cwd()`-anchored. Asserted rather than left
  // implicit because the injected `cwd` above deliberately does NOT participate here — a caller
  // passing a relative override gets the process's real working directory, matching every other
  // `TOVU_*_DIR` resolver in `server/deps.ts`.
  assert.equal(resolveSiteRoot({ cwd: "/srv/tovu", env: { TOVU_SITE_DIR: "relative-site" } }), path.resolve("relative-site"));
});

test("an empty-string TOVU_SITE_DIR is treated as set (resolves to cwd), matching `!== undefined` semantics", () => {
  assert.equal(resolveSiteRoot({ cwd: "/srv/tovu", env: { TOVU_SITE_DIR: "" } }), path.resolve(""));
});

test("omitting cwd falls back to process.cwd()", () => {
  assert.equal(resolveSiteRoot({ env: {} }), path.resolve(process.cwd(), "sites", DEFAULT_SITE_NAME));
});
