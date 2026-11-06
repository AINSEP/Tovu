/**
 * @file Static-analysis tests for the Electron entry's (`src/main/index.ts`, formerly `main.ts`)
 * project-discovery wiring — the boot pass that makes a site on disk appear on the Projects screen
 * without hand-registration.
 *
 * Source text, not behaviour, for the reason `main-speech-wiring.test.ts` documents at length: the
 * entry requires `"electron"` at module scope, which resolves to a path string rather than the real
 * API outside a real Electron process, so `require`-ing it under plain `node --test` crashes before
 * proving anything. The decisions it wires are behaviourally covered where they now live:
 * `src/main/boot/boot-steps.test.ts` (`settleDevFallbackRows`: the dismissal migration BEFORE the
 * seed, one dev-fallback dir for both, the safe classifier, nothing at all for a packaged app; and the
 * discovery lanes that never cancel each other), `src/main/boot/boot-sequence.test.ts` (the handlers
 * and the boot scan get the SAME deps object), `src/main/boot/site-backend.test.ts` (the owner
 * sign-in is armed before the session is ensured), `src/main/windows/sites-home-window.test.ts` (the
 * window's minimum size) and `startup-env.test.ts` / `site-folder-prompt.test.ts`
 * (`describeRejectedDefault`'s "unreadable" wording). What stays here is only what the entry itself
 * binds: which constants and which classifier it hands those modules, and the fields of the
 * sites-home deps literal.
 *
 * Why the order mattered (now pinned in boot-steps.test.ts). `migrateLegacyDismissals` is what carries
 * "the operator removed this, never offer it again" across the registry's format change, and it
 * must record that fact BEFORE `seedDevFallbackSite` asks whether to seed. Reversed, the seed
 * reads a file that cannot yet answer, re-adds the card the operator deleted, and the migration
 * then dutifully records that it is tracked. Nothing downstream would ever report the mistake.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDesktopRoots } from "./packaged-paths.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_PATH = path.join(__dirname, "main", "index.ts");
const rawSource = fs.readFileSync(MAIN_PATH, "utf8");
const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The sites-home deps literal `buildProjectDeps` returns, up to its own closing `};`. */
function projectDepsBlock(): string {
  const start = source.indexOf("function buildProjectDeps(");
  assert.notEqual(start, -1, "expected buildProjectDeps in the entry");
  const rest = source.slice(start);
  const end = rest.search(/\n\s*};\n/);
  assert.notEqual(end, -1, "could not find the end of the deps literal");
  return rest.slice(0, end);
}

/** The `settleDevFallbackRows({...})` call, up to its closing `})`. */
function settleCall(): string {
  const start = source.indexOf("settleDevFallbackRows({");
  assert.notEqual(start, -1, "expected a settleDevFallbackRows({...}) call in the entry");
  return source.slice(start, source.indexOf("})", start));
}

test("the dev-fallback rows are settled against the one resolved dev-fallback directory", () => {
  // One named constant, from the one resolver. Two copies of the same `path.join` would silently
  // diverge the moment either moved; `settleDevFallbackRows` then hands this one dir to both the
  // migration and the seed (boot-steps.test.ts).
  assert.match(settleCall(), /projectsPath: sitesCtx\.projectsPath, devFallbackDir: DEV_FALLBACK_SITE_DIR,/);
  // The definition moved into `packaged-paths.ts` (2026-09-11) so a packaged app can have NO dev
  // fallback rather than one pointing inside a read-only bundle. Pinned as "main.ts takes it from
  // the one resolver" plus a real-value check on that resolver, instead of re-stating the literal
  // here where it would only ever be a copy of the real definition.
  assert.match(source, /const DEV_FALLBACK_SITE_DIR = DESKTOP_ROOTS\.devFallbackSiteDir/);
  assert.equal(
    resolveDesktopRoots({ isPackaged: false, resourcesPath: "/unused", repoRoot: "/repo", documentsDir: "/docs", appDataDir: "/appdata" }).devFallbackSiteDir,
    path.join("/repo", "sites", "tovu-dev"),
  );
});

test("the deps carry the transitions store, or every start and stop reports the state it just left", () => {
  // `project-ipc.ts` takes `transitions` OPTIONALLY, so every existing test bag stays valid — which
  // means a production wiring that forgot it would fail nothing and look fine: cards would simply
  // go on saying `Stopped` for a whole boot and `Running` for a whole drain. This is the only place
  // that omission is visible.
  assert.match(projectDepsBlock(), /transitions: siteTransitions,/);
  assert.match(source, /const siteTransitions = createSiteTransitions\(\);/);
});

