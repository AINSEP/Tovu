/** Test-process catalog isolation; children inherit these paths with plain node --import tsx --test.
 * Tests must choose a catalog home; an ambient owner path is never a test fixture.
 * App-data catalog paths also stay inside the isolated home.
 * Keep the override for the whole process: restoring HOME between suites under isolation=none
 * would expose the real catalog again. Each test child owns one temporary home, removed on exit.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const isolatedCatalogHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-test-catalog-")));
Object.assign(process.env, {
  HOME: isolatedCatalogHome, USERPROFILE: isolatedCatalogHome,
  APPDATA: path.join(isolatedCatalogHome, "AppData", "Roaming"),
  XDG_DATA_HOME: path.join(isolatedCatalogHome, ".local", "share"),
  XDG_CONFIG_HOME: path.join(isolatedCatalogHome, ".config"),
});
// Ambient product overrides can point outside HOME, so fixture catalogs must ignore them too.
delete process.env.TOVU_SITES_HOME;
delete process.env.TOVU_SITE_ROOTS;
process.once("exit", () => fs.rmSync(isolatedCatalogHome, { recursive: true, force: true }));
