/**
 * @file Tests for `verify-package-cli.ts` — the packaging backstop's asar lookup and exit-code
 * decision, driven through hand-written filesystem/verifier fakes — plus one end-to-end run of
 * `scripts/verify-package.ts` itself against a REAL asar archive, so the composition edge that binds
 * `node:fs` and the real verifier is proven to report a mismatch and exit 1.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPackageWithOptions, getRawHeader } from "@electron/asar";

import { runVerifyPackage, resolveAsarPath } from "./verify-package-cli.ts";
import type { VerifyPackageDirent, VerifyPackageFs, VerifyPackagePorts } from "./verify-package-cli.ts";
import type { AsarVerification } from "./asar-verify.ts";

const ROOT = "/desk";
const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A fake tree: directories (with their children) and files (with an mtime). Unknown paths throw on read. */
function fakeFs({ dirs = {}, files = {}, unreadable = [] }: {
  dirs?: Record<string, string[]>; files?: Record<string, number>; unreadable?: string[];
}): VerifyPackageFs {
  const isDir = (target: string) => target in dirs;
  return {
    existsSync: (target) => isDir(target) || target in files,
    readdirSync(target): VerifyPackageDirent[] {
      if (unreadable.includes(target) || !isDir(target)) throw Object.assign(new Error(`ENOENT ${target}`), { code: "ENOENT" });
      return dirs[target]!.map((name) => ({ name, isDirectory: () => isDir(path.join(target, name)) }));
    },
    statSync: (target) => ({ mtimeMs: files[target] ?? 0 }),
  };
}

function harness(fs: VerifyPackageFs, overrides: Partial<VerifyPackagePorts> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const verified: string[] = [];
  const npmChecked: string[][] = [];
  const ports: VerifyPackagePorts = {
    fs,
    verify(asarPath, sourceRoot, prefixes): AsarVerification {
      verified.push(`${asarPath}|${sourceRoot}|${prefixes.join(",")}`);
      return { checkedCount: 3, mismatches: [] };
    },
    isEmptyVerification: (count) => count === 0,
    formatMismatchReport: (mismatches) => `REPORT(${mismatches.map((item) => item.relPath).join(",")})`,
    bundledNpmFailures(dirs) { npmChecked.push(dirs); return []; },
    prefixes: ["src", "dist"],
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
    ...overrides,
  };
  return { ports, out, err, verified, npmChecked };
}

const macApp = `${ROOT}/release/mac-arm64/Tovu.app`;
const macAsar = `${macApp}/Contents/Resources/app.asar`;
const winResources = `${ROOT}/release/win-unpacked/resources`;
const winAsar = `${winResources}/app.asar`;

/** release/ holding a mac bundle (nested one level), a win-unpacked tree, a stray file, and an unreadable dir. */
function releaseTree({ macMtime, winMtime }: { macMtime: number; winMtime: number }): VerifyPackageFs {
  return fakeFs({
    dirs: {
      [`${ROOT}/release`]: ["mac-arm64", "win-unpacked", "locked", "builder-debug.yml"],
      [`${ROOT}/release/mac-arm64`]: ["Tovu.app"],
      [macApp]: ["Contents"],
      [`${ROOT}/release/win-unpacked`]: ["resources"],
      [winResources]: ["app.asar"],
      [`${ROOT}/release/locked`]: [],
    },
    files: { [macAsar]: macMtime, [winAsar]: winMtime, [`${ROOT}/release/builder-debug.yml`]: 1 },
    unreadable: [`${ROOT}/release/locked`],
  });
}

test("an explicit --asar wins over release/ and a clean comparison with npm present exits 0", () => {
  const { ports, out, err, verified, npmChecked } = harness(releaseTree({ macMtime: 5, winMtime: 9 }));
  assert.equal(runVerifyPackage({ argv: ["--asar", "/probe/Resources/app.asar"], desktopRoot: ROOT }, ports), 0);
  assert.deepEqual(verified, [`/probe/Resources/app.asar|${ROOT}|src,dist`]);
  // The explicit asar's own resources dir plus EVERY packaged layout under release/ is npm-checked.
  assert.deepEqual(npmChecked, [["/probe/Resources", `${macApp}/Contents/Resources`, winResources]]);
  assert.deepEqual(out, [
    "verify-package: checking /probe/Resources/app.asar against source under src, dist\n",
    "verify-package: 3 file(s) checked\n",
    "verify-package: OK — bundled npm present in 3 resources dir(s)\n",
    "verify-package: OK — every file byte-identical to source\n",
  ]);
  assert.deepEqual(err, []);
});

test("without --asar the newest app.asar across the mac and win-unpacked layouts is verified", () => {
  for (const [macMtime, winMtime, expected] of [[9, 5, macAsar], [5, 9, winAsar]] as const) {
    const { ports, verified, npmChecked } = harness(releaseTree({ macMtime, winMtime }));
    assert.equal(runVerifyPackage({ argv: [], desktopRoot: ROOT }, ports), 0);
    assert.equal(verified[0]!.split("|")[0], expected);
    // The chosen asar's resources dir is not listed twice.
    assert.equal(npmChecked[0]!.length, 2);
  }
});

