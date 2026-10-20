import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

import * as realSources from "../site-key-sources.js";
import type { SiteKeySource } from "../site-key-sources.js";

/**
 * @file Pins `installSiteKey`'s defence against a source list with no key file to write. Today's
 * `siteKeySources` always ends in a file source that carries a `path`, so the only seam that
 * reaches these branches is a module mock of `site-key-sources.ts` returning a degenerate list;
 * every other export stays the real one.
 */

let sourcesOverride: SiteKeySource[] | undefined;

mock.module(new URL("../site-key-sources.ts", import.meta.url).href, {
  namedExports: { ...realSources, siteKeySources: (input: realSources.SiteKeySourcesInput) => sourcesOverride ?? realSources.siteKeySources(input) },
});

const { installSiteKey } = await import("../site-key-ensure.js");

const HEX = "ab".repeat(32);
const siteDir = mkdtempSync(path.join(tmpdir(), "tovu-site-key-sources-boundary-"));
test.after(() => rmSync(siteDir, { recursive: true, force: true }));

test.afterEach(() => {
  sourcesOverride = undefined;
});

test("sources boundary: an env-only source list with no env key has no key file to write", () => {
  sourcesOverride = [{ kind: "env" }];
  assert.throws(() => installSiteKey({ siteDir, hex: HEX, mode: "production", env: {}, home: siteDir, cwd: siteDir }), {
    name: "Error",
    message: "installSiteKey: this site has no key file to write",
  });
});

test("sources boundary: a file source without a path is skipped, never written", () => {
  sourcesOverride = [{ kind: "volume-file" }];
  assert.throws(() => installSiteKey({ siteDir, hex: HEX, mode: "production", env: {}, home: siteDir, cwd: siteDir }), {
    message: "installSiteKey: this site has no key file to write",
  });
  assert.deepEqual(readdirSync(siteDir), []);
});

test("sources boundary: the mock passes the real source list through when no override is set", () => {
  const result = installSiteKey({ siteDir, hex: HEX, mode: "production", env: {}, home: siteDir, cwd: siteDir });
  assert.equal(result?.outcome, "installed");
});
