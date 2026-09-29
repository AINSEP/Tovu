import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

/**
 * @file GitHub's REST calls live in the bundled `github` Agent Plugin
 * (`content/agent-plugins/github/source-control/`), not in core. This guards the three core features
 * that used to carry them — site commit, write-files and site backup — against a helper creeping back.
 * Model-facing copy that names GitHub as an example is not API code and is not checked here.
 */

const FEATURES_ROOT = path.resolve(import.meta.dirname, "../..");
const CORE_DIRS = ["source-control", "site-backup", "custom-credentials"];
/** GitHub REST surface: git-data endpoints, repo routes, and GitHub-only headers/media types. */
const GITHUB_API_CODE = /\/git\/(?:blobs|trees|commits|refs)\b|\/repos\/\$\{|X-GitHub-Api-Version|application\/vnd\.github/;

async function coreSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : coreSourceFiles(full);
      return entry.name.endsWith(".ts") ? [full] : [];
    }),
  );
  return nested.flat();
}

test("core source-control, site-backup and custom-credentials carry no GitHub REST code", async () => {
  const offenders: string[] = [];
  for (const dir of CORE_DIRS) {
    for (const file of await coreSourceFiles(path.join(FEATURES_ROOT, dir))) {
      const lines = (await readFile(file, "utf8")).split("\n");
      lines.forEach((line, index) => {
        if (GITHUB_API_CODE.test(line)) offenders.push(`${path.relative(FEATURES_ROOT, file)}:${index + 1}`);
      });
    }
  }
  assert.deepEqual(offenders, []);
});

test("the pattern does catch the calls it guards against", () => {
  for (const line of ["`/repos/${owner}/${repo}/git/trees`", '"X-GitHub-Api-Version": "2022-11-28"', "accept: 'application/vnd.github+json'"]) {
    assert.match(line, GITHUB_API_CODE);
  }
});