test("the deps carry a scan root and the recently-opened list for the scan to read", () => {
  const depsBlock = projectDepsBlock();
  assert.match(depsBlock, /siteScanRoots: SITE_SCAN_ROOTS/);
  assert.match(depsBlock, /recentSiteDirs: \(\) => existingRecentSiteDirs\(sitesCtx\.statePath, \{ workspace: sharedSites \}\)/);
});

test("the scan root is the sites directory the dev fallback already lives in", () => {
  assert.match(source, /const SITE_SCAN_ROOTS = DESKTOP_ROOTS\.siteScanRoots/);
  // The RELATIONSHIP, not two literals that happen to agree today: the fallback site must sit
  // directly inside the scanned root, or the seed offers a card the rescan then cannot re-find.
  const dev = resolveDesktopRoots({ isPackaged: false, resourcesPath: "/unused", repoRoot: "/repo", documentsDir: "/docs", appDataDir: "/appdata" });
  assert.deepEqual(dev.siteScanRoots, [path.dirname(dev.devFallbackSiteDir!)]); // `!`: a checkout always has a dev fallback; only a packaged app has none.
});

test("recentSiteDirs is a thunk over the MRU file, not a snapshot taken at boot", () => {
  // A value would freeze the list at registration time, so a site opened during the session would
  // never be found by a later rescan — the exact staleness the rescan button exists to cure.
  assert.match(source, /recentSiteDirs:\s*\(\)\s*=>\s*existingRecentSiteDirs\(/);
});

test("the two bulk site scans in the boot chain are handed the NON-throwing classifier", () => {
  // D-01. `classifySiteDir` throws by design, for the operator-picked-folder path where the dialog
  // shows the error. Both boot-time scans run inside the `whenReady()` chain whose only handler is
  // `reportBootFailure`, and before `openSitesHomeWindow()` — so one unreadable candidate used to show
  // a dialog and quit, with no renderer for the Rescan button to live in.
  //
  // Source text rather than behaviour, for this file's stated reason. It is still the check that
  // matters: `site-dir-store.ts`, `tracked-sites.ts` and `settleDevFallbackRows` are behaviourally
  // covered, and what only the entry can get wrong is handing them the throwing form.
  assert.match(settleCall(), /classifySiteDir: classifySiteDirSafely,/,
    "settleDevFallbackRows (which seeds with it) must be given the non-throwing classifier");
  assert.match(projectDepsBlock(), /^\s*classifySiteDir: classifySiteDirSafely,$/m,
    "the deps' classifySiteDir (which rescanSites scans with) must be the non-throwing classifier");
});

test("deskfx2 SHOULD-1: desktop main explicitly enables catalog recovery", () => {
  assert.match(source, /const sharedSites = createSitesWorkspace\([^;]+catalogRecovery: true/);
});




test("B2 sleep skips crash telemetry/warnings after preserving exit cleanup", () => {
  const callback = source.slice(source.indexOf('onUnexpectedExit: (siteDir, exit, entry)'), source.indexOf('const productState ='));
  for (const effect of ['recordSiteClosed(', 'sitePreviewScheduler.cancel(', 'siteThemePreviews.stop(']) {
    assert.ok(callback.indexOf(effect) < callback.indexOf('if (exit.code === SITE_SLEEP_EXIT_CODE) return;'));
  }
  assert.ok(callback.indexOf('if (exit.code === SITE_SLEEP_EXIT_CODE) return;') < callback.indexOf('reportDesktopServerExit('));
  assert.ok(callback.indexOf('if (exit.code === SITE_SLEEP_EXIT_CODE) return;') < callback.indexOf('exited on its own'));
  assert.match(source, /desktopResources.get\(\{ panelOpen: true \}, \{\}\)/);
  assert.match(source, /setInterval\([\s\S]*?30_000\)/);
  assert.match(source, /clearInterval\(siteMaintenanceTimer\)/);
});

test("quitting stops a running archive import inside the awaited quit drain", () => {
  const quit = source.slice(source.indexOf('app.on("before-quit"'));
  assert.match(quit, /pendingTeardowns\.track\(\{ promise: stopRunningImports\(\) \}\)/);
});
