/**
 * @file Static-analysis tests for `../main.js`'s project-discovery wiring — the boot pass that
 * makes a site on disk appear on the Projects screen without hand-registration.
 *
 * Source text, not behaviour, for the reason `main-speech-wiring.test.js` documents at length:
 * `main.js` requires `"electron"` at module scope, which resolves to a path string rather than the
 * real API outside a real Electron process, so `require`-ing it under plain `node --test` crashes
 * before proving anything. The pieces it wires together are behaviourally covered where they live
 * (`project-registry.test.js`, `project-ipc.test.js`); what only this file can check is that
 * `main.js` actually CALLS them, and in the one order where the call is correct.
 *
 * That order is the whole point of the first two tests. `migrateLegacyDismissals` is what carries
 * "the operator removed this, never offer it again" across the registry's format change, and it
 * must record that fact BEFORE `seedDevFallbackProject` asks whether to seed. Reversed, the seed
 * reads a file that cannot yet answer, re-adds the card the operator deleted, and the migration
 * then dutifully records that it is tracked. Nothing downstream would ever report the mistake.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDesktopRoots } from "./packaged-paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_PATH = path.join(__dirname, "..", "main.js");
const source = fs.readFileSync(MAIN_PATH, "utf8");

/** The call site's index, asserted to exist first so a renamed function fails loudly here rather
 *  than making every ordering comparison below vacuously true against two -1s. */
function callIndex(name) {
  const index = source.indexOf(`${name}(`);
  assert.notEqual(index, -1, `expected a ${name}(...) call in main.js`);
  return index;
}

