/**
 * @file `electron-builder.yml` must keep producing what the auto-updater and the Microsoft Store
 * package depend on. Each of these was checked once against a real build (a local mac package
 * wrote `Tovu-mac-x64.zip`, its `.blockmap`, `latest-mac.yml` and `Resources/app-update.yml`); a
 * config edit that drops one breaks updates silently, for every installed copy, only after release.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yaml = createRequire(import.meta.url)("js-yaml") as { load(text: string): unknown };

interface BuilderConfig {
  publish?: { provider?: string; owner?: string; repo?: string; releaseType?: string };
  mac?: { target?: unknown[]; artifactName?: string };
  nsis?: { differentialPackage?: boolean };
  appx?: { customManifestPath?: string; capabilities?: string[]; artifactName?: string; minVersion?: string };
  directories?: { buildResources?: string };
}

const config = yaml.load(fs.readFileSync(path.join(DESKTOP_ROOT, "electron-builder.yml"), "utf8")) as BuilderConfig;

test("the updater reads the public GitHub repo's published releases", () => {
  assert.deepEqual(config.publish, { provider: "github", owner: "AINSEP", repo: "Tovu", releaseType: "release" });
});

test("macOS builds a zip (Squirrel.Mac installs only from a zip), named per arch like the dmg", () => {
  assert.ok(config.mac?.target?.includes("zip"), "mac.target must include zip");
  assert.equal(config.mac?.artifactName, "Tovu-mac-${arch}.${ext}");
});

test("NSIS writes the blockmap for differential updates", () => {
  assert.equal(config.nsis?.differentialPackage, true);
});

test("the Store package keeps AppData unvirtualized, with the capability that requires", () => {
  assert.ok(config.appx?.capabilities?.includes("unvirtualizedResources"));
  assert.equal(config.appx?.artifactName, "Tovu-windows-${arch}-store.${ext}");
  const manifestPath = path.join(DESKTOP_ROOT, config.directories?.buildResources ?? "build", config.appx?.customManifestPath ?? "");
  const manifest = fs.readFileSync(manifestPath, "utf8");
  assert.match(manifest, /<desktop6:FileSystemWriteVirtualization>disabled<\/desktop6:FileSystemWriteVirtualization>/);
  assert.match(manifest, /IgnorableNamespaces="desktop6 rescap"/);
  assert.ok((config.appx?.minVersion ?? "") >= "10.0.18362.0", "desktop6 virtualization control needs Windows 10 1903+");
});

test("the custom Store manifest uses only macros electron-builder 26 fills (an unknown one fails the build)", () => {
  // AppxTarget.writeManifest's switch; anything else throws "Macro X is not defined".
  const known = new Set([
    "publisher", "publisherDisplayName", "version", "applicationId", "identityName", "executable", "displayName",
    "description", "backgroundColor", "logo", "square150x150Logo", "square44x44Logo", "lockScreen", "defaultTile",
    "splashScreen", "arch", "resourceLanguages", "capabilities", "extensions", "minVersion", "maxVersionTested",
  ]);
  const manifest = fs.readFileSync(path.join(DESKTOP_ROOT, "build", "appx-manifest.xml"), "utf8");
  const used = [...manifest.matchAll(/\$\{([a-zA-Z0-9]+)\}/g)].map((match) => match[1]!);
  assert.ok(used.length > 10);
  assert.deepEqual(used.filter((name) => !known.has(name)), []);
});

test("the Store tile assets exist at the sizes the manifest names", () => {
  for (const name of ["StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png", "Wide310x150Logo.png"]) {
    assert.ok(fs.statSync(path.join(DESKTOP_ROOT, "build", "appx", name)).size > 0, name);
  }
});
