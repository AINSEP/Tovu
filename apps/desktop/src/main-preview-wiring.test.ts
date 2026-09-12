/**
 * @file Static-analysis tests for `../main.js`'s card-preview capture wiring.
 *
 * `main.js` requires `"electron"` at module scope, which resolves to a path string (not the real
 * API) outside a real Electron process — `require`-ing it under plain `node --test` would crash
 * immediately without proving anything (same constraint `main-speech-wiring.test.js` and
 * `main-project-wiring.test.js` document for their own files). The capture's non-Electron half —
 * the path convention, the version token, the two cleanup paths — is behaviourally covered directly
 * in `site-preview-store.test.js`; what only this file can check is that `main.js` actually calls
 * that store's functions, from the right places, bound the right way.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_PATH = path.join(__dirname, "..", "main.ts");
const source = fs.readFileSync(MAIN_PATH, "utf8");

/** One function's own body, from its `function name(` header to the next top-level `function `. */
function functionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `expected a function ${name}(...) in main.ts`);
  const rest = source.slice(start);
  const end = rest.indexOf("\nfunction ", 1);
  return end === -1 ? rest : rest.slice(0, end);
}

test("main.ts imports every site-preview-store operation it needs", () => {
  assert.match(source, /from ["']\.\/src\/site-preview-store\.ts["']/);
  for (const name of ["readPreviewVersion", "readPreviewDataUrl", "writePreview", "deletePreview", "sweepOrphanedPreviews"]) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `expected ${name} to be imported and used`);
  }
});

test("captureSitePreview loads the site's OWN public root, never /admin/", () => {
  const body = functionBody("captureSitePreview");
  assert.match(body, /loadURL\(`http:\/\/127\.0\.0\.1:\$\{port\}\/`\)/, "must load the bare origin root, not an admin path");
  assert.doesNotMatch(body, /\/admin\//, "must never navigate the capture window to /admin/");
});

test("captureSitePreview's window is hidden and scoped to the site's own partition", () => {
  const body = functionBody("captureSitePreview");
  const windowOptions = body.match(/new BrowserWindow\(\{[\s\S]*?\}\);/);
  assert.ok(windowOptions, "expected a new BrowserWindow(...) in captureSitePreview");
  assert.match(windowOptions[0], /show:\s*false/, "the capture window must never be shown");
  assert.match(windowOptions[0], /partition/, "the capture window must be scoped to the site's own partition");
});

test("captureSitePreview writes through writePreview, keyed by siteDir, resized before storage", () => {
  const body = functionBody("captureSitePreview");
  assert.match(body, /capturePage\(\)/);
  assert.match(body, /\.resize\(\{[^}]*\}\)/, "the captured image must be downscaled before it is stored");
  assert.match(body, /writePreview\(app\.getPath\("userData"\),\s*siteDir,/);
});

test("captureSitePreview never throws past its own boundary — every failure is caught and logged", () => {
  const body = functionBody("captureSitePreview");
  assert.match(body, /catch \(error\)/, "a failed capture must be swallowed, not propagated");
  assert.match(body, /finally/, "the hidden window must be torn down whether the capture succeeded or not");
});

test("scheduleSitePreview captures a site at most once per process run", () => {
  const body = functionBody("scheduleSitePreview");
  assert.match(body, /previewCapturedThisRun\.has\(siteDir\)/, "must check the run-scoped guard before scheduling");
  assert.match(body, /previewCapturedThisRun\.add\(siteDir\)/, "must mark the site captured before the timer fires");
  assert.match(body, /setTimeout\(/, "must debounce past first-boot settle rather than capturing immediately");
});

test("both places a site enters openSites schedule its preview capture", () => {
  // Design decision (2026-09-12): hook exactly these two, and nowhere else — never the tab-open
  // hot path, never a timer. A capture scheduled anywhere but right after `openSites.set(...)`
  // would either fire before the entry exists or fire again on every reuse.
  const windowBody = functionBody("openSiteWindow");
  const serverBody = functionBody("openSiteServer");

  assert.match(
    windowBody,
    /openSites\.set\(siteDir, \{ server, window \}\);\s*\n\s*scheduleSitePreview\(siteDir, server\.port, partition\);/,
    "openSiteWindow must schedule a capture immediately after publishing into openSites",
  );
  assert.match(
    serverBody,
    /openSites\.set\(siteDir, \{ server \}\);\s*\n\s*scheduleSitePreview\(siteDir, server\.port, partition\);/,
    "openSiteServer must schedule a capture immediately after publishing into openSites",
  );
  // `openSiteServer` used to destructure only `{ server }` from `startSiteBackend` — the capture
  // needs `partition` too, or the capture window would run on the DEFAULT (unauthenticated)
  // partition instead of the site's own.
  assert.match(serverBody, /const \{ server, partition \} = await startSiteBackend\(/);
});

test("the sites-home deps object carries the three preview operations, bound to this launch's userData", () => {
  const depsStart = source.indexOf("const projectDeps = {");
  assert.notEqual(depsStart, -1, "expected a projectDeps object in the sites-home branch");
  const depsBlock = source.slice(depsStart, source.indexOf("\n      };", depsStart));

  assert.match(depsBlock, /readPreviewVersion: \(siteDir\) => readPreviewVersion\(app\.getPath\("userData"\), siteDir\)/);
  assert.match(depsBlock, /readPreviewDataUrl: \(siteDir\) => readPreviewDataUrl\(app\.getPath\("userData"\), siteDir\)/);
  assert.match(depsBlock, /deletePreview: \(siteDir\) => deletePreview\(app\.getPath\("userData"\), siteDir\)/);
});

test("the boot sweep runs against the tracked list, after the boot discovery pass", () => {
  const sweepCall = source.indexOf("sweepSitePreviewsOnBoot(sitesCtx.projectsPath);");
  const rescanCall = source.indexOf("rescanSites(projectDeps);");
  assert.notEqual(sweepCall, -1, "expected a sweepSitePreviewsOnBoot(sitesCtx.projectsPath) call");
  assert.ok(rescanCall !== -1 && rescanCall < sweepCall, "the sweep must run after the boot scan has populated the tracked list");

  const body = functionBody("sweepSitePreviewsOnBoot");
  assert.match(body, /readTrackedSites\(projectsPath\)/);
  assert.match(body, /sweepOrphanedPreviews\(app\.getPath\("userData"\),/);
  assert.match(body, /catch \(error\)/, "a hygiene sweep must never be able to fail the boot sequence");
});
