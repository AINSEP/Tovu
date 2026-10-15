/** Test-process catalog isolation; children inherit these paths with plain node --import tsx --test.
 * Tests must choose a catalog home; an ambient owner path is never a test fixture.
 * App-data catalog paths also stay inside the isolated home.
 * Keep the override for the whole process: restoring HOME between suites under isolation=none
 * would expose the real catalog again. Each test child owns one temporary home, removed on exit.
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

export const isolatedCatalogHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-test-catalog-")));
// A fresh OS temp home has no Documents folder; the default sites home requires that parent.
fs.mkdirSync(path.join(isolatedCatalogHome, "Documents"));
Object.assign(process.env, {
  HOME: isolatedCatalogHome, USERPROFILE: isolatedCatalogHome,
  APPDATA: path.join(isolatedCatalogHome, "AppData", "Roaming"),
  XDG_DATA_HOME: path.join(isolatedCatalogHome, ".local", "share"),
  XDG_CONFIG_HOME: path.join(isolatedCatalogHome, ".config"),
  TOVU_DESKTOP_USER_DATA_DIR: path.join(isolatedCatalogHome, "desktop-profile"),
});
// Ambient product overrides can point outside HOME, so fixture catalogs must ignore them too.
delete process.env.TOVU_SITES_HOME;
delete process.env.TOVU_SITE_ROOTS;
// Pin child paths: callers may temporarily change process.env after this module loads.
export const isolatedCatalogEnv: NodeJS.ProcessEnv = Object.freeze({
  HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  TOVU_DESKTOP_USER_DATA_DIR: process.env.TOVU_DESKTOP_USER_DATA_DIR,
  TOVU_SITES_HOME: undefined, TOVU_SITE_ROOTS: undefined,
});
process.once("exit", () => fs.rmSync(isolatedCatalogHome, { recursive: true, force: true }));

/** Fail before fixture readers run if a boot-pinned layout escaped the test's temporary root.
 * The default covers the isolated home catalog; explicit fixtures pass their own mkdtemp root.
 */
export function assertIsolatedCatalogPath(
  { root }: { root: string },
  { fixtureRoot = isolatedCatalogHome }: { fixtureRoot?: string } = {},
): void {
  const relative = path.relative(path.resolve(fixtureRoot), path.resolve(root));
  assert.ok(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    "Test site layout escaped its isolated fixture root.");
}
