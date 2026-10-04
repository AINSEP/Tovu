import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";

import {
  findSecretInText,
  scanForDefaultCredentialExposure,
} from "../default-credential-exposure.js";
import { DEFAULT_OWNER_PASSWORD } from "../wiring.js";

test("a line containing the secret is reported with its 1-based line number", () => {
  const src = ["import x from 'y';", `const hint = "use ${DEFAULT_OWNER_PASSWORD}";`, "export {};"].join("\n");
  assert.deepEqual(findSecretInText(src, DEFAULT_OWNER_PASSWORD), [2]);
});

test("every occurrence is reported, not just the first", () => {
  const src = [`a = "${DEFAULT_OWNER_PASSWORD}"`, "b = 1", `c = "${DEFAULT_OWNER_PASSWORD}"`].join("\n");
  assert.deepEqual(findSecretInText(src, DEFAULT_OWNER_PASSWORD), [1, 3]);
});

test("the secret embedded mid-string is still found — this is a containment check, not a token match", () => {
  // The original regression was `local dev default: admin / <password>` inside prose, not a bare
  // identifier, so a word-boundary matcher would have missed the exact bug this guards against.
  const src = `<p>local dev default: admin / ${DEFAULT_OWNER_PASSWORD}</p>`;
  assert.deepEqual(findSecretInText(src, DEFAULT_OWNER_PASSWORD), [1]);
});

test("unrelated content is not flagged", () => {
  const src = ["const a = 1;", "// nothing sensitive here", "export const b = 'placeholder';"].join("\n");
  assert.deepEqual(findSecretInText(src, DEFAULT_OWNER_PASSWORD), []);
});

test("the default password is non-empty — an empty value would make this whole guard vacuous", () => {
  // A guard that searches for "" matches every line of every file, or (depending on the matcher)
  // nothing at all. Either way it would stop being evidence, so assert the premise explicitly.
  assert.ok(DEFAULT_OWNER_PASSWORD.length > 0);
});

test("REGRESSION: the shipped admin UI source does not contain the seeded default password", (t) => {
  // Guards the real, thrice-recurring bug: apps/admin/src/features/auth/Login.tsx rendering
  // `local dev default: admin / <password>` into the production sign-in page.
  const read = fs.readFileSync.bind(fs);
  const visited: string[] = [];
  t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => { visited.push(String(args[0])); return read(...args); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.deepEqual(scanForDefaultCredentialExposure(), []);
  assert.ok(visited.includes(path.resolve(import.meta.dirname, "../../../../../admin/src/features/auth/Login.tsx")), "the scan must actually inspect Login.tsx");
});


function redirectAdminRoot(t: TestContext, fixture: string): void {
  const realRoot = path.resolve(import.meta.dirname, "../../../../../..", "apps/admin/src");
  const remap = (file: fs.PathLike | number) => typeof file === "string" && (file === realRoot || file.startsWith(`${realRoot}${path.sep}`)) ? path.join(fixture, path.relative(realRoot, file)) : file;
  const read = fs.readFileSync.bind(fs), entries = fs.readdirSync.bind(fs), stat = fs.statSync.bind(fs);
  t.mock.method(fs, "readFileSync", (file: fs.PathOrFileDescriptor, ...options: unknown[]) => (read as Function)(remap(file), ...options));
  t.mock.method(fs, "readdirSync", (dir: fs.PathLike, ...options: unknown[]) => (entries as Function)(remap(dir), ...options));
  t.mock.method(fs, "statSync", (file: fs.PathLike, ...options: unknown[]) => (stat as Function)(remap(file), ...options));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

test("the complete scanner detects a planted credential in the shipped Login path", (t) => {
  const fixture = fs.mkdtempSync(path.join(tmpdir(), "tovu-credential-scan-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, "features/auth"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "features/auth/Login.tsx"), `export const hint = "${DEFAULT_OWNER_PASSWORD}";\n`);
  fs.writeFileSync(path.join(fixture, "clean.ts"), "export const clean = true;");
  redirectAdminRoot(t, fixture);
  assert.deepEqual(scanForDefaultCredentialExposure(), [{ file: "apps/admin/src/features/auth/Login.tsx", line: 1 }]);
});

test("a missing scanner root is an error rather than a clean scan", (t) => {
  const fixture = fs.mkdtempSync(path.join(tmpdir(), "tovu-missing-credential-scan-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  redirectAdminRoot(t, path.join(fixture, "missing"));
  assert.throws(() => scanForDefaultCredentialExposure(), { code: "ENOENT" });
});