test("main.js imports the migration, the seed and the rescan from their own modules", () => {
  assert.match(source, /migrateLegacyDismissals/);
  assert.match(source, /seedDevFallbackProject/);
  assert.match(source, /rescanProjects/);
  assert.match(source, /from ["']\.\/src\/project-registry\.js["']/);
  assert.match(source, /from ["']\.\/src\/project-ipc\.js["']/);
});

test("migrateLegacyDismissals runs BEFORE the seed, or a removed project is re-seeded once", () => {
  assert.ok(
    callIndex("migrateLegacyDismissals") < callIndex("seedDevFallbackProject"),
    "the pre-dismissals registry must be migrated before the seed reads it, or the seed asks a file that cannot yet say the operator removed the dev fallback",
  );
});

test("the boot discovery pass runs before the sites home window opens", () => {
  // Against the CALL, not `openSitesHomeWindow`'s own definition, which appears earlier in the file and
  // would make this comparison pass no matter where the scan went.
  const openCall = source.indexOf("openSitesHomeWindow();");
  assert.notEqual(openCall, -1, "expected an openSitesHomeWindow(); call in the sites-home branch");
  assert.ok(
    callIndex("rescanProjects") < openCall,
    "a scan that ran after the window opened would leave the first render showing the un-scanned list",
  );
});

test("the migration and the seed are handed the SAME dev-fallback directory", () => {
  // One named constant, checked at both call sites. Two copies of the same `path.join` would pass a
  // looser test today and silently diverge the moment either moved.
  assert.match(source, /migrateLegacyDismissals\(sitesCtx\.projectsPath, DEV_FALLBACK_SITE_DIR\)/);
  // The classifier argument is pinned by its own test above; this one is about the DIRECTORY, so
  // it matches whichever classifier form is passed rather than restating that decision here.
  assert.match(source, /seedDevFallbackProject\(sitesCtx\.projectsPath, DEV_FALLBACK_SITE_DIR, classifySiteDir\w*\)/);
  // The definition moved into `packaged-paths.js` (2026-09-11) so a packaged app can have NO dev
  // fallback rather than one pointing inside a read-only bundle. Pinned as "main.js takes it from
  // the one resolver" plus a real-value check on that resolver, instead of re-stating the literal
  // here where it would only ever be a copy of the real definition.
  assert.match(source, /const DEV_FALLBACK_SITE_DIR = DESKTOP_ROOTS\.devFallbackSiteDir/);
  assert.equal(
    resolveDesktopRoots({ isPackaged: false, resourcesPath: "/unused", repoRoot: "/repo", documentsDir: "/docs" }).devFallbackSiteDir,
    path.join("/repo", "sites", "tovu-com"),
  );
});

test("the shared deps object the handlers get is the one the boot scan is run against", () => {
  // Two separately-built deps literals could drift in `projectsPath` or `classifySiteDir` and the
  // only symptom would be a site that never appears — no error anywhere.
  assert.match(source, /registerProjectIpcHandlers\(projectDeps\)/);
  assert.match(source, /rescanProjects\(projectDeps\)/);
});

test("the deps carry a scan root and the recently-opened list for the scan to read", () => {
  const depsStart = source.indexOf("const projectDeps = {");
  assert.notEqual(depsStart, -1, "expected a projectDeps object in the sites-home branch");
  const depsBlock = source.slice(depsStart, source.indexOf("\n      };", depsStart));
  assert.match(depsBlock, /projectScanRoots: PROJECT_SCAN_ROOTS/);
  assert.match(depsBlock, /recentSiteDirs: \(\) => existingRecentSiteDirs\(sitesCtx\.statePath\)/);
});

test("the scan root is the sites directory the dev fallback already lives in", () => {
  assert.match(source, /const PROJECT_SCAN_ROOTS = DESKTOP_ROOTS\.projectScanRoots/);
  // The RELATIONSHIP, not two literals that happen to agree today: the fallback site must sit
  // directly inside the scanned root, or the seed offers a card the rescan then cannot re-find.
  const dev = resolveDesktopRoots({ isPackaged: false, resourcesPath: "/unused", repoRoot: "/repo", documentsDir: "/docs" });
  assert.deepEqual(dev.projectScanRoots, [path.dirname(dev.devFallbackSiteDir)]);
});

test("a packaged app has no dev fallback, so the seed and the migration are skipped rather than handed null", () => {
  // `migrateLegacyDismissals` takes a DIRECTORY and would write a literal `null` into the
  // `dismissed` array, which is a corrupt row rather than a no-op — so the guard is load-bearing.
  const packaged = resolveDesktopRoots({ isPackaged: true, resourcesPath: "/res", repoRoot: "/repo", documentsDir: "/docs" });
  assert.equal(packaged.devFallbackSiteDir, null);
  assert.match(source, /if \(DEV_FALLBACK_SITE_DIR\) \{[\s\S]*?migrateLegacyDismissals\(/);
  assert.match(source, /if \(DEV_FALLBACK_SITE_DIR\) \{[\s\S]*?seedDevFallbackProject\(/);
});

test("recentSiteDirs is a thunk over the MRU file, not a snapshot taken at boot", () => {
  // A value would freeze the list at registration time, so a site opened during the session would
  // never be found by a later rescan — the exact staleness the rescan button exists to cure.
  assert.match(source, /recentSiteDirs:\s*\(\)\s*=>\s*existingRecentSiteDirs\(/);
});

test("the two bulk site scans in the boot chain use the NON-throwing classifier", () => {
  // D-01. `classifySiteDir` throws by design, for the operator-picked-folder path where the dialog
  // shows the error. Both boot-time scans run inside the `whenReady()` chain whose only handler is
  // `reportBootFailure`, and before `openSitesHomeWindow()` — so one unreadable candidate used to show
  // a dialog and quit, with no renderer for the Rescan button to live in.
  //
  // Source text rather than behaviour, for this file's stated reason. It is still the check that
  // matters: `site-dir-store.js` and `project-registry.js` are behaviourally covered, and what
  // only main.js can get wrong is handing them the throwing form.
  assert.match(source, /seedDevFallbackProject\(\s*sitesCtx\.projectsPath,\s*DEV_FALLBACK_SITE_DIR,\s*classifySiteDirSafely\s*\)/,
    "seedDevFallbackProject must be given the non-throwing classifier");
  assert.match(source, /^\s*classifySiteDir: classifySiteDirSafely,$/m,
    "projectDeps.classifySiteDir (which rescanProjects scans with) must be the non-throwing classifier");
});

test("describeRejectedDefault answers the 'unreadable' verdict the safe classifier can now return", () => {
  // The unwired-call-site half of the same change: `resolveDevFallback` can now report
  // `kind: "unreadable"`, and that arm carries no `missing` array — the existing code path does
  // `rejectedDefault.missing.join(...)` unconditionally once past "empty", which would throw on
  // undefined while building the very dialog that explains why the site could not be opened.
  const body = source.slice(source.indexOf("function describeRejectedDefault("));
  assert.match(body.slice(0, body.indexOf("\n}")), /"unreadable"/,
    "describeRejectedDefault must handle the unreadable kind before it reaches .missing.join()");
});
