/**
 * @file The "no root key" warning is only worth anything if it is actually WIRED — every link in
 * the chain from the boot check to a pixel on screen. Each link is asserted here as source text,
 * because this package has no DOM runner for `.tsx` (see `tasks-nav-hidden-wiring.test.ts` and
 * `expanded-mode.test.ts` for the same discipline and its reason).
 *
 * The chain, and what breaks if a link is cut:
 *
 *   main.ts  installs the boot guard        → cut: nothing is ever checked
 *   preload  exposes `rootKeyStatus`        → cut: the renderer can never learn the verdict
 *   main.tsx mounts `<RootKeyBanner/>`      → cut: the log survives, the human-visible surface does
 *                                                  not — which is exactly the 2026-09-18 failure
 *   the banner renders the status           → cut: an empty strip that says nothing
 *
 * Every assertion runs against COMMENT-STRIPPED source: all four of those files discuss
 * `RootKeyBanner`, `rootKeyStatus` and `installRootKeyBootGuard` at length in their own headers, so
 * a naive substring match would pass on prose while the code was gone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..', '..');

function source(...parts: string[]) {
  const raw = fs.readFileSync(path.join(desktopRoot, ...parts), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const mainProcess = source('main.ts');
const preload = source('src', 'preload', 'preload.mts');
const rendererEntry = source('src', 'renderer', 'main.tsx');
const banner = source('src', 'renderer', 'RootKeyBanner.tsx');
const contract = source('src', 'contracts', 'root-key.ts');

// ---------------------------------------------------------------------------------------------
// link 1 — the shell checks, at boot
// ---------------------------------------------------------------------------------------------

test('main.ts installs the root-key boot guard', () => {
  assert.match(mainProcess, /import \{ installRootKeyBootGuard \} from "\.\/src\/root-key-boot-guard\.ts";/);
  assert.match(mainProcess, /installRootKeyBootGuard\(\{ ipcMain \}\)/);
});

test('the guard is installed ABOVE the boot-mode split, so every mode is checked', () => {
  const install = mainProcess.indexOf('installRootKeyBootGuard({ ipcMain })');
  const modeSplit = mainProcess.indexOf('if (sitesUiRequested())');
  assert.notEqual(install, -1);
  assert.notEqual(modeSplit, -1);
  assert.ok(install < modeSplit, 'a guard inside one branch leaves the other boot modes unchecked');
});

test('the guard is installed before any window is opened, so the banner cannot race the channel', () => {
  // Scoped to the `app.whenReady()` body: `openSitesHomeWindow` and `createWindow` are DECLARED
  // earlier in the file, and `name()` is a substring of `name(): void`, so a whole-file `indexOf`
  // finds the declaration rather than the call and the comparison means nothing.
  const readyAt = mainProcess.indexOf('.whenReady()');
  assert.notEqual(readyAt, -1, 'main.ts no longer boots from app.whenReady()');
  const bootBody = mainProcess.slice(readyAt);

  const install = bootBody.indexOf('installRootKeyBootGuard({ ipcMain })');
  assert.notEqual(install, -1, 'the guard is not installed on the boot path at all');
  for (const opensAWindow of ['openSitesHomeWindow()', 'createWindow(']) {
    const at = bootBody.indexOf(opensAWindow);
    assert.notEqual(at, -1, `${opensAWindow} is no longer called on the boot path`);
    assert.ok(install < at, `the guard must be installed before ${opensAWindow}`);
  }
});

// ---------------------------------------------------------------------------------------------
// link 2 — the verdict can reach the page
// ---------------------------------------------------------------------------------------------

test('the preload exposes the status over the contract channel', () => {
  assert.match(preload, /rootKeyStatus: \(\) => ipcRenderer\.invoke\(ROOT_KEY_CHANNELS\.status\)/);
  assert.match(preload, /import \{ ROOT_KEY_CHANNELS \} from '\.\.\/contracts\/root-key\.js';/);
});

test('the contract channel name is a single literal both sides share', () => {
  assert.match(contract, /status: "runner:root-key:status"/);
});

test('the contract carries no field that could hold key material', () => {
  for (const forbidden of ['hex', 'value', 'secret', 'key:']) {
    assert.equal(
      new RegExp(`readonly ${forbidden}`).test(contract),
      false,
      `RootKeyStatusDto must never gain a "${forbidden}" field`
    );
  }
});

// ---------------------------------------------------------------------------------------------
// link 3 — the banner is on screen, outside App
// ---------------------------------------------------------------------------------------------

test('the renderer entry mounts the banner', () => {
  assert.match(rendererEntry, /import \{ RootKeyBanner \} from '\.\/RootKeyBanner\.js';/);
  assert.match(rendererEntry, /<RootKeyBanner \/>/);
});

test('the banner is mounted OUTSIDE App, so an App refactor cannot drop it', () => {
  const bannerAt = rendererEntry.indexOf('<RootKeyBanner />');
  const appAt = rendererEntry.indexOf('<App />');
  assert.notEqual(bannerAt, -1);
  assert.notEqual(appAt, -1);
  assert.ok(bannerAt < appAt, 'the warning belongs above the app, not inside it');
});

// ---------------------------------------------------------------------------------------------
// link 4 — the banner actually says something
// ---------------------------------------------------------------------------------------------

test('the banner asks main for the status and gates on the shared rule', () => {
  assert.match(banner, /fetchRootKeyStatus\(/);
  assert.match(banner, /shouldShowRootKeyBanner\(status\)/);
});

test('the banner renders the copy module’s fields, not its own strings', () => {
  assert.match(banner, /rootKeyBannerCopy\(status\)/);
  for (const field of ['headline', 'cause', 'consequence', 'launcherCommand', 'launcherHint', 'remedies', 'caveat']) {
    assert.ok(banner.includes(`copy.${field}`), `the banner never renders copy.${field}`);
  }
});

test('the banner announces itself to assistive tech', () => {
  assert.match(banner, /role="alert"/);
});

test('the banner has no dismiss control that could restore the silence', () => {
  assert.equal(/onClick=/.test(banner), false, 'a dismissible warning is one a stray click can hide forever');
  assert.equal(/<button/.test(banner), false);
});

test('the banner renders nothing when there is nothing to report', () => {
  assert.match(banner, /return null;/);
});

test('the banner carries its own stylesheet rather than editing the shared one', () => {
  assert.match(banner, /import '\.\/root-key-banner\.css';/);
  assert.equal(
    fs.existsSync(path.join(desktopRoot, 'src', 'renderer', 'root-key-banner.css')),
    true
  );
});
