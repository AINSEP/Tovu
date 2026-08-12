import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkBuiltThemeConformance } from "../build-conformance";

/**
 * @file The real-bundler falsifying test (team-lead directive, 2026-08-12): every other test in this
 * suite feeds `checkBuiltThemeConformance` HAND-AUTHORED fixture HTML, which only ever proves the
 * gate's rules FIRE against strings shaped exactly the way the rule expects. It is not evidence a real
 * bundler's actual output would satisfy them. This file closes that gap by running one real page
 * through a real bundler (Astro, `astro build` — the framework `data-tovu-island`'s own doc explicitly
 * modeled itself on, per `build-conformance.ts`'s `ISLAND_MARKER` comment) and feeding its UNMODIFIED
 * output through the same gate `loadTheme()` uses.
 *
 * The honest result, captured here rather than tuned away: Astro's DEFAULT output does not satisfy the
 * gate. A `<style>` block inside a `.astro` component is inlined into the page's own `<head>` as a
 * scoped `<style>` tag — there is no external `.css` file, no `<link>` tag, and therefore no possible
 * way for the literal `TOKEN_STYLESHEET_SENTINEL` string to appear on the page at all. That is a REAL,
 * unmodified, `astro build`-produced page failing the install-time gate for a reason with nothing to do
 * with hashing or asset-path rewriting — it fails because Astro's per-page CSS-inlining model doesn't
 * produce ANYTHING that the design tokens have anywhere to be injected into in the first place. See the
 * fixture's own `astro.config.mjs` for one unrelated, purely environmental obstacle this test also had
 * to route around (a monorepo dependency-hoisting collision in Astro's own internal `cookie` import)
 * before it could even reach that result — noted there, not silently worked around.
 *
 * Per team-lead's explicit instruction: this test does NOT adjust `checkBuiltThemeConformance` or any
 * of its rules to make this pass. The assertions below pin the REAL, currently-observed failure shape
 * so a future change to Astro's own output (a version bump) or to the gate is caught either way — if
 * Astro starts emitting an external stylesheet by default, or if the gate's sentinel rule changes, this
 * test breaks and must be re-diagnosed, not silently re-tuned.
 *
 * A second finding this test surfaces, informational rather than assertable as a "failure" in the same
 * sense: `checkAssetPaths` (via `findUnrewrittenAssetPaths`) only ever flags a `href=`/`src=` reference
 * that STARTS WITH `../css/` or `../js/` and can't be rewritten — it has no rule for "a page ships zero
 * external asset references at all, when a real build might reasonably be expected to have some." A
 * page with no `<link>`/`<script>` referencing an external asset passes the asset-path check completely
 * silently, which is exactly what happens here — not a bug in this test, but a real gap in what that
 * check can detect, worth naming for whoever revisits the gate's design.
 */

const FIXTURE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "astro-bundler-probe");
const DIST_DIR = path.join(FIXTURE_ROOT, "dist");
const ASTRO_BIN = path.resolve(FIXTURE_ROOT, "../../../../../../node_modules/astro/bin/astro.mjs");

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Every real file under `dir`, keyed by its path relative to `dir` (POSIX). Used to build a REAL
 * `artifactHashes` map from Astro's actual output bytes, so the only things `checkBuiltThemeConformance`
 * has left to fail on are the sentinel/asset-path/island rules this test is actually about — not
 * whether this test bothered to hash things correctly, which is a tautological question for any build
 * tool (hashing your own output always succeeds). */
function hashTree(dir: string, prefix = ""): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const absolute = path.join(dir, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      Object.assign(hashes, hashTree(absolute, relative));
    } else if (stat.isFile()) {
      hashes[relative] = sha256(readFileSync(absolute));
    }
  }
  return hashes;
}

test(
  "a real Astro build's unmodified output run through the install-time conformance gate",
  { timeout: 60_000 },
  () => {
    rmSync(DIST_DIR, { recursive: true, force: true });

    // Real bundler, real subprocess -- not a mock, not a hand-written string standing in for one.
    execFileSync(process.execPath, [ASTRO_BIN, "build", "--root", FIXTURE_ROOT], {
      stdio: "pipe", // captured, not printed -- silence-on-success per this repo's own convention
    });

    const pageHtml = readFileSync(path.join(DIST_DIR, "index.html"), "utf8");
    // Ground truth, observed directly (see this file's own header): Astro inlined the component's
    // <style> block into the page's own <head> rather than emitting an external stylesheet.
    assert.ok(!pageHtml.includes("<link"), "expected NO <link> tag in Astro's default output -- CSS was inlined, not extracted; if this now fails, Astro's default output shape changed and this whole test needs re-diagnosing, not re-tuning");
    assert.ok(pageHtml.includes("<style>"), "expected the component CSS inlined as a <style> tag -- if this changed, re-diagnose");

    const artifactHashes = hashTree(DIST_DIR);

    const issues = checkBuiltThemeConformance({
      themeId: "astro-bundler-probe",
      themeDir: DIST_DIR,
      pages: { index: pageHtml },
      partials: {},
      artifactHashes,
    });

    // THE FALSIFYING RESULT: real, unmodified `astro build` output fails the install-time gate.
    // Exactly one issue, and it is the stylesheet-sentinel rule -- not a hashing or asset-path problem,
    // a fundamental "Astro's per-page CSS model has nowhere for the sentinel to exist" problem.
    assert.equal(issues.length, 1, `expected exactly one conformance issue, got: ${JSON.stringify(issues, null, 2)}`);
    assert.equal(issues[0]!.rule, "stylesheet-sentinel");
    assert.equal(issues[0]!.page, "index");
    assert.match(issues[0]!.message, /missing the literal stylesheet tag/);

    // Named explicitly, not just implied by the single-issue count above: asset-path and island-content
    // both report nothing, but NOT because the page positively satisfies either rule -- there is simply
    // no external asset reference and no data-tovu-island element anywhere in Astro's output for either
    // rule to have an opinion about. See this file's header for why that's a real detection gap, not a
    // clean bill of health.
    assert.ok(!issues.some((issue) => issue.rule === "asset-path"));
    assert.ok(!issues.some((issue) => issue.rule === "island-content"));
  }
);
