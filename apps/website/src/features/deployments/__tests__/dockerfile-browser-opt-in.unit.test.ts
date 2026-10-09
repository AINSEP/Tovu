import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * @file Pins headless Chromium as OPT-IN in every image build this repo ships (owner decision
 * 2026-10-08). 7894cf366 (2026-08-25) made `ARG TOVU_INSTALL_BROWSER=1` the Dockerfile default
 * without that decision ever being made; this guard exists so the default cannot be flipped back
 * silently — not by the Dockerfile, and not by a host config that would install it anyway.
 *
 * Reads the REAL repo-root files (same discipline as `dockerignore-security.unit.test.ts`): a fixture
 * copy would stay green while the shipped file drifted.
 */

const REPO_ROOT = process.cwd();
const read = (relativePath: string) => readFileSync(join(REPO_ROOT, relativePath), "utf8");

test("Dockerfile: TOVU_INSTALL_BROWSER is declared exactly once and defaults to 0", () => {
  const declarations = [...read("Dockerfile").matchAll(/^ARG TOVU_INSTALL_BROWSER(?:=(.*))?$/gm)];
  assert.equal(declarations.length, 1, "a second ARG would shadow the first in its own stage");
  assert.equal(declarations[0]![1], "0");
});

test("Dockerfile: Chromium installs only when the arg is explicitly 1", () => {
  const dockerfile = read("Dockerfile");
  assert.ok(
    dockerfile.includes('RUN if [ "$TOVU_INSTALL_BROWSER" = "1" ]; then \\\n      npx --yes playwright@'),
    "the install must sit behind an explicit opt-in test, not run unconditionally",
  );
  assert.match(dockerfile, /^ENV PLAYWRIGHT_BROWSERS_PATH=\/opt\/playwright-browsers$/m);
});

test("host configs: every in-repo build passes 0 (off) unless an operator opts in", () => {
  assert.match(read("docker-compose.yml"), /^\s+TOVU_INSTALL_BROWSER: \$\{TOVU_INSTALL_BROWSER:-0\}$/m);
  assert.match(read("fly.toml"), /^\[build\.args\]\n\s+TOVU_INSTALL_BROWSER = "0"$/m);
  assert.match(read(".github/workflows/fly-deploy.yml"), /--build-arg TOVU_INSTALL_BROWSER=0$/m);
  assert.match(read(".github/workflows/publish-image.yml"), /^\s+TOVU_INSTALL_BROWSER=0$/m);
});