test("a bare --asar with no path falls back to searching release/", () => {
  const { ports, verified } = harness(releaseTree({ macMtime: 9, winMtime: 5 }));
  assert.equal(runVerifyPackage({ argv: ["--asar"], desktopRoot: ROOT }, ports), 0);
  assert.equal(verified[0]!.split("|")[0], macAsar);
});

test("no app.asar anywhere (or no release/ at all) is a failure, not a pass", () => {
  for (const fs of [fakeFs({}), fakeFs({ dirs: { [`${ROOT}/release`]: [] } })]) {
    const { ports, out, err, verified } = harness(fs);
    assert.equal(runVerifyPackage({ argv: [], desktopRoot: ROOT }, ports), 1);
    assert.deepEqual(verified, []);
    assert.deepEqual(out, []);
    assert.deepEqual(err, [`verify-package: no app.asar found under ${ROOT}/release (checked *.app bundles and win-unpacked) — did electron-builder run?\n`]);
  }
});

test("verifying zero files exits 1 and never reaches the npm check", () => {
  const { ports, err, npmChecked } = harness(fakeFs({}), { verify: () => ({ checkedCount: 0, mismatches: [] }) });
  assert.equal(runVerifyPackage({ argv: ["--asar", "/a/app.asar"], desktopRoot: ROOT }, ports), 1);
  assert.match(err.join(""), /^verify-package: verified nothing — path-separator or prefix bug .*this is a failure, not a clean pass\n$/);
  assert.deepEqual(npmChecked, []);
});

test("a byte mismatch exits 1 with the formatted report and never reaches the npm check", () => {
  const mismatches = [{ relPath: "src/a.ts", reason: "content differs" }, { relPath: "dist/b.js", reason: "missing" }];
  const { ports, err, npmChecked } = harness(fakeFs({}), { verify: () => ({ checkedCount: 2, mismatches }) });
  assert.equal(runVerifyPackage({ argv: ["--asar", "/a/app.asar"], desktopRoot: ROOT }, ports), 1);
  assert.deepEqual(err, ["verify-package: REPORT(src/a.ts,dist/b.js)\n"]);
  assert.deepEqual(npmChecked, []);
});

