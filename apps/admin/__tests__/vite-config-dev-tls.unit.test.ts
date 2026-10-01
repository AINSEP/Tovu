import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "vitest";

import { isDevTlsExplicitlyDisabled } from "../dev-tls-disable-flag";

/**
 * @file Regression coverage for `vite.config.ts`'s `TOVU_DISABLE_DEV_TLS` gate — the admin sibling of
 * `apps/website/src/server/runtime/boot/dev-tls.ts`'s and `development/scripts/dev.mjs`'s own copies
 * of this same parse (see each file's own header for why there are three copies, not one shared
 * module).
 *
 * Covers the leaf parser and the real config decision. Load the config in an isolated Node
 * process to avoid a second Vite/esbuild service inside Vitest. Certificate reads are replaced
 * before import, so this never reads a contributor's private key or starts a dev server.
 */

const readTlsConfig = `
  import fs from "node:fs";
  import { syncBuiltinESMExports } from "node:module";
  const originalExists = fs.existsSync;
  const originalRead = fs.readFileSync;
  fs.existsSync = (file) => String(file).includes("/.certs/") || originalExists(file);
  fs.readFileSync = (file, ...args) => {
    if (String(file).endsWith("/.certs/localhost.pem")) return Buffer.from("test cert");
    if (String(file).endsWith("/.certs/localhost-key.pem")) return Buffer.from("test key");
    return originalRead(file, ...args);
  };
  syncBuiltinESMExports();
  // Vite supplies this when loading the ESM config; reproduce that binding for direct import.
  globalThis.__dirname = process.cwd();
  const loaded = await import("./vite.config.ts");
  const config = loaded.default.default ?? loaded.default;
  const https = config.server.https;
  console.log(JSON.stringify({
    tls: Boolean(https),
    fakeCertificates: https ? https.cert.toString() === "test cert" && https.key.toString() === "test key" : false,
    proxyTarget: config.server.proxy["/api"].target,
  }));
`;

test("isDevTlsExplicitlyDisabled: true only for \"1\"/\"true\" (case-insensitive)", () => {
  expect(isDevTlsExplicitlyDisabled("1")).toBe(true);
  expect(isDevTlsExplicitlyDisabled("true")).toBe(true);
  expect(isDevTlsExplicitlyDisabled("TRUE")).toBe(true);
});

test('REGRESSION (2026-09-05 audit finding): "false" and "0" must NOT disable dev TLS', () => {
  // vite.config.ts used to check `Boolean(process.env.TOVU_DISABLE_DEV_TLS)` — a bare truthy check
  // that treated ANY non-empty string as "disable", silently inverting an operator's explicit
  // TOVU_DISABLE_DEV_TLS=false "keep TLS on" intent.
  expect(isDevTlsExplicitlyDisabled("false")).toBe(false);
  expect(isDevTlsExplicitlyDisabled("0")).toBe(false);
});

test("isDevTlsExplicitlyDisabled: undefined (unset) does not disable", () => {
  expect(isDevTlsExplicitlyDisabled(undefined)).toBe(false);
});

test.each([
  [undefined, true],
  ["false", true],
  ["0", true],
  ["true", false],
  ["1", false],
] as const)("the real config with TOVU_DISABLE_DEV_TLS=%s uses TLS=%s when certificates exist", async (flag, tls) => {
  const env = { ...process.env };
  delete env.TOVU_API_URL;
  if (flag === undefined) delete env.TOVU_DISABLE_DEV_TLS;
  else env.TOVU_DISABLE_DEV_TLS = flag;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", readTlsConfig], {
    cwd: path.resolve(__dirname, ".."),
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout.trim())).toEqual({
    tls,
    fakeCertificates: tls,
    proxyTarget: `${tls ? "https" : "http"}://localhost:3000`,
  });
});

test.each([
  [" true ", true],
  ["", false],
  ["yes", false],
] as const)("isDevTlsExplicitlyDisabled(%j) is %s", (flag, disabled) => {
  expect(isDevTlsExplicitlyDisabled(flag)).toBe(disabled);
});
