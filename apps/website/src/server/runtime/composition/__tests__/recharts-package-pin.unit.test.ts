/** D-charts: Tovu's compiled-in Recharts approval is a review copy of the INSTALLED package's manifest.
 * The pin must equal the whole packaged integrity map (licenses included): admission snapshots every
 * file in the payload, so a partial pin refuses the provider just as a wrong digest does. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  RECHARTS_BROWSER_APPROVAL, RECHARTS_DEFAULT_PROVIDER, RECHARTS_PACKAGE_NAME, RECHARTS_RUNTIME_SOURCE, rechartsSourceDir,
} from "../charts-recharts-source.js";

type PackagedManifest = { id: string; version: string; browserProviders: unknown; integrity: Record<string, string> };

function packagedManifest(): PackagedManifest {
  return JSON.parse(readFileSync(path.join(RECHARTS_RUNTIME_SOURCE.sourceDir, "jini.plugin.json"), "utf8")) as PackagedManifest;
}

test("the source directory is the pinned version inside the installed package, not content/plugins", () => {
  assert.ok(existsSync(RECHARTS_RUNTIME_SOURCE.sourceDir), `${RECHARTS_PACKAGE_NAME} must ship plugins/charts-recharts/${RECHARTS_BROWSER_APPROVAL.version}`);
  assert.match(RECHARTS_RUNTIME_SOURCE.sourceDir.replaceAll("\\", "/"), /\/@jini-ai\/plugin-charts-recharts\/plugins\/charts-recharts\/[^/]+$/);
  assert.equal(path.basename(RECHARTS_RUNTIME_SOURCE.sourceDir), RECHARTS_BROWSER_APPROVAL.version);
  assert.equal(RECHARTS_RUNTIME_SOURCE.entryPath, path.join(RECHARTS_RUNTIME_SOURCE.sourceDir, "server/index.mjs"));
});

test("the approval equals the packaged manifest: id, version, browser providers and the FULL integrity map", () => {
  const packaged = packagedManifest();
  assert.equal(packaged.id, RECHARTS_BROWSER_APPROVAL.pluginId);
  assert.equal(packaged.version, RECHARTS_BROWSER_APPROVAL.version);
  assert.deepEqual(packaged.browserProviders, RECHARTS_BROWSER_APPROVAL.browserProviders);
  // On failure the message is the map to review and paste into charts-recharts-source.ts.
  assert.deepEqual({ ...RECHARTS_BROWSER_APPROVAL.integrity }, packaged.integrity,
    `paste the reviewed packaged pins:\n${JSON.stringify(packaged.integrity, null, 2)}`);
  assert.ok(Object.keys(packaged.integrity).some((file) => /licen[cs]e|notice/i.test(file)), "the packaged map pins license files too");
});

test("every pinned file is on disk with exactly the pinned bytes", () => {
  for (const [file, digest] of Object.entries(RECHARTS_BROWSER_APPROVAL.integrity)) {
    const actual = `sha256-${createHash("sha256").update(readFileSync(path.join(RECHARTS_RUNTIME_SOURCE.sourceDir, file))).digest("hex")}`;
    assert.equal(actual, digest, file);
  }
});

test("the runtime manifest is the approval: a package cannot widen its own trust", () => {
  const { manifest } = RECHARTS_RUNTIME_SOURCE;
  assert.equal(manifest.version, RECHARTS_BROWSER_APPROVAL.version);
  assert.equal(manifest.integrity, RECHARTS_BROWSER_APPROVAL.integrity);
  assert.equal(manifest.browserProviders, RECHARTS_BROWSER_APPROVAL.browserProviders);
  assert.deepEqual(manifest.extensions, { tovu: { id: "tovu/charts-recharts" } });
  assert.equal(RECHARTS_DEFAULT_PROVIDER, "plugin.recharts");
  assert.equal(RECHARTS_BROWSER_APPROVAL.browserProviders[0]?.id, RECHARTS_DEFAULT_PROVIDER);
});

test("resolution uses the desktop payload roots and the pinned version, whatever the package version", () => {
  const calls: { id: string; paths: string[] }[] = [];
  const dir = rechartsSourceDir({}, { resolvePackage: (id, options) => {
    calls.push({ id, paths: options.paths });
    return "/install/node_modules/@jini-ai/plugin-charts-recharts/package.json";
  } });
  assert.equal(dir, path.join("/install/node_modules/@jini-ai/plugin-charts-recharts/plugins/charts-recharts", RECHARTS_BROWSER_APPROVAL.version));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.id, "@jini-ai/plugin-charts-recharts/package.json");
  assert.ok(calls[0]?.paths.some((root) => root.endsWith(`${path.sep}tovu`)));
  assert.ok(calls[0]?.paths.some((root) => root.endsWith(`${path.sep}app.asar`)));
});

test("a missing package is a loud packaging error, never a silent content/plugins fallback", () => {
  assert.throws(() => rechartsSourceDir({}, { resolvePackage: () => { throw Object.assign(new Error("Cannot find module"), { code: "MODULE_NOT_FOUND" }); } }),
    /Cannot find module/);
});

test("the package's agent face drives this runtime source", () => {
  const facePath = path.join(path.dirname(path.dirname(path.dirname(RECHARTS_RUNTIME_SOURCE.sourceDir))), "charts-recharts", "plugin.json");
  const face = JSON.parse(readFileSync(facePath, "utf8")) as { name: string; extensions?: { tovu?: { id?: string; providerPlugin?: string } } };
  assert.equal(face.name, "charts-recharts");
  assert.equal(face.extensions?.tovu?.providerPlugin, RECHARTS_BROWSER_APPROVAL.pluginId);
  assert.equal(face.extensions?.tovu?.id, "jini/charts-recharts-agent");
});