test("a missing bundled npm exits 1 and lists every missing file", () => {
  const { ports, out, err } = harness(fakeFs({}), {
    bundledNpmFailures: (dirs) => dirs.map((dir) => `npm/bin/npx-cli.js (under ${dir})`),
  });
  assert.equal(runVerifyPackage({ argv: ["--asar", "/a/Resources/app.asar"], desktopRoot: ROOT }, ports), 1);
  assert.equal(err.length, 1);
  assert.ok(err[0]!.startsWith("verify-package: bundled npm is missing from the packaged app:\n  npm/bin/npx-cli.js (under /a/Resources)\n"));
  assert.match(err[0]!, /electron-builder\.yml's two npm extraResources entries/);
  assert.ok(!out.some((line) => line.includes("OK")));
});

/** `createPackageWithOptions` resolves before the write stream flushes; wait for the complete size
 *  (same workaround and reason as `asar-verify.test.ts`'s `packArchive`). */
async function packArchive(root: string, asarPath: string): Promise<void> {
  await createPackageWithOptions(root, asarPath, {});
  const { header, headerSize } = getRawHeader(asarPath);
  const size = (node: { files?: Record<string, unknown>; size?: number }): number =>
    node.files ? Object.values(node.files).reduce<number>((sum, child) => sum + size(child as typeof node), 0) : node.size ?? 0;
  const complete = 8 + headerSize + size(header as never);
  const deadline = Date.now() + 10_000;
  while (statSync(asarPath).size < complete) {
    assert.ok(Date.now() < deadline, "app.asar never reached its complete size");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("scripts/verify-package.ts exits 1 and names the file when a real asar carries a file source does not have", async () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "verify-package-cli-"));
  try {
    const probe = "zz-verify-package-cli-probe-not-in-source.txt";
    mkdirSync(path.join(scratch, "tree", "src"), { recursive: true });
    writeFileSync(path.join(scratch, "tree", "src", probe), "probe");
    const asarPath = path.join(scratch, "Resources", "app.asar");
    mkdirSync(path.dirname(asarPath), { recursive: true });
    await packArchive(path.join(scratch, "tree"), asarPath);
    const run = spawnSync(process.execPath, [path.join(DESKTOP_ROOT, "scripts/verify-package.ts"), "--asar", asarPath], {
      cwd: DESKTOP_ROOT, encoding: "utf8", timeout: 60_000,
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, new RegExp(`verify-package: checking ${asarPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} against source under src, bin, main\\.ts, dist\\n`));
    assert.match(run.stdout, /verify-package: 1 file\(s\) checked/);
    assert.match(run.stderr, new RegExp(`src/${probe.replace(/\./g, "\\.")}`));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("archive closure and byte verification select the same newest archive", () => {
  const fs = releaseTree({ macMtime: 5, winMtime: 9 });
  assert.equal(resolveAsarPath({ fs, argv: [], desktopRoot: ROOT }), winAsar);
  assert.equal(resolveAsarPath({ fs, argv: ['--asar', '/chosen/app.asar'], desktopRoot: ROOT }), '/chosen/app.asar');
});

/** A real desktop-shaped archive and real verification scripts; only their data/install tree is a fixture. */
function closureArchiveFixture(scratch: string) {
  const desktop = path.join(scratch, 'desktop');
  const tree = path.join(scratch, 'tree');
  const resources = path.join(scratch, 'Resources');
  function write(file: string, value: unknown): void {
    const target = path.join(scratch, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
  }
  for (const file of ['scripts/verify-package.ts', 'scripts/verify-staged-closure.ts', 'src/asar-verify.ts', 'src/verify-package-cli.ts']) {
    mkdirSync(path.dirname(path.join(desktop, file)), { recursive: true });
    copyFileSync(path.join(DESKTOP_ROOT, file), path.join(desktop, file));
  }
  symlinkSync(path.join(DESKTOP_ROOT, 'node_modules'), path.join(desktop, 'node_modules'), 'junction');
  write('desktop/package.json', { type: 'module' });
  write('desktop/main.ts', "import '@jini-ai/daemon';");
  write('tree/main.ts', "import '@jini-ai/daemon';");
  for (const file of ['src/check.ts', 'bin/check.js', 'dist/check.js']) {
    write(`desktop/${file}`, 'export const ok = true;');
    write(`tree/${file}`, 'export const ok = true;');
  }
  write('tree/package.json', { name: 'shell', type: 'module' });
  write('tree/node_modules/@jini-ai/daemon/package.json', { name: '@jini-ai/daemon', type: 'module', exports: './dist/index.js' });
  write('tree/node_modules/@jini-ai/daemon/dist/index.js', "import { createRequire } from 'node:module'; export const parse = () => createRequire(import.meta.url)('smol-toml');");
  write('Resources/tovu/package.json', { name: 'payload', type: 'module' });
  write('Resources/tovu/dist/server.js', 'export const ok = true;');
  write('Resources/npm/bin/npx-cli.js', '// npm sentinel');
  write('Resources/npm/node_modules/@npmcli/arborist/package.json', {});
  mkdirSync(path.join(resources, 'website'), { recursive: true });
  // Builds are forbidden in this dispatch. Exercise the actual Jini source, while the separate
  // installed-peer test continues to fail visibly until those new exports are built/published.
  // A linked Jini checkout has that source; the npm-published package ships only dist/ (release
  // run 41393413091 failed on the missing src/ entry.ts), so then the published exports load as-is.
  const jiniSource = path.join(realpathSync(path.join(DESKTOP_ROOT, 'node_modules/@jini-ai/devops')), 'src/packaging/electron/');
  const jini = pathToFileURL(jiniSource);
  const fromSource = existsSync(path.join(jiniSource, 'entry.ts'));
  const hook = path.join(scratch, 'source-hooks.mjs');
  writeFileSync(hook, `import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (${fromSource} && specifier === '@jini-ai/devops/packaging/electron') return next(${JSON.stringify(new URL('entry.ts', jini).href)}, context);
      if (${fromSource} && specifier === '@jini-ai/devops/packaging/electron/typescript') return next(${JSON.stringify(new URL('typescript.ts', jini).href)}, context);
      try { return next(specifier, context); }
      catch (error) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.') || !specifier.endsWith('.js')) throw error;
        return next(specifier.slice(0, -3) + '.ts', context);
      }
    } });`);
  const run = (archive: string) => spawnSync(process.execPath, [path.join(desktop, 'scripts/verify-package.ts'), '--asar', archive], {
    cwd: desktop, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${pathToFileURL(hook).href}` },
  });
  return { tree, resources, write, run };
}

test('verify-package audits the real archive: missing smol-toml fails, a complete archive passes', async () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'verify-package-closure-'));
  try {
    const fixture = closureArchiveFixture(scratch);
    const missingArchive = path.join(fixture.resources, 'missing.asar');
    await packArchive(fixture.tree, missingArchive);
    const missing = fixture.run(missingArchive);
    assert.equal(missing.status, 1, missing.stderr);
    assert.match(missing.stdout, /OK — every file byte-identical to source/, missing.stderr);
    assert.match(missing.stderr, /staged-closure: .*smol-toml/);
    fixture.write('tree/node_modules/smol-toml/package.json', { name: 'smol-toml', main: 'index.cjs' });
    fixture.write('tree/node_modules/smol-toml/index.cjs', 'exports.parse = () => ({});');
    const completeArchive = path.join(fixture.resources, 'complete.asar');
    await packArchive(fixture.tree, completeArchive);
    const complete = fixture.run(completeArchive);
    assert.equal(complete.status, 0, complete.stderr);
    assert.match(complete.stdout, /staged-closure: checked .*0 missing runtime imports/);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
